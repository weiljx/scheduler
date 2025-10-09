import { Types } from 'mongoose';
import ScheduledJob from '../models/ScheduledJob.js';
import Schedule from '../models/schedule.js';
import type { IScheduledJob, ScheduledJobLeanDocument } from '../models/types.js';

export class ScheduledJobService {
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
        if (!Types.ObjectId.isValid(scheduleId)) {
            return [];
        }

        const scheduleObjectId = new Types.ObjectId(scheduleId);

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
            .lean<ScheduledJobLeanDocument>();

        return jobs.map((job) => {
            const normalizedScheduleId =
                job.scheduleId instanceof Types.ObjectId
                    ? job.scheduleId.toString()
                    : job.scheduleId;

            return {
                _id: job._id.toString(),
                scheduleId: normalizedScheduleId,
                startedAt: job.startedAt,
                completedAt: job.completedAt ?? undefined,
                status: job.status,
            };
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
        if (!Types.ObjectId.isValid(scheduleId)) {
            throw new Error('Invalid schedule identifier');
        }

        const scheduleObjectId = new Types.ObjectId(scheduleId);

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

        return {
            _id: created._id.toString(),
            scheduleId: created.scheduleId.toString(),
            startedAt: created.startedAt,
            completedAt: created.completedAt ?? undefined,
            status: created.status,
        };
    }
}

export default ScheduledJobService;
