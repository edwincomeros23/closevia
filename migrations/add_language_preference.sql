-- Migration to add language_preference column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS language_preference VARCHAR(10) NULL DEFAULT 'en';
