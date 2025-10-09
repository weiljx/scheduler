import { Types } from 'mongoose';
import Schedule from '../../models/schedule.js';
import ScheduledJob from '../../models/scheduledJob.js';
import { ScheduledJobService } from '../../services/scheduledJobService.js';

describe('ScheduledJobService', () => {
    const userId = 'user-123';

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('getScheduledJobs', () => {
        it('returns an empty array when scheduleId is invalid', async () => {
            const result = await ScheduledJobService.getScheduledJobs(userId, 'invalid-id');

            expect(result).toEqual([]);
        });

        it('returns an empty array when the schedule is not owned by the user', async () => {
            const existsSpy = jest.spyOn(Schedule, 'exists').mockResolvedValueOnce(null);

            const scheduleId = new Types.ObjectId().toString();
            const result = await ScheduledJobService.getScheduledJobs(userId, scheduleId);

            const [existsFilter] = existsSpy.mock.calls[0] ?? [{}];

            expect(existsFilter).toMatchObject({ createdBy: userId });
            expect(existsFilter._id?.toString()).toBe(scheduleId);
            expect(result).toEqual([]);
        });

        it('returns scheduled jobs sorted by startedAt descending', async () => {
            const scheduleIdObject = new Types.ObjectId();
            const scheduleId = scheduleIdObject.toString();

            jest.spyOn(Schedule, 'exists').mockResolvedValueOnce(true as unknown as Awaited<ReturnType<typeof Schedule.exists>>);

            const jobOneId = new Types.ObjectId();
            const jobTwoId = new Types.ObjectId();

            const leanResult = [
                {
                    _id: jobOneId,
                    scheduleId: scheduleIdObject,
                    startedAt: new Date('2024-01-02T00:00:00.000Z'),
                    completedAt: undefined,
                    status: 'success' as const,
                },
                {
                    _id: jobTwoId,
                    scheduleId: scheduleIdObject,
                    startedAt: new Date('2024-01-01T00:00:00.000Z'),
                    completedAt: undefined,
                    status: 'failed' as const,
                },
            ];

            const leanMock = jest.fn().mockResolvedValueOnce(leanResult);
            const sortMock = jest.fn().mockReturnValue({ lean: leanMock });

            const findSpy = jest.spyOn(ScheduledJob, 'find').mockReturnValue({
                sort: sortMock,
            } as unknown as ReturnType<typeof ScheduledJob.find>);

            const result = await ScheduledJobService.getScheduledJobs(userId, scheduleId);

            expect(findSpy).toHaveBeenCalledWith({
                scheduleId: scheduleIdObject,
            });
            expect(sortMock).toHaveBeenCalledWith({ startedAt: -1 });
            expect(leanMock).toHaveBeenCalled();
            expect(result).toEqual([
                {
                    _id: jobOneId.toString(),
                    scheduleId: scheduleIdObject.toString(),
                    startedAt: leanResult[0].startedAt,
                    completedAt: undefined,
                    status: 'success',
                },
                {
                    _id: jobTwoId.toString(),
                    scheduleId: scheduleIdObject.toString(),
                    startedAt: leanResult[1].startedAt,
                    completedAt: undefined,
                    status: 'failed',
                },
            ]);
        });

        it('applies the optional status filter', async () => {
            const scheduleIdObject = new Types.ObjectId();
            const scheduleId = scheduleIdObject.toString();

            jest.spyOn(Schedule, 'exists').mockResolvedValueOnce(true as unknown as Awaited<ReturnType<typeof Schedule.exists>>);

            const leanMock = jest.fn().mockResolvedValueOnce([]);
            const sortMock = jest.fn().mockReturnValue({ lean: leanMock });

            const findSpy = jest.spyOn(ScheduledJob, 'find').mockReturnValue({
                sort: sortMock,
            } as unknown as ReturnType<typeof ScheduledJob.find>);

            await ScheduledJobService.getScheduledJobs(userId, scheduleId, 'success');

            expect(findSpy).toHaveBeenCalledWith({
                scheduleId: scheduleIdObject,
                status: 'success',
            });
        });
    });

    describe('createScheduledJob', () => {
        it('throws when scheduleId is invalid', async () => {
            await expect(
                ScheduledJobService.createScheduledJob(userId, 'invalid-id')
            ).rejects.toThrow('Invalid schedule identifier');
        });

        it('throws when the schedule does not exist for the user', async () => {
            const scheduleId = new Types.ObjectId().toString();

            const existsSpy = jest.spyOn(Schedule, 'exists').mockResolvedValueOnce(null);

            await expect(
                ScheduledJobService.createScheduledJob(userId, scheduleId)
            ).rejects.toThrow('Schedule not found');

            const [existsFilter] = existsSpy.mock.calls[0] ?? [{}];

            expect(existsFilter).toMatchObject({ createdBy: userId });
            expect(existsFilter._id?.toString()).toBe(scheduleId);
        });

        it('creates a scheduled job with defaults when the schedule exists', async () => {
            const scheduleIdObject = new Types.ObjectId();
            const scheduleId = scheduleIdObject.toString();

            jest.spyOn(Schedule, 'exists').mockResolvedValueOnce(true as unknown as Awaited<ReturnType<typeof Schedule.exists>>);

            const createdDocument = {
                _id: new Types.ObjectId(),
                scheduleId: scheduleIdObject,
                startedAt: new Date('2024-01-01T00:00:00.000Z'),
                completedAt: null,
                status: 'pending',
            };

            const createSpy = jest.spyOn(ScheduledJob, 'create').mockResolvedValueOnce(
                createdDocument as unknown as Awaited<ReturnType<typeof ScheduledJob.create>>
            );

            const result = await ScheduledJobService.createScheduledJob(userId, scheduleId);

            expect(createSpy).toHaveBeenCalledWith({
                scheduleId: scheduleIdObject,
            });
            expect(result).toEqual({
                _id: createdDocument._id.toString(),
                scheduleId: scheduleIdObject.toString(),
                startedAt: createdDocument.startedAt,
                completedAt: undefined,
                status: 'pending',
            });
        });
    });
});
