-- Add organization/account classification fields to users
ALTER TABLE users
  ADD COLUMN is_organization TINYINT(1) NOT NULL DEFAULT 0 AFTER role,
  ADD COLUMN org_verified TINYINT(1) NOT NULL DEFAULT 0 AFTER is_organization,
  ADD COLUMN org_name VARCHAR(255) NULL AFTER org_verified,
  ADD COLUMN org_logo_url VARCHAR(512) NULL AFTER org_name,
  ADD COLUMN department VARCHAR(255) NULL AFTER org_logo_url,
  ADD COLUMN bio TEXT NULL AFTER department;

CREATE INDEX idx_users_is_org ON users (is_organization);
CREATE INDEX idx_users_department ON users (department);

