/**
 * Hash a password using bcrypt with 12 rounds
 * @param password Plain text password
 * @returns Hashed password
 */
export declare function hashPassword(password: string): Promise<string>;
/**
 * Compare plain text password with bcrypt hash
 * @param password Plain text password to verify
 * @param hash Bcrypt hash to compare against
 * @returns True if password matches hash
 */
export declare function verifyPassword(password: string, hash: string): Promise<boolean>;
/**
 * Check if a string is a bcrypt hash (starts with $2a$, $2b$, or $2y$)
 * @param str String to check
 * @returns True if string appears to be a bcrypt hash
 */
export declare function isBcryptHash(str: string): boolean;
/**
 * Validate password strength
 * Minimum 8 characters, at least one uppercase, one lowercase, one number
 * @param password Password to validate
 * @returns Object with isValid and message
 */
export declare function validatePasswordStrength(password: string): {
    isValid: boolean;
    message?: string;
};
//# sourceMappingURL=passwordHash.d.ts.map