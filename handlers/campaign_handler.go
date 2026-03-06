package handlers

import (
	"log"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/xashathebest/clovia/database"
	"github.com/xashathebest/clovia/middleware"
	"github.com/xashathebest/clovia/models"
)

type CampaignHandler struct{}

func NewCampaignHandler() *CampaignHandler {
	return &CampaignHandler{}
}

// GetAdminCampaigns retrieves all campaigns for the admin dashboard
func (h *CampaignHandler) GetAdminCampaigns(c *fiber.Ctx) error {
	rows, err := database.DB.Query(`
		SELECT id, title, description, image_url, button_text, button_link, 
		       start_date, end_date, target_users, frequency, is_active, created_at, updated_at
		FROM campaigns
		ORDER BY created_at DESC
	`)
	if err != nil {
		log.Printf("Error querying campaigns: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"error":   "Failed to fetch campaigns",
		})
	}
	defer rows.Close()

	var campaigns []models.Campaign
	for rows.Next() {
		var camp models.Campaign
		err := rows.Scan(
			&camp.ID, &camp.Title, &camp.Description, &camp.ImageURL,
			&camp.ButtonText, &camp.ButtonLink, &camp.StartDate, &camp.EndDate,
			&camp.TargetUsers, &camp.Frequency, &camp.IsActive, &camp.CreatedAt, &camp.UpdatedAt,
		)
		if err != nil {
			log.Printf("Error scanning campaign: %v", err)
			continue
		}
		campaigns = append(campaigns, camp)
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data":    campaigns,
	})
}

// CreateCampaign creates a new campaign (admin only)
func (h *CampaignHandler) CreateCampaign(c *fiber.Ctx) error {
	var input models.CampaignCreate
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"error":   "Invalid input data",
		})
	}

	// Default values
	if input.TargetUsers == "" {
		input.TargetUsers = "all"
	}
	if input.Frequency == "" {
		input.Frequency = "once_per_user"
	}

	result, err := database.DB.Exec(`
		INSERT INTO campaigns (title, description, image_url, button_text, button_link, start_date, end_date, target_users, frequency, is_active)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, input.Title, input.Description, input.ImageURL, input.ButtonText, input.ButtonLink, input.StartDate, input.EndDate, input.TargetUsers, input.Frequency, input.IsActive)

	if err != nil {
		log.Printf("Error creating campaign: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"error":   "Failed to create campaign",
		})
	}

	id, _ := result.LastInsertId()

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"success": true,
		"message": "Campaign created successfully",
		"data": fiber.Map{
			"id": id,
		},
	})
}

// UpdateCampaign updates an existing campaign (admin only)
func (h *CampaignHandler) UpdateCampaign(c *fiber.Ctx) error {
	id := c.Params("id")
	var input models.CampaignUpdate
	if err := c.BodyParser(&input); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"error":   "Invalid input data",
		})
	}

	// Build dynamic update query
	query := "UPDATE campaigns SET "
	var args []interface{}

	if input.Title != nil {
		query += "title=?, "
		args = append(args, *input.Title)
	}
	if input.Description != nil {
		query += "description=?, "
		args = append(args, *input.Description)
	}
	if input.ImageURL != nil {
		query += "image_url=?, "
		args = append(args, *input.ImageURL)
	}
	if input.ButtonText != nil {
		query += "button_text=?, "
		args = append(args, *input.ButtonText)
	}
	if input.ButtonLink != nil {
		query += "button_link=?, "
		args = append(args, *input.ButtonLink)
	}
	if input.StartDate != nil {
		query += "start_date=?, "
		args = append(args, *input.StartDate)
	}
	if input.EndDate != nil {
		query += "end_date=?, "
		args = append(args, *input.EndDate)
	}
	if input.TargetUsers != nil {
		query += "target_users=?, "
		args = append(args, *input.TargetUsers)
	}
	if input.Frequency != nil {
		query += "frequency=?, "
		args = append(args, *input.Frequency)
	}
	if input.IsActive != nil {
		query += "is_active=?, "
		args = append(args, *input.IsActive)
	}

	if len(args) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"success": false,
			"error":   "No fields to update",
		})
	}

	// Remove trailing comma and space
	query = query[:len(query)-2]
	query += " WHERE id=?"
	args = append(args, id)

	_, err := database.DB.Exec(query, args...)
	if err != nil {
		log.Printf("Error updating campaign: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"error":   "Failed to update campaign",
		})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Campaign updated successfully",
	})
}

// DeleteCampaign deletes a campaign (admin only)
func (h *CampaignHandler) DeleteCampaign(c *fiber.Ctx) error {
	id := c.Params("id")
	_, err := database.DB.Exec("DELETE FROM campaigns WHERE id=?", id)
	if err != nil {
		log.Printf("Error deleting campaign: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"error":   "Failed to delete campaign",
		})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Campaign deleted successfully",
	})
}

// GetActiveCampaigns fetches campaigns currently active for the user
func (h *CampaignHandler) GetActiveCampaigns(c *fiber.Ctx) error {
	// The frontend will evaluate the frequency rules via localStorage,
	// so backend just needs to return campaigns that are:
	// 1. is_active = true
	// 2. start_date is null OR <= now
	// 3. end_date is null OR >= now
	// Optionally filtering by target_users based on the current user Context.

	var queryCondition string = ""
	var args []interface{}
	
	now := time.Now()

	targetConditions := []string{"'all'"}
	
	userID, ok := middleware.GetUserIDFromContext(c)
	if ok {
		// User is logged in
		var verified bool
		err := database.DB.QueryRow("SELECT verified FROM users WHERE id = ?", userID).Scan(&verified)
		if err == nil {
			if verified {
				targetConditions = append(targetConditions, "'verified'")
			} else {
				targetConditions = append(targetConditions, "'unverified'")
			}
		}
	} else {
		// Not logged in (could be 'new')
		targetConditions = append(targetConditions, "'new'")
	}

	// Build the IN clause
	targetInClause := ""
	for i, cond := range targetConditions {
		if i > 0 {
			targetInClause += ","
		}
		targetInClause += cond
	}

	queryCondition = `
		WHERE is_active = TRUE 
		AND (start_date IS NULL OR start_date <= ?)
		AND (end_date IS NULL OR end_date >= ?)
		AND target_users IN (` + targetInClause + `)
	`
	args = append(args, now, now)

	query := `
		SELECT id, title, description, image_url, button_text, button_link, 
		       start_date, end_date, target_users, frequency, is_active, created_at, updated_at
		FROM campaigns
		` + queryCondition + `
		ORDER BY created_at DESC
	`

	rows, err := database.DB.Query(query, args...)
	if err != nil {
		log.Printf("Error querying active campaigns: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"success": false,
			"error":   "Failed to fetch active campaigns",
		})
	}
	defer rows.Close()

	var campaigns []models.Campaign
	for rows.Next() {
		var camp models.Campaign
		err := rows.Scan(
			&camp.ID, &camp.Title, &camp.Description, &camp.ImageURL,
			&camp.ButtonText, &camp.ButtonLink, &camp.StartDate, &camp.EndDate,
			&camp.TargetUsers, &camp.Frequency, &camp.IsActive, &camp.CreatedAt, &camp.UpdatedAt,
		)
		if err != nil {
			log.Printf("Error scanning campaign: %v", err)
			continue
		}
		campaigns = append(campaigns, camp)
	}

	// Frontend will decide which one to show first based on priority/frequency
	return c.JSON(fiber.Map{
		"success": true,
		"data":    campaigns,
	})
}
