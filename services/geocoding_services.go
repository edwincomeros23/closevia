package services

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"net/url"
	"os"
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

// PlaceSuggestion represents a single place returned by the search API.
type PlaceSuggestion struct {
	Name      string  `json:"name"`
	Address   string  `json:"address"`
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
	PlaceID   string  `json:"place_id,omitempty"`
}

// googlePlacesTextSearchResponse models Google Places Text Search API response.
type googlePlacesTextSearchResponse struct {
	Status  string `json:"status"`
	Results []struct {
		Name             string `json:"name"`
		FormattedAddress string `json:"formatted_address"`
		Geometry         struct {
			Location struct {
				Lat float64 `json:"lat"`
				Lng float64 `json:"lng"`
			} `json:"location"`
		} `json:"geometry"`
		PlaceID string `json:"place_id"`
	} `json:"results"`
	ErrorMessage string `json:"error_message,omitempty"`
}

// Zamboanga City service area: viewbox + center for strict bias.
// The app primarily serves WMSU students and nearby residents, so we
// filter out any place results that land outside this region.
const (
	zamboCenterLat   = 6.9214
	zamboCenterLng   = 122.0790
	zamboMaxRadiusKm = 50.0
	// Viewbox covers Zamboanga Peninsula (minLon, minLat, maxLon, maxLat).
	zamboMinLat = 6.75
	zamboMaxLat = 7.10
	zamboMinLng = 121.85
	zamboMaxLng = 122.25
)

// SearchPlaces performs a text search for places biased to Zamboanga City.
// Uses Google Places Text Search when GOOGLE_MAPS_API_KEY is set,
// otherwise falls back to Nominatim search. Results further than
// zamboMaxRadiusKm from Zamboanga center are dropped.
func SearchPlaces(query string, biasLat, biasLng *float64) ([]PlaceSuggestion, error) {
	query = trimmed(query)
	if query == "" {
		return nil, errors.New("query cannot be empty")
	}

	// Force bias to Zamboanga center when no user coords are provided,
	// so free-text searches like "jollibee" don't return Manila results.
	if biasLat == nil || biasLng == nil {
		lat, lng := zamboCenterLat, zamboCenterLng
		biasLat = &lat
		biasLng = &lng
	}

	var (
		results []PlaceSuggestion
		err     error
	)
	apiKey := os.Getenv("GOOGLE_MAPS_API_KEY")
	if apiKey != "" && apiKey != "your-google-maps-api-key-here" {
		results, err = searchPlacesGoogle(query, apiKey, biasLat, biasLng)
	} else {
		results, err = searchPlacesNominatim(query)
	}
	if err != nil {
		return nil, err
	}
	return filterToZamboanga(results), nil
}

// filterToZamboanga drops results outside the Zamboanga service radius.
func filterToZamboanga(in []PlaceSuggestion) []PlaceSuggestion {
	out := make([]PlaceSuggestion, 0, len(in))
	for _, p := range in {
		d := CalculateDistance(zamboCenterLat, zamboCenterLng, p.Latitude, p.Longitude)
		if d.DistanceKm <= zamboMaxRadiusKm {
			out = append(out, p)
		}
	}
	return out
}

func searchPlacesGoogle(query, apiKey string, biasLat, biasLng *float64) ([]PlaceSuggestion, error) {
	params := url.Values{}
	params.Set("query", query+" Philippines")
	params.Set("region", "ph")
	params.Set("key", apiKey)
	if biasLat != nil && biasLng != nil {
		params.Set("location", fmt.Sprintf("%f,%f", *biasLat, *biasLng))
		params.Set("radius", "50000")
	}

	reqURL := "https://maps.googleapis.com/maps/api/place/textsearch/json?" + params.Encode()
	resp, err := geocodeHTTPClient.Get(reqURL)
	if err != nil {
		return nil, fmt.Errorf("places request failed: %w", err)
	}
	defer resp.Body.Close()

	var data googlePlacesTextSearchResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, fmt.Errorf("decode places: %w", err)
	}
	if data.Status != "OK" && data.Status != "ZERO_RESULTS" {
		return nil, fmt.Errorf("google places status=%s: %s", data.Status, data.ErrorMessage)
	}

	out := make([]PlaceSuggestion, 0, len(data.Results))
	for i, r := range data.Results {
		if i >= 8 {
			break
		}
		out = append(out, PlaceSuggestion{
			Name:      r.Name,
			Address:   r.FormattedAddress,
			Latitude:  r.Geometry.Location.Lat,
			Longitude: r.Geometry.Location.Lng,
			PlaceID:   r.PlaceID,
		})
	}
	return out, nil
}

type nominatimSearchResult struct {
	DisplayName string `json:"display_name"`
	Name        string `json:"name"`
	Lat         string `json:"lat"`
	Lon         string `json:"lon"`
}

func searchPlacesNominatim(query string) ([]PlaceSuggestion, error) {
	reqURL := fmt.Sprintf(
		"https://nominatim.openstreetmap.org/search?q=%s&format=json&limit=8&countrycodes=ph&addressdetails=0&bounded=1&viewbox=%f,%f,%f,%f",
		url.QueryEscape(query),
		zamboMinLng, zamboMaxLat, zamboMaxLng, zamboMinLat,
	)
	req, err := http.NewRequest("GET", reqURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Clovia/1.0 (closevia)")

	resp, err := geocodeHTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var results []nominatimSearchResult
	if err := json.NewDecoder(resp.Body).Decode(&results); err != nil {
		return nil, err
	}

	out := make([]PlaceSuggestion, 0, len(results))
	for _, r := range results {
		lat, err1 := strconv.ParseFloat(r.Lat, 64)
		lng, err2 := strconv.ParseFloat(r.Lon, 64)
		if err1 != nil || err2 != nil {
			continue
		}
		name := r.Name
		if name == "" {
			name = firstSegment(r.DisplayName)
		}
		out = append(out, PlaceSuggestion{
			Name:      name,
			Address:   r.DisplayName,
			Latitude:  lat,
			Longitude: lng,
		})
	}
	return out, nil
}

func trimmed(s string) string {
	for len(s) > 0 && (s[0] == ' ' || s[0] == '\t' || s[0] == '\n') {
		s = s[1:]
	}
	for len(s) > 0 && (s[len(s)-1] == ' ' || s[len(s)-1] == '\t' || s[len(s)-1] == '\n') {
		s = s[:len(s)-1]
	}
	return s
}

func firstSegment(s string) string {
	for i, c := range s {
		if c == ',' {
			return s[:i]
		}
	}
	return s
}

// CalculateDistanceToProduct calculates distance between a user and a product location.
func CalculateDistanceToProduct(userLat, userLon, productLat, productLon *float64) (*DistanceResult, error) {
	if userLat == nil || userLon == nil || productLat == nil || productLon == nil {
		return nil, errors.New("user or product does not have location coordinates")
	}
	result := CalculateDistance(*userLat, *userLon, *productLat, *productLon)
	return &result, nil
}
