import { Router } from 'express';
import { authenticateToken, type AuthRequest } from '../middleware/auth.js';
import { HttpStatus, HttpMessages } from '../constants/httpStatus.js';
import type { CreateScheduleRequest } from '../models/types.js';
import { ScheduleService } from '../services/scheduleService.js';

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
 *     responses:
 *       201:
 *         description: Schedule created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Schedule created successfully
 *                 scheduleId:
 *                   type: string
 *                   example: "671f2e98a3f0e91234bfc812"
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
        const { name, cron, description } = req.body as CreateScheduleRequest;

        if (!name || !cron) {
            return res.status(HttpStatus.BAD_REQUEST).json({ error: HttpMessages.MISSING_FIELDS });
        }

        const payload: CreateScheduleRequest = description !== undefined && description !== null
            ? { name, cron, description }
            : { name, cron };

        const { scheduleId } = await ScheduleService.createSchedule(req.user!.userId, payload);

        return res.status(HttpStatus.CREATED).json({
            message: 'Schedule created successfully',
            scheduleId,
        });
    } catch (error) {
        if (error instanceof Error && error.message === 'Invalid cron expression') {
            return res.status(HttpStatus.BAD_REQUEST).json({ error: 'Invalid cron expression' });
        }
        console.error('Create schedule error:', error);
        return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: HttpMessages.INTERNAL_ERROR });
    }
});

export default router;
