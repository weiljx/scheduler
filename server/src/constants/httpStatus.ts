/**
 * HTTP Status Codes used throughout the application
 */
export const HttpStatus = {
    // Success
    OK: 200,
    CREATED: 201,

    // Client Errors
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,

    // Server Errors
    INTERNAL_SERVER_ERROR: 500,
} as const;

/**
 * Common HTTP response messages
 */
export const HttpMessages = {
    // Auth related messages
    INVALID_CREDENTIALS: 'Invalid credentials',
    TOKEN_REQUIRED: 'Authentication token is required',
    TOKEN_INVALID: 'Invalid token',
    TOKEN_EXPIRED: 'Token has expired',
    TOKEN_BLACKLISTED: 'Token has been invalidated',
    LOGIN_SUCCESS: 'Successfully logged in',
    LOGOUT_SUCCESS: 'Successfully logged out',
    REGISTRATION_SUCCESS: 'User registered successfully',
    USER_EXISTS: 'User with this email already exists',
    
    // Generic messages
    INTERNAL_ERROR: 'An internal error occurred',
    MISSING_FIELDS: 'Required fields are missing',
} as const;
