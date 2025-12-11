-- Create reports table for trader reporting feature
CREATE TABLE IF NOT EXISTS reports (
    id INT AUTO_INCREMENT PRIMARY KEY,
    reporter_id INT NOT NULL,
    reported_user_id INT NOT NULL,
    product_id INT,
    reason VARCHAR(50) NOT NULL COMMENT 'inappropriate, counterfeit, spam, scam',
    description TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' COMMENT 'pending, reviewed, dismissed, resolved',
    reviewer_id INT,
    reviewer_comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (reported_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
    FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_reported_user (reported_user_id),
    INDEX idx_reporter (reporter_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
);
