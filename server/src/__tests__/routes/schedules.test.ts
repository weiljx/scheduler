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
    app.use((req, _res, next) => {
        if (req.headers['x-mock-payload'] === 'function') {
            req.body.payload = () => {};
        }
        next();
    });
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
        it('returns 201 with the created schedule when successful', async () => {
            const createdAt = '2025-10-08T00:00:00.000Z';
            const scheduleDocument = {
                toJSON: () => ({
                    _id: 'schedule-456',
                    name: 'Daily Report',
                    cron: '0 9 * * *',
                    description: 'Sends daily report',
                    payload: { reportType: 'daily' },
                    createdBy: 'user-123',
                    createdAt
                })
            } as unknown as Awaited<ReturnType<typeof ScheduleService.createSchedule>>;

            createScheduleMock.mockResolvedValueOnce(scheduleDocument);

            const response = await request(app)
                .post('/api/schedules')
                .send({
                    name: 'Daily Report',
                    cron: '0 9 * * *',
                    description: 'Sends daily report',
                    payload: { reportType: 'daily' }
                });

            expect(response.status).toBe(HttpStatus.CREATED);
            expect(response.body).toEqual(scheduleDocument.toJSON());
            expect(createScheduleMock).toHaveBeenCalledWith('user-123', {
                name: 'Daily Report',
                cron: '0 9 * * *',
                description: 'Sends daily report',
                payload: { reportType: 'daily' }
            });
        });

        it('omits optional fields when not provided', async () => {
            const scheduleDocument = {
                toJSON: () => ({
                    _id: 'schedule-789',
                    name: 'Heartbeat',
                    cron: '*/5 * * * *',
                    createdBy: 'user-123',
                    createdAt: '2025-10-08T00:05:00.000Z'
                })
            } as unknown as Awaited<ReturnType<typeof ScheduleService.createSchedule>>;

            createScheduleMock.mockResolvedValueOnce(scheduleDocument);

            const response = await request(app)
                .post('/api/schedules')
                .send({
                    name: 'Heartbeat',
                    cron: '*/5 * * * *'
                });

            expect(response.status).toBe(HttpStatus.CREATED);
            expect(response.body).toEqual(scheduleDocument.toJSON());
            expect(createScheduleMock).toHaveBeenCalledWith('user-123', {
                name: 'Heartbeat',
                cron: '*/5 * * * *'
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

        it('returns 400 when payload is not JSON-serializable', async () => {
            const response = await request(app)
                .post('/api/schedules')
                .set('x-mock-payload', 'function')
                .send({
                    name: 'Invalid payload job',
                    cron: '0 12 * * *'
                });

            expect(response.status).toBe(HttpStatus.BAD_REQUEST);
            expect(response.body).toEqual({
                error: 'Invalid payload: must be JSON-serializable'
            });
            expect(createScheduleMock).not.toHaveBeenCalled();
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
