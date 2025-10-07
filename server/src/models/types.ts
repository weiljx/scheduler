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
