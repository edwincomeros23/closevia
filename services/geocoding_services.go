package services

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"time"
)

// Coordinates represents a pair of latitude and longitude.
type Coordinates struct {
	Latitude  float64
	Longitude float64
}

// DistanceResult represents the calculated distance between two points
type DistanceResult struct {
	DistanceKm    float64 `json:"distance_km"`
	DistanceMiles float64 `json:"distance_miles"`
	DistanceM     float64 `json:"distance_m"`
}

// nominatimResult is the JSON shape returned by Nominatim's /search endpoint.
type nominatimResult struct {
	Lat string `json:"lat"`
	Lon string `json:"lon"`
}

// httpClient with a reasonable timeout for external geocoding calls.
var geocodeHTTPClient = &http.Client{Timeout: 10 * time.Second}

// GetCoordinates returns the latitude and longitude for a given location string
// using the free OpenStreetMap Nominatim API (no API key required).
func GetCoordinates(location string) (Coordinates, error) {
	if location == "" {
		return Coordinates{}, errors.New("location string cannot be empty")
	}

	reqURL := fmt.Sprintf(
		"https://nominatim.openstreetmap.org/search?q=%s&format=json&limit=1",
		url.QueryEscape(location),
	)

	req, err := http.NewRequest("GET", reqURL, nil)
	if err != nil {
		return Coordinates{}, fmt.Errorf("failed to build geocoding request: %w", err)
	}
	// Nominatim requires a User-Agent header identifying the application.
	req.Header.Set("User-Agent", "Clovia/1.0 (closevia)")

	resp, err := geocodeHTTPClient.Do(req)
	if err != nil {
		return Coordinates{}, fmt.Errorf("geocoding request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return Coordinates{}, fmt.Errorf("geocoding returned status %d", resp.StatusCode)
	}

	var results []nominatimResult
	if err := json.NewDecoder(resp.Body).Decode(&results); err != nil {
		return Coordinates{}, fmt.Errorf("failed to decode geocoding response: %w", err)
	}

	if len(results) == 0 {
		return Coordinates{}, errors.New("no results found for the given location")
	}

	lat, err := strconv.ParseFloat(results[0].Lat, 64)
	if err != nil {
		return Coordinates{}, fmt.Errorf("invalid latitude: %w", err)
	}
	lon, err := strconv.ParseFloat(results[0].Lon, 64)
	if err != nil {
		return Coordinates{}, fmt.Errorf("invalid longitude: %w", err)
	}

	if lat == 0 && lon == 0 {
		return Coordinates{}, errors.New("invalid coordinates returned from geocoding API")
	}

	return Coordinates{Latitude: lat, Longitude: lon}, nil
}

// CalculateDistance calculates the distance between two coordinates using the Haversine formula.
// Returns distance in kilometers, miles, and meters.
func CalculateDistance(lat1, lon1, lat2, lon2 float64) DistanceResult {
	// Earth's radius in kilometers
	const earthRadiusKm = 6371.0

	// Convert degrees to radians
	lat1Rad := lat1 * math.Pi / 180
	lon1Rad := lon1 * math.Pi / 180
	lat2Rad := lat2 * math.Pi / 180
	lon2Rad := lon2 * math.Pi / 180

	// Haversine formula
	dlat := lat2Rad - lat1Rad
	dlon := lon2Rad - lon1Rad

	a := math.Sin(dlat/2)*math.Sin(dlat/2) +
		math.Cos(lat1Rad)*math.Cos(lat2Rad)*
			math.Sin(dlon/2)*math.Sin(dlon/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))

	distanceKm := earthRadiusKm * c
	distanceMiles := distanceKm * 0.621371
	distanceM := distanceKm * 1000

	return DistanceResult{
		DistanceKm:    math.Round(distanceKm*100) / 100,
		DistanceMiles: math.Round(distanceMiles*100) / 100,
		DistanceM:     math.Round(distanceM*100) / 100,
	}
}

// CalculateDistanceBetweenUsers calculates distance between two users based on their coordinates.
// Returns an error if either user doesn't have coordinates set.
func CalculateDistanceBetweenUsers(user1Lat, user1Lon, user2Lat, user2Lon *float64) (*DistanceResult, error) {
	if user1Lat == nil || user1Lon == nil || user2Lat == nil || user2Lon == nil {
		return nil, errors.New("one or both users do not have location coordinates")
	}
	result := CalculateDistance(*user1Lat, *user1Lon, *user2Lat, *user2Lon)
	return &result, nil
}

// CalculateDistanceToProduct calculates distance between a user and a product location.
func CalculateDistanceToProduct(userLat, userLon, productLat, productLon *float64) (*DistanceResult, error) {
	if userLat == nil || userLon == nil || productLat == nil || productLon == nil {
		return nil, errors.New("user or product does not have location coordinates")
	}
	result := CalculateDistance(*userLat, *userLon, *productLat, *productLon)
	return &result, nil
}
