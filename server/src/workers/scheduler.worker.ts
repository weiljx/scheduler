import Schedule from '../models/schedule.js';

import { CronExpressionParser } from 'cron-parser';
import type { SchedulerTickHandler, SchedulerLogger, SchedulerSignal, SchedulerProcessLike, SchedulerWorkerOptions, SchedulerTickContext, SchedulerTickResult, SchedulerTickDueSchedule } from '../models/types.js';
import { ScheduledJobService } from '../services/scheduledJobService.js';
import { normalizeBoolean, normalizePositiveInteger, resolveProcess, hasUnref } from './worker.utils.js';

const DEFAULT_POLL_INTERVAL_MS = 30_000;
const LOG_PREFIX = '[SchedulerWorker]';

const defaultTickHandler: SchedulerTickHandler = async (
    now,
    context: SchedulerTickContext
): Promise<SchedulerTickResult> => {
    const windowStart = now.getTime() - context.intervalMs;
    const windowEnd = now.getTime();
    const schedules = await Schedule.find({}, { cron: 1, createdBy: 1 })
        .lean()
        .exec();

    const dueSchedules: SchedulerTickDueSchedule[] = [];

    for (const schedule of schedules) {
        const cronExpression = (schedule as { cron?: string }).cron;

        if (typeof cronExpression !== 'string' || cronExpression.length === 0) {
            continue;
        }

        const scheduleIdRaw = (schedule as { _id?: unknown })._id;
        const createdBy = (schedule as { createdBy?: unknown }).createdBy;

        if (
            scheduleIdRaw === undefined ||
            scheduleIdRaw === null ||
            typeof createdBy !== 'string'
        ) {
            continue;
        }

        const scheduleId =
            typeof scheduleIdRaw === 'string'
                ? scheduleIdRaw
                : typeof (scheduleIdRaw as { toString?: () => string }).toString ===
                  'function'
                ? (scheduleIdRaw as { toString: () => string }).toString()
                : undefined;

        if (!scheduleId) {
            continue;
        }

        const parserOptions =
            context.timezone !== undefined
                ? { currentDate: now, tz: context.timezone }
                : { currentDate: now };

        try {
            const previousOccurrence = CronExpressionParser.parse(
                cronExpression,
                parserOptions
            )
                .prev()
                .toDate()
                .getTime();

            if (
                previousOccurrence >= windowStart &&
                previousOccurrence <= windowEnd
            ) {
                dueSchedules.push({
                    scheduleId,
                    userId: createdBy,
                });
            }
        } catch {
            // Ignore invalid cron expressions; validation occurs at creation time.
        }
    }

    return {
        dueSchedules,
    };
};

export class SchedulerWorker {
    private readonly enabled: boolean;
    private readonly intervalMs: number;
    private readonly tickHandler: SchedulerTickHandler;
    private readonly logger: SchedulerLogger;
    private readonly proc: SchedulerProcessLike;
    private readonly timezone: string | undefined;
    private timer: ReturnType<typeof setInterval> | null = null;
    private running = false;
    private started = false;
    private signalStopPromise: Promise<void> | null = null;
    private currentTick: Promise<void> | null = null;
    private readonly signalHandlers: Array<{
        signal: SchedulerSignal;
        handler: () => void;
    }> = [];

    constructor(options: SchedulerWorkerOptions = {}) {
        this.proc = resolveProcess(options.process);

        this.enabled =
            options.enabled ??
            normalizeBoolean(this.proc.env.SCHEDULER_ENABLED, false);

        this.intervalMs =
            options.intervalMs ??
            normalizePositiveInteger(
                this.proc.env.SCHEDULER_POLL_INTERVAL_MS,
                DEFAULT_POLL_INTERVAL_MS
            );

        this.tickHandler = options.tickHandler ?? defaultTickHandler;
        this.logger = options.logger ?? console;
        this.timezone = options.timezone ?? this.proc.env.SCHEDULER_TIMEZONE;
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
            `${LOG_PREFIX} Worker started with interval ${this.intervalMs}ms`
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
                this.logger.error?.(
                    `${LOG_PREFIX} Error while awaiting current tick during shutdown`,
                    error
                );
            }
        }

        this.logger.info?.(`${LOG_PREFIX} Worker stopped`);
    }

    private async runTick(): Promise<void> {
        if (!this.started) {
            return;
        }

        if (this.running) {
            this.logger.debug?.(
                `${LOG_PREFIX} Skipping tick because previous execution is still in progress`
            );
            return;
        }

        this.running = true;
        const execution = (async () => {
            const startedAt = new Date();

            try {
                const tickContext =
                    this.timezone !== undefined
                        ? {
                              intervalMs: this.intervalMs,
                              timezone: this.timezone,
                          }
                        : { intervalMs: this.intervalMs };

                const tickResult = await this.tickHandler(
                    startedAt,
                    tickContext
                );

                let createdJobs = 0;

                for (const due of tickResult.dueSchedules) {
                    try {
                        await ScheduledJobService.createScheduledJob(
                            due.userId,
                            due.scheduleId
                        );
                        createdJobs += 1;
                    } catch (error) {
                        this.logger.error?.(
                            `${LOG_PREFIX} Failed to record scheduled job for schedule ${due.scheduleId}`,
                            error
                        );
                    }
                }

                const dueCount = tickResult.dueSchedules.length;
                this.logger.debug?.(
                    `${LOG_PREFIX} Tick completed in ${
                        Date.now() - startedAt.getTime()
                    }ms (dueSchedules=${dueCount}, createdJobs=${createdJobs})`
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
                        const forwardSignal = signal;
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

export function createSchedulerWorker(
    options?: SchedulerWorkerOptions
): SchedulerWorker {
    return new SchedulerWorker(options);
}

export type { SchedulerWorkerOptions } from '../models/types.js';
