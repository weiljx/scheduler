import type { JobDispatcherWorkerOptions, SchedulerLogger, SchedulerProcessLike, SchedulerSignal } from '../models/types.js';
import ScheduledJob from '../models/scheduledJob.js';
import type { IScheduledJobDocument } from '../models/scheduledJob.js';
import Schedule from '../models/schedule.js';
import { getProcessor } from '../processors/registry.js';
import { normalizeBoolean, normalizePositiveInteger, resolveProcess, hasUnref } from './worker.utils.js';

const LOG_PREFIX = '[JobDispatcherWorker]';
const DEFAULT_POLL_INTERVAL_MS = 5_000;
const DEFAULT_BATCH_SIZE = 1;

export class JobDispatcherWorker {
    private readonly enabled: boolean;
    private readonly intervalMs: number;
    private readonly batchSize: number;
    private readonly logger: SchedulerLogger;
    private readonly proc: SchedulerProcessLike;
    private timer: ReturnType<typeof setInterval> | null = null;
    private running = false;
    private started = false;
    private currentTick: Promise<void> | null = null;
    private signalStopPromise: Promise<void> | null = null;
    private readonly signalHandlers: Array<{
        signal: SchedulerSignal;
        handler: () => void;
    }> = [];

    constructor(options: JobDispatcherWorkerOptions = {}) {
        this.proc = resolveProcess(options.process);
        this.logger = options.logger ?? console;
        this.enabled =
            options.enabled ??
            normalizeBoolean(this.proc.env.JOB_DISPATCHER_ENABLED, true);
        this.intervalMs =
            options.intervalMs ??
            normalizePositiveInteger(
                this.proc.env.JOB_DISPATCHER_POLL_INTERVAL_MS,
                DEFAULT_POLL_INTERVAL_MS
            );
        this.batchSize =
            options.batchSize ??
            normalizePositiveInteger(
                this.proc.env.JOB_DISPATCHER_BATCH_SIZE,
                DEFAULT_BATCH_SIZE
            );
    }

    start(): void {
        if (!this.enabled) {
            this.logger.info?.(
                `${LOG_PREFIX} Skipping start because the worker is disabled`
            );
            return;
        }

        if (this.started) {
            this.logger.debug?.(
                `${LOG_PREFIX} Start called but worker is already running`
            );
            return;
        }

        this.started = true;
        this.registerSignalHandlers();

        this.timer = setInterval(() => {
            void this.runTick();
        }, this.intervalMs);

        if (hasUnref(this.timer)) {
            this.timer.unref();
        }

        void this.runTick();
        this.logger.info?.(
            `${LOG_PREFIX} Worker started with interval ${this.intervalMs}ms (batchSize=${this.batchSize})`
        );
    }

    async stop(): Promise<void> {
        if (!this.started) {
            return;
        }

        this.started = false;

        if (this.timer !== null) {
            clearInterval(this.timer);
            this.timer = null;
        }

        this.unregisterSignalHandlers();

        if (this.running && this.currentTick) {
            try {
                await this.currentTick;
            } catch (error) {
                this.logger.error?.(`${LOG_PREFIX} Current tick failed during stop`, error);
            }
        }
    }

    private async runTick(): Promise<void> {
        if (!this.started || this.running) {
            return;
        }

        const execution = (async () => {
            this.running = true;
            const startedAt = Date.now();
            let processed = 0;

            try {
                processed = await this.dispatchBatch();
                this.logger.debug?.(
                    `${LOG_PREFIX} Tick completed in ${
                        Date.now() - startedAt
                    }ms (processed=${processed})`
                );
            } catch (error) {
                this.logger.error?.(`${LOG_PREFIX} Tick failed`, error);
            } finally {
                this.running = false;
                this.currentTick = null;
            }
        })();

        this.currentTick = execution;
        await execution;
    }

    private async dispatchBatch(): Promise<number> {
        let processed = 0;

        while (processed < this.batchSize) {
            const job = await this.claimNextJob();

            if (!job) {
                break;
            }

            await this.handleJob(job);
            processed += 1;
        }

        return processed;
    }

    private async claimNextJob(): Promise<IScheduledJobDocument | null> {
        const claimed = await ScheduledJob.findOneAndUpdate(
            { status: 'pending' },
            {
                $set: {
                    status: 'started',
                    startedAt: new Date(),
                },
            },
            {
                sort: { startedAt: 1, _id: 1 },
                returnDocument: 'after',
            }
        ).exec();

        if (!claimed) {
            return null;
        }

        return claimed as IScheduledJobDocument;
    }

    private async handleJob(job: IScheduledJobDocument): Promise<void> {
        const jobId = String(job._id);

        type ScheduleLean = {
            _id?: unknown;
            processor?: string;
            payload?: unknown;
            createdBy?: string;
        };

        const schedule = await Schedule.findById(job.scheduleId)
            .lean<ScheduleLean | null>();

        if (!schedule) {
            await ScheduledJob.updateOne(
                { _id: job._id },
                {
                    $set: {
                        status: 'failed',
                        completedAt: new Date(),
                    },
                }
            ).exec();

            this.logger.error?.(
                `${LOG_PREFIX} Failed to load schedule for job ${jobId}`
            );
            return;
        }

        const processor = getProcessor(
            typeof schedule.processor === 'string' ? schedule.processor : undefined
        );
        const startedAt = Date.now();

        try {
            await processor.process(job, { schedule });

            await ScheduledJob.updateOne(
                { _id: job._id },
                {
                    $set: {
                        status: 'success',
                        completedAt: new Date(),
                    },
                }
            ).exec();

            this.logger.info?.(
                `${LOG_PREFIX} Completed job ${jobId} with processor ${processor.type} in ${
                    Date.now() - startedAt
                }ms`
            );
        } catch (error) {
            await ScheduledJob.updateOne(
                { _id: job._id },
                {
                    $set: {
                        status: 'failed',
                        completedAt: new Date(),
                    },
                }
            ).exec();

            this.logger.error?.(
                `${LOG_PREFIX} Job ${jobId} failed with processor ${processor.type}`,
                error
            );
        }
    }

    private registerSignalHandlers(): void {
        const signals: SchedulerSignal[] = ['SIGINT', 'SIGTERM'];

        signals.forEach((signal) => {
            const handler = () => {
                this.logger.info?.(
                    `${LOG_PREFIX} Received ${signal}, preparing graceful shutdown`
                );

                if (this.signalStopPromise) {
                    return;
                }

                this.signalStopPromise = (async () => {
                    try {
                        await this.stop();
                    } catch (error) {
                        this.logger.error?.(
                            `${LOG_PREFIX} Failed to stop worker after ${signal}`,
                            error
                        );
                    } finally {
                        const forwardSignal: SchedulerSignal = signal;
                        this.signalStopPromise = null;
                        this.forwardSignal(forwardSignal);
                    }
                })();
            };

            this.signalHandlers.push({ signal, handler });
            this.proc.on(signal, handler);
        });
    }

    private unregisterSignalHandlers(): void {
        const remove =
            this.proc.off?.bind(this.proc) ??
            this.proc.removeListener?.bind(this.proc);

        if (!remove) {
            this.signalHandlers.length = 0;
            return;
        }

        this.signalHandlers.forEach(({ signal, handler }) => {
            remove(signal, handler);
        });

        this.signalHandlers.length = 0;
    }

    private forwardSignal(signal: SchedulerSignal): void {
        const { kill, pid } = this.proc;

        if (typeof kill === 'function' && typeof pid === 'number') {
            try {
                kill(pid, signal);
                return;
            } catch (error) {
                this.logger.error?.(
                    `${LOG_PREFIX} Failed to re-emit ${signal} via kill(), falling back to exit`,
                    error
                );
            }
        }

        const exitCode = signal === 'SIGINT' ? 130 : 143;
        this.proc.exit(exitCode);
    }
}

export function createJobDispatcherWorker(
    options?: JobDispatcherWorkerOptions
): JobDispatcherWorker {
    return new JobDispatcherWorker(options);
}
