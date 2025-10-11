import express from 'express';
import request from 'supertest';
import { HttpStatus, HttpMessages } from '../../constants/httpStatus.js';
import schedulesRouter from '../../routes/schedules.js';
import { ScheduleService } from '../../services/scheduleService.js';
import { ScheduledJobService } from '../../services/scheduledJobService.js';

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
const getScheduledJobsMock = jest.spyOn(ScheduledJobService, 'getScheduledJobs');
const createScheduledJobMock = jest.spyOn(ScheduledJobService, 'createScheduledJob');

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
                    processor: 'report',
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
                    payload: { reportType: 'daily' },
                    processor: 'report'
                });

            expect(response.status).toBe(HttpStatus.CREATED);
            expect(response.body).toEqual(scheduleDocument.toJSON());
            expect(createScheduleMock).toHaveBeenCalledWith('user-123', {
                name: 'Daily Report',
                cron: '0 9 * * *',
                description: 'Sends daily report',
                payload: { reportType: 'daily' },
                processor: 'report'
            });
        });

        it('omits optional fields when not provided', async () => {
            const scheduleDocument = {
                toJSON: () => ({
                    _id: 'schedule-789',
                    name: 'Heartbeat',
                    cron: '*/5 * * * *',
                    processor: 'heartbeat',
                    createdBy: 'user-123',
                    createdAt: '2025-10-08T00:05:00.000Z'
                })
            } as unknown as Awaited<ReturnType<typeof ScheduleService.createSchedule>>;

            createScheduleMock.mockResolvedValueOnce(scheduleDocument);

            const response = await request(app)
                .post('/api/schedules')
                .send({
                    name: 'Heartbeat',
                    cron: '*/5 * * * *',
                    processor: 'heartbeat'
                });

            expect(response.status).toBe(HttpStatus.CREATED);
            expect(response.body).toEqual(scheduleDocument.toJSON());
            expect(createScheduleMock).toHaveBeenCalledWith('user-123', {
                name: 'Heartbeat',
                cron: '*/5 * * * *',
                processor: 'heartbeat'
            });
        });

        it('returns 400 when required fields are missing', async () => {
            const response = await request(app)
                .post('/api/schedules')
                .send({
                    name: 'Missing processor job',
                    cron: '0 10 * * *'
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
                    cron: 'invalid cron',
                    processor: 'report'
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
                    cron: '0 12 * * *',
                    processor: 'report'
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
                    cron: '0 0 1 * *',
                    processor: 'report'
                });

            expect(response.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
            expect(response.body).toEqual({ error: HttpMessages.INTERNAL_ERROR });
        });
    });

    describe('GET /api/schedules/:scheduleId/jobs', () => {
        const basePath = '/api/schedules';
        const scheduleId = '671f2e98a3f0e91234bfc812';

        it('returns 200 with scheduled jobs and delegates to the service', async () => {
            const jobs = [
                {
                    _id: 'job-1',
                    scheduleId,
                    startedAt: '2024-04-05T09:00:00.000Z',
                    status: 'success',
                },
            ];

            getScheduledJobsMock.mockResolvedValueOnce(jobs);

            const response = await request(app)
                .get(`${basePath}/${scheduleId}/jobs`)
                .query({ status: 'success' });

            expect(response.status).toBe(HttpStatus.OK);
            expect(response.body).toEqual(jobs);
            expect(getScheduledJobsMock).toHaveBeenCalledWith('user-123', scheduleId, 'success');
        });

        it('returns 400 when the status filter is invalid', async () => {
            const response = await request(app)
                .get(`${basePath}/${scheduleId}/jobs`)
                .query({ status: 'invalid-status' });

            expect(response.status).toBe(HttpStatus.BAD_REQUEST);
            expect(response.body).toEqual({ error: 'Invalid status filter' });
            expect(getScheduledJobsMock).not.toHaveBeenCalled();
        });

        it('returns 200 when no status filter is provided', async () => {
            getScheduledJobsMock.mockResolvedValueOnce([]);

            const response = await request(app).get(`${basePath}/${scheduleId}/jobs`);

            expect(response.status).toBe(HttpStatus.OK);
            expect(response.body).toEqual([]);
            expect(getScheduledJobsMock).toHaveBeenCalledWith('user-123', scheduleId, undefined);
        });

        it('returns 500 when an unexpected error occurs', async () => {
            getScheduledJobsMock.mockRejectedValueOnce(new Error('Database error'));

            const response = await request(app).get(`${basePath}/${scheduleId}/jobs`);

            expect(response.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
            expect(response.body).toEqual({ error: HttpMessages.INTERNAL_ERROR });
        });
    });

    describe('POST /api/schedules/:scheduleId/jobs', () => {
        const basePath = '/api/schedules';
        const scheduleId = '671f2e98a3f0e91234bfc812';

        it('returns 201 with the created scheduled job when successful', async () => {
            const createdJob = {
                _id: 'job-123',
                scheduleId,
                startedAt: '2024-04-05T09:00:00.000Z',
                status: 'pending',
            };

            createScheduledJobMock.mockResolvedValueOnce(createdJob);

            const response = await request(app).post(`${basePath}/${scheduleId}/jobs`);

            expect(response.status).toBe(HttpStatus.CREATED);
            expect(response.body).toEqual(createdJob);
            expect(createScheduledJobMock).toHaveBeenCalledWith('user-123', scheduleId);
        });

        it('returns 400 when the schedule identifier is invalid', async () => {
            const response = await request(app).post(`${basePath}/invalid-id/jobs`);

            expect(response.status).toBe(HttpStatus.BAD_REQUEST);
            expect(response.body).toEqual({ error: 'Invalid schedule identifier' });
            expect(createScheduledJobMock).not.toHaveBeenCalled();
        });

        it('returns 404 when the schedule is not found for the user', async () => {
            createScheduledJobMock.mockRejectedValueOnce(new Error('Schedule not found'));

            const response = await request(app).post(`${basePath}/${scheduleId}/jobs`);

            expect(response.status).toBe(HttpStatus.NOT_FOUND);
            expect(response.body).toEqual({ error: 'Schedule not found' });
        });

        it('returns 500 when an unexpected error occurs', async () => {
            createScheduledJobMock.mockRejectedValueOnce(new Error('Database failure'));

            const response = await request(app).post(`${basePath}/${scheduleId}/jobs`);

            expect(response.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
            expect(response.body).toEqual({ error: HttpMessages.INTERNAL_ERROR });
        });
    });
});
