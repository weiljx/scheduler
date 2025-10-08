import { isValidCron as validateCron } from 'cron-validator';
import Schedule from '../models/schedule.js';
import type { CreateScheduleRequest } from '../models/types.js';

export class ScheduleService {
    /**
     * Creates a new schedule for the given user.
     * Performs cron validation before persisting to the database.
     *
     * @param userId The ID of the authenticated user creating the schedule
     * @param data The schedule creation payload
     * @returns An object containing the created schedule ID
     * @throws {Error} If the cron expression is invalid
     */
    static async createSchedule(
        userId: string,
        data: CreateScheduleRequest
    ): Promise<{ scheduleId: string }> {
        const { name, description, cron } = data;

        // Validate cron expression early for clear, consistent error message
        if (!validateCron(cron)) {
            throw new Error('Invalid cron expression');
        }

        const created = await Schedule.create({
            name,
            description,
            cron,
            createdBy: userId,
        });

        return { scheduleId: created.id };
    }
}

export default ScheduleService;

