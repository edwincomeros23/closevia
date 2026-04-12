# Dispute Resolution Rules Implementation Summary

**Date**: April 12, 2026  
**Feature**: Automatic dispute resolution with mutual agreement & auto-escalation

---

## Overview

Implemented complete dispute resolution rules with two pathways:

### ✅ Pathway 1: Mutual Agreement Within 48 Hours
- **When**: Both parties agree on resolution and rate each other
- **What Happens**:
  - Trade is completed or cancelled (as agreed)
  - Both parties provide ratings (1-5 stars)
  - Dispute marked as `RESOLVED_MUTUAL`  
  - Archive timer is resumed
  - Trade is unfrozen

### ✅ Pathway 2: Auto-Escalation After 48 Hours (No Response/Agreement)
- **When**: 48-hour response deadline passes with no mutual agreement
- **What Happens**:
  - Dispute automatically escalates to admin review
  - Status changes to `ADMIN_ESCALATION`
  - Both parties & admin are notified
  - Admin review SLA starts (72 hours for non-safety, 24h for safety)

---

## Database Changes

### New Columns in `trade_disputes` Table

| Column | Type | Purpose |
|--------|------|---------|
| `mutual_agreement_party1` | BOOLEAN | Party 1 (filer) has agreed |
| `mutual_agreement_party2` | BOOLEAN | Party 2 (respondent) has agreed |
| `mutual_agreement_at` | TIMESTAMP | When both parties agreed |
| `agreed_resolution_type` | VARCHAR(50) | 'complete' or 'cancel' |
| `party1_rating` | INT(1-5) | Rating from party 1 |
| `party2_rating` | INT(1-5) | Rating from party 2 |
| `auto_escalated` | BOOLEAN | Whether auto-escalated to admin |
| `auto_escalated_at` | TIMESTAMP | When auto-escalation happened |
| `escalation_reason` | TEXT | Reason for escalation |

### New Table: `trade_responses`

Tracks individual party responses to disputes with ratings and feedback:

```sql
CREATE TABLE trade_responses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  dispute_id INT NOT NULL,
  party_id INT NOT NULL,
  agreed_resolution_type VARCHAR(50),
  rating INT (1-5),
  user_feedback TEXT,
  response_type VARCHAR(50),
  responded_at TIMESTAMP,
  UNIQUE KEY uk_dispute_party (dispute_id, party_id)
)
```

---

## API Endpoints

### New: Mutual Agreement with Rating

**POST** `/api/disputes/:id/agree`

**Request**:
```json
{
  "dispute_id": 123,
  "agreed_resolution_type": "complete|cancel",
  "rating": 4,
  "feedback": "Great communication and good items"
}
```

**Response (First Party)**:
```json
{
  "success": true,
  "message": "Your agreement has been recorded. Awaiting the other party's response.",
  "status": "awaiting_mutual_agreement",
  "resolved": false
}
```

**Response (Both Parties Agreed)**:
```json
{
  "success": true,
  "message": "Mutual agreement reached! Both parties have rated each other. Dispute resolved.",
  "status": "resolved_mutual",
  "resolved": true
}
```

### Auto-Escalation: Manual Trigger (for testing/admin)

**POST** `/api/disputes/escalate/expired`

Manually triggers the auto-escalation check for expired disputes.

**Response**:
```json
{
  "success": true,
  "message": "Dispute auto-escalation check completed successfully"
}
```

---

## Background Job

### Automatic Dispute Auto-Escalation

**Service**: `services/dispute_service.go`  
**Trigger**: Every 30 minutes (configurable)  
**Logic**:
1. Queries all disputes past 48-hour deadlines
2. Skips disputes with mutual agreement already reached
3. Updates dispute status to `ADMIN_ESCALATION`
4. Notifies admin and both parties
5. Records escalation timestamp and reason

**Started in**: `main.go` at application startup

---

## Dispute Resolution Flow

```
┌─ FILED (48-hour response window)
│
├─ MUTUAL_RESOLUTION / NEGOTIATION
│  │
│  ├─ Both parties agree resolution + rate
│  │  → RESOLVED_MUTUAL ✓ (Trade completed/cancelled)
│  │
│  └─ 48 hours pass, no agreement, no response
│     → AUTO-ESCALATION to admin
│
├─ ADMIN_ESCALATION (auto-escalated)
│  │
│  ├─ Admin reviews and decides
│  │  → RESOLVED_ADMIN_UPHELD / REVERSED / SUSPENDED
│  │
│  └─ Auto-resolved after SLA timeout
│
└─ RESOLVED_ACCEPTED (party accepted fault)
   → Strike awarded, dispute ends
```

---

## Key Features

✅ **Mutual Agreement**: Both parties can agree to complete or cancel trade with ratings  
✅ **Auto-Escalation**: 48-hour deadline triggers automatic admin escalation  
✅ **Party Rating**: Both parties provide 1-5 star ratings during agreement  
✅ **Notification**: Automatic notifications to admin and parties  
✅ **Trade State Management**: Archive timer pauses during dispute, resumes after resolution  
✅ **Background Job**: Runs every 30 minutes to check for expired disputes  

---

## Testing Scenarios

### Scenario 1: Quick Mutual Agreement
1. Party A files dispute
2. Party B receives notification (48-hour window)
3. Both parties agree to CANCEL trade with ratings
4. Dispute immediately resolves to `RESOLVED_MUTUAL`
5. Trade unfrozen and archived

### Scenario 2: Auto-Escalation
1. Party A files dispute
2. Party B doesn't respond for 48+ hours
3. Background job runs (every 30 min)
4. Dispute auto-escalates to ADMIN_ESCALATION
5. Admin is notified and has 72 hours to review

### Scenario 3: Negotiation Then Agreement
1. Dispute filed (FILED)
2. Party B counters (MUTUAL_RESOLUTION)
3. Messages exchanged (NEGOTIATION)
4. Both agree to COMPLETE trade with ratings
5. Dispute resolves (RESOLVED_MUTUAL)
6. Trade automatically completed

---

## Code Changes Summary

### Files Modified
- `database/database.go` - Added new columns and tables
- `handlers/dispute_handler.go` - Added AgreeOnResolution endpoint + AutoEscalateExpiredDisputes function
- `main.go` - Added dispute service initialization and new routes

### Files Created
- `services/dispute_service.go` - Background job service for auto-escalation

### New Types
- `MutualAgreementRequest` - Request payload for mutual agreement
- `DisputeService` - Background job service

---

## API Examples

### File Dispute (Existing)
```bash
curl -X POST http://localhost:4000/api/disputes \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "trade_id": 123,
    "category": "item_not_as_described",
    "description": "Item arrived damaged",
    "evidence_image_url": "https://..."
  }'
```

### Mutual Agreement (New)
```bash
curl -X POST http://localhost:4000/api/disputes/456/agree \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "dispute_id": 456,
    "agreed_resolution_type": "complete",
    "rating": 5,
    "feedback": "Great seller and smooth transaction"
  }'
```

### Trigger Auto-Escalation (Testing)
```bash
curl -X POST http://localhost:4000/api/disputes/escalate/expired \
  -H "Content-Type: application/json"
```

---

## Configuration

### Auto-Escalation Job Interval
Currently set to **30 minutes** in `main.go`:
```go
disputeService.StartAutoEscalationJob(30 * time.Minute)
```

**To change**: Modify the interval in main.go line ~767

### Admin User ID
Currently assumes admin user_id = 1 for notifications.  
**To customize**: Update `notifyUser(1, ...)` in `AutoEscalateExpiredDisputes()` in handlers/dispute_handler.go

---

## Notifications Sent

| Trigger | Recipients | Type |
|---------|-----------|------|
| Mutual agreement reached | Both parties | In-app |
| Auto-escalation | Admin + Both parties | In-app |
| Awaiting party agreement | Other party | In-app |

---

## Future Enhancements

- [ ] Configurable auto-escalation interval via environment variables
- [ ] Webhook notifications for escalations
- [ ] Email notifications in addition to in-app
- [ ] Admin dashboard for managing escalated disputes
- [ ] Analytics on dispute resolution rates
- [ ] Dispute history export for compliance
