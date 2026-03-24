package services

import (
	"database/sql"
	"log"

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

// FindTradeLoops detects cycles in the trade graph and returns them.
// A loop is a path of trades that starts and ends at the same user.
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
		g.dfs(startNode, startNode, adj, &path, &visited, &loops)
	}

	return loops
}

// dfs is a helper function to perform a depth-first search for cycles.
func (g *TradeGraph) dfs(startNode, currentNode int, adj map[int][]TradeEdge, path *[]TradeEdge, visited *map[int]bool, loops *[][]TradeEdge) {
	(*visited)[currentNode] = true

	for _, edge := range adj[currentNode] {
		// Add edge to the current path
		*path = append(*path, edge)

		if edge.ToUser == startNode {
			// Found a loop
			loop := make([]TradeEdge, len(*path))
			copy(loop, *path)
			*loops = append(*loops, loop)
		} else if !(*visited)[edge.ToUser] {
			// Continue DFS
			g.dfs(startNode, edge.ToUser, adj, path, visited, loops)
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
	User3ProductID    int    `json:"user3_product_id"`    // Product User 3 has (that User 2 wants)
	User3ProductTitle string `json:"user3_product_title"`
	User1ProductID    int    `json:"user1_product_id"`    // Product from User 1 that User 3 wants
	User1ProductTitle string `json:"user1_product_title"`
	MatchScore        int    `json:"match_score"`         // How good the match is (0-100)
}

// FindMultiwayMatch searches for a User 3 who:
// - Has a product that User 2 wants (matching category/title)
// - Wants something that User 1 has (offered items in the original trade)
func FindMultiwayMatch(db *sql.DB, user1ID, user2ID, originalTradeID int, excludeUserIDs []int) ([]MultiwayMatch, error) {
	log.Printf("FindMultiwayMatch: Searching for User3. User1=%d, User2=%d, TradeID=%d", user1ID, user2ID, originalTradeID)

	// 1. Get what User 1 offered
	rows1, err := db.Query(`
		SELECT p.id, p.title, p.category
		FROM trade_items ti
		JOIN products p ON p.id = ti.product_id
		WHERE ti.trade_id = ? AND ti.offered_by = 'buyer'
	`, originalTradeID)
	if err != nil {
		return nil, err
	}
	defer rows1.Close()

	type prod struct {
		ID       int
		Title    string
		Category string
	}
	var u1Prods []prod
	for rows1.Next() {
		var p prod
		if err := rows1.Scan(&p.ID, &p.Title, &p.Category); err == nil {
			u1Prods = append(u1Prods, p)
		}
	}

	if len(u1Prods) == 0 {
		return nil, nil
	}

	// 2. Get User 2's target product details
	var targetCat, targetTitle string
	err = db.QueryRow(`
		SELECT p.category, p.title 
		FROM trades t 
		JOIN products p ON p.id = t.target_product_id 
		WHERE t.id = ?
	`, originalTradeID).Scan(&targetCat, &targetTitle)
	if err != nil {
		return nil, err
	}

	// 3. Build exclude list
	excludeSet := map[int]bool{user1ID: true, user2ID: true}
	for _, id := range excludeUserIDs {
		excludeSet[id] = true
	}

	var matches []MultiwayMatch
	for _, up := range u1Prods {
		// Search for User 3:
		// - Owns a product matching User 2's target category/title
		// - Wants something matching User 1's product title/category
		query := `
			SELECT DISTINCT u.id, u.name, p.id, p.title
			FROM products p
			JOIN users u ON u.id = p.seller_id
			WHERE p.status = 'available'
			AND (p.category = ? OR p.title LIKE ?)
			AND (p.wants LIKE ? OR p.wanted_categories LIKE ? OR p.desired_product LIKE ?)
		`
		searchRows, err := db.Query(query, targetCat, "%"+targetTitle+"%", "%"+up.Title+"%", "%"+up.Category+"%", "%"+up.Title+"%")
		if err != nil {
			continue
		}

		for searchRows.Next() {
			var m MultiwayMatch
			if err := searchRows.Scan(&m.User3ID, &m.User3Name, &m.User3ProductID, &m.User3ProductTitle); err == nil {
				if excludeSet[m.User3ID] {
					continue
				}
				m.User1ProductID = up.ID
				m.User1ProductTitle = up.Title
				matches = append(matches, m)
			}
		}
		searchRows.Close()
	}

	return matches, nil
}