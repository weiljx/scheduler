import { Types } from 'mongoose';
import ScheduledJob from '../models/scheduledJob.js';
import Schedule from '../models/schedule.js';
import type { IScheduledJob, ScheduledJobLeanDocument } from '../models/types.js';

const ALLOWED_STATUSES: ReadonlyArray<IScheduledJob['status']> = ['pending', 'started', 'success', 'failed'];

export class ScheduledJobValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ScheduledJobValidationError';
    }
}

export class ScheduledJobService {
    /**
     * Normalizes a status filter value from incoming requests.
     *
     * @param status Raw status filter value (e.g., from query parameters)
     * @returns Normalized status or undefined if not provided
     * @throws {ScheduledJobValidationError} When the value cannot be normalized
     */
    static normalizeStatusFilter(status: unknown): IScheduledJob['status'] | undefined {
        if (status === undefined || status === null) {
            return undefined;
        }

        if (Array.isArray(status)) {
            return ScheduledJobService.normalizeStatusFilter(status[0]);
        }

        if (typeof status !== 'string') {
            throw new ScheduledJobValidationError('Invalid status filter');
        }

        const normalized = status.trim().toLowerCase();

        if (normalized.length === 0 || !ALLOWED_STATUSES.includes(normalized as IScheduledJob['status'])) {
            throw new ScheduledJobValidationError('Invalid status filter');
        }

        return normalized as IScheduledJob['status'];
    }

    /**
     * Validates and normalizes a schedule identifier string.
     *
     * @param scheduleId Schedule identifier from request params
     * @returns The normalized schedule identifier
     * @throws {ScheduledJobValidationError} When the identifier is missing or invalid
     */
    static normalizeScheduleId(scheduleId: unknown): string {
        if (typeof scheduleId !== 'string' || scheduleId.trim().length === 0) {
            throw new ScheduledJobValidationError('Invalid schedule identifier');
        }

        const normalized = scheduleId.trim();

        if (!Types.ObjectId.isValid(normalized)) {
            throw new ScheduledJobValidationError('Invalid schedule identifier');
        }

        return normalized;
    }
    /**
     * Retrieves scheduled jobs for a schedule owned by the given user.
     * Always enforces that the schedule belongs to the requesting user.
     *
     * @param userId The user requesting the scheduled jobs
     * @param scheduleId The schedule identifier to filter jobs by
     * @param status Optional status filter
     * @returns A list of scheduled jobs, or an empty array if the schedule is not found
     */
    static async getScheduledJobs(
        userId: string,
        scheduleId: string,
        status?: IScheduledJob['status']
    ): Promise<IScheduledJob[]> {
        const normalizedScheduleId = ScheduledJobService.normalizeScheduleId(scheduleId);
        const scheduleObjectId = new Types.ObjectId(normalizedScheduleId);

        const scheduleExists = await Schedule.exists({
            _id: scheduleObjectId,
            createdBy: userId,
        });

        if (!scheduleExists) {
            return [];
        }

        const query: { scheduleId: Types.ObjectId; status?: IScheduledJob['status'] } = {
            scheduleId: scheduleObjectId,
        };

        if (status) {
            query.status = status;
        }

        const jobs = await ScheduledJob.find(query)
            .sort({ startedAt: -1 })
            .lean<ScheduledJobLeanDocument[]>();

        return jobs.map((job): IScheduledJob => {
            const normalizedScheduleId =
                typeof job.scheduleId === 'string'
                    ? job.scheduleId
                    : job.scheduleId.toString();

            const normalizedJob: IScheduledJob = {
                _id: job._id.toString(),
                scheduleId: normalizedScheduleId,
                startedAt: job.startedAt,
                status: job.status,
            };

            if (job.completedAt) {
                normalizedJob.completedAt = job.completedAt;
            }

            return normalizedJob;
        });
    }

    /**
     * Creates a scheduled job for a schedule owned by the given user.
     *
     * @param userId The user creating the scheduled job
     * @param scheduleId The schedule identifier to create the job for     
     * @returns The created scheduled job
     * @throws {Error} When the schedule does not exist or is not owned by the user
     */
    static async createScheduledJob(
        userId: string,
        scheduleId: string
    ): Promise<IScheduledJob> {
        const normalizedScheduleId = ScheduledJobService.normalizeScheduleId(scheduleId);
        const scheduleObjectId = new Types.ObjectId(normalizedScheduleId);

        const scheduleExists = await Schedule.exists({
            _id: scheduleObjectId,
            createdBy: userId,
        });

        if (!scheduleExists) {
            throw new Error('Schedule not found');
        }

        const created = await ScheduledJob.create({
            scheduleId: scheduleObjectId,
        });

        const createdId = created._id as Types.ObjectId;
        const scheduleReference = created.scheduleId as Types.ObjectId | string;

        const createdIdString = createdId.toString();
        const scheduleIdString =
            typeof scheduleReference === 'string'
                ? scheduleReference
                : scheduleReference.toString();

        const job: IScheduledJob = {
            _id: createdIdString,
            scheduleId: scheduleIdString,
            startedAt: created.startedAt,
            status: created.status,
        };

        if (created.completedAt) {
            job.completedAt = created.completedAt;
        }

        return job;
    }
}

export default ScheduledJobService;
