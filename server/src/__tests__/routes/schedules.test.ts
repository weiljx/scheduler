import express from 'express';
import request from 'supertest';
import { HttpStatus, HttpMessages } from '../../constants/httpStatus.js';
import schedulesRouter from '../../routes/schedules.js';
import { ScheduleService } from '../../services/scheduleService.js';

jest.mock('../../middleware/auth.js', () => ({
    __esModule: true,
    authenticateToken: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
        req.user = {
            userId: 'user-123',
            email: 'user@example.com'
        };
        next();
    }
}));

const createScheduleMock = jest.spyOn(ScheduleService, 'createSchedule');

const buildApp = () => {
    const app = express();
    app.use(express.json());
    app.use('/api/schedules', schedulesRouter);
    return app;
};

describe('Schedules Routes', () => {
    let app: express.Express;
    let consoleErrorSpy: jest.SpyInstance;

    beforeAll(() => {
        app = buildApp();
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {
            // Suppress expected error logs during tests
        });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    afterAll(() => {
        consoleErrorSpy.mockRestore();
        jest.restoreAllMocks();
    });

    describe('POST /api/schedules', () => {
        it('returns 201 when a schedule is created successfully', async () => {
            createScheduleMock.mockResolvedValueOnce({ scheduleId: 'schedule-456' });

            const response = await request(app)
                .post('/api/schedules')
                .send({
                    name: 'Daily Report',
                    cron: '0 9 * * *',
                    description: 'Sends daily report'
                });

            expect(response.status).toBe(HttpStatus.CREATED);
            expect(response.body).toEqual({
                message: 'Schedule created successfully',
                scheduleId: 'schedule-456'
            });
            expect(createScheduleMock).toHaveBeenCalledWith('user-123', {
                name: 'Daily Report',
                cron: '0 9 * * *',
                description: 'Sends daily report'
            });
        });

        it('returns 400 when required fields are missing', async () => {
            const response = await request(app)
                .post('/api/schedules')
                .send({
                    description: 'Missing required fields'
                });

            expect(response.status).toBe(HttpStatus.BAD_REQUEST);
            expect(response.body).toEqual({ error: HttpMessages.MISSING_FIELDS });
            expect(createScheduleMock).not.toHaveBeenCalled();
        });

        it('returns 400 when cron validation fails', async () => {
            createScheduleMock.mockRejectedValueOnce(new Error('Invalid cron expression'));

            const response = await request(app)
                .post('/api/schedules')
                .send({
                    name: 'Broken job',
                    cron: 'invalid cron'
                });

            expect(response.status).toBe(HttpStatus.BAD_REQUEST);
            expect(response.body).toEqual({ error: 'Invalid cron expression' });
        });

        it('returns 500 when an unexpected error occurs', async () => {
            createScheduleMock.mockRejectedValueOnce(new Error('Database offline'));

            const response = await request(app)
                .post('/api/schedules')
                .send({
                    name: 'Monthly summary',
                    cron: '0 0 1 * *'
                });

            expect(response.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
            expect(response.body).toEqual({ error: HttpMessages.INTERNAL_ERROR });
        });
    });
});
