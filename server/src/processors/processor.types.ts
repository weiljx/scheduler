import type { IScheduledJobDocument } from '../models/scheduledJob.js';

export interface ProcessorResult {
    result?: unknown;
}

export interface ProcessorContext {
    schedule?: {
        _id?: unknown;
        processor?: string;
        payload?: unknown;
        createdBy?: string;
    };
}

export interface Processor {
    readonly type: string;
    process(job: IScheduledJobDocument, context: ProcessorContext): Promise<ProcessorResult>;
}
