import Schedule from '../../models/schedule.js';
import { ScheduleService } from '../../services/scheduleService.js';

describe('ScheduleService', () => {
    const userId = 'user-123';

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('createSchedule', () => {
        it('persists a schedule when the cron expression is valid', async () => {
            const payload = {
                name: 'Morning Sync',
                description: 'Daily stand-up meeting',
                cron: '* * * * *'
            };
            const createdSchedule = {
                id: 'schedule-456'
            } as Awaited<ReturnType<typeof Schedule.create>>;

            const createSpy = jest.spyOn(Schedule, 'create')
                .mockResolvedValueOnce(createdSchedule);

            const result = await ScheduleService.createSchedule(userId, payload);

            expect(createSpy).toHaveBeenCalledTimes(1);
            expect(createSpy).toHaveBeenCalledWith({
                name: payload.name,
                description: payload.description,
                cron: payload.cron,
                createdBy: userId
            });
            expect(result).toEqual({ scheduleId: createdSchedule.id });
        });

        it('throws when the cron expression is invalid', async () => {
            const payload = {
                name: 'Broken Job',
                description: 'Has an invalid cron expression',
                cron: 'not-a-valid-cron'
            };

            const createSpy = jest.spyOn(Schedule, 'create');

            await expect(
                ScheduleService.createSchedule(userId, payload)
            ).rejects.toThrow('Invalid cron expression');

            expect(createSpy).not.toHaveBeenCalled();
        });
    });
});
