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

	rows, err := db.Query("SELECT id, buyer_id, seller_id FROM trades WHERE status = 'pending'")
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