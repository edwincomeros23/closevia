-- Batch Delivery System Schema
-- Supports claiming multiple barter pairs in one trip with slot management and geographic optimization

-- Batch groups table - represents a single batch trip
CREATE TABLE IF NOT EXISTS delivery_batches (
    id INT AUTO_INCREMENT PRIMARY KEY,
    rider_id INT NOT NULL,
    status ENUM('pending', 'collecting_addons', 'ready', 'in_progress', 'completed', 'cancelled') NOT NULL DEFAULT 'pending',
    
    -- Anchor delivery (first claimed pair)
    anchor_delivery_id INT NOT NULL UNIQUE,
    
    -- Batch details
    batch_name VARCHAR(255) NULL,
    total_slots_used INT NOT NULL DEFAULT 1,
    total_distance_km DECIMAL(8,2) NULL,
    estimated_minutes INT NULL,
    
    -- Geographic bounds for optimization
    min_latitude DECIMAL(10,8) NULL,
    max_latitude DECIMAL(10,8) NULL,
    min_longitude DECIMAL(11,8) NULL,
    max_longitude DECIMAL(11,8) NULL,
    
    -- Route optimization (JSON array of delivery IDs in order)
    optimized_route_json JSON NULL,
    
    -- Financial tracking
    total_rider_commission DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    total_clovia_commission DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    
    -- Timestamps
    claimed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP NULL,
    completed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (rider_id) REFERENCES riders(id) ON DELETE CASCADE,
    FOREIGN KEY (anchor_delivery_id) REFERENCES deliveries(id) ON DELETE CASCADE,
    INDEX idx_rider_batch (rider_id, status),
    INDEX idx_batch_status (status),
    INDEX idx_anchor_delivery (anchor_delivery_id)
);

-- Batch delivery mapping - links individual deliveries to batches
CREATE TABLE IF NOT EXISTS batch_delivery_mappings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    batch_id INT NOT NULL,
    delivery_id INT NOT NULL,
    route_order INT NOT NULL, -- order in optimized route
    is_anchor BOOLEAN DEFAULT FALSE,
    
    -- Per-delivery metrics
    distance_from_previous_km DECIMAL(8,2) NULL,
    estimated_wait_minutes INT NULL,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE KEY unique_batch_delivery (batch_id, delivery_id),
    FOREIGN KEY (batch_id) REFERENCES delivery_batches(id) ON DELETE CASCADE,
    FOREIGN KEY (delivery_id) REFERENCES deliveries(id) ON DELETE CASCADE,
    INDEX idx_batch_order (batch_id, route_order),
    INDEX idx_delivery_batch (delivery_id)
);

-- Rider slot management table
CREATE TABLE IF NOT EXISTS rider_slot_ledger (
    id INT AUTO_INCREMENT PRIMARY KEY,
    rider_id INT NOT NULL UNIQUE,
    
    -- Slot tracking
    free_slots_total INT NOT NULL DEFAULT 3,
    free_slots_remaining INT NOT NULL DEFAULT 3,
    current_batch_slots_used INT NOT NULL DEFAULT 0,
    
    -- Remittance tracking
    cash_collected_current_batch DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    remittance_owed DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    remittance_threshold DECIMAL(10,2) NOT NULL DEFAULT 1000.00,
    
    -- Account status
    is_locked_for_batching BOOLEAN DEFAULT FALSE,
    locked_reason VARCHAR(255) NULL,
    locked_at TIMESTAMP NULL,
    
    -- Timestamps
    last_batch_completed_at TIMESTAMP NULL,
    last_remittance_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (rider_id) REFERENCES riders(id) ON DELETE CASCADE,
    INDEX idx_rider_status (rider_id, is_locked_for_batching)
);

-- Batch remittance history
CREATE TABLE IF NOT EXISTS batch_remittance_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    rider_id INT NOT NULL,
    batch_id INT NOT NULL,
    
    -- Remittance details
    cash_amount_remitted DECIMAL(10,2) NOT NULL,
    clovia_commission_15_percent DECIMAL(10,2) NOT NULL,
    rider_take_home DECIMAL(10,2) NOT NULL,
    
    -- Payment method and proof
    payment_method ENUM('cash', 'bank_transfer', 'e_wallet') NOT NULL,
    payment_reference VARCHAR(255) NULL,
    proof_url VARCHAR(512) NULL,
    
    -- Verification
    status ENUM('pending', 'verified', 'rejected') NOT NULL DEFAULT 'pending',
    verified_by INT NULL,
    verified_at TIMESTAMP NULL,
    rejection_reason TEXT NULL,
    
    -- Slot unlock
    slots_unlocked_count INT NOT NULL DEFAULT 3,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (rider_id) REFERENCES riders(id) ON DELETE CASCADE,
    FOREIGN KEY (batch_id) REFERENCES delivery_batches(id) ON DELETE CASCADE,
    FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_rider_remittance (rider_id, created_at),
    INDEX idx_batch_remittance (batch_id)
);

-- Nearby add-ons suggestion cache (geographic proximity)
CREATE TABLE IF NOT EXISTS batch_addon_suggestions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    anchor_delivery_id INT NOT NULL,
    suggested_delivery_id INT NOT NULL,
    
    -- Distance metrics
    distance_from_anchor_km DECIMAL(8,2) NOT NULL,
    route_detour_percent DECIMAL(5,2) NOT NULL, -- how much longer batch would take
    
    -- Scoring for ranking
    score DECIMAL(8,3) NOT NULL DEFAULT 0.0,
    
    -- Cache validity
    valid_until TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (anchor_delivery_id) REFERENCES deliveries(id) ON DELETE CASCADE,
    FOREIGN KEY (suggested_delivery_id) REFERENCES deliveries(id) ON DELETE CASCADE,
    INDEX idx_anchor_suggestions (anchor_delivery_id, score DESC),
    INDEX idx_validity (valid_until)
);

-- Batch progress tracking per delivery stop
CREATE TABLE IF NOT EXISTS batch_stop_progress (
    id INT AUTO_INCREMENT PRIMARY KEY,
    batch_delivery_mapping_id INT NOT NULL,
    
    -- Progress status
    stop_phase ENUM('pending', 'arrived', 'in_progress', 'completed') NOT NULL DEFAULT 'pending',
    
    -- Timestamps
    arrived_at TIMESTAMP NULL,
    pickup_completed_at TIMESTAMP NULL,
    dropoff_completed_at TIMESTAMP NULL,
    completed_at TIMESTAMP NULL,
    
    -- Distance tracking
    distance_traveled_km DECIMAL(8,2) NULL,
    actual_wait_minutes INT NULL,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (batch_delivery_mapping_id) REFERENCES batch_delivery_mappings(id) ON DELETE CASCADE,
    INDEX idx_batch_progress (batch_delivery_mapping_id),
    INDEX idx_progress_status (stop_phase)
);

-- Add batch_id foreign key to existing deliveries table (if not already present)
-- ALTER TABLE deliveries ADD COLUMN batch_id INT NULL;
-- ALTER TABLE deliveries ADD FOREIGN KEY (batch_id) REFERENCES delivery_batches(id) ON DELETE SET NULL;
-- ALTER TABLE deliveries ADD INDEX idx_delivery_batch (batch_id);
