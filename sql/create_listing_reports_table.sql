-- Create listing_reports table for moderation
CREATE TABLE IF NOT EXISTS listing_reports (
    id SERIAL PRIMARY KEY,
    product_id INT NOT NULL,
    reporter_id INT NOT NULL,
    reason VARCHAR(50) NOT NULL CHECK (reason IN ('wrong_category', 'prohibited_item', 'fake_or_scam', 'inappropriate_photo', 'other')),
    details TEXT,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed')),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    -- Foreign key constraints
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE,
    
    -- Indices for faster querying
    INDEX idx_product_id (product_id),
    INDEX idx_reporter_id (reporter_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
);

-- Create index for finding reports by reason
CREATE INDEX IF NOT EXISTS idx_reason ON listing_reports(reason);
