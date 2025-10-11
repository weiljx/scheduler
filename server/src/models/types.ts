import type { Types } from 'mongoose';

/**
 * Represents the payload structure of a JWT token
 */
export interface JWTPayload {
    userId: string;
    email: string;
}

/**
 * Represents a blacklisted JWT token
 */
export interface IBlacklistedToken {
    token: string;
    createdAt: Date;
}

/**
 * Represents a schedule in the system
 */
export interface ISchedule {
    _id?: string;
    name: string;
    description?: string;
    cron: string;
    processor: string;
    createdBy: string;
    createdAt?: Date;
    payload?: unknown;
}

/**
 * Represents a scheduled job in the system
 */
export interface IScheduledJob {
    _id?: string;
    scheduleId: string;
    startedAt: Date;
    completedAt?: Date;
    status: 'pending' | 'started' | 'success' | 'failed';
}

/**
 * Lean version of ScheduledJob for performance-sensitive queries
 */
export type ScheduledJobLeanDocument = {
    _id: Types.ObjectId;
    scheduleId: Types.ObjectId | string;
    startedAt: Date;
    completedAt?: Date;
    status: IScheduledJob['status'];
};

/**
 * Context information passed to scheduler tick handlers.
 */
export interface SchedulerTickContext {
    intervalMs: number;
    timezone?: string;
}

/**
 * Represents a schedule due for execution in the current tick.
 */
export interface SchedulerTickDueSchedule {
    scheduleId: string;
    userId: string;
}

/**
 * Result returned by scheduler tick handlers.
 */
export interface SchedulerTickResult {
    dueSchedules: SchedulerTickDueSchedule[];
}

/**
 * Shape of the scheduler worker tick handler.
 */
export type SchedulerTickHandler = (
    now: Date,
    context: SchedulerTickContext
) => Promise<SchedulerTickResult>;

/**
 * Logger surface that the scheduler worker relies on.
 */
export type SchedulerLogger = Pick<
    Console,
    'log' | 'info' | 'warn' | 'error' | 'debug'
>;

/**
 * OS signals that the worker handles to shutdown gracefully.
 */
export type SchedulerSignal = 'SIGINT' | 'SIGTERM';

/**
 * Minimal process contract used by the worker for env access and signal hooks.
 */
export interface SchedulerProcessLike {
    env: Record<string, string | undefined>;
    on(signal: SchedulerSignal, handler: () => void): void;
    off?(signal: SchedulerSignal, handler: () => void): void;
    removeListener?(signal: SchedulerSignal, handler: () => void): void;
    exit(code?: number): void;
    kill?(pid: number, signal?: SchedulerSignal | number): void;
    pid?: number;
}

/**
 * Configuration accepted by the scheduler worker factory.
 */
export interface SchedulerWorkerOptions {
    enabled?: boolean;
    intervalMs?: number;
    tickHandler?: SchedulerTickHandler;
    logger?: SchedulerLogger;
    process?: SchedulerProcessLike;
    timezone?: string;
}

/**
 * Request body for creating a new schedule
 */
export interface CreateScheduleRequest {
    name: string;
    description?: string;
    cron: string;
    payload?: unknown;
}

/**
 * Success response for schedule creation
 */
export interface CreateScheduleResponse {
    message: string;
    scheduleId: string;
}

/**
 * Error response structure
 */
export interface ErrorResponse {
    error: string;
}
