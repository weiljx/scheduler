import type { Processor, ProcessorResult } from './processor.types.js';
import type { IScheduledJobDocument } from '../models/scheduledJob.js';

export class DefaultProcessor implements Processor {
    static readonly type = 'default';

    readonly type = DefaultProcessor.type;

    async process(job: IScheduledJobDocument): Promise<ProcessorResult> {
        const payload = (job as { payload?: unknown }).payload ?? null;

        console.log(
            `[DefaultProcessor] jobId=${job._id.toString()}`,
            { payload }
        );

        return {
            result: {
                message: 'Default processor logged job and payload',
            },
        };
    }
}

