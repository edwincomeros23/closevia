-- Add delivery stops table for multi-stop standard deliveries
CREATE TABLE IF NOT EXISTS delivery_stops (
    id INT AUTO_INCREMENT PRIMARY KEY,
    delivery_id INT NOT NULL,
    stop_number INT NOT NULL,
    stop_type ENUM('pickup', 'delivery') NOT NULL,
    contact_name VARCHAR(255) NOT NULL,
    contact_phone VARCHAR(20) NOT NULL,
    address TEXT NOT NULL,
    latitude DECIMAL(10,8) NULL,
    longitude DECIMAL(11,8) NULL,
    item_qr_code VARCHAR(255) NULL,
    fee_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    status ENUM('pending', 'arrived', 'qr_scanned', 'fee_collected', 'completed') NOT NULL DEFAULT 'pending',
    arrived_at TIMESTAMP NULL,
    qr_scanned_at TIMESTAMP NULL,
    fee_collected_at TIMESTAMP NULL,
    completed_at TIMESTAMP NULL,
    photo_url VARCHAR(512) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (delivery_id) REFERENCES deliveries(id) ON DELETE CASCADE,
    INDEX idx_delivery_stop (delivery_id, stop_number),
    INDEX idx_stop_status (status)
);

-- Add cash collection log table
CREATE TABLE IF NOT EXISTS rider_cash_collections (
    id INT AUTO_INCREMENT PRIMARY KEY,
    rider_id INT NOT NULL,
    delivery_id INT NOT NULL,
    stop_id INT NOT NULL,
    collection_type ENUM('pickup_fee', 'delivery_fee') NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    collected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (rider_id) REFERENCES riders(id) ON DELETE CASCADE,
    FOREIGN KEY (delivery_id) REFERENCES deliveries(id) ON DELETE CASCADE,
    FOREIGN KEY (stop_id) REFERENCES delivery_stops(id) ON DELETE CASCADE,
    INDEX idx_rider_collections (rider_id, collected_at),
    INDEX idx_delivery_collections (delivery_id)
);

-- Add rider ledger table for remittance tracking
CREATE TABLE IF NOT EXISTS rider_ledger (
    id INT AUTO_INCREMENT PRIMARY KEY,
    rider_id INT NOT NULL UNIQUE,
    total_cash_collected DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    remittance_owed DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    take_home DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    free_slots_remaining INT NOT NULL DEFAULT 3,
    total_free_slots_used INT NOT NULL DEFAULT 0,
    last_remittance_at TIMESTAMP NULL,
    is_locked_for_remittance BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (rider_id) REFERENCES riders(id) ON DELETE CASCADE
);

-- Add remittance payments table
CREATE TABLE IF NOT EXISTS rider_remittance_payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    rider_id INT NOT NULL,
    amount_paid DECIMAL(10,2) NOT NULL,
    payment_method VARCHAR(100) NOT NULL,
    payment_proof_url VARCHAR(512) NULL,
    status ENUM('pending', 'verified', 'rejected') NOT NULL DEFAULT 'pending',
    verified_by INT NULL,
    verified_at TIMESTAMP NULL,
    rejection_reason TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (rider_id) REFERENCES riders(id) ON DELETE CASCADE,
    FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_rider_payments (rider_id, created_at)
);
