# Multi-Way Trade Process Summary

This document outlines the two primary ways multi-way trade chains are established in the Closevia platform: **Automatic Search** and **Manual Conversion**.

---

## 1. Automatic Multi-Way Search Process
Automatic search is a proactive background process that identifies potential trading cycles (loops) without direct user intervention at the matching stage.

### A. Graph-Based Loop Detection (`CheckForTradeLoops`)
*   **Trigger:** Automatically runs every time a new trade proposal is created (`CreateTrade`).
*   **Algorithm:** 
    *   Builds a `TradeGraph` of all `pending` and `pending_multiway` trades.
    *   Uses Depth-First Search (DFS) to find cycles where User A → User B → User C → User A.
    *   **Max Chain Length:** Currently capped at **3 parties** (can be increased by changing `MaxChainLength`).
*   **Result:** If a loop is found, all participants receive a notification: *"Loop Trade Found! A potential multi-way trade is available."*

### B. Proactive Product Matching (`autoTriggerMultiwayForNewAvailableProduct`)
*   **Trigger:** Runs whenever a new product is listed and set to `available` status.
*   **Strategies:**
    *   **Strategy 1:** Searches for existing trades where the target product matches the newly added product's category/title.
    *   **Strategy 2:** Searches for other available products that match the new product seller's "wants" list, creating synthetic trade links to bridge gaps.
*   **Result:** Triggers valid multi-way suggestions immediately upon listing, increasing "immediate" match rates.

### C. Background Refresh (`RebuildAllLoopCaches`)
*   **Frequency:** Every 5 minutes via a background ticker.
*   **Scope:** Refreshes hybrid loop suggestions for **Premium Users**.
*   **Cache:** Updates the `trade_loop_cache` table, which the frontend polls via `GET /api/trades/loops`.

---

## 2. Manual Multi-Way Conversion Process
Manual conversion occurs when a user explicitly chooses to transform a standard 1-on-1 trade offer into a 3-way chain.

### Step 1: User Initiation
*   **Trigger:** Typically User B (the recipient of a trade offer) reviews a pending offer they aren't fully satisfied with.
*   **Action:** User clicks **"Convert to Multiway"** in the trade details view.
*   **API Call:** `PUT /api/trades/:id` with `{ "action": "convert_to_multiway" }`.

### Step 2: Semantic Matching (`evaluateAndCreateMultiwaySuggestion`)
*   The system uses the **Tolerant Scoring Matcher** to find a "User 3" who:
    1.  Has a product that **User 2** (the recipient) actually wants.
    2.  Wants the product that **User 1** (the original buyer) is offering.
*   **Scoring Criteria:** Includes semantic title matching (synonyms like "PS5" vs "PlayStation"), category matching, price tolerance (±30%), and condition compatibility.

### Step 3: Chain Creation & State Transition
*   **If Match Found:**
    *   A record is created in `multiway_trades` with status `pending_user3`.
    *   The original trade status is updated to `pending_multiway`.
    *   **Locking:** User 3's product is set to `locked` status to prevent it from being sold/traded elsewhere during the 18-hour window.
*   **If No Match Found:** The user is informed, but the system continues to check automatically in the background as new items are posted.

### Step 4: Participant Acceptance (The 18-Hour Window)
*   User 3 receives a specific invitation: *"[User] invited you to a 3-way loop: [User] wants your [Product], and you want their [Product]."*
*   **Decision Period:** All parties must accept the multi-way invitation within **18 hours** (tracked via `expires_at`).
*   **Outcome:**
    *   **Full Acceptance:** Status moves to `active` (or `user3_accepted` depending on the phase), and trade legs are created.
    *   **Expiration/Decline:** If any party declines or the timer runs out, the chain dissolves, User 3's product is `unlocked`, and the original trade remains or is cancelled depending on the context.

---

## Technical Table Reference

| Component | Logic Location | Database Table |
| :--- | :--- | :--- |
| **Logic Engine** | `services/trade_matcher.go` | `multiway_trades` |
| **API Handler** | `handlers/trade_handler.go` | `trade_loop_cache` |
| **Background Service** | `services/trade_timeout.go` | `multiway_trade_legs` |
| **Frontend Display** | `TradeLoopsDisplay.tsx` | N/A |
