import { Router } from 'express';
import { authenticateToken, type AuthRequest } from '../middleware/auth.js';
import { HttpStatus, HttpMessages } from '../constants/httpStatus.js';
import type { CreateScheduleRequest } from '../models/types.js';
import { ScheduleService } from '../services/scheduleService.js';

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
    if (value === null || typeof value !== 'object') {
        return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
};

const isJsonSerializable = (value: unknown): boolean => {
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
                return value.every(isJsonSerializable);
            }
            if (isPlainObject(value)) {
                return Object.values(value).every(isJsonSerializable);
            }
            return false;
        default:
            return false;
    }
};

const router = Router();

/**
 * @swagger
 * /api/schedules:
 *   post:
 *     summary: Create a schedule
 *     description: Creates a new schedule for the authenticated user.
 *     tags:
 *       - Schedules
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - cron
 *             properties:
 *               name:
 *                 type: string
 *                 example: Daily Report
 *               cron:
 *                 type: string
 *                 description: Cron expression in standard format
 *                 example: "0 9 * * *"
 *               description:
 *                 type: string
 *                 example: Triggers the daily reporting workflow
 *               payload:
 *                 description: Arbitrary JSON payload associated with the schedule
 *                 nullable: true
 *                 anyOf:
 *                   - type: object
 *                   - type: array
 *                   - type: string
 *                   - type: number
 *                   - type: boolean
 *                 example:
 *                   task: send-email
 *                   retries: 3
 *     responses:
 *       201:
 *         description: Schedule created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                   example: "671f2e98a3f0e91234bfc812"
 *                 name:
 *                   type: string
 *                   example: Daily Report
 *                 cron:
 *                   type: string
 *                   example: "0 9 * * *"
 *                 description:
 *                   type: string
 *                   nullable: true
 *                   example: Triggers the daily reporting workflow
 *                 payload:
 *                   nullable: true
 *                   description: Arbitrary JSON payload associated with the schedule
 *                 createdBy:
 *                   type: string
 *                   example: user-123
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                   example: "2024-04-05T09:00:00.000Z"
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             examples:
 *               invalidCron:
 *                 value:
 *                   error: Invalid cron expression
 *               missingFields:
 *                 value:
 *                   error: Required fields are missing
 *       401:
 *         description: Authentication required or invalid token
 *         content:
 *           application/json:
 *             examples:
 *               tokenRequired:
 *                 value:
 *                   message: Authentication token is required
 *               tokenInvalid:
 *                 value:
 *                   message: Invalid token
 *               tokenExpired:
 *                 value:
 *                   message: Token has expired
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             example:
 *               error: An internal error occurred
 */
router.post('/', authenticateToken, async (req: AuthRequest, res) => {
    try {
        const { name, cron, description, payload } = req.body as CreateScheduleRequest;

        if (!name || !cron) {
            return res.status(HttpStatus.BAD_REQUEST).json({ error: HttpMessages.MISSING_FIELDS });
        }

        if (payload !== undefined && !isJsonSerializable(payload)) {
            return res.status(HttpStatus.BAD_REQUEST).json({
                error: 'Invalid payload: must be JSON-serializable'
            });
        }

        const scheduleData: CreateScheduleRequest = { name, cron };
        if (description !== undefined) {
            scheduleData.description = description;
        }
        if (payload !== undefined) {
            scheduleData.payload = payload;
        }

        const createdSchedule = await ScheduleService.createSchedule(req.user!.userId, scheduleData);

        return res.status(HttpStatus.CREATED).json(createdSchedule.toJSON());
    } catch (error) {
        if (error instanceof Error && error.message === 'Invalid cron expression') {
            return res.status(HttpStatus.BAD_REQUEST).json({ error: 'Invalid cron expression' });
        }
        console.error('Create schedule error:', error);
        return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: HttpMessages.INTERNAL_ERROR });
    }
});

export default router;
