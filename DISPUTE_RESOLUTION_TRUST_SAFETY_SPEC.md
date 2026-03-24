# CloviaPH Dispute Resolution & Trust/Safety System
**Version 1.0** | Hyper-local same-day marketplace | Zamboanga, Philippines

---

## System Overview

**Philosophy**: User protection with fast mutual resolution pathway; admin escalation for complex/malicious cases. All evidence is camera-based (no gallery uploads). Disputes pause the 7-day archive timer. Strike system incentivizes good behavior (2 strikes = no posting, 3 strikes = auto-suspend).

**Key Constraints**:
- All trades are same-day, hyper-local only
- Evidence always from mandatory in-app camera handoff photos (chain of custody)
- 30-minute no-show reporting window (starts after meetup time window closes)
- TNC disclosure: Clovia not liable for disputes
- Active disputes show caution flag on public profile

---

## 1. DISPUTE FILING FLOW

### Flow Overview (Report Tap to Resolution)

```
┌──────────────────────────────────────────────────────────────┐
│ User taps "Report" on completed/active trade                 │
└──────────────────────────────────────────────────────────────┘
                           ↓
       ┌───────────────────────────────────────┐
       │ Select Dispute Category:              │
       │ • Item Not As Described               │
       │ • No-Show (other party)               │
       │ • Rider Damage (chain of custody)     │
       │ • Other/Harassment/Safety (escalate)  │
       └───────────────────────────────────────┘
                           ↓
       ┌─────────────────────────────────────────────────┐
       │ Category determines evidence path:              │
       │ • Item/Rider: Upload handoff photo + description
       │ • No-Show: System auto-validates time/location  │
       │ • Safety/Harassment: Text only, auto-escalates  │
       └─────────────────────────────────────────────────┘
                           ↓
    ┌──────────────────────────────────────────────────┐
    │ Dispute Created (FILED state)                    │
    │ • Timestamp: NOW                                 │
    │ • Trade paused (archive timer paused)            │
    │ • Caution flag appears on reporter's profile    │
    │ • Both parties notified (in-app + push)         │
    └──────────────────────────────────────────────────┘
                           ↓
    ┌─ MUTUAL RESOLUTION PATH (Item/No-Show) ─────────────────────┐
    │                                                               │
    │ [Respondent Response Window: 48 hours]                      │
    │                                                               │
    │ Respondent can ACCEPT (agree fault) or COUNTER (provide     │
    │ counter-evidence with handoff photo if applicable)          │
    │                                                               │
    │ ┌─ ACCEPT ──→ Trade archived + Dispute RESOLVED_ACCEPTED   │
    │ │ • Strike awarded to respondent per category               │
    │ │ • Striker notified of strike count                        │
    │ │ • Caution flag removed after 7 days (if only 1 active)   │
    │ │                                                             │
    │ └─ COUNTER ──→ Mutual Negotiation Phase                      │
    │   [Max 7 days, 10 message limit]                            │
    │   • Both upload evidence (photos + text)                    │
    │   • Real-time messaging, 12-hour response windows           │
    │   • Either party can concede (RESOLVED_ACCEPTED)            │
    │   • Or both agree on outcome (RESOLVED_MUTUAL)              │
    │                                                               │
    │   If timeout (no response 12hrs after message):             │
    │   → Auto-escalate to admin review                           │
    │                                                               │
    └───────────────────────────────────────────────────────────────┘
                           ↓
    ┌─ ADMIN ESCALATION PATH ────────────────────────────────────┐
    │                                                              │
    │ When:                                                        │
    │ • Category = Safety/Harassment (auto-escalate)             │
    │ • Negotiation hits 7-day timeout                           │
    │ • Respondent rejects AND counter-evidence weak             │
    │ • Dispute involves strikes (3rd strike auto-suspend)       │
    │                                                              │
    │ [Admin Review Window: 72 hours for non-safety,             │
    │  24 hours for safety/harassment]                           │
    │                                                              │
    │ Admin action:                                               │
    │ • RESOLVED_ADMIN_UPHELD: Strike awarded, TXN resolved      │
    │ • RESOLVED_ADMIN_REVERSED: Dispute dismissed, no strike    │
    │ • RESOLVED_ADMIN_SUSPENDED: 3rd strike = auto-suspend      │
    │                                                              │
    │ Admin notifies both parties with reasoning (auto-email)    │
    │                                                              │
    └───────────────────────────────────────────────────────────────┘
```

### State Machine

```
FILED
  ├─→ MUTUAL_RESOLUTION (respondent can respond)
  │    ├─→ ACCEPTED (respondent agrees)
  │    │   └─→ RESOLVED_ACCEPTED (strike awarded)
  │    │
  │    ├─→ COUNTER_EVIDENCE (respondent disputes)
  │    │   ├─→ NEGOTIATION (messaging phase)
  │    │   │   ├─→ RESOLVED_ACCEPTED (one party concedes)
  │    │   │   ├─→ RESOLVED_MUTUAL (agreed outcome)
  │    │   │   └─→ ADMIN_ESCALATION (timeout or stalemate)
  │    │   │
  │    │   └─→ ADMIN_ESCALATION (weak counter-evidence)
  │    │
  │    └─→ UNRESPONSIVE_TIMEOUT (48hrs no response)
  │        └─→ ADMIN_ESCALATION
  │
  ├─→ ADMIN_ESCALATION (safety/harassment auto-escalate)
  │    ├─→ RESOLVED_ADMIN_UPHELD
  │    ├─→ RESOLVED_ADMIN_REVERSED
  │    └─→ RESOLVED_ADMIN_SUSPENDED (3rd strike)
  │
  └─→ CANCELLED (parties agree to cancel before resolution)
       └─→ ARCHIVED_INITIAL (trade reverted)
```

### Notifications

| Event | Recipient | Type | Delay |
|-------|-----------|------|-------|
| Dispute filed | Respondent | In-app modal + push | Immediate |
| Dispute filed | Both | Email summary | 5 min |
| Respondent has 48hrs to respond | Respondent | In-app reminder | 24 hrs in |
| Counter-evidence submitted | Reporter | In-app + push | Immediate |
| Message in negotiation | Both | In-app + push | Immediate |
| Negotiation 12hr timeout | Both | In-app reminder | When threshold hit |
| Admin decision | Both | In-app alert + email | When resolved |
| Strike awarded | Striker | In-app modal + SMS | When resolved |

### Data Model (disputes table)

```sql
CREATE TABLE disputes (
  id UUID PRIMARY KEY,
  trade_id UUID NOT NULL REFERENCES trades(id),
  reporter_id UUID NOT NULL REFERENCES users(id),
  respondent_id UUID NOT NULL REFERENCES users(id),
  
  category VARCHAR(50) NOT NULL, -- 'item_not_as_described', 'no_show', 'rider_damage', 'safety', 'harassment'
  status VARCHAR(50) NOT NULL, -- see state machine
  
  description TEXT NOT NULL,
  photos JSONB, -- [{photo_id: uuid, label: string, uploaded_at: timestamp}]
  
  filed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  response_deadline TIMESTAMP NOT NULL, -- filed_at + 48 hours
  escalation_deadline TIMESTAMP, -- NULL until escalated
  resolved_at TIMESTAMP,
  
  resolution VARCHAR(50), -- 'accepted', 'mutual', 'admin_upheld', 'admin_reversed', 'admin_suspended'
  admin_notes TEXT,
  admin_id UUID REFERENCES users(id), -- NULL until escalated
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE dispute_messages (
  id UUID PRIMARY KEY,
  dispute_id UUID NOT NULL REFERENCES disputes(id),
  sender_id UUID NOT NULL REFERENCES users(id),
  message TEXT NOT NULL,
  photos JSONB, -- Additional evidence photos
  sent_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_response_deadline TIMESTAMP -- 12 hours from this message
);

CREATE TABLE dispute_strikes (
  id UUID PRIMARY KEY,
  dispute_id UUID NOT NULL REFERENCES disputes(id),
  user_id UUID NOT NULL REFERENCES users(id),
  strike_number INT NOT NULL, -- 1, 2, or 3
  strike_type VARCHAR(50) NOT NULL, -- 'no_show', 'item_not_described', 'rider_damage', 'safety'
  awarded_at TIMESTAMP NOT NULL DEFAULT NOW(),
  active_until TIMESTAMP NOT NULL, -- 30 days from awarded_at (for caution flag display)
  
  CONSTRAINT max_active_strikes CHECK (strike_number <= 3)
);
```

---

## 2. NO-SHOW POLICY

### Definition
User did not appear at confirmed meetup location within 30 minutes of agreed time window (end time), OR cancelled after meetup confirmation window closed (15 minutes before meetup).

### Reporting Flow

```
Trade status: MEETUP_CONFIRMED
• Meetup confirmed by both parties (time + location + rider assigned)
• 15-minute pre-meetup window opens (both get "heading to meetup" prompt)
• Meetup time window: 30 minutes (e.g., 2:00 PM - 2:30 PM)
• 30-second marker at window start: GPS accuracy check (within 100m radius)

                           ↓
              [Meetup time window closes]
                           ↓
        [30-minute no-show reporting window opens]
        (Either party can now report no-show)
                           ↓
         Reporting party taps "Confirm No-Show"
         • System validates:
           ✓ Meetup time window has closed
           ✓ No cancellation was filed by other party in that window
           ✓ Trade not already completed
         • System captures: reporter's location + timestamp
                           ↓
         Dispute created with category = 'no_show'
         • Respondent has 48 hours to respond
         • Can ACCEPT (agree they didn't show) 
         • Can COUNTER (claim they appeared in time)
                           ↓
    ┌─ ACCEPT PATH ──────────────────────┐
    │ • 1 strike to no-showing party      │
    │ • Trade marked as CANCELLED         │
    │ • Item reverted to owner            │
    │ • Rider cancellation marked         │
    │ • TXN fees refunded                 │
    │                                     │
    └─────────────────────────────────────┘
                           ↓
    ┌─ COUNTER PATH ────────────────────────────────┐
    │ Respondent can upload:                        │
    │ • Selfie at meetup location (geo-tagged)      │
    │ • Timestamp proof (showing <30min window)     │
    │ • Message history ("I'm here" chats)          │
    │ • Rider chat log showing "at location"        │
    │                                                │
    │ If counter-evidence strong → Admin reviews    │
    │ If weak or missing → Strike awarded to        │
    │   reporter (abuse of no-show claim)           │
    │                                                │
    └────────────────────────────────────────────────┘
```

### Validation Logic

**System auto-validates before allowing no-show report:**
1. ✓ Meetup window closed (end time < NOW)
2. ✓ No cancellation filed by other party in that 30-min window
3. ✓ Trade state = MEETUP_CONFIRMED or IN_PROGRESS
4. ✓ Reporter's location within 500m of meetup location (soft check; hard evidence in counter)
5. ✓ Enough time has passed (min 1 minute after window close, max 1 hour)

**Admin validation if contested:**
- Geo-location proof (selfie + GPS metadata)
- Timestamp accuracy (within 30-min window, within 100m radius)
- Rider logs (did rider mark "at location"? "customer no-show"?)
- Chat history (messages timestamped in that window)

### Strike Consequences

| Strike Count | Consequence | Duration |
|--------------|------------|----------|
| 1st no-show | Caution flag on profile | 30 days |
| 2nd no-show | **Cannot post new trades** | 30 days from 2nd strike |
| 3rd no-show | **Auto-suspended pending admin review** | Until admin decision |

### Edge Cases

- **Both claim other no-showed**: Admin reviews rider logs + GPS. Whoever has better chain-of-custody evidence wins.
- **Rider was no-show**: Rider damage dispute filed separately; no-show strike still applies to user who didn't appear.
- **Both appeared but couldn't agree on exchange**: Not a no-show (both were present). File "other" dispute for item condition/disagreement.

---

## 3. ITEM NOT AS DESCRIBED POLICY

### Definition
Item received differs materially from listing description in:
- **Condition**: Item In Listing vs. Actual (dents, cracks, missing parts, water damage, dirt, stains)
- **Completeness**: Missing accessories, manuals, chargers listed in description
- **Specs**: Color, size, model number, functionality misrepresented
- **Function**: Item doesn't work as claimed

### Evidence Requirements (Mandatory)

Reporter **MUST** upload:
1. **Handoff photo** from initial transaction (system auto-appends timestamp + location)
2. **Current condition photo** (same item, clear angle showing discrepancy)
3. **Close-up detail photo** (if applicable: crack, stain, missing part, etc.)
4. **Text description** (clear, factual statement of discrepancy + how it differs from listing)

At least 2 of 4 required. If reporter uploads <2, system blocks dispute filing with prompt: *"Please upload at least 2 photos (handoff + current condition) to document the issue."*

### Admin Review Process

```
Dispute FILED (category: item_not_as_described)
         ↓
Respondent has 48 hours to ACCEPT or COUNTER
         ↓
     ┌─ ACCEPT ──────────────────────────────┐
     │ • 1 strike to respondent               │
     │ • Trade marked RESOLVED_ACCEPTED       │
     │ • Loser handles return/refund (TBD    │
     │   by negotiation or admin order)       │
     │ • Item goes back to respondent or      │
     │   stays with reporter (per agreement)  │
     │ • Caution flag on respondent (30 days) │
     │                                         │
     └─────────────────────────────────────────┘
                ↓
     ┌─ COUNTER ────────────────────────────┐
     │ Respondent uploads:                   │
     │ • Handoff photo (same from Tx)        │
     │ • Item condition at time of exchange  │
     │ • Statement claiming item was good    │
     │ • Photos of listing description       │
     │                                        │
     │ → ADMIN REVIEW TRIGGERED              │
     │                                        │
     └────────────────────────────────────────┘
                ↓
     ┌─ ADMIN REVIEW (72-hour window) ──────────────┐
     │                                               │
     │ Admin compares:                               │
     │ 1. Original listing description vs photos    │
     │ 2. Listing photos vs handoff photos (match?) │
     │ 3. Handoff photos vs current-state photos    │
     │    → Is damage from user mishandling?        │
     │    → Is damage pre-existing per handoff?     │
     │ 4. Respondent's counter-evidence strength    │
     │                                               │
     │ Possible rulings:                             │
     │ ┌─ CLEAR MISREPRESENTATION ─────────┐       │
     │ │ • Strike to respondent (1)         │       │
     │ │ • Item return ordered (by value)   │       │
     │ │ • Caution flag 30 days             │       │
     │ │ • TXN may be reversed if new trade │       │
     │ │                                     │       │
     │ └─────────────────────────────────────┘       │
     │                                               │
     │ ┌─ UNCLEAR / BOTH AT FAULT ─────────┐       │
     │ │ • No strike awarded                │       │
     │ │ • Both parties split return costs  │       │
     │ │ • Dispute marked RESOLVED_MUTUAL   │       │
     │ │ • No caution flag                  │       │
     │ │                                     │       │
     │ └─────────────────────────────────────┘       │
     │                                               │
     │ ┌─ FALSE / FRIVOLOUS CLAIM ─────────┐       │
     │ │ • Strike to REPORTER (abuse claim) │       │
     │ │ • Caution flag on reporter         │       │
     │ │ • Dispute RESOLVED_ADMIN_REVERSED  │       │
     │ │                                     │       │
     │ └─────────────────────────────────────┘       │
     │                                               │
     └───────────────────────────────────────────────┘
```

### Possible Admin Outcomes

| Outcome | Reporter | Respondent | Item Disposition |
|---------|----------|-----------|------------------|
| **Item was misrepresented** | No strike | 1 strike | Return to respondent (or keep + partial refund per agreement) |
| **Item was as described** | 1 strike (abuse) | No strike | Reporter keeps item; trade stands |
| **Unclear/photos inconclusive** | No strike | No strike | Both parties negotiate return or split cost |
| **Damage from reporter's mishandling** | 1 strike | No strike | Reporter keeps item, pays for damage |

### Data Model

```sql
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS
  evidence_weight VARCHAR(50), -- 'strong', 'moderate', 'weak', 'inconclusive'
  admin_ruling_category VARCHAR(50); -- 'clear_misrepresentation', 'unclear', 'false_claim', 'partial_fault'
```

---

## 4. RIDER DAMAGE POLICY

### Chain of Custody (Photo Evidence)

```
BEFORE Rider Pickup (Sender responsibility):
  Photo 1: Item + packaging (labeled "PRE_HANDOFF_SENDER")
  • Item condition at exchange point
  • Packaging integrity
  • Any pre-existing damage noted
  • Timestamp + location auto-added
                           ↓
  Rider inspects, takes photo for own records
  Rider confirms: "Item received in [condition]"
                           ↓
DURING Transit (Rider responsibility):
  Rider's care of item (no official photo required,
  but important for defense)
                           ↓
AFTER Rider Delivery (Receiver responsibility):
  Photo 2: Item + packaging (labeled "POST_DELIVERY_RECEIVER")
  • Item condition upon receipt
  • Packaging condition (torn, crushed, etc.)
  • Any new/additional damage vs Photo 1
  • Timestamp + location auto-added
  • Receiver confirms: "Item received in [condition]"
                           ↓
  If condition changed: Receiver files dispute immediately
  Category: "rider_damage"
```

### Fault Determination Logic

```
Dispute filed: "Rider damaged item"
Receiver uploads Photo 2 + description of damage
                           ↓
Admin compares Photo 1 (pre-pickup) vs Photo 2 (post-delivery)
                           ↓
    ┌─ DAMAGE PRE-EXISTING (Photo 1) ──────────────┐
    │ • Fault: SENDER (should have rejected item)  │
    │ • Strike: RECEIVER gets strike (false claim) │
    │ • Caution flag: Receiver 30 days             │
    │ • Action: No refund, trade stands            │
    │                                               │
    └────────────────────────────────────────────────┘
                           ↓
    ┌─ NEW DAMAGE (Photo 1 → Photo 2) ──────────────┐
    │                                               │
    │ Admin checks:                                  │
    │ • Packaging integrity (crushed box?)          │
    │ • Type of damage (consistent w/ handling?)    │
    │ • Severity (major structural vs cosmetic)     │
    │ • Weather conditions that day                 │
    │ • Distance/terrain of delivery                │
    │ • Rider's claim (if provided)                 │
    │                                               │
    │ Possible findings:                             │
    │                                               │
    │ ┌─ RIDER AT FAULT ────────────────┐           │
    │ │ • Clear abuse/careless handling  │           │
    │ │ • Strike to RIDER (TBD: 1-2)    │           │
    │ │ • Receiver refunded item value   │           │
    │ │ • Item returned to sender        │           │
    │ │ • Rider disciplined on platform  │           │
    │ │                                   │           │
    │ └─────────────────────────────────┘           │
    │                                               │
    │ ┌─ NORMAL WEAR / UNAVOIDABLE ──────┐          │
    │ │ • Fault: NEITHER (accident)      │          │
    │ │ • No strikes                      │          │
    │ │ • Receiver & sender negotiate    │          │
    │ │   refund split or return         │          │
    │ │ • Admin may comp rider fee       │          │
    │ │                                   │          │
    │ └──────────────────────────────────┘          │
    │                                               │
    │ ┌─ INCONCLUSIVE (photos too dark, │           │
    │ │   angles don't match)               │       │
    │ │ • Request Photo 3 from receiver  │           │
    │ │   (close-up of damage area)      │           │
    │ │ • 24-hour deadline to provide    │           │
    │ │ • If not provided: claim denied  │           │
    │ │   (no evidence of new damage)    │           │
    │ │                                   │          │
    │ └──────────────────────────────────┘          │
    │                                               │
    └───────────────────────────────────────────────┘
```

### Rider Strike System (Optional — TBD)

If implementing rider accountability separately from user strikes:

| Incident | Rider Consequence | Duration |
|----------|------------------|----------|
| 1st damage fault | Warning | Noted in rider profile |
| 2nd damage fault | **Cannot accept pickups** | 7 days |
| 3rd damage fault | **Suspended from platform** | 14 days or review |

### Data Model

```sql
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS
  rider_id UUID REFERENCES users(id), -- Rider identified in trade
  damage_severity VARCHAR(50), -- 'structural', 'cosmetic', 'functional', 'total_loss'
  photo_comparison JSONB; -- {photo_1_id: uuid, photo_2_id: uuid, analysis: 'damage_new|damage_preexisting|inconclusive'}
```

---

## 5. ADMIN PANEL MINIMUM REQUIREMENTS

### Dashboard View (Real-time Overview)

```
┌─────────────────────────────────────────────────────────┐
│ Admin Dashboard — Disputes & Safety                     │
├─────────────────────────────────────────────────────────┤
│                                                          │
│ KEY METRICS (top bar, auto-refresh every 5 min)        │
│ ├─ Open Disputes: 12                                   │
│ ├─ Pending Review (needs decision): 5                  │
│ ├─ Escalated Today: 3                                  │
│ ├─ Safety/Harassment Queue: 2 (⚠️ HIGH PRIORITY)       │
│ └─ 3rd-Strike Suspensions Pending: 1                   │
│                                                          │
├─────────────────────────────────────────────────────────┤
│ DISPUTE QUEUE                                           │
│                                                          │
│ [Safety/Harassment] [Item Not Described] [No-Show]     │
│ [Rider Damage] [All Open]                              │
│                                                          │
│ Status Filter: [Pending Response] [In Escalation]      │
│                [Needs Admin Decision] [All]             │
│                                                          │
│ Time Priority: [Urgent <24hrs] [High 24-48hrs]         │
│                [Standard >48hrs]                        │
│                                                          │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Dispute ID | Category | Filed | Status | Deadline   | │
│ ├─────────────────────────────────────────────────────┤ │
│ │ D-2502-001 │ Safety/ │ 2hrs  │ FILED  │ 22 hrs ⚠️  | │
│ │            │ Harassment
│ │ D-2502-002 │ Item not│ 6hrs  │ ADMIN_ │ 66 hrs     │ │
│ │            │ described
│ │ D-2502-003 │ No-Show │ 12hrs │ COUNTER│ 36 hrs     │ │
│ │ ...        │ ...    │ ...   │ ...    │ ...        │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                          │
│ [Load More] [Export CSV]                               │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Dispute Detail View (Drill-Down)

When admin clicks a dispute:

```
┌──────────────────────────────────────────────────────────┐
│ Dispute D-2502-002: Item Not As Described               │
├──────────────────────────────────────────────────────────┤
│                                                           │
│ BASIC INFO                                               │
│ ├─ Filing date: 2026-03-24 14:30 UTC+8                 │
│ ├─ Reporter: @jane_trades (User ID, link to profile)   │
│ ├─ Respondent: @bob_seller (User ID, link to profile)  │
│ ├─ Trade ID: T-2502-050 (link to full trade record)    │
│ ├─ Item: Sony WH-1000XM4 Headphones                    │
│ ├─ Current Status: NEGOTIATION (2 msgs exchanged)       │
│ └─ Escalation deadline: 2026-03-31 14:30 (in 7 days)   │
│                                                           │
├──────────────────────────────────────────────────────────┤
│ EVIDENCE GALLERY (Swipeable thumbnails)                 │
│                                                           │
│ Reporter photos:                                         │
│ [↑ Handoff photo] [↑ Current condition] [↑ Close-up]    │
│   "Item case is cracked left side"                      │
│                                                           │
│ Respondent photos (if counter-evidence):                │
│ [↑ Handoff photo] [↑ Statement screenshot]              │
│   "Item was fine when I sent it"                        │
│                                                           │
│ [Full-size view] [Download all] [Side-by-side compare] │
│                                                           │
├──────────────────────────────────────────────────────────┤
│ NEGOTIATION HISTORY                                      │
│                                                           │
│ 2026-03-24 14:30 — jane_trades (REPORTER)              │
│ "The case is clearly cracked. Not as described."       │
│ [Photos attached: 3]                                    │
│ [View photos] [Respond]                                 │
│                                                           │
│ 2026-03-24 18:00 — bob_seller (RESPONDENT)             │
│ "I don't know how you got it like that. Was perfect." │
│ [Counter-photos attached: 2]                            │
│ [View photos]                                            │
│ ⏱️ jane_trades has 12 hours to respond (next deadline)  │
│                                                           │
│ 2026-03-25 02:15 — jane_trades                         │
│ "The handoff photo clearly shows the crack. I never    │
│  damaged it further."                                    │
│                                                           │
│ ⏳ Awaiting bob_seller response (last message 24hrs ago) │
│    → Auto-escalate in 12 hours if no response           │
│                                                           │
├──────────────────────────────────────────────────────────┤
│ ADMIN ACTION PANEL                                       │
│                                                           │
│ [Gather More Evidence?]                                 │
│ Admin can request:                                       │
│  ☐ Video call with reporter                            │
│  ☐ Video call with respondent                          │
│  ☐ Additional photos from reporter (deadline: 24hrs)   │
│  ☐ Additional photos from respondent (deadline: 24hrs) │
│  ☐ Seller's original listing (auto-link provided)      │
│                                                           │
│ Or decide now:                                           │
│                                                           │
│ [RULING: Item Was Misrepresented]                      │
│ → 1 strike to bob_seller                               │
│ → Item return ordered to bob_seller                    │
│ → Caution flag for 30 days                             │
│ → jane_trades trade RESOLVED_ACCEPTED                  │
│ ┌ Add admin notes (required): ____________________────┐ │
│ │ (Automatically shown to both parties)               │ │
│ └────────────────────────────────────────────────────┘ │
│ [Send Decision] [Save as Draft]                        │
│                                                           │
│ OR                                                        │
│                                                           │
│ [RULING: Insufficient Evidence / Unclear]               │
│ → No strike awarded                                     │
│ → Parties negotiate return or refund split              │
│ → Dispute marked RESOLVED_MUTUAL                        │
│ ┌ Admin notes: ────────────────────────────────────────┐ │
│ │                                                     │ │
│ └────────────────────────────────────────────────────┘ │
│ [Send Decision]                                        │
│                                                           │
│ OR                                                        │
│                                                           │
│ [RULING: False / Frivolous Claim]                       │
│ → 1 strike to jane_trades (abuse)                       │
│ → Caution flag for 30 days                             │
│ → bob_seller trade RESOLVED_ADMIN_REVERSED             │
│ ┌ Admin notes: ────────────────────────────────────────┐ │
│ │                                                     │ │
│ └────────────────────────────────────────────────────┘ │
│ [Send Decision]                                        │
│                                                           │
│ [Suspend This User] (for 3rd strike auto-suspend)      │
│ → Suspended until admin review/appeal                  │
│ → Email: ____________________                          │
│ → Ban duration: [Custom] [7 days] [14 days] [Permanent]
│ [Confirm Suspension]                                   │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

### User Management (Strike Tracking)

```
┌──────────────────────────────────────────────────────────┐
│ User Profile: jane_trades (@jane_trades)                │
├──────────────────────────────────────────────────────────┤
│                                                           │
│ STRIKE RECORD (Active + Historical)                     │
│                                                           │
│ Active Strikes (caution flag visible): 1 of 3           │
│ ├─ Strike 1 [2026-02-15] No-Show (Dispute D-2601-045)  │
│ │  Expires: 2026-03-16 ← Showing caution flag 5m more  │
│ │                                                       │
│ └─ [View dispute details]                              │
│                                                           │
│                                                           │
│ Historical Strikes: 0                                    │
│                                                           │
├──────────────────────────────────────────────────────────┤
│ DISPUTE HISTORY                                          │
│                                                           │
│ Filed by jane_trades:       2 (1 open, 1 resolved)      │
│ Filed against jane_trades:  1 (resolved)                │
│                                                           │
│ [View all disputes as reporter] [View all as respondent]│
│                                                           │
├──────────────────────────────────────────────────────────┤
│ ACCOUNT STATUS                                           │
│                                                           │
│ Status: ✅ ACTIVE                                        │
│ Can post new trades? ✅ YES (no 2-strike limit reached) │
│ Can participate in trades? ✅ YES                        │
│ Can use rider service? ✅ YES                            │
│                                                           │
│ [Manually Suspend] [Warn User] [Reset Strikes] (Admin)  │
│                                                          │
│ [Manual Strike] ┌──────────────────────────────────────┐│
│ (for bad faith │ Reason: ___________________           ││
│  not caught by │ Strike type: [No-Show] [Item] [Rider] ││
│  system)       │ [Add] [Cancel]                         ││
│                └──────────────────────────────────────┘│
│                                                           │
└──────────────────────────────────────────────────────────┘
```

### Bulk Actions & Reports

```
┌──────────────────────────────────────────────────────────┐
│ Reports & Analytics                                      │
├──────────────────────────────────────────────────────────┤
│                                                           │
│ [Export Disputes] [Export Strikes] [Export Suspensions] │
│                                                           │
│ Date range: [2026-03-01] to [2026-03-24]               │
│                                                           │
│ Dispute Summary:                                         │
│ ├─ Total filed: 67                                     │
│ ├─ Resolved mutual: 32 (48%)                           │
│ ├─ Resolved by admin: 28 (42%)                         │
│ ├─ Still open: 7 (10%)                                 │
│ ├─ By category:                                         │
│ │  ├─ Item not described: 28 (42%)                     │
│ │  ├─ No-Show: 22 (33%)                                │
│ │  ├─ Safety/Harassment: 12 (18%)                      │
│ │  └─ Rider damage: 5 (7%)                             │
│ │                                                        │
│ └─ Avg resolution time: 2.3 days                        │
│                                                           │
│ Strike Summary:                                          │
│ ├─ Total strikes awarded: 87                            │
│ ├─ By type:                                             │
│ │  ├─ No-Show: 45 strikes (52%)                        │
│ │  ├─ Item not described: 32 (37%)                     │
│ │  └─ Rider damage: 10 (11%)                           │
│ │                                                        │
│ ├─ Users with 1 strike: 52                              │
│ ├─ Users with 2 strikes (restricted): 18                │
│ ├─ Users with 3 strikes (suspended): 4                  │
│ │                                                        │
│ └─ Re-offender rate (2+ strikes): 21%                  │
│                                                           │
│ [Export to CSV] [Generate PDF]                          │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### Required Admin Permissions

```
Admin Role Requirements:

tier: DISPUTE_ADMIN
├─ View all open/closed disputes
├─ Access full evidence (all photos)
├─ Message parties (request more info)
├─ Make final ruling (award strikes, suspend)
├─ Manually award strikes for obvious cases
├─ Access user strike history
├─ Suspend/unsuspend users
├─ View all user profiles
├─ Export dispute & strike data
├─ Access admin notes (edit own)
└─ Escalate to higher admin if needed

tier: MODERATION (escalation only)
├─ View all disputes
├─ Flag for human review
├─ Suspend for safety (emergency)
├─ Add internal notes
└─ Escalate to DISPUTE_ADMIN or SUPER_ADMIN

tier: SUPER_ADMIN
└─ Full access including staff management,
   system settings, account resets
```

---

## 6. EDGE CASES

### A. Both Parties Unresponsive

```
Scenario: Dispute filed → 48-hour response window closes
          → Respondent never responds
          → Reporter never follows up in negotiation

State: UNRESPONSIVE_TIMEOUT

Admin action:
  1. [Attempt contact] Send push + email reminder (Day 3)
     "Your dispute needs your input. Respond by [DATE] or we
      will make a decision based on available evidence."
  2. If no contact after 5 days:
     → AUTO-ESCALATE to admin review
     
Admin review:
  • If reporter has photos: Likely upheld (reporter showed up
    with evidence)
  • If reporter has no photos: Dispute DISMISSED (both sides
    absent)
  • Whichever party had better evidence when they did respond
    wins
  • No strike to respondent for being unresponsive (too harsh)
    unless pattern emerges
  
Timeline:
  Day 0: Dispute filed
  Day 2: Response window closes (respondent unresponsive)
  Day 3: Auto-reminder sent
  Day 5: Auto-escalate if still unresponsive
  Day 8: Admin decision issued
```

### B. Inconclusive Evidence

```
Scenario: Both parties provided conflicting photos; unclear
          from evidence which version is correct

Example: "Item was damaged before pickup" vs "Damage happened
         during delivery" — Photos are ambiguous, angles don't
         align, lighting different

Admin action:
  1. Request Photo 3 (specific close-up)
     "Can you provide a close-up photo of [specific damage
      area] showing [clear detail]? Deadline: 24 hours."
     
  2. If photo provided:
     → Re-review with new evidence
     → likely clear winner emerges
     
  3. If no photo provided:
     → Burden of proof on requester
     → Claim DISMISSED or marked UNCLEAR
     → Both parties split return costs if applicable
     → Dispute RESOLVED_ADMIN_REVERSED (no strike)
     
  4. If still inconclusive after 2 rounds:
     → Parties negotiate mutually (RESOLVED_MUTUAL)
     → Admin may comp one side's shipping or TXN fees
     → No strike awarded
```

### C. Bad Faith Dispute (Abuse of System)

```
Scenarios:
  • User A files "No-Show" claim but response time photo
    clearly shows both parties at location
  • User B files "Item damaged" but the "before" and "after"
    photos are identical
  • User C serially files frivolous disputes (pattern: filed
    5 in 30 days, all dismissed)

Pattern detection:
  System flags:
  ├─ Same user filed 3+ disputes in 30 days
  ├─ 100% dismissal rate on filed disputes
  └─ Other users flag this user's disputes as "harassment"

Admin action (single bad faith dispute):
  1 strike to REPORTER
  Dispute RESOLVED_ADMIN_REVERSED
  Caution flag for 30 days
  Message to user: "Please only file disputes for genuine
    discrepancies. Filing false reports violates TNC."

Admin action (serial abuser pattern):
  After 2nd strike in 30 days for bad faith:
  → Require admin approval before filing new disputes
  → Or auto-suspend after 3rd bad-faith strike

Consequence:
  No financial penalty (user doesn't owe others $)
  But reputation damage (caution flag) + posting restrictions
  
Timeline: Same as regular dispute (48hrs response + 72hrs admin
         review if needed)
```

### D. Dispute on One Leg of Multi-Way Chain Trade

```
Scenario: 3-way trade (A→B→C):
  • B receives item from A (satisfactory)
  • C reports to B: "Item not as described" (arrives damaged)
  • B claims: "Item arrived perfect from A, C damaged it"
  • Now B is caught in middle of dispute with C while his
    own trade with A is complete

Architecture:
  ├─ Trade T1: A ↔ B (COMPLETED)
  ├─ Trade T2: B ↔ C (DISPUTED)
  │  ├─ Dispute D1: C vs B (filed by C)
  │  └─ B's counterpoint: "B didn't damage it, received
  │     perfect"
  └─ If severe, B may file counter-dispute D2 against A:
     "A sent damaged item"

Consequences:
  B's exposure:
  • If D1 ruled against B (B at fault): B gets 1 strike
  • If B blamed: refund C, or item return to B
  • But B can then file D2 against A for damages
  
Timeline:
  1. D1 (B vs C) resolves in 2–10 days (as normal)
  2. If B found at fault in D1 → B has 48hrs to file D2
     (B vs A, category: "Item not as described")
  3. D2 processes independently with A
  4. If D2 ruled for B → B recovers from A what B paid to C
  
Admin note:
  • Both disputes can proceed in parallel
  • Neither dispute auto-affects trades outside chain
  • Record full chain for transparency if pattern emerges
  • Flag chain trades with high dispute rates for future
    system refinement
```

---

## Summary: State & Timeline Cheat Sheet

### Dispute Lifecycle

| State | Duration | Action Required | Default Outcome |
|-------|----------|-----------------|-----------------|
| FILED | 48 hrs | Respondent must respond | Auto-escalate if ignored |
| COUNTER_EVIDENCE | 7 days (max) | Parties message, respond every 12hrs | Auto-escalate if timeout |
| ADMIN_ESCALATION | 72 hrs (item/no-show) / 24 hrs (safety) | Admin reviews & rules | Deadline breach = escalate to SUPER_ADMIN |
| RESOLVED_* | Final | Parties notified, trade archived | Caution flag applied if applicable |

### Strike Consequences at a Glance

```
1st Strike
  ├─ Caution flag on profile (30 days)
  ├─ User notified via in-app modal + SMS
  └─ Can still post trades

2nd Strike
  ├─ Caution flag on profile (30 days)
  ├─ **CANNOT POST NEW TRADES** (30 days from 2nd strike)
  ├─ User warned: "One more strike results in suspension"
  └─ Can still ACCEPT incoming trade offers

3rd Strike
  ├─ **AUTO-SUSPENDED** (pending admin review)
  ├─ Cannot post, cannot trade, cannot initiate anything
  ├─ Admin review within 72 hours for possible appeal
  └─ If upheld: Permanent suspension or rehab period (TBD)
```

### Notification Checklist

```
All parties must be notified of:
☐ Dispute filed (immediate)
☐ Respondent deadline approaching (24hrs in)
☐ Counter-evidence received (immediate)
☐ Negotiation message received (push + in-app)
☐ Response deadline looming (every 12hrs after message)
☐ Admin escalation triggered (immediate)
☐ Admin decision & ruling (immediate, with explanation)
☐ Strike awarded (in-app modal, separate from dispute decision)
☐ Caution flag applied (in-app notification)
☐ Subsequent trades: "This user has an active dispute" (flag on
  their profile visible to potential trade partners)
```

---

## Implementation Priority

**Phase 1 (MVP):**
- Dispute filing (File, respond, simple accept/counter)
- No-show reporting with time validation
- Admin panel (dispute queue, photo evidence, ruling interface)
- Strike awards + caution flag display

**Phase 2:**
- Negotiation messaging (to/from flow with timestamps)
- Photo comparison tools (side-by-side, zoom, annotation)
- Auto-escalation triggers
- Bulk admin reports

**Phase 3:**
- Appeal process
- Rider damage chain-of-custody automation
- Pattern detection (serial filers, bad faith)
- AI-assisted ruling suggestions (ML on past decisions)

