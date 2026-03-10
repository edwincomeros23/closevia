package main

import (
	"database/sql"
	"fmt"
	"log"

	"github.com/joho/godotenv"
	"github.com/xashathebest/clovia/database"
)

func main() {
	if err := godotenv.Load(".env"); err != nil {
		log.Fatal("Error loading .env file")
	}

	if err := database.InitDatabase(); err != nil {
		log.Fatalf("Failed to init db: %v", err)
	}
	defer database.CloseDatabase()

	// To safely scan all we need matching dests
	var (
		id, name, email, role, verified, org_logo_url, profile_picture, bio, bg_img, bg_pos, dept, is_prem, v_stat, s_name, s_email, v_rea, e_not, p_not, c_at, u_at interface{}
		s_v_at                                                                                                                                                       sql.NullTime
	)

	err := database.DB.QueryRow(
		`SELECT id, name, email, role, verified, 
		        COALESCE(org_logo_url, '') AS org_logo_url,
		        COALESCE(profile_picture, '') AS profile_picture,
		        COALESCE(bio, '') AS bio,
		        COALESCE(background_image, '') AS background_image,
		        COALESCE(background_position, '') AS background_position,
		        COALESCE(department, '') AS department, 
		        COALESCE(is_premium, FALSE) AS is_premium,
		        COALESCE(verification_status, 'not_verified') AS verification_status,
		        COALESCE(school_name, '') AS school_name,
		        COALESCE(school_email, '') AS school_email,
		        school_email_verified_at,
		        COALESCE(verification_rejection_reason, '') AS verification_rejection_reason,
		        COALESCE(email_notifications_enabled, TRUE) AS email_notifications_enabled,
		        COALESCE(push_notifications_enabled, TRUE) AS push_notifications_enabled,
		        created_at, updated_at
		 FROM users WHERE id = ?`, 35,
	).Scan(
		&id, &name, &email, &role, &verified, &org_logo_url, &profile_picture, &bio, &bg_img, &bg_pos, &dept, &is_prem,
		&v_stat, &s_name, &s_email, &s_v_at, &v_rea,
		&e_not, &p_not, &c_at, &u_at,
	)

	if err != nil {
		fmt.Printf("🚨 FULL GetProfile Query Error: %v\n", err)
	} else {
		fmt.Printf("FULL GetProfile Query SUCCESS. No errors.\n")
	}
}
