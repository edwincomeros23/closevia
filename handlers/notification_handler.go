package handlers

import (
	"database/sql"

	"github.com/gofiber/fiber/v2"
	"github.com/xashathebest/clovia/database"
	"github.com/xashathebest/clovia/middleware"
	"github.com/xashathebest/clovia/models"
)

type NotificationHandler struct{ db *sql.DB }

func NewNotificationHandler() *NotificationHandler { return &NotificationHandler{db: database.DB} }

// GetNotifications lists notifications for the authenticated user
func (h *NotificationHandler) GetNotifications(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return fiber.ErrUnauthorized
	}
	category := c.Query("type", "")
	where := "WHERE user_id = ?"
	args := []interface{}{userID}
	if category != "" {
		where += " AND type = ?"
		args = append(args, category)
	}
	rows, err := h.db.Query("SELECT id, user_id, type, message, is_read, created_at FROM notifications "+where+" ORDER BY created_at DESC", args...)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to fetch notifications"})
	}
	defer rows.Close()
	var list []map[string]interface{}
	for rows.Next() {
		var id, uid int
		var typ, msg string
		var read bool
		var createdAt string
		if err := rows.Scan(&id, &uid, &typ, &msg, &read, &createdAt); err == nil {
			list = append(list, map[string]interface{}{"id": id, "user_id": uid, "type": typ, "message": msg, "read": read, "created_at": createdAt})
		}
	}
	return c.JSON(models.APIResponse{Success: true, Data: list})
}

// MarkAsRead marks a single notification as read
func (h *NotificationHandler) MarkAsRead(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return fiber.ErrUnauthorized
	}
	id := c.Params("id")
	res, err := h.db.Exec("UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?", id, userID)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to update notification"})
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fiber.ErrNotFound
	}
	return c.JSON(models.APIResponse{Success: true})
}

// MarkAllAsRead marks all notifications as read for the user
func (h *NotificationHandler) MarkAllAsRead(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return fiber.ErrUnauthorized
	}
	if _, err := h.db.Exec("UPDATE notifications SET is_read = TRUE WHERE user_id = ?", userID); err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to update notifications"})
	}
	return c.JSON(models.APIResponse{Success: true})
}
