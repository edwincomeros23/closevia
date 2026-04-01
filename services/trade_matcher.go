package services

import (
	"database/sql"
	"log"
	"math"
	"sort"
	"strconv"
	"strings"

	"github.com/xashathebest/clovia/models"
)

// TradeEdge represents a directed edge in the trade graph.
// It signifies that `FromUser` has proposed a trade to `ToUser`.
type TradeEdge struct {
	FromUser int
	ToUser   int
	TradeID  int
}

// TradeGraph represents the graph of active trade proposals.
type TradeGraph struct {
	Edges []TradeEdge
	Nodes map[int]bool
}

// NewTradeGraph creates a new trade graph from the database.
func NewTradeGraph(db *sql.DB) (*TradeGraph, error) {
	graph := &TradeGraph{
		Edges: make([]TradeEdge, 0),
		Nodes: make(map[int]bool),
	}

	rows, err := db.Query("SELECT id, buyer_id, seller_id FROM trades WHERE status IN ('pending', 'pending_multiway')")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var trade models.Trade
		if err := rows.Scan(&trade.ID, &trade.BuyerID, &trade.SellerID); err != nil {
			log.Printf("Error scanning trade row: %v", err)
			continue
		}

		edge := TradeEdge{
			FromUser: trade.BuyerID,
			ToUser:   trade.SellerID,
			TradeID:  trade.ID,
		}
		graph.Edges = append(graph.Edges, edge)
		graph.Nodes[trade.BuyerID] = true
		graph.Nodes[trade.SellerID] = true
	}

	return graph, nil
}

// MaxChainLength is the maximum number of parties in a multi-way trade chain.
// Set to 3 for MVP — increase this constant to allow longer chains later.
const MaxChainLength = 3

// FindTradeLoops detects cycles in the trade graph and returns them.
// A loop is a path of trades that starts and ends at the same user.
// Chains are capped at MaxChainLength parties to keep coordination manageable.
func (g *TradeGraph) FindTradeLoops() [][]TradeEdge {
	// Adjacency list representation of the graph
	adj := make(map[int][]TradeEdge)
	for _, edge := range g.Edges {
		adj[edge.FromUser] = append(adj[edge.FromUser], edge)
	}

	var loops [][]TradeEdge
	for startNode := range g.Nodes {
		path := []TradeEdge{}
		visited := make(map[int]bool)
		g.dfs(startNode, startNode, adj, &path, &visited, &loops, 0)
	}

	return loops
}

// dfs is a helper function to perform a depth-first search for cycles.
// depth tracks how many edges deep we are; we stop exploring beyond MaxChainLength.
func (g *TradeGraph) dfs(startNode, currentNode int, adj map[int][]TradeEdge, path *[]TradeEdge, visited *map[int]bool, loops *[][]TradeEdge, depth int) {
	(*visited)[currentNode] = true

	for _, edge := range adj[currentNode] {
		// Add edge to the current path
		*path = append(*path, edge)

		if edge.ToUser == startNode {
			// Found a loop — keep it if within the chain length cap
			if len(*path) <= MaxChainLength {
				loop := make([]TradeEdge, len(*path))
				copy(loop, *path)
				*loops = append(*loops, loop)
			}
		} else if !(*visited)[edge.ToUser] && depth+1 < MaxChainLength {
			// Continue DFS only if we haven't hit the depth cap
			g.dfs(startNode, edge.ToUser, adj, path, visited, loops, depth+1)
		}

		// Backtrack
		*path = (*path)[:len(*path)-1]
	}

	(*visited)[currentNode] = false
}

// MultiwayMatch represents a potential 3rd party match for multiway trading
type MultiwayMatch struct {
	User3ID           int    `json:"user3_id"`
	User3Name         string `json:"user3_name"`
	User3ProductID    int    `json:"user3_product_id"` // Product User 3 has (that User 2 wants)
	User3ProductTitle string `json:"user3_product_title"`
	User1ProductID    int    `json:"user1_product_id"` // Product from User 1 that User 3 wants
	User1ProductTitle string `json:"user1_product_title"`
	MatchScore        int    `json:"match_score"` // How good the match is (0-100)
}

type MultiwayCandidateDebug struct {
	User3ID           int      `json:"user3_id"`
	User3Name         string   `json:"user3_name"`
	User3ProductID    int      `json:"user3_product_id"`
	User3ProductTitle string   `json:"user3_product_title"`
	OfferedProductID  int      `json:"offered_product_id"`
	OfferedTitle      string   `json:"offered_title"`
	Score             int      `json:"score"`
	PassedThreshold   bool     `json:"passed_threshold"`
	Reasons           []string `json:"reasons"`
}

type MultiwayDebugInfo struct {
	TradeID       int                      `json:"trade_id"`
	Threshold     int                      `json:"threshold"`
	NoMatchReason string                   `json:"no_match_reason,omitempty"`
	Candidates    []MultiwayCandidateDebug `json:"candidates"`
}

// FindMultiwayMatch searches for a User 3 who:
// - Has a product that User 2 wants (matching category/title)
// - Wants something that User 1 has (offered items in the original trade)
func FindMultiwayMatch(db *sql.DB, user1ID, user2ID, originalTradeID int, excludeUserIDs []int) ([]MultiwayMatch, error) {
	matches, _, err := FindMultiwayMatchDetailed(db, user1ID, user2ID, originalTradeID, excludeUserIDs)
	return matches, err
}

func normalizeConditionBucket(raw string) string {
	v := strings.TrimSpace(strings.ToLower(raw))
	switch v {
	case "new", "brand new", "sealed":
		return "new"
	case "like new", "like-new", "excellent":
		return "like_new"
	case "good", "used - good", "used good":
		return "good"
	case "fair", "used - fair", "used fair":
		return "fair"
	default:
		return v
	}
}

func wantedSignalScore(candidateWants, candidateWantedCategories, candidateDesiredProduct, offeredTitle, offeredCategory string) (int, bool) {
	needleTitle := strings.ToLower(strings.TrimSpace(offeredTitle))
	needleCategory := strings.ToLower(strings.TrimSpace(offeredCategory))
	haystack := strings.ToLower(candidateWants + " " + candidateWantedCategories + " " + candidateDesiredProduct)

	if needleTitle != "" && strings.Contains(haystack, needleTitle) {
		return 18, true
	}
	if needleCategory != "" && strings.Contains(haystack, needleCategory) {
		return 12, true
	}
	return 0, false
}

// FindMultiwayMatchDetailed runs a tolerant scoring-based multi-way matcher.
// Wants text is now a bonus signal, not a hard requirement.
func FindMultiwayMatchDetailed(db *sql.DB, user1ID, user2ID, originalTradeID int, excludeUserIDs []int) ([]MultiwayMatch, MultiwayDebugInfo, error) {
	log.Printf("FindMultiwayMatch: Searching for User3. User1=%d, User2=%d, TradeID=%d", user1ID, user2ID, originalTradeID)
	const minScore = 35
	debug := MultiwayDebugInfo{TradeID: originalTradeID, Threshold: minScore, Candidates: []MultiwayCandidateDebug{}}

	// 1. Get what User 1 offered
	rows1, err := db.Query(`
		SELECT p.id, p.title, p.category, COALESCE(p.price, 0), COALESCE(p.`+"`condition`"+`, '')
		FROM trade_items ti
		JOIN products p ON p.id = ti.product_id
		WHERE ti.trade_id = ? AND ti.offered_by = 'buyer'
	`, originalTradeID)
	if err != nil {
		return nil, debug, err
	}
	defer rows1.Close()

	type prod struct {
		ID        int
		Title     string
		Category  string
		Price     float64
		Condition string
	}
	var u1Prods []prod
	for rows1.Next() {
		var p prod
		if err := rows1.Scan(&p.ID, &p.Title, &p.Category, &p.Price, &p.Condition); err == nil {
			u1Prods = append(u1Prods, p)
		}
	}

	if len(u1Prods) == 0 {
		debug.NoMatchReason = "No buyer-offered items were found for this trade."
		return nil, debug, nil
	}

	// 2. Get User 2's target product details and wants
	var targetCat, targetTitle, targetWants, targetWantedCat, targetDesiredProd string
	err = db.QueryRow(`
		SELECT p.category, p.title, COALESCE(p.wants, ''), COALESCE(p.wanted_categories, ''), COALESCE(p.desired_product, '')
		FROM trades t 
		JOIN products p ON p.id = t.target_product_id 
		WHERE t.id = ?
	`, originalTradeID).Scan(&targetCat, &targetTitle, &targetWants, &targetWantedCat, &targetDesiredProd)
	if err != nil {
		return nil, debug, err
	}

	// 3. Build exclude list
	excludeSet := map[int]bool{user1ID: true, user2ID: true}
	for _, id := range excludeUserIDs {
		excludeSet[id] = true
	}

	query := `
		SELECT DISTINCT u.id, u.name, p.id, p.title, COALESCE(p.category, ''), COALESCE(p.price, 0),
		       COALESCE(p.` + "`condition`" + `, ''), COALESCE(p.wants, ''), COALESCE(p.wanted_categories, ''), COALESCE(p.desired_product, '')
		FROM products p
		JOIN users u ON u.id = p.seller_id
		WHERE p.status = 'available'
	`
	searchRows, err := db.Query(query)
	if err != nil {
		return nil, debug, err
	}
	defer searchRows.Close()

	type candidateAgg struct {
		match MultiwayMatch
		score int
	}
	bestByUser3 := map[int]candidateAgg{}

	for searchRows.Next() {
		var user3ID, user3ProductID int
		var user3Name, user3ProductTitle, user3Category, user3Condition, wants, wantedCategories, desiredProduct string
		var user3Price float64
		if err := searchRows.Scan(&user3ID, &user3Name, &user3ProductID, &user3ProductTitle, &user3Category, &user3Price, &user3Condition, &wants, &wantedCategories, &desiredProduct); err != nil {
			continue
		}
		if excludeSet[user3ID] {
			continue
		}

		for _, up := range u1Prods {
			score := 0
			reasons := []string{}

			u2Haystack := strings.ToLower(targetWants + " " + targetWantedCat + " " + targetDesiredProd)
			u3TitleLower := strings.ToLower(strings.TrimSpace(user3ProductTitle))
			u3CatLower := strings.ToLower(strings.TrimSpace(user3Category))

			if u3TitleLower != "" && strings.Contains(u2Haystack, u3TitleLower) {
				score += 35
				reasons = append(reasons, "User 3 title matched what User 2 wants (+35)")
			} else if u3CatLower != "" && strings.Contains(u2Haystack, u3CatLower) {
				score += 20
				reasons = append(reasons, "User 3 category matched what User 2 wants (+20)")
			} else {
				reasons = append(reasons, "User 3 product did not strongly match User 2's explicit wants (+0)")
			}

			if up.Price > 0 && user3Price > 0 {
				delta := math.Abs(user3Price-up.Price) / up.Price
				if delta <= 0.30 {
					score += 25
					reasons = append(reasons, "Price within +/-30% tolerance (+25)")
				} else {
					reasons = append(reasons, "Price outside +/-30% tolerance (+0)")
				}
			} else {
				score += 6
				reasons = append(reasons, "Price missing on one side; neutral tolerance (+6)")
			}

			u1Bucket := normalizeConditionBucket(up.Condition)
			u3Bucket := normalizeConditionBucket(user3Condition)
			if u1Bucket != "" && u3Bucket != "" {
				if (u1Bucket == "new" && u3Bucket == "like_new") || (u1Bucket == "like_new" && u3Bucket == "new") {
					score += 14
					reasons = append(reasons, "Condition compatibility: new/like new (+14)")
				} else if (u1Bucket == "good" && u3Bucket == "fair") || (u1Bucket == "fair" && u3Bucket == "good") {
					score += 12
					reasons = append(reasons, "Condition compatibility: good/fair (+12)")
				} else if u1Bucket == u3Bucket {
					score += 15
					reasons = append(reasons, "Condition matched exactly (+15)")
				} else {
					score += 4
					reasons = append(reasons, "Condition differs but still considered (+4)")
				}
			}

			wantsScore, wantsMatched := wantedSignalScore(wants, wantedCategories, desiredProduct, up.Title, up.Category)
			score += wantsScore
			if wantsMatched {
				reasons = append(reasons, "Wants text signal matched offered item (bonus)")
			} else {
				reasons = append(reasons, "Wants text did not match (no bonus)")
			}

			passed := score >= minScore
			debug.Candidates = append(debug.Candidates, MultiwayCandidateDebug{
				User3ID:           user3ID,
				User3Name:         user3Name,
				User3ProductID:    user3ProductID,
				User3ProductTitle: user3ProductTitle,
				OfferedProductID:  up.ID,
				OfferedTitle:      up.Title,
				Score:             score,
				PassedThreshold:   passed,
				Reasons:           reasons,
			})

			if !passed {
				continue
			}

			if prev, ok := bestByUser3[user3ID]; !ok || score > prev.score {
				bestByUser3[user3ID] = candidateAgg{
					score: score,
					match: MultiwayMatch{
						User3ID:           user3ID,
						User3Name:         user3Name,
						User3ProductID:    user3ProductID,
						User3ProductTitle: user3ProductTitle,
						User1ProductID:    up.ID,
						User1ProductTitle: up.Title,
						MatchScore:        score,
					},
				}
			}
		}
	}

	var matches []MultiwayMatch
	for _, cand := range bestByUser3 {
		matches = append(matches, cand.match)
	}

	sort.Slice(matches, func(i, j int) bool {
		return matches[i].MatchScore > matches[j].MatchScore
	})

	if len(matches) == 0 {
		if len(debug.Candidates) == 0 {
			debug.NoMatchReason = "No available User 3 found in the same category/title as the target product."
		} else {
			best := 0
			for _, c := range debug.Candidates {
				if c.Score > best {
					best = c.Score
				}
			}
			debug.NoMatchReason = "Candidates found, but none met the minimum score threshold."
			if best > 0 {
				debug.NoMatchReason += " Best score: " + strconv.Itoa(best) + "."
			}
		}
	}
	return matches, debug, nil
}
