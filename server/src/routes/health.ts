import { Router } from 'express';

const router = Router();

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Health check endpoint
 *     description: Returns the current health status of the API
 *     tags:
 *       - Health
 *     responses:
 *       200:
 *         description: System is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                   example: "2025-10-06T12:00:00Z"
 *                 content:
 *                   type: string
 *                   example: Health check successful
 */
router.get('/', (req, res) => {
    res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        content: 'Health check successful'
    });
});

export default router;
