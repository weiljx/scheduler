import { Router } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/user.js';
import { JWT_SECRET, JWT_EXPIRES_IN } from '../config/jwt.js';
import { authenticateToken, type AuthRequest } from '../middleware/auth.js';
import { AuthService } from '../services/authService.js';
import { HttpStatus, HttpMessages } from '../constants/httpStatus.js';

const router = Router();

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     description: |
 *       Creates a new user account. The email must be unique and in a valid format.
 *       The password will be automatically hashed before storage.
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: "Password123!"
 *     responses:
 *       201:
 *         description: User successfully registered
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: User registered successfully
 *                 userId:
 *                   type: string
 *                   example: "123e4567-e89b-12d3-a456-426614174000"
 *             examples:
 *               success:
 *                 value:
 *                   message: User registered successfully
 *                   userId: "123e4567-e89b-12d3-a456-426614174000"
 *       400:
 *         description: Invalid input (missing fields or invalid email format)
 *         content:
 *           application/json:
 *             examples:
 *               missingFields:
 *                 value:
 *                   message: Required fields are missing
 *               invalidEmail:
 *                 value:
 *                   message: Invalid email format
 *       409:
 *         description: Email already exists
 *         content:
 *           application/json:
 *             example:
 *               message: User with this email already exists
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             example:
 *               message: Error registering user
 */
router.post('/register', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validate input
        if (!email || !password) {
            return res.status(HttpStatus.BAD_REQUEST).json({
                message: HttpMessages.MISSING_FIELDS
            });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(HttpStatus.BAD_REQUEST).json({
                message: HttpMessages.INVALID_EMAIL
            });
        }

        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(HttpStatus.CONFLICT).json({
                message: HttpMessages.USER_EXISTS
            });
        }

        // Create new user
        const user = new User({
            email,
            password // Will be hashed by the pre-save hook
        });

        await user.save();

        res.status(HttpStatus.CREATED).json({
            message: HttpMessages.REGISTRATION_SUCCESS,
            userId: user._id
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
            message: HttpMessages.INTERNAL_ERROR
        });
    }
});

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login user
 *     description: |
 *       Authenticates a user with email and password, returning a JWT token.
 *       The token should be included in subsequent requests in the Authorization header.
 *       Token expiration is set to JWT_EXPIRES_IN configuration value.
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: "Password123!"
 *     responses:
 *       200:
 *         description: Successfully authenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Successfully logged in
 *                 token:
 *                   type: string
 *                   description: JWT token to be used for authenticated requests
 *                   example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: "123e4567-e89b-12d3-a456-426614174000"
 *                     email:
 *                       type: string
 *                       example: "user@example.com"
 *             examples:
 *               success:
 *                 value:
 *                   message: Successfully logged in
 *                   token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *                   user:
 *                     id: "123e4567-e89b-12d3-a456-426614174000"
 *                     email: "user@example.com"
 *       400:
 *         description: Missing required fields
 *         content:
 *           application/json:
 *             example:
 *               message: Required fields are missing
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             example:
 *               message: Invalid credentials
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             example:
 *               message: Error during login
 */
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validate input
        if (!email || !password) {
            return res.status(HttpStatus.BAD_REQUEST).json({
                message: HttpMessages.MISSING_FIELDS
            });
        }

        // Find user by email
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(HttpStatus.UNAUTHORIZED).json({
                message: HttpMessages.INVALID_CREDENTIALS
            });
        }

        // Check password
        const isValidPassword = await user.comparePassword(password);
        if (!isValidPassword) {
            return res.status(HttpStatus.UNAUTHORIZED).json({
                message: HttpMessages.INVALID_CREDENTIALS
            });
        }

        // Generate JWT token
        const token = jwt.sign(
            { 
                userId: user._id,
                email: user.email
            },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );

        // Send response
        res.status(HttpStatus.OK).json({
            message: HttpMessages.LOGIN_SUCCESS,
            token,
            user: {
                id: user._id,
                email: user.email
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
            message: HttpMessages.INTERNAL_ERROR
        });
    }
});

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Logout user
 *     description: |
 *       Invalidates the user's JWT token by adding it to a blacklist.
 *       Requires a valid JWT token in the Authorization header.
 *       Once logged out, the token cannot be reused for authentication.
 *     tags:
 *       - Authentication
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: Authorization
 *         required: true
 *         schema:
 *           type: string
 *         description: Bearer token from login
 *         example: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *     responses:
 *       200:
 *         description: Successfully logged out
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Successfully logged out
 *             example:
 *               message: Successfully logged out
 *       401:
 *         description: Authentication error
 *         content:
 *           application/json:
 *             examples:
 *               noToken:
 *                 value:
 *                   message: Authentication token is required
 *               expiredToken:
 *                 value:
 *                   message: Token has expired
 *               blacklistedToken:
 *                 value:
 *                   message: Token has been invalidated
 *       403:
 *         description: Invalid token
 *         content:
 *           application/json:
 *             example:
 *               message: Invalid token
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             example:
 *               message: Error during logout
 */
router.post('/logout', authenticateToken, async (req: AuthRequest, res) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = AuthService.extractTokenFromHeader(authHeader);
        await AuthService.blacklistToken(token);

        res.status(HttpStatus.OK).json({
            message: HttpMessages.LOGOUT_SUCCESS
        });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
            message: HttpMessages.INTERNAL_ERROR
        });
    }
});

export default router;
