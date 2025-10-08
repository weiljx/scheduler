import { Router } from 'express';
import healthRouter from './health.js';
import authRouter from './auth.js';
import schedulesRouter from './schedules.js';

const router = Router();

router.use('/health', healthRouter);
router.use('/auth', authRouter);
router.use('/schedules', schedulesRouter);

export default router;
