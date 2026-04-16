-- Add image support and looking_for flag to organization_posts table
ALTER TABLE organization_posts 
ADD COLUMN IF NOT EXISTS image_urls JSON DEFAULT NULL,
ADD COLUMN IF NOT EXISTS is_looking_for BOOLEAN DEFAULT FALSE;
