type SchedulerTickHandler = (now: Date) => Promise<void>;

type SchedulerLogger = Pick<
    Console,
    'log' | 'info' | 'warn' | 'error' | 'debug'
>;

type Signal = 'SIGINT' | 'SIGTERM';

type ProcessEnv = Record<string, string | undefined>;

interface ProcessLike {
    env: ProcessEnv;
    on(signal: Signal, handler: () => void): void;
    off?(signal: Signal, handler: () => void): void;
    removeListener?(signal: Signal, handler: () => void): void;
}

export interface SchedulerWorkerOptions {
    enabled?: boolean;
    intervalMs?: number;
    tickHandler?: SchedulerTickHandler;
    logger?: SchedulerLogger;
    process?: ProcessLike;
}

const DEFAULT_POLL_INTERVAL_MS = 30_000;
const LOG_PREFIX = '[SchedulerWorker]';

const defaultTickHandler: SchedulerTickHandler = async () => {
    /* no-op placeholder until processing is implemented */
};

function normalizeBoolean(
    value: string | undefined,
    fallback: boolean
): boolean {
    if (value === undefined) {
        return fallback;
    }

    const normalized = value.trim().toLowerCase();

    if (['1', 'true', 'yes', 'on'].includes(normalized)) {
        return true;
    }

    if (['0', 'false', 'no', 'off'].includes(normalized)) {
        return false;
    }

    return fallback;
}

function normalizeInterval(value: string | undefined, fallback: number): number {
    if (value === undefined) {
        return fallback;
    }

    const parsed = Number.parseInt(value, 10);

    if (Number.isNaN(parsed) || parsed <= 0) {
        return fallback;
    }

    return parsed;
}

function resolveProcess(customProcess?: ProcessLike): ProcessLike {
    if (customProcess) {
        return customProcess;
    }

    const candidate = (globalThis as { process?: unknown }).process as
        | ProcessLike
        | undefined;

    if (candidate && typeof candidate.on === 'function' && candidate.env) {
        return candidate;
    }

    return {
        env: {},
        on: () => undefined,
        off: () => undefined,
    };
}

function hasUnref(timer: unknown): timer is { unref: () => void } {
    return (
        typeof timer === 'object' &&
        timer !== null &&
        typeof (timer as { unref?: unknown }).unref === 'function'
    );
}

export class SchedulerWorker {
    private readonly enabled: boolean;
    private readonly intervalMs: number;
    private readonly tickHandler: SchedulerTickHandler;
    private readonly logger: SchedulerLogger;
    private readonly proc: ProcessLike;
    private timer: ReturnType<typeof setInterval> | null = null;
    private running = false;
    private started = false;
    private currentTick: Promise<void> | null = null;
    private readonly signalHandlers: Array<{
        signal: Signal;
        handler: () => void;
    }> = [];

    constructor(options: SchedulerWorkerOptions = {}) {
        this.proc = resolveProcess(options.process);

        this.enabled =
            options.enabled ??
            normalizeBoolean(this.proc.env.SCHEDULER_ENABLED, false);

        this.intervalMs =
            options.intervalMs ??
            normalizeInterval(
                this.proc.env.SCHEDULER_POLL_INTERVAL_MS,
                DEFAULT_POLL_INTERVAL_MS
            );

        this.tickHandler = options.tickHandler ?? defaultTickHandler;
        this.logger = options.logger ?? console;
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
                await this.tickHandler(startedAt);
                this.logger.debug?.(
                    `${LOG_PREFIX} Tick completed in ${
                        Date.now() - startedAt.getTime()
                    }ms`
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
        const signals: Signal[] = ['SIGINT', 'SIGTERM'];

        signals.forEach((signal) => {
            const handler = () => {
                this.logger.info?.(
                    `${LOG_PREFIX} Received ${signal}, stopping worker`
                );
                this.stop().catch((error) => {
                    this.logger.error?.(
                        `${LOG_PREFIX} Failed to stop worker after ${signal}`,
                        error
                    );
                });
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
}

export function createSchedulerWorker(
    options?: SchedulerWorkerOptions
): SchedulerWorker {
    return new SchedulerWorker(options);
}
