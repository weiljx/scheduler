import type { Processor, ProcessorResult, ProcessorContext } from './processor.types.js';
import type { IScheduledJobDocument } from '../models/scheduledJob.js';

/**
 * Basic processor used when a job does not specify a custom handler.
 *
 * The implementation simply logs metadata about the job and the payload that
 * was captured from the originating schedule. This makes it a safe default for
 * smoke-testing dispatcher behaviour before introducing real side effects.
 */
export class DefaultProcessor implements Processor {
    static readonly type = 'default';

    readonly type = DefaultProcessor.type;

    /**
     * Logs the job identifier along with the associated schedule payload.
     *
     * @param job        Job document claimed by the dispatcher.
     * @param context    Additional schedule context fetched by the dispatcher.
     */
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
