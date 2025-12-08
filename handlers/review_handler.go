package handlers

import (
	"database/sql"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/xashathebest/clovia/database"
)

// ReviewHandler handles review-related HTTP requests
type ReviewHandler struct {
	db *sql.DB
}

// NewReviewHandler creates a new review handler
func NewReviewHandler() *ReviewHandler {
	return &ReviewHandler{
		db: database.DB,
	}
}

// CreateReview handles creating a new review
func (h *ReviewHandler) CreateReview(c *fiber.Ctx) error {
	// Get authenticated user
	userIDInterface := c.Locals("user_id")
	if userIDInterface == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "Unauthorized",
		})
	}
	userID, ok := userIDInterface.(int)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "Unauthorized",
		})
	}

	// Get reviewed user ID from URL
	reviewedUserID, err := c.ParamsInt("id")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid user ID",
		})
	}

	// Parse request body
	var req struct {
		Rating  int    `json:"rating"`
		Comment string `json:"comment"`
	}

	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid request body",
		})
	}

	// Validate rating
	if req.Rating < 1 || req.Rating > 5 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Rating must be between 1 and 5",
		})
	}

	// Validate comment
	if len(req.Comment) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Comment is required",
		})
	}

	// Check if user is trying to review themselves
	if userID == reviewedUserID {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "You cannot review yourself",
		})
	}

	// Create review in database
	query := `
		INSERT INTO reviews (reviewer_id, reviewed_user_id, rating, comment, created_at)
		VALUES (?, ?, ?, ?, ?)
	`

	result, err := h.db.Exec(query, userID, reviewedUserID, req.Rating, req.Comment, time.Now())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to create review",
		})
	}

	reviewID, _ := result.LastInsertId()

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"message": "Review created successfully",
		"data": fiber.Map{
			"id": reviewID,
		},
	})
}

// GetUserReviews retrieves all reviews for a specific user
func (h *ReviewHandler) GetUserReviews(c *fiber.Ctx) error {
	userID, err := c.ParamsInt("id")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid user ID",
		})
	}

	query := `
		SELECT 
			r.id,
			r.reviewer_id,
			u.name as reviewer_name,
			u.profile_picture as reviewer_avatar,
			r.rating,
			r.comment,
			r.created_at
		FROM reviews r
		JOIN users u ON r.reviewer_id = u.id
		WHERE r.reviewed_user_id = ?
		ORDER BY r.created_at DESC
	`

	rows, err := h.db.Query(query, userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to fetch reviews",
		})
	}
	defer rows.Close()

	var reviews []fiber.Map
	for rows.Next() {
		var review struct {
			ID             int
			ReviewerID     int
			ReviewerName   string
			ReviewerAvatar sql.NullString
			Rating         int
			Comment        string
			CreatedAt      time.Time
		}

		err := rows.Scan(
			&review.ID,
			&review.ReviewerID,
			&review.ReviewerName,
			&review.ReviewerAvatar,
			&review.Rating,
			&review.Comment,
			&review.CreatedAt,
		)

		if err != nil {
			continue
		}

		avatar := ""
		if review.ReviewerAvatar.Valid {
			avatar = review.ReviewerAvatar.String
		}

		reviews = append(reviews, fiber.Map{
			"id":       review.ID,
			"reviewer": review.ReviewerName,
			"avatar":   avatar,
			"rating":   review.Rating,
			"comment":  review.Comment,
			"date":     review.CreatedAt.Format("2006-01-02"),
		})
	}

	if reviews == nil {
		reviews = []fiber.Map{}
	}

	return c.JSON(fiber.Map{
		"data": reviews,
	})
}

// GetUserRating calculates the average rating for a user
func (h *ReviewHandler) GetUserRating(c *fiber.Ctx) error {
	userID, err := c.ParamsInt("id")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid user ID",
		})
	}

	query := `
		SELECT 
			COALESCE(AVG(rating), 0) as avg_rating,
			COUNT(*) as total_reviews,
			COALESCE(SUM(CASE WHEN rating >= 4 THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0), 0) as positive_feedback
		FROM reviews
		WHERE reviewed_user_id = ?
	`

	var stats struct {
		AvgRating        float64
		TotalReviews     int
		PositiveFeedback float64
	}

	err = h.db.QueryRow(query, userID).Scan(
		&stats.AvgRating,
		&stats.TotalReviews,
		&stats.PositiveFeedback,
	)

	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to calculate rating",
		})
	}

	return c.JSON(fiber.Map{
		"data": fiber.Map{
			"rating":            stats.AvgRating,
			"total_reviews":     stats.TotalReviews,
			"positive_feedback": int(stats.PositiveFeedback),
		},
	})
}
