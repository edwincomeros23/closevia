// Mock data for admin dashboard when API is unavailable
export const mockAdminStats = {
  // Core Metrics
  total_users: 1250,
  premium_users: 85,
  total_income: 156750.50,
  active_listings: 892,
  total_trades: 234,

  // Daily Metrics
  new_users_today: 12,
  new_listings_today: 8,

  // User Management
  verified_users: 987,
  pending_approvals: 15,
  pending_verifications: 3,
  reports_filed: 23,
  suspended_users: 7,

  // System Metrics
  storage_usage_mb: 245.8,
  revenue_breakdown: [
    { period: 'Week 35', amount: 45230.50 },
    { period: 'Week 34', amount: 38950.25 },
    { period: 'Week 33', amount: 42180.75 },
    { period: 'Week 32', amount: 30389.00 }
  ],
  recent_activity: [
    { action: 'New User', count: 12, latest: '2025-01-15T14:30:00Z' },
    { action: 'New Listing', count: 8, latest: '2025-01-15T13:45:00Z' },
    { action: 'Trade Completed', count: 3, latest: '2025-01-15T12:20:00Z' }
  ],

  // Metadata
  last_updated: '2025-01-15T15:00:00Z'
};

// Simulate API delay for realistic testing
export const simulateApiDelay = (ms: number = 1000): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

// Check if we're in development mode
// Vite exposes environment via import.meta.env
// import.meta.env.DEV is true in development mode
export const isDevelopment = typeof import.meta !== 'undefined' && (import.meta as any).env && ((import.meta as any).env.DEV === true || (import.meta as any).env.MODE === 'development')

// Check if we should use mock data
export const shouldUseMockData = (): boolean => {
  return isDevelopment && !navigator.onLine;
};
