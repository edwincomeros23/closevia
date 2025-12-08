package main

// hallo :3
import (
	"log"
	"os"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/joho/godotenv"
	"github.com/xashathebest/clovia/database"
	"github.com/xashathebest/clovia/handlers"
	"github.com/xashathebest/clovia/middleware"
	"github.com/xashathebest/clovia/services"
)

func main() {
	// Load environment variables for francistest connection
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using default values")
	}

	// Initialize database
	if err := database.InitDatabase(); err != nil {
		log.Fatal("Failed to initialize database:", err)
	}
	defer database.CloseDatabase()

	// Create database tables
	if err := database.CreateTables(); err != nil {
		log.Fatal("Failed to create database tables:", err)
	}

	// Create Fiber app
	app := fiber.New(fiber.Config{
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			code := fiber.StatusInternalServerError
			if e, ok := err.(*fiber.Error); ok {
				code = e.Code
			}
			return c.Status(code).JSON(fiber.Map{
				"success": false,
				"error":   err.Error(),
			})
		},
	})

	// Middleware
	app.Use(recover.New())
	app.Use(logger.New())

	corsOrigins := os.Getenv("CORS_ORIGINS")
	if corsOrigins == "" {
		corsOrigins = strings.Join([]string{
			"http://localhost:5173",
			"http://localhost:5174",
			"http://localhost:3000",
			"https://cloviaph.netlify.app",
			"https://closevia.onrender.com",
		}, ",")
	}

	log.Printf("CORS Origins configured: %s", corsOrigins)

	app.Use(cors.New(cors.Config{
		AllowOrigins:     corsOrigins,
		AllowHeaders:     "Origin, Content-Type, Accept, Authorization, X-Requested-With",
		AllowMethods:     "GET, POST, PUT, DELETE, OPTIONS, PATCH",
		AllowCredentials: true,
		MaxAge:           3600,
		ExposeHeaders:    "Content-Length, Content-Type, Authorization",
	}))

	// Explicit OPTIONS handler for preflight requests
	app.Options("/*", func(c *fiber.Ctx) error {
		return c.SendStatus(fiber.StatusNoContent)
	})

	// Serve static files (uploads directory)
	app.Static("/uploads", "./uploads")

	// Add after middleware setup
	app.Get("/", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"success": true,
			"message": "Welcome to Clovia API",
		})
	})

	// Health check
	app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"success": true,
			"message": "Clovia API is running",
			"version": "1.0.0",
		})
	})

	// Test database connection
	app.Get("/test-db", func(c *fiber.Ctx) error {
		var count int
		err := database.DB.QueryRow("SELECT COUNT(*) FROM products").Scan(&count)
		if err != nil {
			return c.JSON(fiber.Map{
				"success": false,
				"error":   err.Error(),
			})
		}
		return c.JSON(fiber.Map{
			"success":       true,
			"product_count": count,
		})
	})
	app.Get("/api/fix-profile-picture", func(c *fiber.Ctx) error {
		if _, err := database.DB.Exec("ALTER TABLE users ADD COLUMN profile_picture VARCHAR(255) NULL"); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"success": false,
				"error":   err.Error(),
			})
		}
		return c.JSON(fiber.Map{
			"success": true,
			"message": "profile_picture column ensured",
		})
	})

	// API routes
	api := app.Group("/api")

	// Initialize handlers
	userHandler := handlers.NewUserHandler()
	productHandler := handlers.NewProductHandler()
	orderHandler := handlers.NewOrderHandler()
	chatHandler := handlers.NewChatHandler()
	tradeHandler := handlers.NewTradeHandler()
	notificationHandler := handlers.NewNotificationHandler()
	adminHandler := handlers.NewAdminHandler()
	commentHandler := handlers.NewCommentHandler()
	wishlistHandler := handlers.NewWishlistHandler()
	aiFeaturesHandler := handlers.NewAIFeaturesHandler()
	deliveryHandler := handlers.NewDeliveryHandler()
	reviewHandler := handlers.NewReviewHandler()

	// Auth routes (no authentication required)
	auth := api.Group("/auth")
	auth.Post("/register", userHandler.Register)
	auth.Post("/login", userHandler.Login)
	auth.Post("/google", userHandler.GoogleLogin)

	// User routes (authentication required)
	users := api.Group("/users")
	users.Get("/profile", middleware.AuthMiddleware(), userHandler.GetProfile)
	users.Put("/profile", middleware.AuthMiddleware(), userHandler.UpdateProfile)
	users.Post("/profile-picture", middleware.AuthMiddleware(), userHandler.UploadProfilePicture)

	// Saved products routes (must be BEFORE dynamic ":id" route)
	users.Post("/saved-products", middleware.AuthMiddleware(), userHandler.SaveProduct)
	users.Delete("/saved-products/:id", middleware.AuthMiddleware(), userHandler.UnsaveProduct)
	users.Get("/saved-products/:id", middleware.AuthMiddleware(), userHandler.CheckSavedProduct)
	users.Get("/saved-products", middleware.AuthMiddleware(), userHandler.GetSavedProducts)

	// User stats route (must be BEFORE dynamic ":id" route)
	users.Get("/:id/stats", userHandler.GetSellerStats) // Public route

	// Review routes (must be BEFORE dynamic ":id" route)
	users.Get("/:id/reviews", reviewHandler.GetUserReviews)                             // Public route
	users.Post("/:id/reviews", middleware.AuthMiddleware(), reviewHandler.CreateReview) // Auth required
	users.Get("/:id/rating", reviewHandler.GetUserRating)                               // Public route

	// Dynamic and list routes placed after static subpaths
	users.Get("/:id", userHandler.GetUserByID) // Public route
	users.Get("/", userHandler.GetUsers)       // Admin route (no auth for demo)

	// Product routes
	products := api.Group("/products")
	products.Get("/", productHandler.GetProducts)                      // Public route
	products.Get("", productHandler.GetProducts)                       // Support no trailing slash
	products.Get("/user/:id", productHandler.GetUserProducts)          // Public route
	products.Get("/user/:id/listings", productHandler.GetUserProducts) // alias for listings
	// Specific routes must come before generic :id route
	products.Post("/generate-details", middleware.AuthMiddleware(), productHandler.GenerateProductDetailsWithAI)
	products.Get("/:id/wishlist/status", middleware.AuthMiddleware(), productHandler.GetUserWishlistStatus)
	products.Get("/:id/comments", commentHandler.GetComments)
	products.Post("/:id/comments", middleware.AuthMiddleware(), commentHandler.CreateComment)
	products.Get("/:id", productHandler.GetProduct) // Public route (must be last)
	products.Post("/", middleware.AuthMiddleware(), productHandler.CreateProduct)
	products.Put("/:id", middleware.AuthMiddleware(), productHandler.UpdateProduct)
	products.Delete("/:id", middleware.AuthMiddleware(), productHandler.DeleteProduct)

	// Order routes (authentication required)
	orders := api.Group("/orders")
	orders.Post("/", middleware.AuthMiddleware(), orderHandler.CreateOrder)
	orders.Get("/", middleware.AuthMiddleware(), orderHandler.GetOrders)
	orders.Get("/:id", middleware.AuthMiddleware(), orderHandler.GetOrder)
	orders.Put("/:id/status", middleware.AuthMiddleware(), orderHandler.UpdateOrderStatus)

	// Chat routes (REST + SSE)
	chat := api.Group("/chat")
	chat.Get("/conversations", middleware.AuthMiddleware(), chatHandler.GetConversations)
	chat.Get("/conversations/:id/messages", middleware.AuthMiddleware(), chatHandler.GetMessages)
	chat.Post("/conversations", middleware.AuthMiddleware(), chatHandler.EnsureConversation)
	chat.Post("/messages", middleware.AuthMiddleware(), chatHandler.SendMessage)
	chat.Post("/typing", middleware.AuthMiddleware(), chatHandler.Typing)
	// Allow optional auth for SSE stream: clients may pass token via query param
	chat.Get("/stream", middleware.OptionalAuthMiddleware(), chatHandler.Stream)

	// Trade routes
	trades := api.Group("/trades")
	trades.Post("/", middleware.AuthMiddleware(), tradeHandler.CreateTrade)
	trades.Get("/", middleware.AuthMiddleware(), tradeHandler.GetTrades)
	// Allow optional auth for counts endpoint so unauthenticated UI polling returns a safe zero value
	// IMPORTANT: /count must be BEFORE /:id routes to avoid matching "count" as an ID
	trades.Get("/count", middleware.OptionalAuthMiddleware(), tradeHandler.CountTrades)
	trades.Put("/:id", middleware.AuthMiddleware(), tradeHandler.UpdateTrade)
	trades.Get("/:id", middleware.AuthMiddleware(), tradeHandler.GetTrade)
	trades.Get("/:id/messages", middleware.AuthMiddleware(), tradeHandler.GetTradeMessages)
	trades.Post("/:id/messages", middleware.AuthMiddleware(), tradeHandler.SendTradeMessage)
	trades.Get("/:id/history", middleware.AuthMiddleware(), tradeHandler.GetTradeHistory)
	trades.Put("/:id/complete", middleware.AuthMiddleware(), tradeHandler.CompleteTrade)
	trades.Get("/:id/completion-status", middleware.AuthMiddleware(), tradeHandler.GetTradeCompletionStatus)

	// Notifications routes
	notifs := api.Group("/notifications")
	notifs.Get("/", middleware.AuthMiddleware(), notificationHandler.GetNotifications)
	notifs.Put("/:id/read", middleware.AuthMiddleware(), notificationHandler.MarkAsRead)
	notifs.Put("/read-all", middleware.AuthMiddleware(), notificationHandler.MarkAllAsRead)

	// Admin routes
	admin := api.Group("/admin")
	admin.Get("/stats", middleware.AuthMiddleware(), middleware.AdminMiddleware(), adminHandler.GetAdminStats)

	// Wishlist routes
	wishlist := api.Group("/wishlist")
	wishlist.Get("/", middleware.AuthMiddleware(), wishlistHandler.GetWishlist)
	wishlist.Post("/", middleware.AuthMiddleware(), wishlistHandler.AddToWishlist)
	wishlist.Delete("/:productId", middleware.AuthMiddleware(), wishlistHandler.RemoveFromWishlist)

	// Delivery routes
	deliveries := api.Group("/deliveries")
	deliveries.Post("/", middleware.AuthMiddleware(), deliveryHandler.CreateDelivery)
	deliveries.Get("/", middleware.AuthMiddleware(), deliveryHandler.GetDeliveries)
	deliveries.Get("/:id", middleware.AuthMiddleware(), deliveryHandler.GetDelivery)
	deliveries.Put("/:id/status", middleware.AuthMiddleware(), deliveryHandler.UpdateDeliveryStatus)
	deliveries.Post("/:id/assign", middleware.AuthMiddleware(), deliveryHandler.AssignRider)

	// AI Features routes
	ai := api.Group("/ai")
	ai.Get("/proximity", middleware.AuthMiddleware(), aiFeaturesHandler.GetProximity)
	ai.Get("/response-metrics", middleware.AuthMiddleware(), aiFeaturesHandler.GetResponseMetrics)
	ai.Get("/profile-analysis", middleware.AuthMiddleware(), aiFeaturesHandler.GetProfileAnalysis)
	ai.Get("/profile-analysis/all", middleware.AuthMiddleware(), aiFeaturesHandler.AnalyzeAllProfiles)
	ai.Get("/counterfeit/:id", aiFeaturesHandler.GetCounterfeitReport)

	// Get port from environment or use default
	port := os.Getenv("PORT")
	if port == "" {
		port = "4000"
	}

	// Start server
	// Start background trade timeout scheduler
	services.StartTradeTimeoutScheduler(database.DB)
	log.Printf("Starting Clovia server on port %s", port)
	log.Fatal(app.Listen(":" + port))
}
