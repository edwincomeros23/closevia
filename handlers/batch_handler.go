package handlers

import (
	"context"
	"database/sql"
	"fmt"
	"math"
	"sort"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/xashathebest/clovia/middleware"
	"github.com/xashathebest/clovia/models"
)

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES AND MODELS
// ═══════════════════════════════════════════════════════════════════════════════

type BatchDelivery struct {
	ID                    int        `json:"id"`
	RiderID               int        `json:"rider_id"`
	Status                string     `json:"status"` // pending, collecting_addons, ready, in_progress, completed, cancelled
	AnchorDeliveryID      int        `json:"anchor_delivery_id"`
	BatchName             string     `json:"batch_name"`
	TotalSlotsUsed        int        `json:"total_slots_used"`
	TotalDistanceKm       float64    `json:"total_distance_km"`
	EstimatedMinutes      int        `json:"estimated_minutes"`
	OptimizedRoute        []int      `json:"optimized_route"` // delivery IDs in order
	TotalRiderCommission  float64    `json:"total_rider_commission"`
	TotalCloviaCommission float64    `json:"total_clovia_commission"`
	ClaimedAt             time.Time  `json:"claimed_at"`
	StartedAt             *time.Time `json:"started_at"`
	CompletedAt           *time.Time `json:"completed_at"`
	CreatedAt             time.Time  `json:"created_at"`
	UpdatedAt             time.Time  `json:"updated_at"`
	Deliveries            []int      `json:"deliveries"` // all delivery IDs in batch
}

type RiderSlotLedger struct {
	RiderID                   int     `json:"rider_id"`
	FreeSlotTotal             int     `json:"free_slots_total"`
	FreeSlotsRemaining        int     `json:"free_slots_remaining"`
	CurrentBatchSlotsUsed     int     `json:"current_batch_slots_used"`
	CashCollectedCurrentBatch float64 `json:"cash_collected_current_batch"`
	RemittanceOwed            float64 `json:"remittance_owed"`
	RemittanceThreshold       float64 `json:"remittance_threshold"`
	IsLockedForBatching       bool    `json:"is_locked_for_batching"`
	LockedReason              string  `json:"locked_reason"`
}

type BatchAddonSuggestion struct {
	SuggestedDeliveryID  int     `json:"suggested_delivery_id"`
	DistanceFromAnchorKm float64 `json:"distance_from_anchor_km"`
	RouteDetourPercent   float64 `json:"route_detour_percent"`
	Score                float64 `json:"score"`
}

type ClaimBatchRequest struct {
	AnchorDeliveryID int   `json:"anchor_delivery_id"`
	AddonDeliveryIDs []int `json:"addon_delivery_ids"`
}

type RemitCashRequest struct {
	BatchID          int     `json:"batch_id"`
	Amount           float64 `json:"amount"`
	PaymentMethod    string  `json:"payment_method"` // cash, bank_transfer, e_wallet
	PaymentReference string  `json:"payment_reference"`
	ProofURL         string  `json:"proof_url"`
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

func toRadians(deg float64) float64 {
	return deg * (math.Pi / 180)
}

// ═══════════════════════════════════════════════════════════════════════════════
// BATCH HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════

// ClaimBatch - Rider claims anchor delivery and optional add-ons
func (h *DeliveryHandler) ClaimBatch(c *fiber.Ctx) error {
	riderUserID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "Unauthorized"})
	}

	var req ClaimBatchRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid request"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Get rider ID
	var riderID int
	err := h.db.QueryRowContext(ctx, "SELECT id FROM riders WHERE user_id = ?", riderUserID).Scan(&riderID)
	if err != nil {
		return c.Status(403).JSON(models.APIResponse{Success: false, Error: "Not a registered rider"})
	}

	// Check rider slot availability
	var ledger RiderSlotLedger
	err = h.db.QueryRowContext(ctx,
		"SELECT rider_id, free_slots_total, free_slots_remaining, current_batch_slots_used, cash_collected_current_batch, remittance_owed, is_locked_for_batching FROM rider_slot_ledger WHERE rider_id = ?",
		riderID).Scan(&ledger.RiderID, &ledger.FreeSlotTotal, &ledger.FreeSlotsRemaining, &ledger.CurrentBatchSlotsUsed, &ledger.CashCollectedCurrentBatch, &ledger.RemittanceOwed, &ledger.IsLockedForBatching)

	if err != nil && err != sql.ErrNoRows {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to fetch rider ledger"})
	}

	if ledger.IsLockedForBatching {
		return c.Status(403).JSON(models.APIResponse{Success: false, Error: "Account locked: remittance owed exceeds threshold"})
	}

	// Calculate slots needed
	slotsNeeded := 1 + len(req.AddonDeliveryIDs)
	if slotsNeeded > ledger.FreeSlotsRemaining {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   fmt.Sprintf("Insufficient slots. Need %d, have %d available", slotsNeeded, ledger.FreeSlotsRemaining),
		})
	}

	// Create batch in database
	tx, err := h.db.BeginTx(ctx, nil)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to start transaction"})
	}
	defer tx.Rollback()

	// Insert batch
	var batchID int
	err = tx.QueryRowContext(ctx,
		`INSERT INTO delivery_batches (rider_id, status, anchor_delivery_id, total_slots_used) 
		 VALUES (?, 'collecting_addons', ?, ?) RETURNING id`,
		riderID, req.AnchorDeliveryID, slotsNeeded).Scan(&batchID)

	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to create batch"})
	}

	// Create batch delivery mapping for anchor
	_, err = tx.ExecContext(ctx,
		`INSERT INTO batch_delivery_mappings (batch_id, delivery_id, route_order, is_anchor) 
		 VALUES (?, ?, 1, true)`,
		batchID, req.AnchorDeliveryID)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to map anchor delivery"})
	}

	// Create mappings for add-ons
	for i, addonID := range req.AddonDeliveryIDs {
		_, err = tx.ExecContext(ctx,
			`INSERT INTO batch_delivery_mappings (batch_id, delivery_id, route_order, is_anchor) 
			 VALUES (?, ?, ?, false)`,
			batchID, addonID, i+2)
		if err != nil {
			return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to map addon delivery"})
		}
	}

	// Update rider ledger
	_, err = tx.ExecContext(ctx,
		`UPDATE rider_slot_ledger SET free_slots_remaining = free_slots_remaining - ?, 
		        current_batch_slots_used = ? WHERE rider_id = ?`,
		slotsNeeded, slotsNeeded, riderID)

	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to update slot ledger"})
	}

	if err = tx.Commit(); err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to commit transaction"})
	}

	return c.Status(201).JSON(models.APIResponse{
		Success: true,
		Data: fiber.Map{
			"batch_id":        batchID,
			"slots_used":      slotsNeeded,
			"slots_remaining": ledger.FreeSlotsRemaining - slotsNeeded,
		},
	})
}

// GetNearbyAddOns - Get suggested add-on deliveries based on anchor location
func (h *DeliveryHandler) GetNearbyAddOns(c *fiber.Ctx) error {
	anchorDeliveryID := c.QueryInt("anchor_delivery_id")
	if anchorDeliveryID == 0 {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "anchor_delivery_id required"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Fetch anchor delivery details
	var anchorLat, anchorLon float64
	err := h.db.QueryRowContext(ctx,
		"SELECT pickup_latitude, pickup_longitude FROM deliveries WHERE id = ?",
		anchorDeliveryID).Scan(&anchorLat, &anchorLon)

	if err != nil {
		return c.Status(404).JSON(models.APIResponse{Success: false, Error: "Anchor delivery not found"})
	}

	// Find nearby pending deliveries within 15km
	rows, err := h.db.QueryContext(ctx,
		`SELECT id, pickup_latitude, pickup_longitude, status, total_cost 
		 FROM deliveries 
		 WHERE id != ? AND status = 'pending' 
		 AND pickup_latitude BETWEEN ? AND ? 
		 AND pickup_longitude BETWEEN ? AND ?
		 LIMIT 10`,
		anchorDeliveryID,
		anchorLat-0.15, anchorLat+0.15,
		anchorLon-0.15, anchorLon+0.15)

	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to query deliveries"})
	}
	defer rows.Close()

	var suggestions []BatchAddonSuggestion
	for rows.Next() {
		var id int
		var lat, lon float64
		var status string
		var cost float64

		if err := rows.Scan(&id, &lat, &lon, &status, &cost); err != nil {
			continue
		}

		// Calculate distance using Haversine formula (inline to avoid dependency)
		const R = 6371 // Earth radius in km
		phi1 := toRadians(anchorLat)
		phi2 := toRadians(lat)
		deltaPhi := toRadians(lat - anchorLat)
		deltaLambda := toRadians(lon - anchorLon)

		a := math.Sin(deltaPhi/2)*math.Sin(deltaPhi/2) +
			math.Cos(phi1)*math.Cos(phi2)*math.Sin(deltaLambda/2)*math.Sin(deltaLambda/2)
		c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
		distance := R * c

		detourPercent := (distance / 2.0) * 100.0 // rough estimate

		suggestion := BatchAddonSuggestion{
			SuggestedDeliveryID:  id,
			DistanceFromAnchorKm: distance,
			RouteDetourPercent:   detourPercent,
			Score:                1000.0 / (distance + 1.0), // favor closer deliveries
		}

		suggestions = append(suggestions, suggestion)
	}

	// Sort by score descending
	sort.Slice(suggestions, func(i, j int) bool {
		return suggestions[i].Score > suggestions[j].Score
	})

	return c.JSON(models.APIResponse{
		Success: true,
		Data:    suggestions,
	})
}

// GetRiderSlots - Get current rider slot status
func (h *DeliveryHandler) GetRiderSlots(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "Unauthorized"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var riderID int
	err := h.db.QueryRowContext(ctx, "SELECT id FROM riders WHERE user_id = ?", userID).Scan(&riderID)
	if err != nil {
		return c.Status(403).JSON(models.APIResponse{Success: false, Error: "Not a registered rider"})
	}

	// Initialize ledger if not exists
	_, err = h.db.ExecContext(ctx,
		`INSERT IGNORE INTO rider_slot_ledger (rider_id, free_slots_total, free_slots_remaining, remittance_threshold) 
		 VALUES (?, 3, 3, 1000.00)`,
		riderID)

	var ledger RiderSlotLedger
	err = h.db.QueryRowContext(ctx,
		`SELECT rider_id, free_slots_total, free_slots_remaining, current_batch_slots_used, 
		        cash_collected_current_batch, remittance_owed, remittance_threshold, 
		        is_locked_for_batching, locked_reason
		 FROM rider_slot_ledger WHERE rider_id = ?`,
		riderID).Scan(&ledger.RiderID, &ledger.FreeSlotTotal, &ledger.FreeSlotsRemaining,
		&ledger.CurrentBatchSlotsUsed, &ledger.CashCollectedCurrentBatch, &ledger.RemittanceOwed,
		&ledger.RemittanceThreshold, &ledger.IsLockedForBatching, &ledger.LockedReason)

	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to fetch slot ledger"})
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Data:    ledger,
	})
}

// RemitCash - Rider remits collected cash to unlock slots
func (h *DeliveryHandler) RemitCash(c *fiber.Ctx) error {
	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "Unauthorized"})
	}

	var req RemitCashRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Invalid request"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var riderID int
	err := h.db.QueryRowContext(ctx, "SELECT id FROM riders WHERE user_id = ?", userID).Scan(&riderID)
	if err != nil {
		return c.Status(403).JSON(models.APIResponse{Success: false, Error: "Not a registered rider"})
	}

	// Start transaction
	tx, err := h.db.BeginTx(ctx, nil)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to start transaction"})
	}
	defer tx.Rollback()

	// Calculate commissions
	cloviaCommission := req.Amount * 0.15
	riderTakeHome := req.Amount - cloviaCommission

	// Insert remittance record
	_, err = tx.ExecContext(ctx,
		`INSERT INTO batch_remittance_history (rider_id, batch_id, cash_amount_remitted, clovia_commission_15_percent, 
		                                        rider_take_home, payment_method, payment_reference, proof_url, slots_unlocked_count)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 3)`,
		riderID, req.BatchID, req.Amount, cloviaCommission, riderTakeHome, req.PaymentMethod, req.PaymentReference, req.ProofURL)

	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to record remittance"})
	}

	// Update rider ledger - unlock slots
	_, err = tx.ExecContext(ctx,
		`UPDATE rider_slot_ledger 
		 SET free_slots_remaining = free_slots_total,
		        current_batch_slots_used = 0,
		        remittance_owed = GREATEST(remittance_owed - ?, 0),
		        is_locked_for_batching = CASE WHEN (remittance_owed - ?) < 1000 THEN FALSE ELSE TRUE END,
		        last_remittance_at = NOW()
		 WHERE rider_id = ?`,
		req.Amount, req.Amount, riderID)

	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to update ledger"})
	}

	if err = tx.Commit(); err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to commit transaction"})
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Data: fiber.Map{
			"remittance_id":     1,
			"amount_remitted":   req.Amount,
			"clovia_commission": cloviaCommission,
			"rider_take_home":   riderTakeHome,
			"status":            "pending",
			"message":           "Remittance submitted for verification",
		},
	})
}

// StartBatch - Rider begins executing the batch delivery
func (h *DeliveryHandler) StartBatch(c *fiber.Ctx) error {
	batchIDStr := c.Params("batch_id")
	batchID, err := strconv.Atoi(batchIDStr)
	if err != nil || batchID == 0 {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "batch_id required"})
	}

	userID, ok := middleware.GetUserIDFromContext(c)
	if !ok {
		return c.Status(401).JSON(models.APIResponse{Success: false, Error: "Unauthorized"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Verify rider owns this batch
	var riderID int
	err = h.db.QueryRowContext(ctx,
		"SELECT rider_id FROM delivery_batches WHERE id = ?", batchID).Scan(&riderID)

	if err != nil {
		return c.Status(404).JSON(models.APIResponse{Success: false, Error: "Batch not found"})
	}

	// Verify user is this rider
	var userRiderID int
	err = h.db.QueryRowContext(ctx, "SELECT id FROM riders WHERE user_id = ?", userID).Scan(&userRiderID)
	if err != nil || userRiderID != riderID {
		return c.Status(403).JSON(models.APIResponse{Success: false, Error: "Not authorized"})
	}

	// Update batch status
	result, err := h.db.ExecContext(ctx,
		`UPDATE delivery_batches SET status = 'in_progress', started_at = NOW() 
		 WHERE id = ? AND status IN ('pending', 'collecting_addons', 'ready')`,
		batchID)

	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to start batch"})
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "Batch cannot be started from current status"})
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Data: fiber.Map{
			"batch_id": batchID,
			"status":   "in_progress",
		},
	})
}

// CompleteBatch - Mark batch as completed
func (h *DeliveryHandler) CompleteBatch(c *fiber.Ctx) error {
	batchIDStr := c.Params("batch_id")
	batchID, err := strconv.Atoi(batchIDStr)
	if err != nil || batchID == 0 {
		return c.Status(400).JSON(models.APIResponse{Success: false, Error: "batch_id required"})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	tx, err := h.db.BeginTx(ctx, nil)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to start transaction"})
	}
	defer tx.Rollback()

	// Get batch details
	var riderID int
	var totalCommission float64
	err = tx.QueryRowContext(ctx,
		`SELECT rider_id, total_rider_commission FROM delivery_batches WHERE id = ?`,
		batchID).Scan(&riderID, &totalCommission)

	if err != nil {
		return c.Status(404).JSON(models.APIResponse{Success: false, Error: "Batch not found"})
	}

	// Mark batch as completed
	_, err = tx.ExecContext(ctx,
		`UPDATE delivery_batches SET status = 'completed', completed_at = NOW() 
		 WHERE id = ?`, batchID)

	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to complete batch"})
	}

	// Update rider ledger - add to remittance owed
	_, err = tx.ExecContext(ctx,
		`UPDATE rider_slot_ledger 
		 SET cash_collected_current_batch = cash_collected_current_batch + ?,
		        remittance_owed = remittance_owed + ?,
		        is_locked_for_batching = CASE WHEN (remittance_owed + ?) >= 1000 THEN TRUE ELSE FALSE END
		 WHERE rider_id = ?`,
		totalCommission, totalCommission, totalCommission, riderID)

	if err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to update ledger"})
	}

	if err = tx.Commit(); err != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: "Failed to commit transaction"})
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Data: fiber.Map{
			"batch_id":          batchID,
			"status":            "completed",
			"commission_earned": totalCommission,
		},
	})
}
