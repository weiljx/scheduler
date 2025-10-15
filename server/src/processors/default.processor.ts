import type { Processor, ProcessorResult, ProcessorContext } from './processor.types.js';
import type { IScheduledJobDocument } from '../models/scheduledJob.js';

export class DefaultProcessor implements Processor {
    static readonly type = 'default';

    readonly type = DefaultProcessor.type;

    async process(
        job: IScheduledJobDocument,
        context: ProcessorContext
    ): Promise<ProcessorResult> {
        const payload = context.schedule?.payload ?? null;
        const scheduleIdRaw =
            context.schedule?._id ?? job.scheduleId ?? '(unknown)';
        const scheduleId = String(scheduleIdRaw);
        const jobId = String(job._id);

        console.log(
            `[DefaultProcessor] jobId=${jobId} scheduleId=${scheduleId}`,
            { payload }
        );

        return {
            result: {
                message: 'Default processor logged job and payload',
            },
        };
    }
}
