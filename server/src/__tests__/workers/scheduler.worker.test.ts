import { createSchedulerWorker, type SchedulerWorkerOptions } from '../../workers/scheduler.worker.js';
import { ScheduledJobService } from '../../services/scheduledJobService.js';
import type {
    SchedulerTickContext,
    SchedulerTickResult,
} from '../../models/types.js';

type Signal = 'SIGINT' | 'SIGTERM';

type MockProcess = NonNullable<SchedulerWorkerOptions['process']> & {
    emit: (signal: Signal) => void;
    kill?: jest.Mock<void, [number, Signal | number | undefined]>;
    exit: jest.Mock<void, [number | undefined]>;
};

const createLoggerMock = () => ({
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
});

const createProcessMock = (overrides: Partial<MockProcess> = {}): MockProcess => {
    const handlers = new Map<Signal, () => void>();

    const process: MockProcess = {
        env: {},
        pid: 1234,
        on: jest.fn((signal: Signal, handler: () => void) => {
            handlers.set(signal, handler);
        }),
        off: jest.fn((signal: Signal, handler: () => void) => {
            const registered = handlers.get(signal);
            if (registered === handler) {
                handlers.delete(signal);
            }
        }),
        kill: jest.fn((pid: number, signal?: Signal | number) => {
            void pid;
            void signal;
        }),
        exit: jest.fn((code?: number) => {
            void code;
        }),
        emit: (signal: Signal) => {
            handlers.get(signal)?.();
        },
    };

    Object.assign(process, overrides);

    return process;
};

const flushMicrotasks = async () => {
    await Promise.resolve();
    await Promise.resolve();
};

describe('SchedulerWorker', () => {
    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    it('does not start when disabled', async () => {
        jest.useFakeTimers();

        const tickHandler = jest.fn<
            Promise<SchedulerTickResult>,
            [Date, SchedulerTickContext]
        >().mockResolvedValue({ dueSchedules: [] });
        const createJobSpy = jest.spyOn(
            ScheduledJobService,
            'createScheduledJob'
        ).mockResolvedValue({
            _id: 'job',
            scheduleId: 'schedule',
            startedAt: new Date(),
            status: 'pending',
        } as unknown as Awaited<
            ReturnType<typeof ScheduledJobService.createScheduledJob>
        >);
        const processMock = createProcessMock();

        const worker = createSchedulerWorker({
            enabled: false,
            tickHandler,
            process: processMock,
            logger: createLoggerMock(),
        });

        worker.start();

        await flushMicrotasks();
        jest.advanceTimersByTime(5_000);
        await flushMicrotasks();

        expect(tickHandler).not.toHaveBeenCalled();
        expect(processMock.on).not.toHaveBeenCalled();
        expect(createJobSpy).not.toHaveBeenCalled();

        await worker.stop();
    });

    it('invokes the tick handler immediately and on the configured interval', async () => {
        jest.useFakeTimers();

        const tickHandler = jest
            .fn<Promise<SchedulerTickResult>, [Date, SchedulerTickContext]>()
            .mockResolvedValueOnce({
                dueSchedules: [{ scheduleId: 'schedule-1', userId: 'user-1' }],
            })
            .mockResolvedValueOnce({
                dueSchedules: [{ scheduleId: 'schedule-2', userId: 'user-2' }],
            });
        const createJobSpy = jest.spyOn(
            ScheduledJobService,
            'createScheduledJob'
        ).mockResolvedValue({
            _id: 'job',
            scheduleId: 'schedule',
            startedAt: new Date(),
            status: 'pending',
        } as unknown as Awaited<
            ReturnType<typeof ScheduledJobService.createScheduledJob>
        >);
        const processMock = createProcessMock();
        const loggerMock = createLoggerMock();

        const worker = createSchedulerWorker({
            enabled: true,
            intervalMs: 1_000,
            timezone: 'UTC',
            tickHandler,
            process: processMock,
            logger: loggerMock,
        });

        worker.start();
        await flushMicrotasks();

        expect(tickHandler).toHaveBeenCalledTimes(1);
        const [firstNow, firstContext] = tickHandler.mock.calls[0] ?? [];
        expect(firstNow).toBeInstanceOf(Date);
        expect(firstContext).toEqual({
            intervalMs: 1_000,
            timezone: 'UTC',
        });
        expect(processMock.on).toHaveBeenCalledTimes(2);
        expect(createJobSpy).toHaveBeenCalledTimes(1);
        expect(createJobSpy).toHaveBeenCalledWith('user-1', 'schedule-1');

        jest.advanceTimersByTime(1_000);
        await flushMicrotasks();

        expect(tickHandler).toHaveBeenCalledTimes(2);
        expect(createJobSpy).toHaveBeenCalledTimes(2);
        expect(createJobSpy).toHaveBeenLastCalledWith('user-2', 'schedule-2');
        expect(loggerMock.debug).toHaveBeenCalled();

        await worker.stop();
        await flushMicrotasks();

        expect(processMock.off).toHaveBeenCalledTimes(2);
    });

    it('skips overlapping ticks while a previous tick is running', async () => {
        jest.useFakeTimers();

        let resolveTick: ((value: SchedulerTickResult) => void) | undefined;
        const tickHandler = jest.fn<
            Promise<SchedulerTickResult>,
            [Date, SchedulerTickContext]
        >(() => {
            if (resolveTick === undefined) {
                return new Promise<SchedulerTickResult>((resolve) => {
                    resolveTick = resolve;
                });
            }

            return Promise.resolve({ dueSchedules: [] });
        });

        const createJobSpy = jest.spyOn(
            ScheduledJobService,
            'createScheduledJob'
        ).mockResolvedValue({
            _id: 'job',
            scheduleId: 'schedule',
            startedAt: new Date(),
            status: 'pending',
        } as unknown as Awaited<
            ReturnType<typeof ScheduledJobService.createScheduledJob>
        >);

        const processMock = createProcessMock();
        const loggerMock = createLoggerMock();

        const worker = createSchedulerWorker({
            enabled: true,
            intervalMs: 1_000,
            tickHandler,
            process: processMock,
            logger: loggerMock,
        });

        worker.start();
        await flushMicrotasks();

        expect(tickHandler).toHaveBeenCalledTimes(1);

        jest.advanceTimersByTime(1_000);
        await flushMicrotasks();

        expect(tickHandler).toHaveBeenCalledTimes(1);
        expect(createJobSpy).not.toHaveBeenCalled();

        resolveTick?.({ dueSchedules: [] });
        resolveTick = undefined;
        await flushMicrotasks();

        jest.advanceTimersByTime(1_000);
        await flushMicrotasks();

        expect(tickHandler).toHaveBeenCalledTimes(2);

        resolveTick?.({ dueSchedules: [] });
        await flushMicrotasks();

        await worker.stop();
        await flushMicrotasks();

        expect(processMock.off).toHaveBeenCalledTimes(2);
        expect(loggerMock.error).not.toHaveBeenCalled();
        expect(loggerMock.warn).not.toHaveBeenCalled();
        expect(createJobSpy).not.toHaveBeenCalled();
    });

    it('re-emits shutdown signals only after the worker stops', async () => {
        jest.useFakeTimers();

        let resolveTick: ((value: SchedulerTickResult) => void) | undefined;
        const tickHandler = jest
            .fn<Promise<SchedulerTickResult>, [Date, SchedulerTickContext]>(
                () =>
                    new Promise<SchedulerTickResult>((resolve) => {
                        resolveTick = resolve;
                    })
            );

        const processMock = createProcessMock();
        const loggerMock = createLoggerMock();

        const worker = createSchedulerWorker({
            enabled: true,
            intervalMs: 1_000,
            tickHandler,
            process: processMock,
            logger: loggerMock,
        });

        worker.start();
        await flushMicrotasks();

        expect(tickHandler).toHaveBeenCalledTimes(1);

        if (!processMock.kill) {
            throw new Error('Expected kill to be defined for this test');
        }

        const killCalls: Array<[number, Signal | number | undefined]> = [];
        const killInvoked = new Promise<void>((resolve) => {
            processMock.kill!.mockImplementation(
                (pid: number, signal?: Signal | number) => {
                    killCalls.push([pid, signal]);
                    resolve();
                }
            );
        });

        processMock.emit('SIGINT');
        await flushMicrotasks();

        expect(processMock.kill.mock.calls.length).toBe(0);
        expect(processMock.exit).not.toHaveBeenCalled();

        // Subsequent signals before the first shutdown finishes should be ignored.
        processMock.emit('SIGINT');
        await flushMicrotasks();
        expect(processMock.kill.mock.calls.length).toBe(0);

        resolveTick?.({ dueSchedules: [] });
        await killInvoked;
        await flushMicrotasks();

        expect(killCalls).toEqual([[processMock.pid!, 'SIGINT']]);
        expect(processMock.exit).not.toHaveBeenCalled();
        expect(processMock.off).toHaveBeenCalledTimes(2);

        await worker.stop();
    });

    it('falls back to process.exit when kill is unavailable', async () => {
        jest.useFakeTimers();

        const tickHandler = jest
            .fn<Promise<SchedulerTickResult>, [Date, SchedulerTickContext]>(
                () => Promise.resolve({ dueSchedules: [] })
            );

        const exitCodes: Array<number | undefined> = [];
        let exitResolve: (() => void) | undefined;
        const exitPromise = new Promise<void>((resolve) => {
            exitResolve = resolve;
        });

        const processMock = createProcessMock({
            kill: undefined,
            exit: jest.fn((code?: number) => {
                exitCodes.push(code);
                exitResolve?.();
            }),
        });
        const loggerMock = createLoggerMock();

        const worker = createSchedulerWorker({
            enabled: true,
            intervalMs: 1_000,
            tickHandler,
            process: processMock,
            logger: loggerMock,
        });

        worker.start();
        await flushMicrotasks();

        processMock.emit('SIGTERM');
        await exitPromise;
        await flushMicrotasks();

        expect(processMock.kill).toBeUndefined();
        expect(exitCodes).toEqual([143]);
        expect(processMock.exit).toHaveBeenCalledTimes(1);
        expect(processMock.off).toHaveBeenCalledTimes(2);
        expect(loggerMock.error).not.toHaveBeenCalled();

        await worker.stop();
    });

    it('awaits the in-flight tick when stopping', async () => {
        jest.useFakeTimers();

        let resolveTick: ((value: SchedulerTickResult) => void) | undefined;
        const tickHandler = jest
            .fn<Promise<SchedulerTickResult>, [Date, SchedulerTickContext]>(
            () =>
                new Promise<SchedulerTickResult>((resolve) => {
                    resolveTick = resolve;
                })
            );

        const createJobSpy = jest.spyOn(
            ScheduledJobService,
            'createScheduledJob'
        ).mockResolvedValue({
            _id: 'job',
            scheduleId: 'schedule',
            startedAt: new Date(),
            status: 'pending',
        } as unknown as Awaited<
            ReturnType<typeof ScheduledJobService.createScheduledJob>
        >);

        const processMock = createProcessMock();
        const loggerMock = createLoggerMock();

        const worker = createSchedulerWorker({
            enabled: true,
            intervalMs: 1_000,
            tickHandler,
            process: processMock,
            logger: loggerMock,
        });

        worker.start();
        await flushMicrotasks();

        expect(tickHandler).toHaveBeenCalledTimes(1);

        const stopPromise = worker.stop();
        let stopResolved = false;
        void stopPromise.then(() => {
            stopResolved = true;
        });

        await flushMicrotasks();
        expect(stopResolved).toBe(false);

        resolveTick?.({ dueSchedules: [] });
        await stopPromise;

        expect(stopResolved).toBe(true);
        expect(processMock.off).toHaveBeenCalledTimes(2);
        expect(loggerMock.error).not.toHaveBeenCalled();
        expect(createJobSpy).not.toHaveBeenCalled();
    });
});
