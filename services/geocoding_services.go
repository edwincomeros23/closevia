package services

import (
	"context"
	"errors"
	"math"
	"os"
	"sync"

	"googlemaps.github.io/maps"
)

var (
	googleMapsClient *maps.Client
	clientOnce       sync.Once
	clientErr        error
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

// initGoogleMapsClient initializes the Google Maps client (singleton pattern)
func initGoogleMapsClient() (*maps.Client, error) {
	clientOnce.Do(func() {
		apiKey := os.Getenv("GOOGLE_MAPS_API_KEY")
		if apiKey == "" {
			clientErr = errors.New("GOOGLE_MAPS_API_KEY environment variable is not set")
			return
		}

		client, err := maps.NewClient(maps.WithAPIKey(apiKey))
		if err != nil {
			clientErr = err
			return
		}
		googleMapsClient = client
	})

	if clientErr != nil {
		return nil, clientErr
	}

	return googleMapsClient, nil
}

// GetCoordinates returns the latitude and longitude for a given location string using Google Maps Geocoding API.
func GetCoordinates(location string) (Coordinates, error) {
	if location == "" {
		return Coordinates{}, errors.New("location string cannot be empty")
	}

	client, err := initGoogleMapsClient()
	if err != nil {
		return Coordinates{}, err
	}

	ctx := context.Background()
	req := &maps.GeocodingRequest{
		Address: location,
	}

	resp, err := client.Geocode(ctx, req)
	if err != nil {
		return Coordinates{}, err
	}

	if len(resp) == 0 {
		return Coordinates{}, errors.New("no results found for the given location")
	}

	// Use the first result (most relevant)
	result := resp[0]
	if result.Geometry.Location.Lat == 0 && result.Geometry.Location.Lng == 0 {
		return Coordinates{}, errors.New("invalid coordinates returned from geocoding API")
	}

	return Coordinates{
		Latitude:  result.Geometry.Location.Lat,
		Longitude: result.Geometry.Location.Lng,
	}, nil
}

// GetAddressFromCoordinates performs reverse geocoding to get an address from coordinates.
func GetAddressFromCoordinates(lat, lng float64) (string, error) {
	client, err := initGoogleMapsClient()
	if err != nil {
		return "", err
	}

	ctx := context.Background()
	req := &maps.GeocodingRequest{
		LatLng: &maps.LatLng{
			Lat: lat,
			Lng: lng,
		},
	}

	resp, err := client.Geocode(ctx, req)
	if err != nil {
		return "", err
	}

	if len(resp) == 0 {
		return "", errors.New("no address found for the given coordinates")
	}

	// Return the formatted address from the first result
	return resp[0].FormattedAddress, nil
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
