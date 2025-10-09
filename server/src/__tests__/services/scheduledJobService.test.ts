import { Types } from 'mongoose';
import Schedule from '../../models/schedule.js';
import ScheduledJob from '../../models/scheduledJob.js';
import { ScheduledJobService, ScheduledJobValidationError } from '../../services/scheduledJobService.js';

describe('ScheduledJobService', () => {
    const userId = 'user-123';

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('normalizeStatusFilter', () => {
        it('returns undefined when status is not provided', () => {
            expect(ScheduledJobService.normalizeStatusFilter(undefined)).toBeUndefined();
            expect(ScheduledJobService.normalizeStatusFilter(null)).toBeUndefined();
        });

        it('normalizes string values to lowercase and trims whitespace', () => {
            expect(ScheduledJobService.normalizeStatusFilter(' success ')).toBe('success');
            expect(ScheduledJobService.normalizeStatusFilter('PENDING')).toBe('pending');
        });

        it('handles array inputs by using the first value', () => {
            expect(ScheduledJobService.normalizeStatusFilter(['failed', 'success'])).toBe('failed');
        });

        it('throws when the status value is invalid', () => {
            expect(() => ScheduledJobService.normalizeStatusFilter('invalid')).toThrow(
                ScheduledJobValidationError
            );
            expect(() => ScheduledJobService.normalizeStatusFilter(123)).toThrow(
                ScheduledJobValidationError
            );
        });
    });

    describe('getScheduledJobs', () => {
        it('throws a validation error when scheduleId is invalid', async () => {
            await expect(
                ScheduledJobService.getScheduledJobs(userId, 'invalid-id')
            ).rejects.toThrow(ScheduledJobValidationError);
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
        it('throws a validation error when scheduleId is invalid', async () => {
            await expect(
                ScheduledJobService.createScheduledJob(userId, 'invalid-id')
            ).rejects.toThrow(ScheduledJobValidationError);
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

    describe('normalizeScheduleId', () => {
        it('returns the trimmed schedule id when valid', () => {
            const scheduleId = new Types.ObjectId().toString();
            const result = ScheduledJobService.normalizeScheduleId(` ${scheduleId} `);
            expect(result).toBe(scheduleId);
        });

        it('throws when scheduleId is missing or empty', () => {
            expect(() => ScheduledJobService.normalizeScheduleId(undefined)).toThrow(
                ScheduledJobValidationError
            );
            expect(() => ScheduledJobService.normalizeScheduleId('   ')).toThrow(
                ScheduledJobValidationError
            );
        });

        it('throws when scheduleId is not a valid ObjectId', () => {
            expect(() => ScheduledJobService.normalizeScheduleId('invalid-id')).toThrow(
                ScheduledJobValidationError
            );
        });
    });
});
