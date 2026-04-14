# Review System Backend Implementation - Setup Guide

## Overview
The review system backend has been implemented with the following features:
- Initial review submission (mandatory photo evidence for meetup/delivery trades)
- Follow-up reviews with rating adjustments
- Auto-completion after 3 days of inactivity
- Dynamic trust scoring based on latest review
- Review history tracking

## Database Setup

### 1. Run the Migration
Execute the migration script to create the necessary tables and columns:

```bash
mysql -u your_user -p your_database < migrations/20260413_review_system_enhancement.sql
```

This will:
- Create the `trade_reviews` table
- Update the `trades` table with new columns
- Migrate existing reviews from trades → trade_reviews
- Create indexes for performance
- Create the `latest_trade_review` SQL view

### 2. Verify Migration
Check that the migration completed successfully:

```sql
SELECT * FROM trade_reviews LIMIT 1;
SELECT * FROM trades LIMIT 1;
DESCRIBE trade_reviews;
DESCRIBE trades;
SELECT * FROM INFORMATION_SCHEMA.VIEWS WHERE TABLE_NAME='latest_trade_review';
```

## Backend Routes

### New API Endpoints

#### Submit Trade Review
```
POST /api/trades/{id}/reviews
Authorization: Bearer <token>
Content-Type: application/json

{
  "rating": 5,
  "feedback": "Great trader, would trade again!",
  "proof_url": "https://bucket.com/photo.jpg",
  "is_camera_photo": true,
  "is_followup": false
}

Response:
{
  "success": true,
  "message": "Review submitted successfully",
  "data": {
    "review_id": 1,
    "trade_id": 42,
    "is_followup": false,
    "auto_completed": true
  }
}
```

#### Get Trade Review History
```
GET /api/trades/{id}/reviews
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": [
    {
      "id": 1,
      "trade_id": 42,
      "reviewer_id": 5,
      "rating": 5,
      "feedback": "Great trader!",
      "proof_url": "https://...",
      "is_camera_photo": true,
      "is_followup": false,
      "is_auto_generated": false,
      "rating_delta": 0,
      "created_at": "2024-04-13T10:30:00Z",
      "reviewer_name": "John Doe",
      "reviewer_avatar": "https://..."
    },
    {
      "id": 2,
      "trade_id": 42,
      "reviewer_id": 5,
      "rating": 4,
      "feedback": "Actually, minor issue with delivery",
      "proof_url": null,
      "is_followup": true,
      "rating_delta": -1,
      "created_at": "2024-04-16T14:22:00Z"
    }
  ]
}
```

#### Get Review Summary
```
GET /api/trades/{id}/review-summary
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "buyer_review": {
      "initial_review": {
        "id": 1,
        "rating": 5,
        "feedback": "..."
      },
      "latest_review": {
        "id": 3,
        "rating": 4,
        "feedback": "...",
        "rating_delta": -1
      },
      "has_followup": true,
      "rating_trend": "down",
      "rating_change": -1,
      "followup_count": 1
    },
    "seller_review": {
      "initial_review": { ... },
      "latest_review": { ... },
      "has_followup": false,
      "rating_trend": "auto",
      "rating_change": 0,
      "followup_count": 0
    }
  }
}
```

## Scheduler Setup

### Auto-Completion Cron Job

The review system includes an auto-completion feature that creates default 5-star reviews after 3 days of inactivity. To enable this:

#### Option 1: Go-based Scheduler (Recommended)
Add to your main.go startup code:

```go
import (
    "github.com/robfig/cron/v3"
)

func setupSchedulers(tradeHandler *handlers.TradeHandler) {
    c := cron.New()
    
    // Auto-complete trades every hour
    c.AddFunc("0 * * * *", func() {
        log.Println("Running auto-completion scheduler...")
        if err := tradeHandler.AutoCompleteTradesJob(); err != nil {
            log.Printf("Auto-completion error: %v", err)
        }
    })
    
    c.Start()
    // Store cron instance for later cleanup if needed
}

// In main() after handlers creation:
setupSchedulers(tradeHandler)
```

#### Option 2: External Cron (Docker/Kubernetes)
Add a scheduled job in your deployment:

**Docker Compose Example:**
```yaml
scheduler:
  image: curlimages/curl
  command: |
    /bin/sh -c "while true; do 
      sleep 3600; 
      curl -X POST http://api:8080/admin/jobs/auto-complete-trades 
        -H 'Authorization: Bearer your_admin_token';
    done"
  depends_on:
    - api
```

**Kubernetes CronJob Example:**
```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: trade-auto-completion
spec:
  schedule: "0 * * * *"  # Every hour
  jobTemplate:
    spec:
      template:
        spec:
          serviceAccountName: clovia-service
          containers:
          - name: auto-complete
            image: curlimages/curl
            command:
            - /bin/sh
            - -c
            - curl -X POST http://clovia-api:8080/admin/jobs/auto-complete-trades \
                -H 'Authorization: Bearer $ADMIN_TOKEN'
            env:
            - name: ADMIN_TOKEN
              valueFrom:
                secretKeyRef:
                  name: clovia-secrets
                  key: admin-api-token
          restartPolicy: OnFailure
```

#### Option 3: Admin Endpoint
Create an admin endpoint to run the job manually:

```go
// In main.go route setup
admin := api.Group("/admin").Use(middleware.AdminMiddleware())
admin.Post("/jobs/auto-complete-trades", func(c *fiber.Ctx) error {
    if err := tradeHandler.AutoCompleteTradesJob(); err != nil {
        return c.Status(500).JSON(fiber.Map{"error": err.Error()})
    }
    return c.JSON(fiber.Map{"success": true})
})
```

Then schedule it externally:
```bash
# Run every hour
0 * * * * curl -X POST http://localhost:8080/admin/jobs/auto-complete-trades -H "Authorization: Bearer $TOKEN"
```

### Monitoring the Scheduler

Check the logs to verify auto-completion is working:

```bash
# View recent auto-completions
SELECT id, auto_completed_at FROM trades WHERE auto_completed_at IS NOT NULL ORDER BY auto_completed_at DESC LIMIT 10;

# Find pending auto-completions
SELECT id, buyer_rating, seller_rating, created_at, 
       DATEDIFF(NOW(), created_at) as days_ago
FROM trades
WHERE status IN ('active', 'awaiting_confirmation', 'completed')
  AND (buyer_rating IS NULL OR seller_rating IS NULL)
  AND DATE(NOW()) >= DATE_ADD(DATE(created_at), INTERVAL 3 DAY)
ORDER BY created_at ASC;

# View auto-generated reviews
SELECT id, trade_id, reviewer_id, rating, is_auto_generated, created_at 
FROM trade_reviews 
WHERE is_auto_generated = true 
ORDER BY created_at DESC LIMIT 20;
```

## Error Handling

### Common Errors and Solutions

**"Photo evidence is mandatory"**
- Initial reviews for meetup/delivery trades MUST include a photo
- Photos must be taken with the in-app camera (`is_camera_photo=true`)
- Example: `curl -X POST /api/trades/{id}/reviews -d '{"rating":5,"proof_url":"","is_camera_photo":false}'` will fail

**"Initial review already submitted"**
- User tried to submit a second initial review
- Should submit a follow-up review instead (`is_followup=true`)
- Initial reviews are immutable once locked

**"Submit initial review before submitting follow-up"**
- User tried to submit a follow-up without an initial review
- Initial review must exist first

**Trade didn't auto-complete**
- Check that auto-completion scheduler is running
- Verify trade is >= 3 days old
- Ensure both parties haven't submitted reviews yet
- Check database logs for errors

## Testing

### Manual Testing

1. **Submit Initial Review:**
```bash
curl -X POST http://localhost:8080/api/trades/42/reviews \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "rating": 5,
    "feedback": "Great trade!",
    "proof_url": "https://example.com/photo.jpg",
    "is_camera_photo": true,
    "is_followup": false
  }'
```

2. **Submit Follow-up Review:**
```bash
curl -X POST http://localhost:8080/api/trades/42/reviews \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "rating": 3,
    "feedback": "After reflection, item had issues",
    "is_followup": true
  }'
```

3. **Get Review History:**
```bash
curl -X GET http://localhost:8080/api/trades/42/reviews \
  -H "Authorization: Bearer $TOKEN"
```

4. **Get Review Summary:**
```bash
curl -X GET http://localhost:8080/api/trades/42/review-summary \
  -H "Authorization: Bearer $TOKEN"
```

### Unit Tests

Create `handlers/trade_review_handler_test.go`:

```go
package handlers_test

import (
    "testing"
    "database/sql"
    "github.com/stretchr/testify/assert"
)

func TestSubmitTradeReview_InitialReview(t *testing.T) {
    // Test initial review submission
    // Should succeed and lock the review
}

func TestSubmitTradeReview_FollowupReview(t *testing.T) {
    // Test follow-up review submission
    // Should succeed with rating_delta calculation
}

func TestSubmitTradeReview_PhotoRequired(t *testing.T) {
    // Test photo requirement for meetup trades
    // Should fail without proof_url
}

func TestAutoCompleteTradesJob(t *testing.T) {
    // Test auto-completion
    // Should create 5-star reviews after 3 days
}
```

## Frontend Integration

See `FRONTEND_INTEGRATION.md` for details on:
- Updating ReviewTab component
- Creating FollowupReviewForm
- Displaying review history with media
- Handling rating change indicators

## Deployment Checklist

- [ ] Database migration applied successfully
- [ ] New Go models compiled without errors
- [ ] Trade review handler routes added to main.go
- [ ] Auto-completion scheduler configured
- [ ] Photo upload endpoint tested (`/api/upload`)
- [ ] SSE stream working for real-time notifications
- [ ] Frontend ReviewTab component updated (upcoming)
- [ ] Manual testing completed for basic flow
- [ ] Load testing on auto-completion job
- [ ] Production database backed up before migration
