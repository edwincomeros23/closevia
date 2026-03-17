package handlers

import (
	"context"
	"database/sql"
	"fmt"
	"net/url"
	"os"
	"strings"

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

	// Determine frontend URL dynamically
	// We check the 'Origin' and 'Referer' headers directly from the Fiber Context
	frontendURL := c.Get("Origin")
	if frontendURL == "" {
		referer := c.Get("Referer")
		if referer != "" {
			// Extract origin from referer (e.g., https://cloviaph.netlify.app/trades -> https://cloviaph.netlify.app)
			// A simple approach is just checking if it contains the known domain, or parsing it
			// But for simplicity, we can let Fiber's BaseURL be the fallback if we want backend relative,
			// However usually the frontend is separate. So we default to FRONTEND_URL or local.
			frontendURL = referer // This might be a full path, but Xendit might handle it, or we just strip path
		}
	}

	// Clean up the URL if it was extracted from Referer
	if frontendURL != "" {
		// Just take the scheme and host
		parsedURL, err := url.Parse(frontendURL)
		if err == nil {
			frontendURL = parsedURL.Scheme + "://" + parsedURL.Host
		}
	}

	// Final fallbacks
	if frontendURL == "" {
		if envURL := os.Getenv("FRONTEND_URL"); envURL != "" {
			frontendURL = envURL
		} else if os.Getenv("APP_ENV") == "production" {
			frontendURL = "https://cloviaph.netlify.app"
		} else {
			frontendURL = "http://localhost:5173"
		}
	}

	successUrl := fmt.Sprintf("%s/dashboard?trade_id=%d", frontendURL, trade.ID)
	failureUrl := fmt.Sprintf("%s/dashboard?trade_id=%d&payment=failed", frontendURL, trade.ID)

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

// CreatePremiumInvoice generates a Xendit checkout URL for a Premium Upgrade
func (h *PaymentHandler) CreatePremiumInvoice(c *fiber.Ctx) error {
	productID := c.Params("id")
	userID := c.Locals("user_id").(int)

	// Verify ownership
	var sellerID int
	var title string
	err := h.db.QueryRow("SELECT seller_id, title FROM products WHERE id = ?", productID).Scan(&sellerID, &title)
	if err != nil {
		return c.Status(404).JSON(models.APIResponse{Success: false, Error: "Product not found"})
	}
	if sellerID != userID {
		return c.Status(403).JSON(models.APIResponse{Success: false, Error: "Unauthorized"})
	}

	amount := 99.0 // Fixed price for premium upgrade
	var buyerName, buyerEmail string
	h.db.QueryRow("SELECT name, email FROM users WHERE id = ?", userID).Scan(&buyerName, &buyerEmail)

	apiKey := os.Getenv("XENDIT_SECRET_KEY")
	xenditClient := xendit.NewClient(apiKey)

	externalID := fmt.Sprintf("premium_%s_%d", productID, userID)
	description := fmt.Sprintf("Clovia Premium Upgrade: %s", title)

	frontendURL := os.Getenv("FRONTEND_URL")
	if frontendURL == "" {
		frontendURL = "http://localhost:5173"
	}
	successUrl := fmt.Sprintf("%s/dashboard", frontendURL)

	currency := "PHP"
	req := xenditClient.InvoiceApi.CreateInvoice(context.Background()).CreateInvoiceRequest(invoice.CreateInvoiceRequest{
		ExternalId:  externalID,
		Amount:      float32(amount),
		Description: &description,
		PayerEmail:  &buyerEmail,
		SuccessRedirectUrl: &successUrl,
		Currency:    &currency,
	})

	resp, _, execErr := req.Execute()
	if execErr != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: execErr.Error()})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data": fiber.Map{
			"checkout_url": resp.InvoiceUrl,
		},
	})
}

// CreateBoostInvoice generates a Xendit checkout URL for a Product Boost
func (h *PaymentHandler) CreateBoostInvoice(c *fiber.Ctx) error {
	productID := c.Params("id")
	userID := c.Locals("user_id").(int)

	// Verify ownership
	var sellerID int
	var title string
	err := h.db.QueryRow("SELECT seller_id, title FROM products WHERE id = ?", productID).Scan(&sellerID, &title)
	if err != nil {
		return c.Status(404).JSON(models.APIResponse{Success: false, Error: "Product not found"})
	}
	if sellerID != userID {
		return c.Status(403).JSON(models.APIResponse{Success: false, Error: "Unauthorized"})
	}

	amount := 29.0 // Small fee for instant boost
	var buyerName, buyerEmail string
	h.db.QueryRow("SELECT name, email FROM users WHERE id = ?", userID).Scan(&buyerName, &buyerEmail)

	apiKey := os.Getenv("XENDIT_SECRET_KEY")
	xenditClient := xendit.NewClient(apiKey)

	externalID := fmt.Sprintf("boost_%s_%d", productID, userID)
	description := fmt.Sprintf("Clovia Product Boost: %s", title)

	frontendURL := os.Getenv("FRONTEND_URL")
	if frontendURL == "" {
		frontendURL = "http://localhost:5173"
	}
	successUrl := fmt.Sprintf("%s/products/%s", frontendURL, productID)

	currency := "PHP"
	req := xenditClient.InvoiceApi.CreateInvoice(context.Background()).CreateInvoiceRequest(invoice.CreateInvoiceRequest{
		ExternalId:  externalID,
		Amount:      float32(amount),
		Description: &description,
		PayerEmail:  &buyerEmail,
		SuccessRedirectUrl: &successUrl,
		Currency:    &currency,
	})

	resp, _, execErr := req.Execute()
	if execErr != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: execErr.Error()})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data": fiber.Map{
			"checkout_url": resp.InvoiceUrl,
		},
	})
}

// CreateUserPremiumInvoice generates a Xendit checkout URL for a site-wide User Premium Subscription
func (h *PaymentHandler) CreateUserPremiumInvoice(c *fiber.Ctx) error {
	userID := c.Locals("user_id").(int)

	var buyerName, buyerEmail string
	err := h.db.QueryRow("SELECT name, email FROM users WHERE id = ?", userID).Scan(&buyerName, &buyerEmail)
	if err != nil {
		return c.Status(404).JSON(models.APIResponse{Success: false, Error: "User not found"})
	}

	amount := 499.0 // Pricing for full premium account
	apiKey := os.Getenv("XENDIT_SECRET_KEY")
	xenditClient := xendit.NewClient(apiKey)

	externalID := fmt.Sprintf("user_premium_%d", userID)
	description := "Clovia Premium Subscription (Lifetime)"

	frontendURL := os.Getenv("FRONTEND_URL")
	if frontendURL == "" {
		frontendURL = "http://localhost:5173"
	}
	successUrl := fmt.Sprintf("%s/premium", frontendURL)

	currency := "PHP"
	req := xenditClient.InvoiceApi.CreateInvoice(context.Background()).CreateInvoiceRequest(invoice.CreateInvoiceRequest{
		ExternalId:  externalID,
		Amount:      float32(amount),
		Description: &description,
		PayerEmail:  &buyerEmail,
		SuccessRedirectUrl: &successUrl,
		Currency:    &currency,
	})

	resp, _, execErr := req.Execute()
	if execErr != nil {
		return c.Status(500).JSON(models.APIResponse{Success: false, Error: execErr.Error()})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data": fiber.Map{
			"checkout_url": resp.InvoiceUrl,
		},
	})
}

// XenditWebhook handles asynchronous payment confirmations
func (h *PaymentHandler) XenditWebhook(c *fiber.Ctx) error {
	var payload map[string]interface{}
	if err := c.BodyParser(&payload); err != nil {
		return c.Status(400).SendString("Invalid payload")
	}

	status, _ := payload["status"].(string)
	externalID, _ := payload["external_id"].(string)
	amount, _ := payload["amount"].(float64)

	if status != "PAID" {
		return c.SendStatus(200)
	}

	if strings.HasPrefix(externalID, "trade_") {
		var tradeID int
		fmt.Sscanf(externalID, "trade_%d", &tradeID)

		if tradeID > 0 {
			// Get buyer ID for earnings record
			var buyerID int
			h.db.QueryRow("SELECT buyer_id FROM trades WHERE id = ?", tradeID).Scan(&buyerID)

			// Update trade
			_, err := h.db.Exec("UPDATE trades SET payment_confirmed = true, net_amount = ? WHERE id = ?", amount, tradeID)
			if err != nil {
				fmt.Printf("Webhook Error: Failed to update trade %d: %v\n", tradeID, err)
			}

			// Record Earnings
			_, err = h.db.Exec(`
				INSERT INTO earnings (user_id, amount, source_type, source_id, external_id)
				VALUES (?, ?, 'trade_escrow', ?, ?)`,
				buyerID, amount, tradeID, externalID)
			if err != nil {
				fmt.Printf("Earnings Error (Trade %d): %v\n", tradeID, err)
			}
		}
	} else if strings.HasPrefix(externalID, "premium_") {
		var productID, userID int
		fmt.Sscanf(externalID, "premium_%d_%d", &productID, &userID)

		if productID > 0 {
			// Update product to premium
			_, err := h.db.Exec("UPDATE products SET premium = true WHERE id = ?", productID)
			if err != nil {
				fmt.Printf("Webhook Error: Premium upgrade failed for product %d: %v\n", productID, err)
			}

			// Record Earnings
			_, err = h.db.Exec(`
				INSERT INTO earnings (user_id, amount, source_type, source_id, external_id)
				VALUES (?, ?, 'premium_upgrade', ?, ?)`,
				userID, amount, productID, externalID)
		}
	} else if strings.HasPrefix(externalID, "boost_") {
		var productID, userID int
		fmt.Sscanf(externalID, "boost_%d_%d", &productID, &userID)

		if productID > 0 {
			// Update product boosted_at
			_, err := h.db.Exec("UPDATE products SET boosted_at = NOW() WHERE id = ?", productID)
			if err != nil {
				fmt.Printf("Webhook Error: Boost failed for product %d: %v\n", productID, err)
			}

			// Record Earnings
			_, err = h.db.Exec(`
				INSERT INTO earnings (user_id, amount, source_type, source_id, external_id)
				VALUES (?, ?, 'product_boost', ?, ?)`,
				userID, amount, productID, externalID)
		}
	} else if strings.HasPrefix(externalID, "user_premium_") {
		var userID int
		fmt.Sscanf(externalID, "user_premium_%d", &userID)

		if userID > 0 {
			// Update user status
			_, err := h.db.Exec("UPDATE users SET is_premium = true WHERE id = ?", userID)
			if err != nil {
				fmt.Printf("Webhook Error: User premium update failed for user %d: %v\n", userID, err)
			}

			// Record Earnings
			_, err = h.db.Exec(`
				INSERT INTO earnings (user_id, amount, source_type, source_id, external_id)
				VALUES (?, ?, 'premium_upgrade', ?, ?)`,
				userID, amount, userID, externalID)
		}
	}

	return c.SendStatus(200)
}
