//go:build ignore

package main

import (
	"fmt"
	"log"

	"github.com/joho/godotenv"
	"github.com/xashathebest/clovia/database"
	"github.com/xashathebest/clovia/services"
)

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found")
	}
	if err := database.InitDatabase(); err != nil {
		log.Fatal("Failed to init DB:", err)
	}
	defer database.CloseDatabase()

	fmt.Println("=== TESTING SEMANTIC MATCHING DIRECTLY ===\n")

	// Test: Alice (User1=52) wants MacBook from Francis (User2=55), Trade=115
	// Check if the matcher finds Charlie (User3=59)

	fmt.Println("Calling FindMultiwayMatchDetailed for Trade 115:")
	fmt.Println("  User1 (Alice, 52): offering iPhone")
	fmt.Println("  User2 (Francis, 55): wants 'gaming console'")
	fmt.Println("  Expected User3: Charlie (59) who has PS5\n")

	matches, debug, err := services.FindMultiwayMatchDetailed(database.DB, 52, 55, 115, []int{})

	if err != nil {
		fmt.Println("Error:", err)
		return
	}

	fmt.Printf("Threshold: %d\n", debug.Threshold)
	fmt.Printf("Found %d matches\n\n", len(matches))

	if len(matches) == 0 {
		fmt.Println("❌ NO MATCHES FOUND")
		if debug.NoMatchReason != "" {
			fmt.Printf("Reason: %s\n", debug.NoMatchReason)
		}
		fmt.Printf("\nCandidates evaluated: %d\n", len(debug.Candidates))
		for _, cand := range debug.Candidates {
			fmt.Printf("\n  Candidate: User3=%d (%s)\n", cand.User3ID, cand.User3Name)
			fmt.Printf("    Product: %s (ID=%d)\n", cand.User3ProductTitle, cand.User3ProductID)
			fmt.Printf("    Your Offered: %s\n", cand.OfferedTitle)
			fmt.Printf("    Score: %d | Passed: %v\n", cand.Score, cand.PassedThreshold)
			fmt.Println("    Reasoning:")
			for _, reason := range cand.Reasons {
				fmt.Printf("      - %s\n", reason)
			}
		}
	} else {
		fmt.Println("✅ MATCHES FOUND!\n")
		for i, match := range matches {
			fmt.Printf("[%d] User3: %d (%s)\n", i+1, match.User3ID, match.User3Name)
			fmt.Printf("    Has: %s (ID=%d)\n", match.User3ProductTitle, match.User3ProductID)
			fmt.Printf("    Wants your: %s (ID=%d)\n", match.User1ProductTitle, match.User1ProductID)
			fmt.Printf("    Score: %d\n\n", match.MatchScore)

			if match.User3ID == 59 {
				fmt.Println("    ✅ CHARLIE FOUND! (User ID 59)")
			}
		}
	}

	fmt.Println("\n=== SUMMARY ===")
	fmt.Println("If Charlie (ID 59) appears with a score >= 30, the semantic matching is working!")
}
