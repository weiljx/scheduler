import { createJobDispatcherWorker } from '../../workers/jobDispatcher.worker.js';
import ScheduledJob from '../../models/scheduledJob.js';
import Schedule from '../../models/schedule.js';
import * as registry from '../../processors/registry.js';
import type { Processor } from '../../processors/processor.types.js';
import type {
    SchedulerSignal,
    SchedulerProcessLike,
} from '../../models/types.js';

type Signal = SchedulerSignal;

type MockProcess = SchedulerProcessLike & {
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
        pid: 42,
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

const createExecQuery = <T>(value: T) => ({
    exec: jest.fn().mockResolvedValue(value),
});

const createLeanQuery = <T>(value: T) => ({
    lean: jest.fn().mockResolvedValue(value),
});

describe('JobDispatcherWorker', () => {
    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    it('processes a pending job and marks it as success', async () => {
        jest.useFakeTimers();

        const job = {
            _id: 'job-1',
            scheduleId: 'schedule-1',
            status: 'pending',
        } as unknown as Awaited<
            ReturnType<typeof ScheduledJob.findOneAndUpdate>
        >;

        const scheduleLean = {
            _id: 'schedule-1',
            processor: 'custom',
            payload: { foo: 'bar' },
        };

        const processor: Processor = {
            type: 'custom',
            process: jest.fn().mockResolvedValue({}),
        };

        const findExecMocks = [
            createExecQuery(job),
            createExecQuery(null),
        ];
        const findOneAndUpdateMock = jest
            .spyOn(ScheduledJob, 'findOneAndUpdate')
            .mockReturnValueOnce(findExecMocks[0] as never)
            .mockReturnValueOnce(findExecMocks[1] as never)
            .mockReturnValue(findExecMocks[1] as never);
        jest.spyOn(Schedule, 'findById').mockReturnValue(
            createLeanQuery(scheduleLean) as unknown as ReturnType<
                typeof Schedule.findById
            >
        );
        const updateExecMock = createExecQuery({});
        const updateOneMock = jest
            .spyOn(ScheduledJob, 'updateOne')
            .mockReturnValue(updateExecMock as never);
        jest.spyOn(registry, 'getProcessor').mockReturnValue(processor);

        const worker = createJobDispatcherWorker({
            enabled: true,
            intervalMs: 1_000,
            process: createProcessMock(),
            logger: createLoggerMock(),
        });

        worker.start();
        await flushMicrotasks();
        await flushMicrotasks();

        expect(findOneAndUpdateMock).toHaveBeenCalledWith(
            { status: 'pending' },
            expect.objectContaining({
                $set: expect.objectContaining({ status: 'started' }),
            }),
            expect.any(Object)
        );
        expect(Schedule.findById).toHaveBeenCalledWith(job.scheduleId);
        expect(processor.process).toHaveBeenCalledWith(job, {
            schedule: scheduleLean,
        });
        expect(updateOneMock).toHaveBeenCalledWith(
            { _id: job._id },
            expect.objectContaining({
                $set: expect.objectContaining({
                    status: 'success',
                    completedAt: expect.any(Date),
                }),
            })
        );
        expect(updateExecMock.exec).toHaveBeenCalled();

        await worker.stop();
    });

    it('marks the job as failed when the processor throws', async () => {
        jest.useFakeTimers();

        const job = {
            _id: 'job-2',
            scheduleId: 'schedule-2',
            status: 'pending',
        } as unknown as Awaited<
            ReturnType<typeof ScheduledJob.findOneAndUpdate>
        >;

        const processor: Processor = {
            type: 'failing',
            process: jest.fn().mockRejectedValue(new Error('boom')),
        };

        const findExecMocks = [
            createExecQuery(job),
            createExecQuery(null),
        ];
        jest.spyOn(ScheduledJob, 'findOneAndUpdate')
            .mockReturnValueOnce(findExecMocks[0] as never)
            .mockReturnValue(findExecMocks[1] as never);
        jest.spyOn(Schedule, 'findById').mockReturnValue(
            createLeanQuery({
                _id: 'schedule-2',
                processor: 'failing',
            }) as unknown as ReturnType<typeof Schedule.findById>
        );
        const updateExecMock = createExecQuery({});
        const updateOneMock = jest
            .spyOn(ScheduledJob, 'updateOne')
            .mockReturnValue(updateExecMock as never);
        jest.spyOn(registry, 'getProcessor').mockReturnValue(processor);

        const worker = createJobDispatcherWorker({
            enabled: true,
            intervalMs: 1_000,
            process: createProcessMock(),
            logger: createLoggerMock(),
        });

        worker.start();
        await flushMicrotasks();
        await flushMicrotasks();

        expect(processor.process).toHaveBeenCalled();
        expect(updateOneMock).toHaveBeenCalledWith(
            { _id: job._id },
            expect.objectContaining({
                $set: expect.objectContaining({
                    status: 'failed',
                    completedAt: expect.any(Date),
                }),
            })
        );
        expect(updateExecMock.exec).toHaveBeenCalled();

        await worker.stop();
    });

    it('does not start a new tick while a previous one is running', async () => {
        jest.useFakeTimers();

        let processResolve: (() => void) | undefined;
        const processor: Processor = {
            type: 'blocking',
            process: jest.fn(
                () =>
                    new Promise<void>((resolve) => {
                        processResolve = resolve;
                    })
            ),
        };

        const job = {
            _id: 'job-3',
            scheduleId: 'schedule-3',
            status: 'pending',
        } as unknown as Awaited<
            ReturnType<typeof ScheduledJob.findOneAndUpdate>
        >;

        const firstExec = createExecQuery(job);
        const emptyExec = createExecQuery(null);
        const findOneAndUpdateMock = jest
            .spyOn(ScheduledJob, 'findOneAndUpdate')
            .mockReturnValueOnce(firstExec as never)
            .mockReturnValue(emptyExec as never);
        jest.spyOn(Schedule, 'findById').mockReturnValue(
            createLeanQuery({
                _id: 'schedule-3',
                processor: 'blocking',
            }) as unknown as ReturnType<typeof Schedule.findById>
        );
        jest.spyOn(ScheduledJob, 'updateOne').mockReturnValue(
            createExecQuery({}) as never
        );
        jest.spyOn(registry, 'getProcessor').mockReturnValue(processor);

        const worker = createJobDispatcherWorker({
            enabled: true,
            intervalMs: 500,
            process: createProcessMock(),
            logger: createLoggerMock(),
        });

        worker.start();
        await flushMicrotasks();

        expect(findOneAndUpdateMock).toHaveBeenCalledTimes(1);

        jest.advanceTimersByTime(1_000);
        await flushMicrotasks();

        expect(findOneAndUpdateMock).toHaveBeenCalledTimes(1);

        processResolve?.();
        await flushMicrotasks();

        expect(processor.process).toHaveBeenCalledTimes(1);

        await worker.stop();
    });
});
