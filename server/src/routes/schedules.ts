import { Router } from 'express';
import { authenticateToken, type AuthRequest } from '../middleware/auth.js';
import { HttpStatus, HttpMessages } from '../constants/httpStatus.js';
import type { CreateScheduleRequest } from '../models/types.js';
import { ScheduleService } from '../services/scheduleService.js';
import {
    ScheduledJobService,
    ScheduledJobValidationError,
} from '../services/scheduledJobService.js';

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

        if (payload !== undefined && !ScheduleService.isJsonSerializable(payload)) {
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

/**
 * @swagger
 * /api/schedules/{scheduleId}/jobs:
 *   get:
 *     summary: Get scheduled job executions
 *     description: Retrieves scheduled job executions for a schedule owned by the authenticated user.
 *     tags:
 *       - Scheduled Jobs
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: scheduleId
 *         required: true
 *         schema:
 *           type: string
 *         description: The identifier of the schedule
 *       - in: query
 *         name: status
 *         required: false
 *         schema:
 *           type: string
 *           enum: [pending, started, success, failed]
 *         description: Optional status filter for the scheduled jobs
 *     responses:
 *       200:
 *         description: Scheduled jobs retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   _id:
 *                     type: string
 *                   scheduleId:
 *                     type: string
 *                   startedAt:
 *                     type: string
 *                     format: date-time
 *                   completedAt:
 *                     type: string
 *                     format: date-time
 *                     nullable: true
 *                   status:
 *                     type: string
 *                     enum: [pending, started, success, failed]
 *       400:
 *         description: Invalid request parameters
 *         content:
 *           application/json:
 *             example:
 *               error: Invalid status filter
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
router.get('/:scheduleId/jobs', authenticateToken, async (req: AuthRequest, res) => {
    try {
        const scheduleId = req.params.scheduleId as string;
        const statusFilter = ScheduledJobService.normalizeStatusFilter(req.query.status);

        const jobs = await ScheduledJobService.getScheduledJobs(req.user!.userId, scheduleId, statusFilter);

        return res.status(HttpStatus.OK).json(jobs);
    } catch (error) {
        if (error instanceof ScheduledJobValidationError) {
            return res.status(HttpStatus.BAD_REQUEST).json({ error: error.message });
        }
        console.error('Get scheduled jobs error:', error);
        return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: HttpMessages.INTERNAL_ERROR });
    }
});

/**
 * @swagger
 * /api/schedules/{scheduleId}/jobs:
 *   post:
 *     summary: Create a scheduled job execution
 *     description: Creates a scheduled job execution record for a schedule owned by the authenticated user.
 *     tags:
 *       - Scheduled Jobs
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: scheduleId
 *         required: true
 *         schema:
 *           type: string
 *         description: The identifier of the schedule
 *     responses:
 *       201:
 *         description: Scheduled job created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                 scheduleId:
 *                   type: string
 *                 startedAt:
 *                   type: string
 *                   format: date-time
 *                 completedAt:
 *                   type: string
 *                   format: date-time
 *                   nullable: true
 *                 status:
 *                   type: string
 *                   enum: [pending, started, success, failed]
 *       400:
 *         description: Invalid schedule identifier
 *         content:
 *           application/json:
 *             example:
 *               error: Invalid schedule identifier
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
 *       404:
 *         description: Schedule not found for the user
 *         content:
 *           application/json:
 *             example:
 *               error: Schedule not found
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             example:
 *               error: An internal error occurred
 */
router.post('/:scheduleId/jobs', authenticateToken, async (req: AuthRequest, res) => {
    try {
        const scheduleId = ScheduledJobService.normalizeScheduleId(req.params.scheduleId);
        const job = await ScheduledJobService.createScheduledJob(req.user!.userId, scheduleId);

        return res.status(HttpStatus.CREATED).json(job);
    } catch (error) {
        if (error instanceof ScheduledJobValidationError) {
            return res.status(HttpStatus.BAD_REQUEST).json({ error: error.message });
        }

        if (error instanceof Error && error.message === 'Schedule not found') {
            return res.status(HttpStatus.NOT_FOUND).json({ error: error.message });
        }
        console.error('Create scheduled job error:', error);
        return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: HttpMessages.INTERNAL_ERROR });
    }
});

export default router;
