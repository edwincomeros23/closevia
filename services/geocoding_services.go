package services

import "errors"

// Coordinates represents a pair of latitude and longitude.
type Coordinates struct {
	Latitude  float64
	Longitude float64
}

// Hardcoded map of locations to coordinates for demonstration purposes.
var locationCoordinates = map[string]Coordinates{
	"manila":    {Latitude: 14.5995, Longitude: 120.9842},
	"cebu":      {Latitude: 10.3157, Longitude: 123.8854},
	"davao":     {Latitude: 7.1907, Longitude: 125.4553},
	"quezon city": {Latitude: 14.6760, Longitude: 121.0437},
}

// GetCoordinates returns the latitude and longitude for a given location string.
func GetCoordinates(location string) (Coordinates, error) {
	coords, ok := locationCoordinates[location]
	if !ok {
		return Coordinates{}, errors.New("location not found")
	}
	return coords, nil
}
