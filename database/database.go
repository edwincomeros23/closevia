package database

import (
	"crypto/tls"
	"crypto/x509"
	"database/sql"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/go-sql-driver/mysql"
)

var DB *sql.DB

// InitDatabase initializes the database connection
func InitDatabase() error {
	// Get database configuration from environment variables
	dbHost := os.Getenv("DB_HOST")
	dbPort := os.Getenv("DB_PORT")
	dbUser := os.Getenv("DB_USER")
	dbPassword := os.Getenv("DB_PASSWORD")
	dbName := os.Getenv("DB_NAME")
	caCertPath := os.Getenv("DB_CA_CERT")

	// Validate required environment variables are set
	if dbHost == "" {
		return fmt.Errorf("DB_HOST environment variable is not set")
	}
	if dbPort == "" {
		return fmt.Errorf("DB_PORT environment variable is not set")
	}
	if dbUser == "" {
		return fmt.Errorf("DB_USER environment variable is not set")
	}
	if dbName == "" {
		return fmt.Errorf("DB_NAME environment variable is not set")
	}

	// Determine if using hosted database (Aiven/AWS) or local (XAMPP)
	isHostedDatabase := caCertPath != ""

	// For hosted databases, password is required
	if isHostedDatabase && dbPassword == "" {
		return fmt.Errorf("DB_PASSWORD environment variable is not set (required for hosted database)")
	}

	var dsn string

	if isHostedDatabase {
		// Create TLS config for hosted database
		tlsConfig, err := createTLSConfig(dbHost, caCertPath)
		if err != nil {
			return fmt.Errorf("failed to create TLS config: %v", err)
		}

		if err = mysql.RegisterTLSConfig("custom", tlsConfig); err != nil {
			return fmt.Errorf("failed to register TLS config: %v", err)
		}

		// Create DSN with TLS enabled for hosted database
		dsn = fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?parseTime=true&loc=Local&tls=custom",
			dbUser, dbPassword, dbHost, dbPort, dbName)
	} else {
		// Create DSN without TLS for local database (XAMPP)
		dsn = fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?parseTime=true&loc=Local",
			dbUser, dbPassword, dbHost, dbPort, dbName)
	}

	// Open database connection
	var openErr error
	DB, openErr = sql.Open("mysql", dsn)
	if openErr != nil {
		return fmt.Errorf("failed to open database: %v", openErr)
	}

	// Configure connection pool
	DB.SetMaxOpenConns(25)
	DB.SetMaxIdleConns(25)
	DB.SetConnMaxLifetime(10 * time.Minute)

	// Test the connection
	if err := DB.Ping(); err != nil {
		return fmt.Errorf("failed to ping database: %v", err)
	}

	// Test a simple query to verify we're connected to the right database
	var currentDbName string
	queryErr := DB.QueryRow("SELECT DATABASE()").Scan(&currentDbName)
	if queryErr != nil {
		return fmt.Errorf("failed to get database name: %v", queryErr)
	}

	log.Printf("Successfully connected to MySQL database: %s (Host: %s:%s)", currentDbName, dbHost, dbPort)
	return nil
}

// createTLSConfig creates a TLS configuration using the CA certificate
func createTLSConfig(serverName, caCertPath string) (*tls.Config, error) {
	// Read CA certificate
	caCert, err := os.ReadFile(caCertPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read CA certificate: %v", err)
	}

	// Create certificate pool
	caCertPool := x509.NewCertPool()
	if !caCertPool.AppendCertsFromPEM(caCert) {
		return nil, fmt.Errorf("failed to parse CA certificate")
	}

	// Create TLS configuration
	tlsConfig := &tls.Config{
		ServerName:         serverName,
		RootCAs:            caCertPool,
		MinVersion:         tls.VersionTLS12,
		InsecureSkipVerify: false,
	}

	return tlsConfig, nil
}

// CloseDatabase closes the database connection
func CloseDatabase() {
	if DB != nil {
		DB.Close()
		log.Println("Database connection closed")
	}
}

// CreateTables creates all necessary tables if they don't exist
func CreateTables() error {
	// First, check if language_preference exists in users table, if not add it
	// This ensures existing databases are upgraded automatically
	var exists int
	err := DB.QueryRow("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'language_preference'").Scan(&exists)
	if err == nil && exists == 0 {
		log.Println("Adding missing language_preference column to users table...")
		DB.Exec("ALTER TABLE users ADD COLUMN language_preference VARCHAR(10) NULL DEFAULT 'en'")
	}
	err = DB.QueryRow("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reviews' AND COLUMN_NAME = 'reply'").Scan(&exists)
	if err == nil && exists == 0 {
		log.Println("Adding missing reply columns to reviews table...")
		DB.Exec("ALTER TABLE reviews ADD COLUMN reply TEXT NULL")
		DB.Exec("ALTER TABLE reviews ADD COLUMN reply_date DATETIME NULL")
		DB.Exec("ALTER TABLE reviews ADD COLUMN replied_by_user_id INT NULL")
		DB.Exec("ALTER TABLE reviews ADD CONSTRAINT fk_replied_by FOREIGN KEY (replied_by_user_id) REFERENCES users(id) ON DELETE SET NULL")
	}
	// Robust column migration for products table
	productCols := map[string]string{
		"value":               "DECIMAL(10,2) NULL",
		"estimated_value_min": "DECIMAL(10,2) NULL",
		"estimated_value_max": "DECIMAL(10,2) NULL",
		"wants":               "TEXT NULL",
		"wanted_categories":   "JSON NULL",
		"desired_price":       "DECIMAL(10,2) NULL",
		"desired_product":     "VARCHAR(255) NULL",
		"item_type":           "VARCHAR(100) NULL",
		"brand":               "VARCHAR(100) NULL",
		"authenticity_risks":  "VARCHAR(50) NULL",
		"tags":                "JSON NULL",
		"boosted_at":          "TIMESTAMP NULL",
	}

	for col, def := range productCols {
		columnName := col
		if col == "value" {
			columnName = "`value`"
		}
		_, err := DB.Exec(fmt.Sprintf("ALTER TABLE products ADD COLUMN %s %s", columnName, def))
		if err != nil {
			// Ignore error 1060 (Duplicate column name)
			if mysqlErr, ok := err.(*mysql.MySQLError); ok && mysqlErr.Number == 1060 {
				continue
			}
			log.Printf("Note: Could not add column %s to products table: %v", col, err)
		} else {
			log.Printf("Migration: Added column %s to products table", col)
		}
	}

	queries := []string{
		`CREATE TABLE IF NOT EXISTS users (
			id INT AUTO_INCREMENT PRIMARY KEY,
			slug VARCHAR(255) NULL UNIQUE,
			name VARCHAR(255) NOT NULL,
			email VARCHAR(255) UNIQUE NOT NULL,
			password_hash VARCHAR(255) NOT NULL,
			role VARCHAR(10) NOT NULL DEFAULT 'user',
			is_organization TINYINT(1) NOT NULL DEFAULT 0,
			org_verified TINYINT(1) NOT NULL DEFAULT 0,
			org_name VARCHAR(255) NULL,
			org_logo_url VARCHAR(512) NULL,
			profile_picture VARCHAR(255) NULL,
			background_image VARCHAR(512) NULL,
			background_position VARCHAR(64) NULL,
			department VARCHAR(255) NULL,
			bio TEXT NULL,
			badges JSON NULL,
			language_preference VARCHAR(10) NULL DEFAULT 'en',
			email_notifications_enabled BOOLEAN DEFAULT TRUE,
			push_notifications_enabled BOOLEAN DEFAULT TRUE,
			verification_status VARCHAR(50) DEFAULT 'not_verified',
			school_name VARCHAR(255) NULL,
			school_email VARCHAR(255) NULL,
			school_email_verified_at TIMESTAMP NULL,
			school_id_image_path VARCHAR(512) NULL,
			verification_rejection_reason TEXT NULL,
			is_premium BOOLEAN DEFAULT FALSE,
			verified BOOLEAN DEFAULT FALSE,
			last_login TIMESTAMP NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			INDEX idx_users_is_org (is_organization),
			INDEX idx_users_department (department)
		)`,
		`CREATE TABLE IF NOT EXISTS products (
			id INT AUTO_INCREMENT PRIMARY KEY,
			slug VARCHAR(255) NULL,
			title VARCHAR(255) NOT NULL,
			description TEXT,
			price DECIMAL(10,2),
			image_urls JSON,
			image_url VARCHAR(500),
			seller_id INT NOT NULL,
			premium BOOLEAN DEFAULT FALSE,
			status ENUM('available', 'sold', 'traded', 'locked') DEFAULT 'available',
			allow_buying BOOLEAN DEFAULT TRUE,
			barter_only BOOLEAN DEFAULT FALSE,
			location VARCHAR(255),
			` + "`condition`" + ` VARCHAR(50),
			suggested_value INT,
			category VARCHAR(100),
			estimated_value_min DECIMAL(10,2) NULL,
			estimated_value_max DECIMAL(10,2) NULL,
			value DECIMAL(10,2) NULL,
			wants TEXT NULL,
			wanted_categories JSON NULL,
			desired_price DECIMAL(10,2) NULL,
			desired_product VARCHAR(255) NULL,
			item_type VARCHAR(100) NULL,
			brand VARCHAR(100) NULL,
			authenticity_risks VARCHAR(50) NULL,
			tags JSON NULL,
			latitude FLOAT,
			longitude FLOAT,
			video_url VARCHAR(500) NULL,
			bidding_type ENUM('none', 'blind', 'open') DEFAULT 'none',
			boosted_at TIMESTAMP NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE,
			INDEX idx_products_slug (slug)
		)`,
		`CREATE TABLE IF NOT EXISTS orders (
			id INT AUTO_INCREMENT PRIMARY KEY,
			product_id INT NOT NULL,
			buyer_id INT NOT NULL,
			status ENUM('pending', 'completed', 'cancelled') DEFAULT 'pending',
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
			FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE CASCADE
		)`,
		`CREATE TABLE IF NOT EXISTS transactions (
			id INT AUTO_INCREMENT PRIMARY KEY,
			order_id INT NOT NULL,
			amount DECIMAL(10,2) NOT NULL,
			payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
		)`,
		`CREATE TABLE IF NOT EXISTS premium_listings (
			id INT AUTO_INCREMENT PRIMARY KEY,
			product_id INT NOT NULL,
			start_date TIMESTAMP NOT NULL,
			end_date TIMESTAMP NOT NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
		)`,
		// Conversations for chat between buyer and seller about a product
		`CREATE TABLE IF NOT EXISTS conversations (
			id INT AUTO_INCREMENT PRIMARY KEY,
			product_id INT NOT NULL,
			buyer_id INT NOT NULL,
			seller_id INT NOT NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			UNIQUE KEY uniq_conversation (product_id, buyer_id, seller_id),
			FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
			FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE CASCADE,
			FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE
		)`,
		// Messages within a conversation
		`CREATE TABLE IF NOT EXISTS messages (
			id INT AUTO_INCREMENT PRIMARY KEY,
			conversation_id INT NOT NULL,
			sender_id INT NOT NULL,
			content TEXT NOT NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			read_at TIMESTAMP NULL,
			FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
			FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
		)`,
		// Trades and trade items for barter system
		`CREATE TABLE IF NOT EXISTS trades (
			id INT AUTO_INCREMENT PRIMARY KEY,
			buyer_id INT NOT NULL,
			seller_id INT NOT NULL,
			target_product_id INT NOT NULL,
			status ENUM('pending','accepted','declined','countered','active','completed','cancelled') DEFAULT 'pending',
			message TEXT NULL,
			offered_cash_amount DECIMAL(10,2) NULL,
			buyer_completed BOOLEAN DEFAULT FALSE,
			seller_completed BOOLEAN DEFAULT FALSE,
			completed_at TIMESTAMP NULL,
			buyer_rating INT NULL,
			seller_rating INT NULL,
			buyer_feedback TEXT NULL,
			seller_feedback TEXT NULL,
			meetup_location VARCHAR(500) NULL,
			buyer_meetup_confirmed BOOLEAN DEFAULT FALSE,
			seller_meetup_confirmed BOOLEAN DEFAULT FALSE,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE CASCADE,
			FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE,
			FOREIGN KEY (target_product_id) REFERENCES products(id) ON DELETE CASCADE
		)`,
		`CREATE TABLE IF NOT EXISTS trade_items (
			id INT AUTO_INCREMENT PRIMARY KEY,
			trade_id INT NOT NULL,
			product_id INT NOT NULL,
			offered_by ENUM('buyer','seller') NOT NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (trade_id) REFERENCES trades(id) ON DELETE CASCADE,
			FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
		)`,
		`CREATE TABLE IF NOT EXISTS trade_messages (
			id INT AUTO_INCREMENT PRIMARY KEY,
			trade_id INT NOT NULL,
			sender_id INT NOT NULL,
			content TEXT NOT NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (trade_id) REFERENCES trades(id) ON DELETE CASCADE,
			FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
		)`,
		`CREATE TABLE IF NOT EXISTS trade_events (
			id INT AUTO_INCREMENT PRIMARY KEY,
			trade_id INT NOT NULL,
			actor_id INT NULL,
			from_status VARCHAR(32) NULL,
			to_status VARCHAR(32) NULL,
			note VARCHAR(500) NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (trade_id) REFERENCES trades(id) ON DELETE CASCADE,
			FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
		)`,
		`CREATE TABLE IF NOT EXISTS notifications (
			id INT AUTO_INCREMENT PRIMARY KEY,
			user_id INT NOT NULL,
			type VARCHAR(50) NOT NULL,
			message VARCHAR(500) NOT NULL,
			is_read BOOLEAN DEFAULT FALSE,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
		)`,
		`CREATE TABLE IF NOT EXISTS comments (
			id INT AUTO_INCREMENT PRIMARY KEY,
			product_id INT NOT NULL,
			user_id INT NOT NULL,
			content TEXT NOT NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
			FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
		)`,
		`CREATE TABLE IF NOT EXISTS wishlists (
			id INT AUTO_INCREMENT PRIMARY KEY,
			user_id INT NOT NULL,
			product_id INT NOT NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
			FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
			UNIQUE KEY uniq_wishlist_item (user_id, product_id)
		)`,
		`CREATE TABLE IF NOT EXISTS saved_products (
			id INT AUTO_INCREMENT PRIMARY KEY,
			user_id INT NOT NULL,
			product_id INT NOT NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			deleted_at TIMESTAMP NULL DEFAULT NULL,
			FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
			FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
			UNIQUE KEY unique_user_product (user_id, product_id),
			INDEX idx_user_id (user_id),
			INDEX idx_product_id (product_id),
			INDEX idx_created_at (created_at),
			INDEX idx_deleted_at (deleted_at)
		)`,
		`CREATE TABLE IF NOT EXISTS product_votes (
			id INT AUTO_INCREMENT PRIMARY KEY,
			product_id INT NOT NULL,
			user_id INT NOT NULL,
			vote ENUM('under','over') NOT NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
			FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
			UNIQUE KEY uniq_product_user_vote (product_id, user_id)
		)`,
		`CREATE TABLE IF NOT EXISTS riders (
			id INT AUTO_INCREMENT PRIMARY KEY,
			user_id INT NOT NULL,
			name VARCHAR(255) NOT NULL,
			vehicle_type ENUM('motorcycle', 'bicycle', 'car') NOT NULL DEFAULT 'motorcycle',
			vehicle_plate VARCHAR(20) NULL,
			phone VARCHAR(20) NOT NULL,
			rating DECIMAL(3,2) DEFAULT 0.00,
			is_active BOOLEAN DEFAULT TRUE,
			latitude DECIMAL(10,8) NULL,
			longitude DECIMAL(11,8) NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
			UNIQUE KEY unique_rider_user (user_id)
		)`,
		`CREATE TABLE IF NOT EXISTS deliveries (
			id INT AUTO_INCREMENT PRIMARY KEY,
			user_id INT NOT NULL,
			trade_id INT NULL,
			delivery_type ENUM('standard', 'express') NOT NULL DEFAULT 'standard',
			status ENUM('pending', 'claimed', 'picked_up', 'in_transit', 'delivered', 'cancelled') NOT NULL DEFAULT 'pending',
			rider_id INT NULL,
			pickup_latitude DECIMAL(10,8) NULL,
			pickup_longitude DECIMAL(11,8) NULL,
			pickup_address TEXT NOT NULL,
			delivery_latitude DECIMAL(10,8) NULL,
			delivery_longitude DECIMAL(11,8) NULL,
			delivery_address TEXT NOT NULL,
			special_instructions TEXT NULL,
			total_cost DECIMAL(10,2) NOT NULL DEFAULT 0.00,
			estimated_eta TIMESTAMP NULL,
			item_count INT NOT NULL DEFAULT 1,
			is_fragile BOOLEAN DEFAULT FALSE,
			claimed_at TIMESTAMP NULL,
			picked_up_at TIMESTAMP NULL,
			in_transit_at TIMESTAMP NULL,
			delivered_at TIMESTAMP NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
			FOREIGN KEY (trade_id) REFERENCES trades(id) ON DELETE SET NULL,
			FOREIGN KEY (rider_id) REFERENCES riders(id) ON DELETE SET NULL,
			INDEX idx_delivery_user (user_id),
			INDEX idx_delivery_trade (trade_id),
			INDEX idx_delivery_rider (rider_id),
			INDEX idx_delivery_status (status),
			INDEX idx_delivery_type (delivery_type)
		)`,
		`CREATE TABLE IF NOT EXISTS trade_loop_agreements (
			id INT AUTO_INCREMENT PRIMARY KEY,
			loop_id VARCHAR(255) NOT NULL,
			user_id INT NOT NULL,
			status ENUM('accepted', 'declined') NOT NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			UNIQUE KEY uniq_loop_user (loop_id, user_id),
			FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
		)`,
		`CREATE TABLE IF NOT EXISTS delivery_items (
			id INT AUTO_INCREMENT PRIMARY KEY,
			delivery_id INT NOT NULL,
			product_id INT NOT NULL,
			product_name VARCHAR(255) NULL,
			is_fragile BOOLEAN DEFAULT FALSE,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (delivery_id) REFERENCES deliveries(id) ON DELETE CASCADE,
			FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
		)`,
		`CREATE TABLE IF NOT EXISTS reviews (
			id INT AUTO_INCREMENT PRIMARY KEY,
			reviewer_id INT NOT NULL,
			reviewed_user_id INT NOT NULL,
			rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
			comment TEXT NOT NULL,
			reply TEXT NULL,
			reply_date DATETIME NULL,
			replied_by_user_id INT NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE CASCADE,
			FOREIGN KEY (reviewed_user_id) REFERENCES users(id) ON DELETE CASCADE,
			FOREIGN KEY (replied_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
			INDEX idx_reviewed_user (reviewed_user_id),
			INDEX idx_reviewer (reviewer_id),
			INDEX idx_created_at (created_at)
		)`,
		`CREATE TABLE IF NOT EXISTS reports (
			id INT AUTO_INCREMENT PRIMARY KEY,
			reporter_id INT NOT NULL,
			reported_user_id INT NOT NULL,
			product_id INT NULL,
			reason VARCHAR(100) NOT NULL,
			description TEXT NOT NULL,
			status ENUM('pending', 'reviewed', 'resolved', 'dismissed') NOT NULL DEFAULT 'pending',
			reviewer_id INT NULL,
			reviewer_comment TEXT NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE,
			FOREIGN KEY (reported_user_id) REFERENCES users(id) ON DELETE CASCADE,
			FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
			FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE SET NULL,
			INDEX idx_reporter (reporter_id),
			INDEX idx_reported_user (reported_user_id),
			INDEX idx_status (status)
		)`,
		`CREATE TABLE IF NOT EXISTS trade_grades (
			id INT AUTO_INCREMENT PRIMARY KEY,
			trade_id INT NOT NULL,
			grader_id INT NOT NULL,
			graded_user_id INT NOT NULL,
			communication INT NOT NULL CHECK (communication >= 1 AND communication <= 5),
			item_accuracy INT NOT NULL CHECK (item_accuracy >= 1 AND item_accuracy <= 5),
			punctuality INT NOT NULL CHECK (punctuality >= 1 AND punctuality <= 5),
			overall INT NOT NULL CHECK (overall >= 1 AND overall <= 5),
			comment TEXT,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (trade_id) REFERENCES trades(id) ON DELETE CASCADE,
			FOREIGN KEY (grader_id) REFERENCES users(id) ON DELETE CASCADE,
			FOREIGN KEY (graded_user_id) REFERENCES users(id) ON DELETE CASCADE,
			UNIQUE KEY uk_trade_grader (trade_id, grader_id),
			INDEX idx_graded_user (graded_user_id),
			INDEX idx_trade_id (trade_id)
		)`,
		`CREATE TABLE IF NOT EXISTS campaigns (
			id INT AUTO_INCREMENT PRIMARY KEY,
			title VARCHAR(255) NOT NULL,
			description TEXT,
			image_url VARCHAR(500),
			button_text VARCHAR(100),
			button_link VARCHAR(500),
			start_date TIMESTAMP NULL,
			end_date TIMESTAMP NULL,
			target_users VARCHAR(50) DEFAULT 'all',
			frequency VARCHAR(50) DEFAULT 'once_per_user',
			is_active BOOLEAN DEFAULT TRUE,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			INDEX idx_campaigns_active (is_active),
			INDEX idx_campaigns_dates (start_date, end_date)
		)`,
		`CREATE TABLE IF NOT EXISTS earnings (
			id INT AUTO_INCREMENT PRIMARY KEY,
			user_id INT NOT NULL,
			amount DECIMAL(10,2) NOT NULL,
			source_type ENUM('trade_escrow', 'premium_upgrade', 'delivery_fee', 'product_boost') NOT NULL,
			source_id INT NOT NULL,
			external_id VARCHAR(255) NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
			INDEX idx_earnings_source (source_type, source_id),
			INDEX idx_earnings_created (created_at)
		)`,
	}

	// Execute table creation queries
	for _, query := range queries {
		if _, err := DB.Exec(query); err != nil {
			return fmt.Errorf("failed to create tables: %v", err)
		}
	}

	ensureIndexes()

	ensureUserColumns()
	ensureProductColumns()
	ensureTradeColumns()
	ensureRiderColumns()

	// Seed Mock Rider: Wynry Perian
	mockRiderEmail := "wynry@clovia.com"
	var riderUserID int
	err = DB.QueryRow("SELECT id FROM users WHERE email = ?", mockRiderEmail).Scan(&riderUserID)
	if err == sql.ErrNoRows {
		res, execErr := DB.Exec("INSERT INTO users (name, email, password_hash, role, verified) VALUES (?, ?, ?, ?, ?)",
			"Wynry Perian", mockRiderEmail, "mock_password", "rider", true)
		if execErr == nil {
			id, _ := res.LastInsertId()
			riderUserID = int(id)
			log.Printf("Created mock rider user profile with ID: %d", riderUserID)
		} else {
			log.Printf("Failed to create mock rider user: %v", execErr)
		}
	}

	if riderUserID > 0 {
		var riderCount int
		DB.QueryRow("SELECT COUNT(*) FROM riders WHERE user_id = ?", riderUserID).Scan(&riderCount)
		if riderCount == 0 {
			_, err := DB.Exec("INSERT INTO riders (user_id, name, vehicle_type, vehicle_plate, phone, rating, is_active, latitude, longitude, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
				riderUserID, "Wynry Perian", "motorcycle", "WMSU-RX7", "09991234567", 5.0, true, 6.9214, 122.0790, "approved")
			if err == nil {
				log.Println("Seeded mock rider Wynry Perian into the database.")
			} else {
				log.Printf("Failed to seed mock rider: %v", err)
			}
		}
	}

	log.Println("Database tables and indexes created successfully")
	return nil
}

// ensureUserColumns adds missing columns to the users table if they don't exist
func ensureUserColumns() {
	columns := []struct {
		name       string
		definition string
	}{
		{"slug", "VARCHAR(255) NULL UNIQUE"},
		{"is_organization", "TINYINT(1) NOT NULL DEFAULT 0"},
		{"org_verified", "TINYINT(1) NOT NULL DEFAULT 0"},
		{"org_name", "VARCHAR(255) NULL"},
		{"org_logo_url", "VARCHAR(512) NULL"},
		{"profile_picture", "VARCHAR(255) NULL"},
		{"background_image", "VARCHAR(512) NULL"},
		{"background_position", "VARCHAR(64) NULL"},
		{"department", "VARCHAR(255) NULL"},
		{"bio", "TEXT NULL"},
		{"badges", "JSON NULL"},
		{"latitude", "DECIMAL(10,8) NULL"},
		{"longitude", "DECIMAL(11,8) NULL"},
		// School ID verification columns
		{"verification_status", "ENUM('not_verified','pending','verified','rejected') NOT NULL DEFAULT 'not_verified'"},
		{"school_name", "VARCHAR(255) NULL"},
		{"school_email", "VARCHAR(255) NULL"},
		{"school_email_verified_at", "TIMESTAMP NULL"},
		{"school_id_image_path", "VARCHAR(512) NULL"},
		{"verification_rejection_reason", "TEXT NULL"},
		{"school_email_otp_hash", "VARCHAR(255) NULL"},
		{"school_email_otp_expires", "TIMESTAMP NULL"},
		{"school_id_document_type", "VARCHAR(20) NULL"},
		{"is_premium", "BOOLEAN NOT NULL DEFAULT FALSE"},
		{"last_login", "TIMESTAMP NULL"},
		{"email_otp_hash", "VARCHAR(255) NULL"},
		{"email_otp_expires", "TIMESTAMP NULL"},
		{"password_reset_otp_hash", "VARCHAR(255) NULL"},
		{"password_reset_otp_expires", "TIMESTAMP NULL"},
	}

	for _, col := range columns {
		// Check if column exists
		var count int
		err := DB.QueryRow(`
			SELECT COUNT(*) 
			FROM information_schema.COLUMNS 
			WHERE TABLE_SCHEMA = DATABASE() 
			AND TABLE_NAME = 'users' 
			AND COLUMN_NAME = ?
		`, col.name).Scan(&count)

		if err != nil {
			log.Printf("Warning: failed to check column %s: %v", col.name, err)
			continue
		}

		// Add column if it doesn't exist
		if count == 0 {
			query := fmt.Sprintf("ALTER TABLE users ADD COLUMN %s %s", col.name, col.definition)
			if _, err := DB.Exec(query); err != nil {
				log.Printf("Warning: failed to add column %s: %v", col.name, err)
			} else {
				log.Printf("Added missing column: %s", col.name)
			}
		}
	}

	// Ensure badges column is initialized for existing users
	DB.Exec("UPDATE users SET badges = JSON_ARRAY() WHERE badges IS NULL")
}

// ensureProductColumns adds missing columns to the products table if they don't exist
func ensureProductColumns() {
	columns := []struct {
		name       string
		definition string
	}{
		{"latitude", "FLOAT NULL"},
		{"longitude", "FLOAT NULL"},
		{"slug", "VARCHAR(255) NULL"},
		{"image_url", "VARCHAR(500) NULL"},
		{"condition", "VARCHAR(50) NULL"},
		{"suggested_value", "INT NULL"},
		{"category", "VARCHAR(255) DEFAULT 'General'"},
		{"authenticity_verified", "TINYINT(1) DEFAULT 0"},
		{"video_url", "VARCHAR(500) NULL"},
		{"wants", "VARCHAR(255) NULL"},
		{"wanted_categories", "VARCHAR(500) NULL"},
		{"desired_price", "DECIMAL(10,2) NULL"},
		{"desired_product", "VARCHAR(500) NULL"},
		{"item_type", "VARCHAR(100) NULL"},
		{"brand", "VARCHAR(100) NULL"},
		{"authenticity_risks", "VARCHAR(50) NULL"},
		{"tags", "JSON NULL"},
		{"estimated_value_min", "DECIMAL(10,2) NULL"},
		{"estimated_value_max", "DECIMAL(10,2) NULL"},
		{"value", "DECIMAL(10,2) NULL"},
		{"ai_analysis_generated_at", "TIMESTAMP NULL"},
		{"boosted_at", "TIMESTAMP NULL"},
	}

	for _, col := range columns {
		// Check if column exists
		var count int
		err := DB.QueryRow(`
			SELECT COUNT(*) 
			FROM information_schema.COLUMNS 
			WHERE TABLE_SCHEMA = DATABASE() 
			AND TABLE_NAME = 'products' 
			AND COLUMN_NAME = ?
		`, col.name).Scan(&count)

		if err != nil {
			log.Printf("Warning: failed to check column %s: %v", col.name, err)
			continue
		}

		// Add column if it doesn't exist
		if count == 0 {
			colName := col.name
			// Escape reserved identifiers
			if colName == "condition" || colName == "value" {
				colName = "`" + colName + "`"
			}
			query := fmt.Sprintf("ALTER TABLE products ADD COLUMN %s %s", colName, col.definition)
			if _, err := DB.Exec(query); err != nil {
				log.Printf("Warning: failed to add column %s: %v", col.name, err)
			} else {
				log.Printf("Added missing column to products: %s", col.name)
			}
		}
	}

	// Update status enum to include all required statuses
	updateProductStatusEnum()
}

// updateProductStatusEnum ensures the status column has all required enum values
func updateProductStatusEnum() {
	// Check current status enum
	var columnType string
	err := DB.QueryRow(`
		SELECT COLUMN_TYPE
		FROM information_schema.COLUMNS
		WHERE TABLE_SCHEMA = DATABASE()
		AND TABLE_NAME = 'products'
		AND COLUMN_NAME = 'status'
	`).Scan(&columnType)

	if err != nil {
		log.Printf("Warning: failed to check status column type: %v", err)
		return
	}

	// If status doesn't include all required values, update it
	if !contains(columnType, "'traded'") || !contains(columnType, "'locked'") {
		query := `ALTER TABLE products MODIFY COLUMN status ENUM('available','sold','traded','locked') DEFAULT 'available'`
		if _, err := DB.Exec(query); err != nil {
			log.Printf("Warning: failed to update status enum: %v", err)
		} else {
			log.Println("Updated products status enum to include 'traded' and 'locked'")
		}
	}
}

// ensureTradeColumns adds missing columns to the trades table if they don't exist
func ensureTradeColumns() {
	columns := []struct {
		name       string
		definition string
	}{
		{"trade_option", "VARCHAR(20) NULL DEFAULT 'meetup'"},
		{"delivery_address", "TEXT NULL"},
		{"buyer_rating", "INT NULL"},
		{"seller_rating", "INT NULL"},
		{"buyer_feedback", "TEXT NULL"},
		{"seller_feedback", "TEXT NULL"},
		{"buyer_proof_url", "VARCHAR(500) NULL"},
		{"seller_proof_url", "VARCHAR(500) NULL"},
		{"first_completion_at", "TIMESTAMP NULL"},
		{"awaiting_confirmation_since", "TIMESTAMP NULL"},
		{"delivery_type", "VARCHAR(20) NULL DEFAULT 'standard'"},
		{"payment_method", "VARCHAR(20) NULL DEFAULT 'gcash'"},
		{"payment_confirmed", "BOOLEAN DEFAULT FALSE"},
		{"proof_of_delivery", "LONGTEXT NULL"},
		{"buyer_confirmed_receipt", "BOOLEAN DEFAULT FALSE"},
		{"seller_confirmed_delivery", "BOOLEAN DEFAULT FALSE"},
		{"auto_completed_at", "TIMESTAMP NULL DEFAULT NULL"},
		{"awaiting_confirmation_since", "TIMESTAMP NULL"},
		{"option_change_requested", "VARCHAR(20) NULL DEFAULT NULL"},
		{"net_amount", "DECIMAL(10,2) DEFAULT 0.00"},
	}

	for _, col := range columns {
		// Check if column exists
		var count int
		err := DB.QueryRow(`
			SELECT COUNT(*)
			FROM information_schema.COLUMNS
			WHERE TABLE_SCHEMA = DATABASE()
			AND TABLE_NAME = 'trades'
			AND COLUMN_NAME = ?
		`, col.name).Scan(&count)

		if err != nil {
			log.Printf("Warning: failed to check trade column %s: %v", col.name, err)
			continue
		}

		// Add column if it doesn't exist
		if count == 0 {
			query := fmt.Sprintf("ALTER TABLE trades ADD COLUMN %s %s", col.name, col.definition)
			if _, err := DB.Exec(query); err != nil {
				log.Printf("Warning: failed to add trade column %s: %v", col.name, err)
			} else {
				log.Printf("Added missing trade column: %s", col.name)
			}
		}
	}

	// Ensure trades status ENUM includes auto_completed, awaiting_confirmation, expired
	var tradeStatusType string
	if err := DB.QueryRow(`
		SELECT COLUMN_TYPE FROM information_schema.COLUMNS
		WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'trades' AND COLUMN_NAME = 'status'
	`).Scan(&tradeStatusType); err == nil {
		if !contains(tradeStatusType, "'expired'") {
			if _, err := DB.Exec(`ALTER TABLE trades MODIFY COLUMN status ENUM('pending','accepted','declined','countered','active','awaiting_confirmation','completed','cancelled','auto_completed','expired') DEFAULT 'pending'`); err != nil {
				log.Printf("Warning: failed to update trades status enum: %v", err)
			} else {
				log.Println("Updated trades status enum to include 'expired'")
			}
		}
	}
}

// ensureRiderColumns adds missing columns to the riders table for the application flow
func ensureRiderColumns() {
	columns := []struct {
		name       string
		definition string
	}{
		{"status", "ENUM('pending','under_review','approved','rejected') NOT NULL DEFAULT 'pending'"},
		{"license_image_url", "VARCHAR(512) NULL"},
		{"selfie_image_url", "VARCHAR(512) NULL"},
		{"contact_number", "VARCHAR(20) NULL"},
		{"full_name", "VARCHAR(255) NULL"},
		{"rejection_reason", "TEXT NULL"},
		{"reviewed_at", "TIMESTAMP NULL"},
		{"reviewed_by", "INT NULL"},
	}

	for _, col := range columns {
		var count int
		err := DB.QueryRow(`
			SELECT COUNT(*)
			FROM information_schema.COLUMNS
			WHERE TABLE_SCHEMA = DATABASE()
			AND TABLE_NAME = 'riders'
			AND COLUMN_NAME = ?
		`, col.name).Scan(&count)

		if err != nil {
			log.Printf("Warning: failed to check rider column %s: %v", col.name, err)
			continue
		}

		if count == 0 {
			query := fmt.Sprintf("ALTER TABLE riders ADD COLUMN %s %s", col.name, col.definition)
			if _, err := DB.Exec(query); err != nil {
				log.Printf("Warning: failed to add rider column %s: %v", col.name, err)
			} else {
				log.Printf("Added missing rider column: %s", col.name)
			}
		}
	}

	// Backfill existing active riders as approved
	DB.Exec("UPDATE riders SET status = 'approved' WHERE is_active = TRUE AND status = 'pending'")
}

// contains checks if a string contains a substring
func contains(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

// ensureIndexes creates indexes if they do not exist (MySQL < 8.0.21 lacks CREATE INDEX IF NOT EXISTS)
func ensureIndexes() {
	indexes := []struct {
		table   string
		name    string
		columns string
	}{
		{"products", "idx_products_seller", "seller_id"},
		{"products", "idx_products_status", "status"},
		{"products", "idx_products_premium", "premium"},
		{"orders", "idx_orders_buyer", "buyer_id"},
		{"orders", "idx_orders_product", "product_id"},
		{"orders", "idx_orders_status", "status"},
		{"transactions", "idx_transactions_order", "order_id"},
		{"premium_listings", "idx_premium_listings_product", "product_id"},
		{"premium_listings", "idx_premium_listings_dates", "start_date, end_date"},
		{"conversations", "idx_conversations_participants", "buyer_id, seller_id"},
		{"messages", "idx_messages_conversation", "conversation_id"},
		{"messages", "idx_messages_sender", "sender_id"},
		{"trades", "idx_trades_participants", "buyer_id, seller_id"},
		{"trades", "idx_trades_target", "target_product_id"},
		{"trades", "idx_trades_status", "status"},
		{"trade_items", "idx_trade_items_trade", "trade_id"},
		{"trade_items", "idx_trade_items_product", "product_id"},
		{"trade_messages", "idx_trade_messages_trade", "trade_id"},
		{"trade_messages", "idx_trade_messages_sender", "sender_id"},
		{"notifications", "idx_notifications_user", "user_id"},
		{"notifications", "idx_notifications_read", "is_read"},
		{"notifications", "idx_notifications_type", "type"},
		{"comments", "idx_comments_product", "product_id"},
		{"comments", "idx_comments_user", "user_id"},
		{"wishlists", "idx_wishlists_user", "user_id"},
		{"wishlists", "idx_wishlists_product", "product_id"},
		{"riders", "idx_riders_user", "user_id"},
		{"riders", "idx_riders_active", "is_active"},
		{"deliveries", "idx_deliveries_user", "user_id"},
		{"deliveries", "idx_deliveries_status", "status"},
		{"delivery_items", "idx_delivery_items_delivery", "delivery_id"},
		{"trade_events", "idx_trade_events_trade", "trade_id"},
		{"trade_events", "idx_trade_events_actor", "actor_id"},
	}

	for _, idx := range indexes {
		var count int
		err := DB.QueryRow(`
			SELECT COUNT(*)
			FROM information_schema.STATISTICS
			WHERE TABLE_SCHEMA = DATABASE()
			  AND TABLE_NAME = ?
			  AND INDEX_NAME = ?
		`, idx.table, idx.name).Scan(&count)
		if err != nil {
			log.Printf("Warning: failed to check index %s on %s: %v", idx.name, idx.table, err)
			continue
		}
		if count > 0 {
			continue
		}

		query := fmt.Sprintf("CREATE INDEX %s ON %s(%s)", idx.name, idx.table, idx.columns)
		if _, err := DB.Exec(query); err != nil {
			log.Printf("Warning: failed to create index %s on %s: %v", idx.name, idx.table, err)
		} else {
			log.Printf("Created missing index %s on %s", idx.name, idx.table)
		}
	}
}
