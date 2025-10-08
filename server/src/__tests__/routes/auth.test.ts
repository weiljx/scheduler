import type { Response } from 'express';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { AuthService } from '../../services/authService.js';
import { HttpStatus, HttpMessages } from '../../constants/httpStatus.js';
import { type AuthRequest } from '../../middleware/auth.js';
import User from '../../models/user.js';
import authRouter from '../../routes/auth.js';
import express from 'express';
import request from 'supertest';

// Create Express app for testing
const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);

describe('Auth Routes', () => {
    let mongod: MongoMemoryServer;

    beforeAll(async () => {
        // Setup in-memory MongoDB
        mongod = await MongoMemoryServer.create();
        const uri = mongod.getUri();
        await mongoose.connect(uri);
    });

    afterAll(async () => {
        // Cleanup
        await mongoose.disconnect();
        await mongod.stop();
    });

    beforeEach(async () => {
        // Clear database before each test
        await User.deleteMany({});
    });

    describe('POST /api/auth/register', () => {
        const validUser = {
            email: 'test@example.com',
            password: 'Password123!'
        };

        it('should successfully register a new user', async () => {
            const response = await request(app)
                .post('/api/auth/register')
                .send(validUser);

            expect(response.status).toBe(HttpStatus.CREATED);
            expect(response.body).toHaveProperty('message', HttpMessages.REGISTRATION_SUCCESS);
            expect(response.body).toHaveProperty('userId');

            // Verify user was created in database
            const user = await User.findById(response.body.userId);
            expect(user).toBeTruthy();
            expect(user?.email).toBe(validUser.email);
        });

        it('should reject registration with missing fields', async () => {
            const response = await request(app)
                .post('/api/auth/register')
                .send({ email: validUser.email });

            expect(response.status).toBe(HttpStatus.BAD_REQUEST);
            expect(response.body).toHaveProperty('message', HttpMessages.MISSING_FIELDS);
        });

        it('should reject registration with invalid email', async () => {
            const response = await request(app)
                .post('/api/auth/register')
                .send({ ...validUser, email: 'invalid-email' });

            expect(response.status).toBe(HttpStatus.BAD_REQUEST);
            expect(response.body).toHaveProperty('message', HttpMessages.INVALID_EMAIL);
        });

        it('should reject duplicate email registration', async () => {
            // Register first user
            await request(app)
                .post('/api/auth/register')
                .send(validUser);

            // Try to register same email again
            const response = await request(app)
                .post('/api/auth/register')
                .send(validUser);

            expect(response.status).toBe(HttpStatus.CONFLICT);
            expect(response.body).toHaveProperty('message', HttpMessages.USER_EXISTS);
        });
    });

    describe('POST /api/auth/login', () => {
        const validUser = {
            email: 'test@example.com',
            password: 'Password123!'
        };

        beforeEach(async () => {
            // Create a user before each login test
            await request(app)
                .post('/api/auth/register')
                .send(validUser);
        });

        it('should successfully login with valid credentials', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send(validUser);

            expect(response.status).toBe(HttpStatus.OK);
            expect(response.body).toHaveProperty('message', HttpMessages.LOGIN_SUCCESS);
            expect(response.body).toHaveProperty('token');
            expect(response.body).toHaveProperty('user');
            expect(response.body.user).toHaveProperty('email', validUser.email);
        });

        it('should reject login with incorrect password', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: validUser.email,
                    password: 'wrongpassword'
                });

            expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
            expect(response.body).toHaveProperty('message', HttpMessages.INVALID_CREDENTIALS);
        });

        it('should reject login with non-existent email', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'nonexistent@example.com',
                    password: validUser.password
                });

            expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
            expect(response.body).toHaveProperty('message', HttpMessages.INVALID_CREDENTIALS);
        });

        it('should reject login with missing fields', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({ email: validUser.email });

            expect(response.status).toBe(HttpStatus.BAD_REQUEST);
            expect(response.body).toHaveProperty('message', HttpMessages.MISSING_FIELDS);
        });
    });

    describe('POST /api/auth/logout', () => {
        let validToken: string;

        beforeEach(async () => {
            // Create and login a user before each logout test
            const user = {
                email: 'test@example.com',
                password: 'Password123!'
            };

            await request(app)
                .post('/api/auth/register')
                .send(user);

            const loginResponse = await request(app)
                .post('/api/auth/login')
                .send(user);

            validToken = loginResponse.body.token;
        });

        it('should successfully logout with valid token', async () => {
            const response = await request(app)
                .post('/api/auth/logout')
                .set('Authorization', `Bearer ${validToken}`);

            expect(response.status).toBe(HttpStatus.OK);
            expect(response.body).toHaveProperty('message', HttpMessages.LOGOUT_SUCCESS);

            // Verify token is blacklisted by trying to use it again
            const secondResponse = await request(app)
                .post('/api/auth/logout')
                .set('Authorization', `Bearer ${validToken}`);

            expect(secondResponse.status).toBe(HttpStatus.UNAUTHORIZED);
            expect(secondResponse.body).toHaveProperty('message', HttpMessages.TOKEN_BLACKLISTED);
        });

        it('should reject logout without token', async () => {
            const response = await request(app)
                .post('/api/auth/logout');

            expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
            expect(response.body).toHaveProperty('message', HttpMessages.TOKEN_REQUIRED);
        });

        it('should reject logout with invalid token', async () => {
            const response = await request(app)
                .post('/api/auth/logout')
                .set('Authorization', 'Bearer invalid.token.here');

            expect(response.status).toBe(HttpStatus.FORBIDDEN);
            expect(response.body).toHaveProperty('message', HttpMessages.TOKEN_INVALID);
        });
    });
});
