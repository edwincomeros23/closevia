package models

import "time"

// MeetupStage represents the current stage of a meetup process
type MeetupStage string

const (
	// Negotiating - discussing time and location
	MeetupStageNegotiating MeetupStage = "negotiating"
	// Scheduled - both users agreed on time and location
	MeetupStageScheduled MeetupStage = "scheduled"
	// OnTheWay - user is heading to meetup location
	MeetupStageOnTheWay MeetupStage = "on_the_way"
	// Arrived - user has arrived at location
	MeetupStageArrived MeetupStage = "arrived"
	// Completed - both users confirmed exchange was completed
	MeetupStageCompleted MeetupStage = "completed"
	// NoShow - one user did not appear
	MeetupStageNoShow MeetupStage = "no_show"
)

// MeetupStatus tracks the current status of a meetup
type MeetupStatus struct {
	ID                     int        `json:"id"`
	TradeID                int        `json:"trade_id"`
	Stage                  string     `json:"stage"` // negotiating, scheduled, on_the_way, arrived, completed, no_show
	BuyerProposedTime      *time.Time `json:"buyer_proposed_time,omitempty"`
	BuyerProposedLocation  string     `json:"buyer_proposed_location,omitempty"`
	SellerProposedTime     *time.Time `json:"seller_proposed_time,omitempty"`
	SellerProposedLocation string     `json:"seller_proposed_location,omitempty"`
	AgreedTime             *time.Time `json:"agreed_time,omitempty"`
	AgreedLocation         string     `json:"agreed_location,omitempty"`
	ReminderSent           bool       `json:"reminder_sent"`
	ReminderSentAt         *time.Time `json:"reminder_sent_at,omitempty"`
	BuyerHeadingOut        bool       `json:"buyer_heading_out"`
	SellerHeadingOut       bool       `json:"seller_heading_out"`
	BuyerArrived           bool       `json:"buyer_arrived"`
	SellerArrived          bool       `json:"seller_arrived"`
	BuyerArrivedAt         *time.Time `json:"buyer_arrived_at,omitempty"`
	SellerArrivedAt        *time.Time `json:"seller_arrived_at,omitempty"`
	CompletedAt            *time.Time `json:"completed_at,omitempty"`
	NoShowReportedBy       *int       `json:"no_show_reported_by,omitempty"` // user ID who reported no-show
	NoShowReportedAt       *time.Time `json:"no_show_reported_at,omitempty"`
	NoShowReason           string     `json:"no_show_reason,omitempty"`
	CreatedAt              time.Time  `json:"created_at"`
	UpdatedAt              time.Time  `json:"updated_at"`
}

// SystemMessage represents a system message in chat related to meetup progress
type SystemMessage struct {
	ID             int       `json:"id"`
	ConversationID int       `json:"conversation_id"`
	MessageType    string    `json:"message_type"` // "negotiation_prompt", "scheduled_confirmation", "reminder", "heading_out", "arrived", "completion_prompt", "no_show_report"
	Title          string    `json:"title"`
	Description    string    `json:"description"`
	Actions        []Action  `json:"actions,omitempty"`
	CreatedAt      time.Time `json:"created_at"`
}

// Action represents an action button for a system message
type Action struct {
	ID         string                 `json:"id"`
	Label      string                 `json:"label"`
	ActionType string                 `json:"action_type"` // "propose_time", "confirm_location", "heading_out", "mark_arrived", "confirm_completion", "report_no_show"
	Data       map[string]interface{} `json:"data,omitempty"`
}

// MeetupProposal represents a user's proposal for time/location
type MeetupProposal struct {
	ID               int       `json:"id"`
	TradeID          int       `json:"trade_id"`
	UserID           int       `json:"user_id"`
	ProposedTime     time.Time `json:"proposed_time"`
	ProposedLocation string    `json:"proposed_location"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}

// MeetupStatusUpdate represents types of status updates
type MeetupStatusUpdate struct {
	TradeID int                    `json:"trade_id"`
	Stage   string                 `json:"stage"`
	UserID  int                    `json:"user_id"`
	Action  string                 `json:"action"` // "propose_time_location", "confirm_on_agreed", "heading_out", "mark_arrived", "confirm_completion"
	Data    map[string]interface{} `json:"data,omitempty"`
}
