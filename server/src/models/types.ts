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
    createdBy: string;
    createdAt?: Date;
    payload?: unknown;
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
