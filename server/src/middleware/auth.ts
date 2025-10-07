import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthService } from '../services/authService.js';
import { type JWTPayload } from '../models/types.js';
import { HttpStatus, HttpMessages } from '../constants/httpStatus.js';

export interface AuthRequest extends Request {
    user?: JWTPayload;
}

/**
 * Middleware to authenticate requests using JWT tokens
 * Extracts the token from the Authorization header, verifies it,
 * and attaches the decoded user information to the request object
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
