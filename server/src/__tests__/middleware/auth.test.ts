/// <reference types="jest" />

import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { authenticateToken } from '../../middleware/auth.js';
import type { AuthRequest } from '../../middleware/auth.js';
import { AuthService } from '../../services/authService.js';
import { HttpStatus, HttpMessages } from '../../constants/httpStatus.js';
import type { JWTPayload } from '../../models/types.js';

// Mock the AuthService
jest.mock('../../services/authService.js');

describe('Auth Middleware', () => {
    let mockRequest: Partial<AuthRequest>;
    let mockResponse: Partial<Response>;
    let nextFunction: NextFunction;

    beforeEach(() => {
        // Reset mocks before each test
        jest.clearAllMocks();

        // Setup request mock
        mockRequest = {
            headers: {} as { [key: string]: string | string[] | undefined },
            user: null as unknown as JWTPayload
        };

        // Setup response mock
        mockResponse = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };

        // Setup next function mock
        nextFunction = jest.fn();
    });

    describe('Valid Token Scenarios', () => {
        const validToken = 'valid.jwt.token';
        const validPayload: JWTPayload = {
            userId: '123',
            email: 'test@example.com'
        };

        it('should process a valid token and set user in request', async () => {
            // Arrange
            mockRequest.headers = {
                authorization: `Bearer ${validToken}`
            };
            jest.spyOn(AuthService, 'extractTokenFromHeader').mockReturnValue(validToken);
            jest.spyOn(AuthService, 'verifyToken').mockResolvedValue(validPayload);

            // Act
            await authenticateToken(
                mockRequest as AuthRequest,
                mockResponse as Response,
                nextFunction
            );

            // Assert
            expect(nextFunction).toHaveBeenCalled();
            expect(mockRequest.user).toEqual(validPayload);
            expect(mockResponse.status).not.toHaveBeenCalled();
            expect(mockResponse.json).not.toHaveBeenCalled();
        });
    });

    describe('Invalid Token Scenarios', () => {
        it('should return 401 when no token is provided', async () => {
            // Arrange
            mockRequest.headers = {};
            jest.spyOn(AuthService, 'extractTokenFromHeader')
                .mockImplementation(() => {
                    throw new Error(HttpMessages.TOKEN_REQUIRED);
                });

            // Act
            await authenticateToken(
                mockRequest as AuthRequest,
                mockResponse as Response,
                nextFunction
            );

            // Assert
            expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
            expect(mockResponse.json).toHaveBeenCalledWith({
                message: HttpMessages.TOKEN_REQUIRED
            });
            expect(nextFunction).not.toHaveBeenCalled();
        });

        it('should return 401 when token is expired', async () => {
            // Arrange
            const expiredToken = 'expired.token';
            mockRequest.headers = {
                authorization: `Bearer ${expiredToken}`
            };
            jest.spyOn(AuthService, 'extractTokenFromHeader').mockReturnValue(expiredToken);
            jest.spyOn(AuthService, 'verifyToken')
                .mockRejectedValue(new jwt.TokenExpiredError('Token expired', new Date()));

            // Act
            await authenticateToken(
                mockRequest as AuthRequest,
                mockResponse as Response,
                nextFunction
            );

            // Assert
            expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
            expect(mockResponse.json).toHaveBeenCalledWith({
                message: HttpMessages.TOKEN_EXPIRED
            });
            expect(nextFunction).not.toHaveBeenCalled();
        });

        it('should return 403 when token is malformed', async () => {
            // Arrange
            const malformedToken = 'malformed.token';
            mockRequest.headers = {
                authorization: `Bearer ${malformedToken}`
            };
            jest.spyOn(AuthService, 'extractTokenFromHeader').mockReturnValue(malformedToken);
            jest.spyOn(AuthService, 'verifyToken')
                .mockRejectedValue(new jwt.JsonWebTokenError('Invalid token'));

            // Act
            await authenticateToken(
                mockRequest as AuthRequest,
                mockResponse as Response,
                nextFunction
            );

            // Assert
            expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
            expect(mockResponse.json).toHaveBeenCalledWith({
                message: HttpMessages.TOKEN_INVALID
            });
            expect(nextFunction).not.toHaveBeenCalled();
        });

        it('should return 401 when token is blacklisted', async () => {
            // Arrange
            const blacklistedToken = 'blacklisted.token';
            mockRequest.headers = {
                authorization: `Bearer ${blacklistedToken}`
            };
            jest.spyOn(AuthService, 'extractTokenFromHeader').mockReturnValue(blacklistedToken);
            jest.spyOn(AuthService, 'verifyToken')
                .mockRejectedValue(new Error(HttpMessages.TOKEN_BLACKLISTED));

            // Act
            await authenticateToken(
                mockRequest as AuthRequest,
                mockResponse as Response,
                nextFunction
            );

            // Assert
            expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
            expect(mockResponse.json).toHaveBeenCalledWith({
                message: HttpMessages.TOKEN_BLACKLISTED
            });
            expect(nextFunction).not.toHaveBeenCalled();
        });
    });

    describe('Error Handling', () => {
        it('should return 500 for unexpected errors', async () => {
            // Arrange
            const token = 'some.token';
            mockRequest.headers = {
                authorization: `Bearer ${token}`
            };
            jest.spyOn(AuthService, 'extractTokenFromHeader').mockReturnValue(token);
            jest.spyOn(AuthService, 'verifyToken')
                .mockRejectedValue(new Error('Unexpected error'));

            // Act
            await authenticateToken(
                mockRequest as AuthRequest,
                mockResponse as Response,
                nextFunction
            );

            // Assert
            expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
            expect(mockResponse.json).toHaveBeenCalledWith({
                message: HttpMessages.INTERNAL_ERROR
            });
            expect(nextFunction).not.toHaveBeenCalled();
        });
    });
});
