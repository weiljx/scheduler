import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthService } from '../services/authService.js';
import { type JWTPayload } from '../models/types.js';
import { HttpStatus, HttpMessages } from '../constants/httpStatus.js';

/**
 * Extended Express Request interface that includes the authenticated user information
 * @interface AuthRequest
 * @extends {Request}
 */
export interface AuthRequest extends Request {
    /** The authenticated user's JWT payload containing user information */
    user?: JWTPayload;
}

/**
 * Middleware to authenticate requests using JWT tokens.
 * 
 * This middleware verifies that a valid JWT token is present in the Authorization header
 * and attaches the decoded user information to the request object. The token must be
 * provided in the Bearer authentication scheme format.
 * 
 * Authorization Flow:
 * 1. Extracts Bearer token from Authorization header
 * 2. Verifies token signature and expiration
 * 3. Checks if token is blacklisted
 * 4. Attaches decoded user data to request
 * 
 * @example
 * // Required Authorization header format
 * Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 * 
 * @example
 * // Successful authentication - user data attached to request
 * req.user = {
 *   userId: "123",
 *   email: "user@example.com"
 * }
 * 
 * @example
 * // Error Responses:
 * // Missing token (401 Unauthorized)
 * {
 *   "message": "Authentication token is required"
 * }
 * 
 * // Invalid token (403 Forbidden)
 * {
 *   "message": "Invalid token"
 * }
 * 
 * // Expired token (401 Unauthorized)
 * {
 *   "message": "Token has expired"
 * }
 * 
 * // Blacklisted token (401 Unauthorized)
 * {
 *   "message": "Token has been invalidated"
 * }
 */
export const authenticateToken = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = AuthService.extractTokenFromHeader(authHeader);
        const decoded = await AuthService.verifyToken(token);
        req.user = decoded;
        next();
    } catch (error) {
        if (error instanceof jwt.TokenExpiredError) {
            return res.status(HttpStatus.UNAUTHORIZED).json({ message: HttpMessages.TOKEN_EXPIRED });
        }
        if (error instanceof jwt.JsonWebTokenError) {
            return res.status(HttpStatus.FORBIDDEN).json({ message: HttpMessages.TOKEN_INVALID });
        }
        if (error instanceof Error && error.message === HttpMessages.TOKEN_BLACKLISTED) {
            return res.status(HttpStatus.UNAUTHORIZED).json({ message: HttpMessages.TOKEN_BLACKLISTED });
        }
        if (error instanceof Error && error.message === HttpMessages.TOKEN_REQUIRED) {
            return res.status(HttpStatus.UNAUTHORIZED).json({ message: HttpMessages.TOKEN_REQUIRED });
        }
        console.error('Authentication error:', error);
        return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: HttpMessages.INTERNAL_ERROR });
    }
};
