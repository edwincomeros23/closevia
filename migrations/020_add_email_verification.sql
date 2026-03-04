-- Add email OTP verification columns to users table
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS email_otp_hash VARCHAR(255) NULL,
    ADD COLUMN IF NOT EXISTS email_otp_expires DATETIME NULL;
