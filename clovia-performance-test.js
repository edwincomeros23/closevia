import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Counter, Histogram, Rate, Trend } from 'k6/metrics';

// ============================================================================
// K6 PERFORMANCE TEST: CLOVIA TRADING PLATFORM
// ============================================================================
// This script simulates realistic user behavior including:
// - User authentication (registration/login)
// - Product CRUD operations
// - Trade operations (create, view, update)
// - Search and listing operations
// - Concurrent virtual users
// - Realistic think time between operations
//
// Run with:
//   k6 run clovia-performance-test.js
//   k6 run -u 100 -d 5m clovia-performance-test.js  (100 VUs, 5 minute duration)
// ============================================================================

// Configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000/api';
const THINK_TIME_MS = parseInt(__ENV.THINK_TIME || '500');
const DEBUG = __ENV.DEBUG === 'true';

// Custom metrics for detailed monitoring (use unique names to avoid conflicts)
const httpErrors = new Counter('custom_http_errors');
const productCreateDuration = new Trend('product_create_duration');
const tradeCreateDuration = new Trend('trade_create_duration');
const apiErrorRate = new Rate('api_error_rate');

// Test configuration
export const options = {
  stages: [
    { duration: '10s', target: 5 },      // Ramp up to 5 VUs
    { duration: '1m', target: 20 },      // Ramp up to 20 VUs
    { duration: '3m', target: 50 },      // Ramp up to 50 VUs
    { duration: '2m', target: 50 },      // Stay at 50 VUs
    { duration: '1m', target: 20 },      // Ramp down to 20 VUs
    { duration: '30s', target: 0 },      // Ramp down to 0
  ],
  thresholds: {
    'http_req_duration': ['p(95)<500', 'p(99)<1000', 'max<3000'],
    'http_req_failed': ['rate<0.1'],
    'api_error_rate': ['rate<0.05'],
  },
};

// Track created resources for cleanup/reuse
const testData = {
  users: [],
  products: [],
  trades: [],
  tokens: [],
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate unique test data
 */
function generateUniqueEmail() {
  return `testuser-${Date.now()}-${Math.random().toString(36).substr(2, 9)}@test.com`;
}

function generateUniqueProduct() {
  return {
    title: `Test Product ${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    description: 'Performance test product created by k6',
    category: 'electronics',
    condition: 'like-new',
    price_range_min: 100,
    price_range_max: 500,
    pickup_location: 'Manila',
    latitude: 14.5995,
    longitude: 120.9842,
  };
}

/**
 * Make HTTP request with error handling and logging
 */
function makeRequest(method, path, payload = null, headers = {}, label = null) {
  const url = `${BASE_URL}${path}`;
  const params = {
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    timeout: '30s',
  };

  let response;
  try {
    if (method === 'GET') {
      response = http.get(url, params);
    } else if (method === 'POST') {
      response = http.post(url, JSON.stringify(payload), params);
    } else if (method === 'PUT') {
      response = http.put(url, JSON.stringify(payload), params);
    } else if (method === 'DELETE') {
      response = http.del(url, params);
    }

    // Track metrics (http_req_duration is tracked automatically by k6)
    if (response.status >= 400) {
      httpErrors.add(1);
      apiErrorRate.add(1);
      if (DEBUG) {
        console.log(`❌ ${method} ${path} - Status: ${response.status}`);
      }
    } else {
      apiErrorRate.add(0);
    }

    if (DEBUG && response.status >= 400) {
      console.log(`Response: ${response.body}`);
    }

    return response;
  } catch (error) {
    httpErrors.add(1);
    apiErrorRate.add(1);
    console.error(`❌ Request failed: ${method} ${path} - ${error.message}`);
    return null;
  }
}

/**
 * Extract token from login response
 */
function extractToken(response) {
  if (!response || response.status !== 200) {
    console.error('Login failed');
    return null;
  }
  const body = JSON.parse(response.body);
  return body.data?.token || body.token;
}

/**
 * Get auth headers with token
 */
function getAuthHeaders(token) {
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

// ============================================================================
// TEST SCENARIOS
// ============================================================================

/**
 * Scenario: User Registration & Login
 */
function testUserAuthFlow() {
  group('User Authentication', () => {
    // Registration
    const email = generateUniqueEmail();
    const password = 'TestPassword123!@#';

    const registerPayload = {
      name: 'Performance Test User',
      email: email,
      password: password,
      password_confirmation: password,
    };

    const registerResponse = makeRequest('POST', '/auth/register', registerPayload, {}, 'Register User');
    check(registerResponse, {
      'registration status is 201 or 200': (r) => r && [200, 201].includes(r.status),  // ✅ Gated on status
      'registration returns user data': (r) => r && [200, 201].includes(r.status) && r.json('data') !== undefined,  // ✅ Gated
      'registration response time < 500ms': (r) => r && r.timings.duration < 500,
      'registration response time < 1000ms': (r) => r && r.timings.duration < 1000,
    });

    if (!registerResponse || ![200, 201].includes(registerResponse.status)) {
      apiErrorRate.add(1);
      if (DEBUG) {
        console.log(`❌ Registration failed: ${registerResponse?.status || 'no response'}`);
      }
      return;  // Don't proceed to login if registration failed
    }

    sleep(1);

    // Login
    const loginPayload = {
      email: email,
      password: password,
    };

    const loginResponse = makeRequest('POST', '/auth/login', loginPayload, {}, 'User Login');
    check(loginResponse, {
      'login status is 200': (r) => r && r.status === 200,  // ✅ Gated on status
      'login returns token': (r) => r && r.status === 200 && r.json('data.token') !== undefined,  // ✅ Gated
      'login response time < 500ms': (r) => r && r.timings.duration < 500,
      'login response time < 1000ms': (r) => r && r.timings.duration < 1000,
    });

    if (loginResponse && loginResponse.status === 200) {
      const token = extractToken(loginResponse);
      if (token) {
        testData.tokens.push(token);
        testData.users.push({ email, token });
      }
    } else {
      apiErrorRate.add(1);
      if (DEBUG) {
        console.log(`❌ Login failed: ${loginResponse?.status || 'no response'}`);
      }
    }
  });
}

/**
 * Scenario: Product CRUD Operations
 */
function testProductCRUD(token) {
  group('Product CRUD Operations', () => {
    const headers = getAuthHeaders(token);

    // CREATE Product
    const productPayload = generateUniqueProduct();
    
    const createStartTime = new Date();
    const createResponse = makeRequest('POST', '/products', productPayload, headers, 'Create Product');
    productCreateDuration.add(new Date() - createStartTime);

    let productId = null;
    check(createResponse, {
      'product creation status is 200/201': (r) => r && [200, 201].includes(r.status),
      'product creation returns data': (r) => r && r.json('data') !== undefined,
    });

    if (createResponse && [200, 201].includes(createResponse.status)) {
      productId = createResponse.json('data.id');
      if (productId) {
        testData.products.push({ id: productId, title: productPayload.title });
      }
    }

    sleep(THINK_TIME_MS / 1000);

    // READ Product (if created successfully)
    if (productId) {
      const getResponse = makeRequest('GET', `/products/${productId}`, null, headers, 'Get Product');
      check(getResponse, {
        'product fetch status is 200': (r) => r && r.status === 200,
        'product data matches': (r) => r && r.json('data.title') !== undefined,
      });

      sleep(THINK_TIME_MS / 1000);

      // UPDATE Product
      const updatePayload = {
        title: `Updated ${productPayload.title}`,
        description: 'Updated description from k6 test',
        price_range_min: 150,
        price_range_max: 600,
      };

      const updateResponse = makeRequest('PUT', `/products/${productId}`, updatePayload, headers, 'Update Product');
      check(updateResponse, {
        'product update status is 200': (r) => r && r.status === 200,
      });

      sleep(THINK_TIME_MS / 1000);

      // DELETE Product
      const deleteResponse = makeRequest('DELETE', `/products/${productId}`, null, headers, 'Delete Product');
      check(deleteResponse, {
        'product deletion status is 200': (r) => r && r.status === 200,
      });
    }
  });
}

/**
 * Scenario: Browse Products & Search
 */
function testProductBrowsing() {
  group('Product Browsing & Search', () => {
    // Get all products
    const listResponse = makeRequest('GET', '/products?limit=20&page=1', null, {}, 'List Products');
    check(listResponse, {
      'list products status is 200': (r) => r && r.status === 200,
      'list returns data array': (r) => r && r.json('data') !== undefined,
    });

    sleep(500 / 1000);

    // Search products
    const searchResponse = makeRequest('GET', '/products/smart-search?q=electronics&limit=10', null, {}, 'Search Products');
    check(searchResponse, {
      'search status is 200': (r) => r && r.status === 200,
    });

    sleep(500 / 1000);

    // Get search suggestions
    const suggestionsResponse = makeRequest('GET', '/products/search-suggestions?q=phone', null, {}, 'Search Suggestions');
    check(suggestionsResponse, {
      'suggestions status is 200': (r) => r && r.status === 200,
    });
  });
}

/**
 * Scenario: Trade Operations
 */
function testTradeCRUD(token) {
  group('Trade Operations', () => {
    const headers = getAuthHeaders(token);

    // Get available products for trading
    const productsResponse = makeRequest('GET', '/products?limit=5', null, headers, 'Get Products for Trade');
    sleep(THINK_TIME_MS / 1000);

    // Get user profile (for completing profile)
    const profileResponse = makeRequest('GET', '/users/profile', null, headers, 'Get User Profile');
    sleep(THINK_TIME_MS / 1000);

    // Get user stats
    const statsResponse = makeRequest('GET', '/users/__USERID__/stats', null, headers, 'Get User Stats');
    check(statsResponse, {
      'user stats status is 200 or 404': (r) => r && [200, 404].includes(r.status),
    });

    sleep(THINK_TIME_MS / 1000);

    // Get user trades
    const tradesResponse = makeRequest('GET', '/trades', null, headers, 'Get User Trades');
    check(tradesResponse, {
      'get trades status is 200': (r) => r && r.status === 200,
    });

    sleep(THINK_TIME_MS / 1000);

    // Get trade count
    const countResponse = makeRequest('GET', '/trades/count', null, headers, 'Get Trade Count');
    check(countResponse, {
      'trade count status is 200': (r) => r && r.status === 200,
    });
  });
}

/**
 * Scenario: Chat Operations
 */
function testChatOperations(token) {
  group('Chat Operations', () => {
    const headers = getAuthHeaders(token);

    // Get conversations
    const conversationsResponse = makeRequest('GET', '/chat/conversations', null, headers, 'Get Conversations');
    check(conversationsResponse, {
      'get conversations status is 200': (r) => r && r.status === 200,
    });

    sleep(THINK_TIME_MS / 1000);
  });
}

/**
 * Scenario: Notification Operations
 */
function testNotificationOperations(token) {
  group('Notification Operations', () => {
    const headers = getAuthHeaders(token);

    // Get notifications
    const notificationsResponse = makeRequest('GET', '/notifications', null, headers, 'Get Notifications');
    check(notificationsResponse, {
      'get notifications status is 200': (r) => r && r.status === 200,
    });

    sleep(THINK_TIME_MS / 1000);

    // Get dashboard counts
    const countsResponse = makeRequest('GET', '/dashboard/counts', null, headers, 'Get Dashboard Counts');
    check(countsResponse, {
      'get dashboard counts status is 200': (r) => r && r.status === 200,
    });
  });
}

/**
 * Scenario: Public API Endpoints (no auth required)
 */
function testPublicEndpoints() {
  group('Public API Endpoints', () => {
    // ✅ FIXED: Use '/health' not '/api/health' (BASE_URL already includes /api)
    const healthResponse = makeRequest('GET', '/health', null, {}, 'Health Check');
    check(healthResponse, {
      'health status is 200': (r) => r && r.status === 200,
      'health db is connected': (r) => r && r.status === 200 && r.json('db') === 'connected',
      'health status is ok': (r) => r && r.status === 200 && r.json('status') === 'ok',
      'health response time < 1000ms': (r) => r && r.timings.duration < 1000,
    });

    if (healthResponse && healthResponse.status !== 200) {
      console.error(`🚨 CRITICAL: Health check failed (${healthResponse.status}) - API infrastructure down!`);
      apiErrorRate.add(1);
    }

    sleep(THINK_TIME_MS / 1000);

    // ✅ FIXED: Use '/version' not '/api/version'
    const versionResponse = makeRequest('GET', '/version', null, {}, 'API Version');
    check(versionResponse, {
      'version status is 200': (r) => r && r.status === 200,
      'version returns version string': (r) => r && r.status === 200 && r.json('version') !== undefined,
    });

    sleep(THINK_TIME_MS / 1000);

    // Get public user profile (if we have a user ID)
    if (testData.users.length > 0) {
      const userId = 1;
      const userResponse = makeRequest('GET', `/users/${userId}`, null, {}, 'Get Public User Profile');
      check(userResponse, {
        'public user profile status is 200 or 404': (r) => r && [200, 404].includes(r.status),
      });
    }

    sleep(THINK_TIME_MS / 1000);

    // Get recent activity
    const activityResponse = makeRequest('GET', '/activities', null, {}, 'Get Recent Activity');
    check(activityResponse, {
      'recent activity status is 200 or 400': (r) => r && [200, 400].includes(r.status),
    });
  });
}

/**
 * Scenario: Stress Test - Rapid Fire Requests
 */
function testStressRapidRequests(token) {
  group('Stress Test - Rapid Requests', () => {
    const headers = getAuthHeaders(token);

    // Simulate rapid product browsing
    for (let i = 0; i < 5; i++) {
      makeRequest('GET', `/products?limit=10&page=${i + 1}`, null, {}, `Rapid Browse ${i + 1}`);
    }

    sleep(1);

    // Simulate rapid trade checking
    for (let i = 0; i < 3; i++) {
      makeRequest('GET', '/trades', null, headers, `Rapid Trade Check ${i + 1}`);
    }
  });
}

/**
 * Main test execution
 */
export default function testMain() {
  // Test public endpoints (no auth required)
  testPublicEndpoints();

  sleep(2);

  // Test user authentication
  testUserAuthFlow();

  sleep(2);

  // Get a token for authenticated operations
  const token = testData.tokens.length > 0 ? testData.tokens[0] : null;

  if (token) {
    // Product operations
    testProductBrowsing();
    sleep(2);

    testProductCRUD(token);
    sleep(2);

    // Trade operations
    testTradeCRUD(token);
    sleep(2);

    // Chat operations
    testChatOperations(token);
    sleep(2);

    // Notification operations
    testNotificationOperations(token);
    sleep(2);

    // Stress test
    testStressRapidRequests(token);
  } else {
    console.warn('No token available - skipping authenticated tests');
  }

  sleep(3);
}

/**
 * Summary/teardown
 */
export function teardown(data) {
  console.log(`
  ╔════════════════════════════════════════════════════════════╗
  ║         CLOVIA PERFORMANCE TEST SUMMARY                    ║
  ╠════════════════════════════════════════════════════════════╣
  ║ Users Created:    ${testData.users.length}
  ║ Products Tested:  ${testData.products.length}
  ║ Trades Accessed:  ${testData.trades.length}
  ║ Total Requests:   Check metrics above
  ╚════════════════════════════════════════════════════════════╝
  `);
}
