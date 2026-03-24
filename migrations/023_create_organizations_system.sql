-- Organization community system (tier-limited creation, membership workflow, member-only feed)

CREATE TABLE IF NOT EXISTS organizations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  creator_user_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(80) NOT NULL UNIQUE,
  description TEXT NULL,
  category VARCHAR(120) NOT NULL,
  logo_url VARCHAR(512) NULL,
  cover_url VARCHAR(512) NULL,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  deleted_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (creator_user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_org_creator (creator_user_id),
  INDEX idx_org_deleted (is_deleted)
);

CREATE TABLE IF NOT EXISTS organization_memberships (
  id INT AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  user_id INT NOT NULL,
  status ENUM('pending','approved','rejected','removed','blocked','cancelled_org_deleted') NOT NULL DEFAULT 'pending',
  requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  decided_at TIMESTAMP NULL,
  decided_by_user_id INT NULL,
  removed_at TIMESTAMP NULL,
  cooldown_until TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_org_user (organization_id, user_id),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (decided_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_org_membership_status (organization_id, status)
);

CREATE TABLE IF NOT EXISTS organization_posts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  author_user_id INT NOT NULL,
  content TEXT NOT NULL,
  category_tag VARCHAR(120) NOT NULL,
  is_visible_in_org_feed TINYINT(1) NOT NULL DEFAULT 1,
  hidden_reason ENUM('member_removed','org_deleted','admin_action') NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_org_posts_feed (organization_id, is_visible_in_org_feed, created_at),
  INDEX idx_org_posts_author (author_user_id, created_at)
);
