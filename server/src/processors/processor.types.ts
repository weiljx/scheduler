import type { IScheduledJobDocument } from '../models/scheduledJob.js';

/**
 * Shape returned by processor implementations after handling a job.
 * The dispatcher currently stores only success/failure status, but the
 * result payload allows processors to surface optional metadata.
 */
export interface ProcessorResult {
    result?: unknown;
}

/**
 * Supplemental data fetched by the dispatcher and passed alongside a job.
 * Processors can rely on this for schedule-driven configuration or payloads.
 */
export interface ProcessorContext {
    schedule?: {
        _id?: unknown;
        processor?: string;
        payload?: unknown;
        createdBy?: string;
    };
}

/**
 * Contract every job processor must fulfil so the dispatcher can route work
 * without knowing implementation details.
 */
export interface Processor {
    readonly type: string;
    process(job: IScheduledJobDocument, context: ProcessorContext): Promise<ProcessorResult>;
}
