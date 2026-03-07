package handlers

import (
	"context"
	"database/sql"
	"fmt"
	"os"

	"github.com/gofiber/fiber/v2"
	"github.com/xashathebest/clovia/models"
	xendit "github.com/xendit/xendit-go/v3"
	"github.com/xendit/xendit-go/v3/invoice"
)

type PaymentHandler struct {
	db *sql.DB
}

func NewPaymentHandler(db *sql.DB) *PaymentHandler {
	return &PaymentHandler{db: db}
}

// CreateTradeInvoice generates a Xendit checkout URL for a Trade
func (h *PaymentHandler) CreateTradeInvoice(c *fiber.Ctx) error {
	// Parse Trade ID
	tradeID := c.Params("id")
	if tradeID == "" {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "Trade ID is required",
		})
	}

	// Verify User
	userID := c.Locals("user_id").(int)

	// Fetch Trade details and verify participation
	var trade models.Trade
	var buyerID, sellerID, targetProductID int
	var status string
	var offeredCashAmount sql.NullFloat64
	var deliveryType sql.NullString

	err := h.db.QueryRow(`
		SELECT id, buyer_id, seller_id, status, offered_cash_amount, COALESCE(delivery_type, ''), target_product_id 
		FROM trades 
		WHERE id = ?`, tradeID).Scan(
		&trade.ID, &buyerID, &sellerID, &status, &offeredCashAmount, &deliveryType, &targetProductID,
	)

	fmt.Printf("🔍 Payment Debug: TradeID=%s, UserID=%d, BuyerID=%d, SellerID=%d, DeliveryType=%s\n",
		tradeID, userID, buyerID, sellerID, deliveryType.String)

	if err != nil {
		fmt.Printf("❌ Payment Error (Fetch): %v\n", err)
		return c.Status(404).JSON(models.APIResponse{
			Success: false,
			Error:   "Trade not found",
		})
	}

	// Only Buyer can pay
	if userID != buyerID {
		fmt.Printf("🚫 Payment Forbidden: UserID %d is not BuyerID %d\n", userID, buyerID)
		return c.Status(403).JSON(models.APIResponse{
			Success: false,
			Error:   "Only the buyer can initiate payment",
		})
	}

	// Trade must be active or accepted
	if status != "accepted" && status != "active" && status != "pending" {
		fmt.Printf("🚫 Payment Rejected: Trade status is '%s' (expected 'accepted', 'active', or 'pending')\n", status)
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   fmt.Sprintf("Trade is not in a payable state (current status: %s)", status),
		})
	}

	// Calculate Amount
	var amount float64 = 0

	// 1. Negotiation cash supplement
	if offeredCashAmount.Valid {
		amount += offeredCashAmount.Float64
	}

	// 2. Product Price (if it's a direct purchase, i.e., 0 items offered by buyer)
	var itemCount int
	h.db.QueryRow("SELECT COUNT(*) FROM trade_items WHERE trade_id = ? AND offered_by = 'buyer'", tradeID).Scan(&itemCount)
	if itemCount == 0 {
		var productPrice float64
		h.db.QueryRow("SELECT COALESCE(price, 0) FROM products WHERE id = ?", targetProductID).Scan(&productPrice)
		amount += productPrice
		fmt.Printf("🛒 Purchase detected (0 items offered). Added product price: %.2f\n", productPrice)
	}

	// 3. Delivery Fee
	deliveryFee := 0.0
	if deliveryType.Valid {
		switch deliveryType.String {
		case "express":
			deliveryFee = 150.0
		case "standard":
			deliveryFee = 50.0
		}
	}
	amount += deliveryFee
	fmt.Printf("🚚 Delivery fee for '%s': %.2f. Total Amount: %.2f\n", deliveryType.String, deliveryFee, amount)

	if amount <= 0 {
		fmt.Printf("🚫 Payment Rejected: Calculated amount is %.2f\n", amount)
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   fmt.Sprintf("This trade does not require a cash payment (amount: %.2f)", amount),
		})
	}

	// Get User Details for Invoice
	var buyerName, buyerEmail string
	h.db.QueryRow("SELECT name, email FROM users WHERE id = ?", buyerID).Scan(&buyerName, &buyerEmail)

	// Initialize Xendit Client
	apiKey := os.Getenv("XENDIT_SECRET_KEY")
	if apiKey == "" {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Payment gateway is not configured",
		})
	}
	xenditClient := xendit.NewClient(apiKey)

	// Create Invoice Parameters
	externalID := fmt.Sprintf("trade_%d_%s", trade.ID, os.Getenv("PORT")) // Unique reference
	description := fmt.Sprintf("Clovia Trade Escrow #%d", trade.ID)

	// Create Xendit Invoice Request

	// Determine frontend URL based on environment
	frontendURL := "http://localhost:5173" // Default for local dev
	if os.Getenv("APP_ENV") == "production" || os.Getenv("FRONTEND_URL") != "" {
		if envURL := os.Getenv("FRONTEND_URL"); envURL != "" {
			frontendURL = envURL
		} else {
			frontendURL = "https://cloviaph.netlify.app"
		}
	}

	successUrl := fmt.Sprintf("%s/trades", frontendURL)
	failureUrl := fmt.Sprintf("%s/trades", frontendURL)

	currency := "PHP"
	req := xenditClient.InvoiceApi.CreateInvoice(context.Background()).CreateInvoiceRequest(invoice.CreateInvoiceRequest{
		ExternalId:  externalID,
		Amount:      float32(amount),
		Description: &description,
		PayerEmail:  &buyerEmail,
		Customer: &invoice.CustomerObject{
			GivenNames: *invoice.NewNullableString(&buyerName),
			Email:      *invoice.NewNullableString(&buyerEmail),
		},
		SuccessRedirectUrl: &successUrl,
		FailureRedirectUrl: &failureUrl,
		Currency:           &currency,
	})

	// Execute Request
	resp, _, execErr := req.Execute()
	if execErr != nil {
		fmt.Printf("❌ Xendit Execute Error: %v\n", execErr)
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   "Failed to generate payment link: " + execErr.Error(),
		})
	}

	// Return checkout URL to frontend
	return c.JSON(fiber.Map{
		"success": true,
		"data": fiber.Map{
			"checkout_url": resp.InvoiceUrl,
			"invoice_id":   resp.Id,
		},
	})
}

// XenditWebhook handles asynchronous payment confirmations
func (h *PaymentHandler) XenditWebhook(c *fiber.Ctx) error {
	// Xendit sends a callback. We could verify the webhook token here.
	var payload map[string]interface{}
	if err := c.BodyParser(&payload); err != nil {
		return c.Status(400).SendString("Invalid payload")
	}

	// Extract data
	status, _ := payload["status"].(string)
	externalID, _ := payload["external_id"].(string)

	if status != "PAID" {
		return c.SendStatus(200) // Ignore unpaid webhooks
	}

	// Parse Trade ID from external_id (format: trade_123_...)
	var tradeID int
	fmt.Sscanf(externalID, "trade_%d", &tradeID)

	if tradeID > 0 {
		// Update trade payment status
		_, err := h.db.Exec("UPDATE trades SET payment_confirmed = true WHERE id = ?", tradeID)
		if err != nil {
			fmt.Printf("Webhook Error: Failed to update trace %d: %v\n", tradeID, err)
			return c.Status(500).SendString("DB Error")
		}
		fmt.Printf("Trade %d payment confirmed via Xendit Webhook.\n", tradeID)
	}

	return c.SendStatus(200)
}
