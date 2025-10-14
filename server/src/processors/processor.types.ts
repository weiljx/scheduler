import type { IScheduledJobDocument } from '../models/scheduledJob.js';

export interface ProcessorResult {
    result?: unknown;
}

export interface Processor {
    readonly type: string;
    process(job: IScheduledJobDocument): Promise<ProcessorResult>;
}

