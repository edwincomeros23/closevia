package database

import (
	"context"
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

	// Fail fast on network / DB stalls so the API doesn't hang for 15s+.
	const connectTimeout = "5s"
	const readTimeout = "15s"
	const writeTimeout = "15s"
	commonParams := fmt.Sprintf("timeout=%s&readTimeout=%s&writeTimeout=%s", connectTimeout, readTimeout, writeTimeout)

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

		dsn = fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?parseTime=true&loc=Local&tls=custom&%s",
			dbUser, dbPassword, dbHost, dbPort, dbName, commonParams)
	} else {
		dsn = fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?parseTime=true&loc=Local&%s",
			dbUser, dbPassword, dbHost, dbPort, dbName, commonParams)
	}

	// Open database connection
	var openErr error
	DB, openErr = sql.Open("mysql", dsn)
	if openErr != nil {
		return fmt.Errorf("failed to open database: %v", openErr)
	}

	// Configure connection pool with better resilience
	DB.SetMaxOpenConns(10)
	DB.SetMaxIdleConns(5)
	DB.SetConnMaxLifetime(5 * time.Minute)
	DB.SetConnMaxIdleTime(2 * time.Minute)

	// Test the connection (with timeout to avoid long startup hangs)
	pingCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := DB.PingContext(pingCtx); err != nil {
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
	var err error
	var exists int

	// Add premium_tier column to users table if missing
	err = DB.QueryRow("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'premium_tier'").Scan(&exists)
	if err == nil && exists == 0 {
		log.Println("Adding missing premium_tier column to users table...")
		DB.Exec("ALTER TABLE users ADD COLUMN premium_tier VARCHAR(20) NULL DEFAULT 'free'")
	}

	err = DB.QueryRow("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'language_preference'").Scan(&exists)
	if err == nil && exists == 0 {
		log.Println("Adding missing language_preference column to users table...")
		DB.Exec("ALTER TABLE users ADD COLUMN language_preference VARCHAR(10) NULL DEFAULT 'en'")
	}

	err = DB.QueryRow("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'phone'").Scan(&exists)
	if err == nil && exists == 0 {
		log.Println("Adding missing phone column to users table...")
		DB.Exec("ALTER TABLE users ADD COLUMN phone VARCHAR(20) NULL")
	}

	err = DB.QueryRow("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'phone_verified'").Scan(&exists)
	if err == nil && exists == 0 {
		log.Println("Adding missing phone_verified column to users table...")
		DB.Exec("ALTER TABLE users ADD COLUMN phone_verified BOOLEAN DEFAULT FALSE")
	}

	err = DB.QueryRow("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'phone_otp_hash'").Scan(&exists)
	if err == nil && exists == 0 {
		log.Println("Adding missing phone_otp_hash column to users table...")
		DB.Exec("ALTER TABLE users ADD COLUMN phone_otp_hash VARCHAR(255) NULL")
	}

	err = DB.QueryRow("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'phone_otp_expires'").Scan(&exists)
	if err == nil && exists == 0 {
		log.Println("Adding missing phone_otp_expires column to users table...")
		DB.Exec("ALTER TABLE users ADD COLUMN phone_otp_expires TIMESTAMP NULL")
	}

	err = DB.QueryRow("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'password_changed_at'").Scan(&exists)
	if err == nil && exists == 0 {
		log.Println("Adding missing password_changed_at column to users table...")
		DB.Exec("ALTER TABLE users ADD COLUMN password_changed_at TIMESTAMP NULL")
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
			phone VARCHAR(20) NULL,
			phone_verified BOOLEAN DEFAULT FALSE,
			phone_otp_hash VARCHAR(255) NULL,
			phone_otp_expires TIMESTAMP NULL,
			password_hash VARCHAR(255) NOT NULL,
			password_changed_at TIMESTAMP NULL,
			role VARCHAR(10) NOT NULL DEFAULT 'user',
			is_organization TINYINT(1) NOT NULL DEFAULT 0,
			org_verified TINYINT(1) NOT NULL DEFAULT 0,
			org_name VARCHAR(255) NULL,
			org_handle VARCHAR(100) NULL,
			org_logo_url VARCHAR(512) NULL,
			org_cover_url VARCHAR(512) NULL,
			org_category VARCHAR(120) NULL,
			org_website VARCHAR(512) NULL,
			org_location VARCHAR(255) NULL,
			org_contact_email VARCHAR(255) NULL,
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
			premium_tier VARCHAR(20) DEFAULT 'free',
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
		`CREATE TABLE IF NOT EXISTS organizations (
			id INT AUTO_INCREMENT PRIMARY KEY,
			creator_user_id INT NOT NULL,
			name VARCHAR(255) NOT NULL,
			slug VARCHAR(80) NOT NULL UNIQUE,
			description TEXT NULL,
			category VARCHAR(120) NOT NULL,
			logo_url VARCHAR(512) NULL,
			cover_url VARCHAR(512) NULL,
			is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
			deleted_at TIMESTAMP NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			FOREIGN KEY (creator_user_id) REFERENCES users(id) ON DELETE CASCADE,
			INDEX idx_org_creator (creator_user_id),
			INDEX idx_org_deleted (is_deleted)
		)`,
		`CREATE TABLE IF NOT EXISTS organization_memberships (
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
		)`,
		`CREATE TABLE IF NOT EXISTS organization_posts (
			id INT AUTO_INCREMENT PRIMARY KEY,
			organization_id INT NOT NULL,
			author_user_id INT NOT NULL,
			content TEXT NOT NULL,
			category_tag VARCHAR(120) NOT NULL,
			is_visible_in_org_feed BOOLEAN NOT NULL DEFAULT TRUE,
			hidden_reason ENUM('member_removed','org_deleted','admin_action') NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
			FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE CASCADE,
			INDEX idx_org_posts_feed (organization_id, is_visible_in_org_feed, created_at),
			INDEX idx_org_posts_author (author_user_id, created_at)
		)`,
		`CREATE TABLE IF NOT EXISTS organization_trade_posts (
			id INT AUTO_INCREMENT PRIMARY KEY,
			organization_id INT NOT NULL,
			user_id INT NOT NULL,
			product_id INT NOT NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
			FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
			FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
			UNIQUE KEY uniq_org_product (organization_id, product_id),
			INDEX idx_org_trade_posts_org (organization_id, created_at),
			INDEX idx_org_trade_posts_user (user_id, created_at)
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
		`CREATE TABLE IF NOT EXISTS trade_rejection_signals (
			id INT AUTO_INCREMENT PRIMARY KEY,
			trade_id INT NOT NULL,
			rejector_user_id INT NOT NULL,
			rejected_user_id INT NOT NULL,
			target_product_id INT NULL,
			target_category VARCHAR(255) NULL,
			reason TEXT NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (trade_id) REFERENCES trades(id) ON DELETE CASCADE,
			FOREIGN KEY (rejector_user_id) REFERENCES users(id) ON DELETE CASCADE,
			FOREIGN KEY (rejected_user_id) REFERENCES users(id) ON DELETE CASCADE,
			INDEX idx_trade_rejector (rejector_user_id, created_at),
			INDEX idx_trade_rejected (rejected_user_id, created_at)
		)`,
		`CREATE TABLE IF NOT EXISTS trade_loop_cache (
			id INT AUTO_INCREMENT PRIMARY KEY,
			user_id INT NOT NULL,
			loop_id VARCHAR(255) NOT NULL,
			loop_type VARCHAR(20) NOT NULL DEFAULT 'graph',
			loop_length INT NOT NULL DEFAULT 0,
			score INT NOT NULL DEFAULT 0,
			payload_json LONGTEXT NOT NULL,
			expires_at TIMESTAMP NOT NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			UNIQUE KEY uniq_trade_loop_cache_user_loop (user_id, loop_id),
			INDEX idx_trade_loop_cache_expiry (user_id, expires_at),
			FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
		)`,
		`CREATE TABLE IF NOT EXISTS loop_quota_usage (
			id INT AUTO_INCREMENT PRIMARY KEY,
			user_id INT NOT NULL,
			period VARCHAR(7) NOT NULL COMMENT 'YYYY-MM',
			used INT NOT NULL DEFAULT 0,
			` + "`limit`" + ` INT NOT NULL DEFAULT 5,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			UNIQUE KEY uniq_loop_quota_usage_user_period (user_id, period),
			FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
		)`,
		`CREATE TABLE IF NOT EXISTS trade_loop_cancellations (
			id INT AUTO_INCREMENT PRIMARY KEY,
			loop_id VARCHAR(255) NOT NULL UNIQUE,
			cancelled_by INT NOT NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (cancelled_by) REFERENCES users(id) ON DELETE CASCADE
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
		` CREATE TABLE IF NOT EXISTS delivery_stops (
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
		)`,
		`CREATE TABLE IF NOT EXISTS rider_cash_collections (
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
		)`,
		`CREATE TABLE IF NOT EXISTS rider_ledger (
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
		)`,
		`CREATE TABLE IF NOT EXISTS rider_remittance_payments (
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
		`CREATE TABLE IF NOT EXISTS trade_disputes (
			id INT AUTO_INCREMENT PRIMARY KEY,
			trade_id INT NOT NULL,
			raised_by_id INT NOT NULL,
			reported_user_id INT NOT NULL,
			reason VARCHAR(100) NOT NULL,
			description TEXT NOT NULL,
			evidence_image_1 VARCHAR(500) NULL,
			evidence_image_2 VARCHAR(500) NULL,
			status ENUM('pending', 'reviewed', 'resolved', 'dismissed') NOT NULL DEFAULT 'pending',
			reviewer_id INT NULL,
			resolution_notes TEXT NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			FOREIGN KEY (trade_id) REFERENCES trades(id) ON DELETE CASCADE,
			FOREIGN KEY (raised_by_id) REFERENCES users(id) ON DELETE CASCADE,
			FOREIGN KEY (reported_user_id) REFERENCES users(id) ON DELETE CASCADE,
			FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE SET NULL,
			INDEX idx_disputes_trade (trade_id),
			INDEX idx_disputes_status (status)
		)`,
		`CREATE TABLE IF NOT EXISTS user_strikes (
			id INT AUTO_INCREMENT PRIMARY KEY,
			user_id INT NOT NULL,
			admin_id INT NOT NULL,
			dispute_id INT NULL,
			reason TEXT NOT NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
			FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE,
			FOREIGN KEY (dispute_id) REFERENCES trade_disputes(id) ON DELETE SET NULL,
			INDEX idx_strikes_user (user_id)
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
			source_type ENUM('trade_escrow', 'premium_upgrade', 'delivery_fee', 'product_boost', 'riders_remittance', 'advertisers_revenue', 'google_ads') NOT NULL,
			source_id INT NOT NULL,
			external_id VARCHAR(255) NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
			INDEX idx_earnings_source (source_type, source_id),
			INDEX idx_earnings_created (created_at)
		)`,
		`CREATE TABLE IF NOT EXISTS profile_views (
			id INT AUTO_INCREMENT PRIMARY KEY,
			target_user_id INT NOT NULL,
			viewer_user_id INT NULL,
			viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE CASCADE,
			FOREIGN KEY (viewer_user_id) REFERENCES users(id) ON DELETE SET NULL,
			INDEX idx_target_user (target_user_id),
			INDEX idx_viewed_at (viewed_at)
		)`,
		`CREATE TABLE IF NOT EXISTS product_views (
			id INT AUTO_INCREMENT PRIMARY KEY,
			product_id INT NOT NULL,
			viewer_user_id INT NULL,
			viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
			FOREIGN KEY (viewer_user_id) REFERENCES users(id) ON DELETE SET NULL,
			INDEX idx_product_id (product_id),
			INDEX idx_viewed_at (viewed_at)
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
	ensureDeliveryBatchColumns()

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
		{"org_handle", "VARCHAR(100) NULL"},
		{"org_logo_url", "VARCHAR(512) NULL"},
		{"org_cover_url", "VARCHAR(512) NULL"},
		{"org_category", "VARCHAR(120) NULL"},
		{"org_website", "VARCHAR(512) NULL"},
		{"org_location", "VARCHAR(255) NULL"},
		{"org_contact_email", "VARCHAR(255) NULL"},
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
		{"phone", "VARCHAR(20) NULL"},
		{"phone_verified", "BOOLEAN DEFAULT FALSE"},
		{"phone_otp_hash", "VARCHAR(255) NULL"},
		{"phone_otp_expires", "TIMESTAMP NULL"},
		{"password_changed_at", "TIMESTAMP NULL"},
		{"school_id_document_type", "VARCHAR(20) NULL"},
		{"is_premium", "BOOLEAN NOT NULL DEFAULT FALSE"},
		{"last_login", "TIMESTAMP NULL"},
		{"email_otp_hash", "VARCHAR(255) NULL"},
		{"email_otp_expires", "TIMESTAMP NULL"},
		{"reset_password_otp_hash", "VARCHAR(255) NULL"},
		{"reset_password_otp_expires", "TIMESTAMP NULL"},
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
		{"price_reasoning", "TEXT NULL"},
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
		{"xendit_invoice_id", "VARCHAR(255) NULL"},
		{"xendit_external_id", "VARCHAR(255) NULL"},
		{"delivery_instructions", "TEXT NULL"},
		{"proof_of_delivery", "LONGTEXT NULL"},
		{"buyer_confirmed_receipt", "BOOLEAN DEFAULT FALSE"},
		{"seller_confirmed_delivery", "BOOLEAN DEFAULT FALSE"},
		{"auto_completed_at", "TIMESTAMP NULL DEFAULT NULL"},
		{"awaiting_confirmation_since", "TIMESTAMP NULL"},
		{"option_change_requested", "VARCHAR(20) NULL DEFAULT NULL"},
		{"net_amount", "DECIMAL(10,2) DEFAULT 0.00"},
		{"meetup_time", "VARCHAR(50) NULL"},
		{"buyer_meetup_location", "VARCHAR(500) NULL"},
		{"buyer_meetup_time", "VARCHAR(50) NULL"},
		{"seller_meetup_location", "VARCHAR(500) NULL"},
		{"seller_meetup_time", "VARCHAR(50) NULL"},
		{"buyer_met", "BOOLEAN DEFAULT FALSE"},
		{"seller_met", "BOOLEAN DEFAULT FALSE"},
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

	// Ensure trades status ENUM includes auto_completed, awaiting_confirmation, expired, pending_multiway, multiway_active
	var tradeStatusType string
	if err := DB.QueryRow(`
		SELECT COLUMN_TYPE FROM information_schema.COLUMNS
		WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'trades' AND COLUMN_NAME = 'status'
	`).Scan(&tradeStatusType); err == nil {
		if !contains(tradeStatusType, "'pending_multiway'") || !contains(tradeStatusType, "'multiway_active'") {
			if _, err := DB.Exec(`ALTER TABLE trades MODIFY COLUMN status ENUM('pending','accepted','declined','countered','active','awaiting_confirmation','completed','cancelled','auto_completed','expired','pending_multiway','multiway_active') DEFAULT 'pending'`); err != nil {
				log.Printf("Warning: failed to update trades status enum: %v", err)
			} else {
				log.Println("Updated trades status enum to include 'pending_multiway' and 'multiway_active'")
			}
		}
	}

	// Ensure multiway_trades table exists for tracking multiway chain participants
	_, _ = DB.Exec(`CREATE TABLE IF NOT EXISTS multiway_trades (
		id INT AUTO_INCREMENT PRIMARY KEY,
		chain_id VARCHAR(255) NOT NULL,
		original_trade_id INT NOT NULL,
		initiator_user_id INT NOT NULL COMMENT 'User 2 who converted to multiway',
		user1_id INT NOT NULL COMMENT 'Original buyer (User 1)',
		user2_id INT NOT NULL COMMENT 'User who converted to multiway (User 2)',
		user3_id INT NULL COMMENT 'Matched third party (User 3)',
		user3_trade_id INT NULL COMMENT 'Trade ID linking User 3',
		status ENUM('searching','pending_user3','pending_initiator_upgrade','user3_accepted','user3_declined','active','completed','cancelled','fully_declined') DEFAULT 'searching',
		expires_at TIMESTAMP NULL COMMENT 'Expiry for pending_initiator_upgrade records (7 days)',
		cancelled_at TIMESTAMP NULL,
		cancelled_by INT NULL,
		trade_option VARCHAR(20) NULL DEFAULT 'meetup',
		meetup_location VARCHAR(500) NULL,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
		FOREIGN KEY (original_trade_id) REFERENCES trades(id) ON DELETE CASCADE,
		FOREIGN KEY (initiator_user_id) REFERENCES users(id) ON DELETE CASCADE,
		FOREIGN KEY (user1_id) REFERENCES users(id) ON DELETE CASCADE,
		FOREIGN KEY (user2_id) REFERENCES users(id) ON DELETE CASCADE,
		FOREIGN KEY (user3_id) REFERENCES users(id) ON DELETE SET NULL,
		FOREIGN KEY (cancelled_by) REFERENCES users(id) ON DELETE SET NULL,
		INDEX idx_multiway_chain (chain_id),
		INDEX idx_multiway_status (status),
		INDEX idx_multiway_user3 (user3_id),
		INDEX idx_multiway_expires (expires_at)
	)`)

	// Ensure multiway_trades status enum includes pending_initiator_upgrade on existing databases.
	var multiwayStatusType string
	if err := DB.QueryRow(`
		SELECT COLUMN_TYPE FROM information_schema.COLUMNS
		WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'multiway_trades' AND COLUMN_NAME = 'status'
	`).Scan(&multiwayStatusType); err == nil {
		if !contains(multiwayStatusType, "'pending_initiator_upgrade'") {
			if _, err := DB.Exec(`
				ALTER TABLE multiway_trades
				MODIFY COLUMN status ENUM('searching','pending_user3','pending_initiator_upgrade','user3_accepted','user3_declined','active','completed','cancelled','fully_declined') DEFAULT 'searching'
			`); err != nil {
				log.Printf("Warning: failed to update multiway_trades status enum: %v", err)
			} else {
				log.Println("Updated multiway_trades status enum to include 'pending_initiator_upgrade'")
			}
		}
	}

	// Ensure expires_at column exists on multiway_trades for 7-day TTL
	var expiresExists int
	if err := DB.QueryRow(`
		SELECT COUNT(*) FROM information_schema.COLUMNS
		WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'multiway_trades' AND COLUMN_NAME = 'expires_at'
	`).Scan(&expiresExists); err == nil && expiresExists == 0 {
		if _, err := DB.Exec(`
			ALTER TABLE multiway_trades
			ADD COLUMN expires_at TIMESTAMP NULL COMMENT 'Expiry for pending_initiator_upgrade records (7 days)',
			ADD COLUMN cancelled_at TIMESTAMP NULL,
			ADD COLUMN cancelled_by INT NULL,
			ADD FOREIGN KEY fk_cancelled_by (cancelled_by) REFERENCES users(id) ON DELETE SET NULL,
			ADD INDEX idx_multiway_expires (expires_at)
		`); err != nil {
			log.Printf("Warning: failed to add expires_at/cancelled columns to multiway_trades: %v", err)
		} else {
			log.Println("Added expires_at and cancellation columns to multiway_trades")
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
		{"first_login_completed", "BOOLEAN DEFAULT FALSE"},
		{"free_delivery_slots", "INT DEFAULT 3"},
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

// ensureDeliveryBatchColumns adds batch window columns to the deliveries table
// PHASE 3: Also adds step lock and photo enforcement columns
func ensureDeliveryBatchColumns() {
	columns := []struct {
		name       string
		definition string
	}{
		{"batch_id", "VARCHAR(36) NULL"},
		{"batch_window_expires_at", "TIMESTAMP NULL"},
		// Phase 3 - Task 15 & 16: Step lock and photo enforcement columns
		{"qr_verified", "BOOLEAN DEFAULT FALSE"},
		{"qr_code", "VARCHAR(255) NULL"},
		{"photo_uploaded", "BOOLEAN DEFAULT FALSE"},
		{"delivery_photo_url", "VARCHAR(512) NULL"},
	}

	for _, col := range columns {
		var count int
		err := DB.QueryRow(`
			SELECT COUNT(*)
			FROM information_schema.COLUMNS
			WHERE TABLE_SCHEMA = DATABASE()
			AND TABLE_NAME = 'deliveries'
			AND COLUMN_NAME = ?
		`, col.name).Scan(&count)

		if err != nil {
			log.Printf("Warning: failed to check delivery column %s: %v", col.name, err)
			continue
		}

		if count == 0 {
			query := fmt.Sprintf("ALTER TABLE deliveries ADD COLUMN %s %s", col.name, col.definition)
			if _, err := DB.Exec(query); err != nil {
				log.Printf("Warning: failed to add delivery column %s: %v", col.name, err)
			} else {
				log.Printf("Added missing delivery column: %s", col.name)
			}
		}
	}
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
		{"users", "idx_users_org_handle", "org_handle"},
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
