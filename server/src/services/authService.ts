import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/jwt.js';
import BlacklistedToken from '../models/blacklistedToken.js';
import { type JWTPayload } from '../models/types.js';

export class AuthService {
    /**
     * Verifies and decodes a JWT token
     * @param token The JWT token to verify
     * @returns The decoded token payload
     * @throws {jwt.TokenExpiredError} If the token has expired
     * @throws {jwt.JsonWebTokenError} If the token is invalid
     */
    static async verifyToken(token: string): Promise<JWTPayload> {
        // Check if token is blacklisted
        const blacklistedToken = await BlacklistedToken.findOne({ token });
        if (blacklistedToken) {
            throw new Error('Token has been invalidated');
        }

        // Verify and decode token
        const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
        return decoded;
    }

    /**
     * Extracts the token from the Authorization header
     * @param authHeader The Authorization header value
     * @returns The extracted token
     * @throws {Error} If no token is provided
     */
    static extractTokenFromHeader(authHeader?: string): string {
        const token = authHeader?.split(' ')[1];
        if (!token) {
            throw new Error('Authentication token is required');
        }
        return token;
    }

    /**
     * Adds a token to the blacklist
     * @param token The token to blacklist
     */
    static async blacklistToken(token: string): Promise<void> {
        await BlacklistedToken.create({ token });
    }
}
