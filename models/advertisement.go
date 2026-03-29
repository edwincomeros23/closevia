package models

import "time"

type Advertisement struct {
	ID          int        `json:"id" db:"id"`
	Title       string     `json:"title" db:"title"`
	Description string     `json:"description" db:"description"`
	MediaURL    string     `json:"media_url" db:"media_url"`
	MediaType   string     `json:"media_type" db:"media_type"`
	LinkURL     string     `json:"link_url" db:"link_url"`
	CtaText     string     `json:"cta_text" db:"cta_text"`
	IsActive    bool       `json:"is_active" db:"is_active"`
	Priority    int        `json:"priority" db:"priority"`
	StartDate   *time.Time `json:"start_date" db:"start_date"`
	EndDate     *time.Time `json:"end_date" db:"end_date"`
	Views       int        `json:"views" db:"views"`
	Clicks      int        `json:"clicks" db:"clicks"`
	CreatedAt   time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at" db:"updated_at"`
}

type AdvertisementCreate struct {
	Title       string     `json:"title"`
	Description string     `json:"description"`
	MediaType   string     `json:"media_type"`
	LinkURL     string     `json:"link_url"`
	CtaText     string     `json:"cta_text"`
	IsActive    bool       `json:"is_active"`
	Priority    int        `json:"priority"`
	StartDate   *time.Time `json:"start_date"`
	EndDate     *time.Time `json:"end_date"`
}

type AdvertisementUpdate struct {
	Title       *string    `json:"title"`
	Description *string    `json:"description"`
	MediaURL    *string    `json:"media_url"`
	MediaType   *string    `json:"media_type"`
	LinkURL     *string    `json:"link_url"`
	CtaText     *string    `json:"cta_text"`
	IsActive    *bool      `json:"is_active"`
	Priority    *int       `json:"priority"`
	StartDate   *time.Time `json:"start_date"`
	EndDate     *time.Time `json:"end_date"`
}
