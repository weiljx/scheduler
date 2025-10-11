import { isValidCron as validateCron } from 'cron-validator';
import Schedule, { type IScheduleDocument } from '../models/schedule.js';
import type { CreateScheduleRequest } from '../models/types.js';

export class ScheduleService {
    /**
     * Creates a new schedule for the given user.
     * Performs cron validation before persisting to the database.
     *
     * @param userId The ID of the authenticated user creating the schedule
     * @param data The schedule creation payload
     * @returns The created schedule document
     * @throws {Error} If the cron expression is invalid
     */
    static async createSchedule(
        userId: string,
        data: CreateScheduleRequest
    ): Promise<IScheduleDocument> {
        const { name, description, cron, payload, processor } = data;

        // Validate cron expression early for clear, consistent error message
        if (!validateCron(cron)) {
            throw new Error('Invalid cron expression');
        }

        const created = await Schedule.create({
            name,
            description,
            cron,
            payload,
            processor,
            createdBy: userId,
        });

        return created;
    }

    static isJsonSerializable(value: unknown): boolean {
        if (value === null) {
            return true;
        }

        switch (typeof value) {
            case 'string':
            case 'boolean':
                return true;
            case 'number':
                return Number.isFinite(value);
            case 'object':
                if (Array.isArray(value)) {
                    return value.every((item) => ScheduleService.isJsonSerializable(item));
                }
                if (ScheduleService.isPlainObject(value)) {
                    return Object.values(value).every((item) => ScheduleService.isJsonSerializable(item));
                }
                return false;
            default:
                return false;
        }
    }

    private static isPlainObject(value: unknown): value is Record<string, unknown> {
        if (value === null || typeof value !== 'object') {
            return false;
        }
        const prototype = Object.getPrototypeOf(value);
        return prototype === Object.prototype || prototype === null;
    }
}

export default ScheduleService;

