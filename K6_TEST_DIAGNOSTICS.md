# K6 Test Failure Diagnosis

## Test Results Analysis

```
❌ FAILURES OBSERVED:
- api_error_rate: 85.71% (should be < 5%)
- http_req_duration p95: 2.79s (should be < 500ms)
- http_req_failed: 80% (should be < 10%)
- No tokens generated → Login endpoint failing
- Health checks: 0% pass in k6, but works manually

✅ PARTIALLY WORKING:
- Registration: status passes, but response time > 500ms
- Login: triggered but 0% token generation (endpoint returning non-200)
- Health: Manual curl returns 200, k6 reports 0%
```

---

## Root Cause Analysis

### Issue 1: Response Time Slowing Down (576ms avg vs 250ms target)

**Possible causes:**
1. ❓ Connection pool change not applied
2. ❓ Backend not restarted after database.go changes
3. ❓ MySQL connection limit preventing fast connections
4. ❓ Slow queries (N+1 problem in registration/login)

**Check:**
```bash
# 1. Verify Go process started AFTER your changes
Get-Process go | Select-Object StartTime

# 2. Check if process was running during test
# If StartTime is BEFORE test time, backend wasn't restarted
```

### Issue 2: Login Endpoint Failing (0% token generation)

**Symptoms:**
- `check(loginResponse, { 'login status is 200': (r) => r && r.status === 200 })` shows 0% pass
- `"login returns token"` check fails
- "No token available" warnings in k6 output

**Possible causes:**
1. Login endpoint returning non-200 (likely 400 or 401)
2. Email/password mismatch (registration uses "password_confirmation" but login uses "password")
3. User not verified after registration  
4. Token extraction fails (wrong field name)

### Issue 3: Health Check 0% Pass in K6 (But Manual Works)

**Manual test works:**
```
StatusCode: 200
Content: {"db":"connected","status":"ok",...}
```

**K6 reports 0/1265 pass** on same endpoint

**Possible causes:**
1. K6 is calling different endpoint path (check BASE_URL)
2. Race condition: health check fails under concurrent load
3. DB connectivity issue when DB connection pool is exhausted
4. JSON parsing issue in k6 checks

---

## Step-by-Step Diagnosis

### 1. Verify Backend was Restarted with New Connection Pool

```powershell
# Check backend process start time
# Must be AFTER the database.go changes were made
Get-Process -Name go | Select-Object Id, StartTime

# Expected: StartTime should be recent (within last few minutes)
# If it's from hours ago, backend wasn't restarted!
```

**If old:** Restart backend
```powershell
# Stop old process
Stop-Process -Name go -Force

# Wait 2 seconds
Start-Sleep -Seconds 2

# Start new backend
cd c:\xampp\htdocs\Clovia
go run main.go

# Check for log: "Database connection pool configured: maxOpenConns=100"
```

### 2. Verify Connection Pool is Actually 100

Check backend logs when it starts:

```
Database connection pool configured: maxOpenConns=100 maxIdleConns=20 (supports 50+ concurrent VUs)
```

If you see:
```
Database connection pool configured: maxOpenConns=10 maxIdleConns=5
```

→ Old code is still running (restart backend)

### 3. Test Login Endpoint Manually

```powershell
$registerPayload = @{
    name = "Test$(Get-Random)"
    email = "testuser$(Get-Random)@example.com"
    password = "TestPassword123!@#"
    phone = "09123456789"
} | ConvertTo-Json

# Register
$reg = Invoke-WebRequest -Uri "http://localhost:4000/api/auth/register" `
    -Method POST -ContentType "application/json" -Body $registerPayload -UseBasicParsing
Write-Host "Register Status: $($reg.StatusCode)"

# Extract email from response
$regData = $reg.Content | ConvertFrom-Json
$email = $regData.data.user.email
Write-Host "Email: $email"

# Try login
$loginPayload = @{
    email = $email
    password = "TestPassword123!@#"
} | ConvertTo-Json

$login = Invoke-WebRequest -Uri "http://localhost:4000/api/auth/login" `
    -Method POST -ContentType "application/json" -Body $loginPayload -UseBasicParsing
Write-Host "Login Status: $($login.StatusCode)"
Write-Host "Login Response: $($login.Content | ConvertFrom-Json | ConvertTo-Json)"
```

**Check what status code login returns:**
- 200 = OK
- 400 = Bad request (missing fields)
- 401 = Invalid credentials or not verified
- 500 = Server error

### 4. Check If K6 is Using Correct Endpoint

In k6 output, look for:
```
'GET /api/health'  or  'GET /health'  or  'GET http://localhost:4000/api/health'
```

**Fix if wrong:**
```bash
# In clovia-performance-test.js, check BASE_URL:
const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000/api';

# If BASE_URL is 'http://localhost:4000/api', then:
# - Health endpoint should be: BASE_URL + '/health' = 'http://localhost:4000/api/health'
# Check that your makeRequest() calls use correct paths
```

### 5. Check for MySQL Connection Limit

```bash
# Connect to MySQL
mysql -h 127.0.0.1 -u root --protocol=TCP

# Check current connection limit:
SHOW VARIABLES LIKE 'max_connections';

# Example output:
# max_connections | 151

# If max_connections < 100, increase it:
SET GLOBAL max_connections = 300;

# Save it in my.ini or my.cnf:
[mysqld]
max_connections = 300
```

### 6. Monitor Database During k6 Test

While k6 is running:

```bash
# Terminal 1: Check active MySQL connections
mysql -h 127.0.0.1 -u root --protocol=TCP
> SHOW PROCESSLIST;  # Shows which queries are running
> SELECT COUNT(*) FROM INFORMATION_SCHEMA.PROCESSLIST WHERE COMMAND != 'Sleep';  # Count active
```

**Expected:** <50 active queries
**Problem:** >100 queries = connection pool still too small OR queries are slow

### 7. Run Slow Query Log

```bash
mysql -h 127.0.0.1 -u root --protocol=TCP

# Enable slow query log (queries > 0.1 seconds)
SET SESSION long_query_time = 0.1;

# While k6 runs, check slow queries:
SELECT * FROM mysql.slow_log;  # or check /var/log/mysql/slow.log
```

**Look for:**
- Queries taking > 1 second
- Queries missing indexes
- N+1 pattern (same query repeated many times)

---

## Quick Fix Checklist

- [ ] **Kill old backend process** - Stop-Process -Name go -Force
- [ ] **Restart backend** - go run main.go
- [ ] **Verify logs show** - "maxOpenConns=100"
- [ ] **Test health manually** - curl http://localhost:4000/api/health (should be 200)
- [ ] **Test registration/login manually** - Verify both return proper status codes
- [ ] **Check MySQL connection limit** - SHOW VARIABLES LIKE 'max_connections'
- [ ] **Run baseline test** - k6 run -u 1 -d 1m clovia-performance-test.js
- [ ] **Verify baseline passes** - p95 < 500ms, error rate 0%
- [ ] **Run full test** - k6 run clovia-performance-test.js

---

## Expected Results After Fixes

```
✅ HEALTHY:
- api_error_rate: < 1% (was 85.71%)
- http_req_duration p95: 300-500ms (was 2.79s)
- http_req_failed: < 1% (was 80%)
- Tokens generated: 100% (was 0%)
- Health checks: 100% pass

- avg response time: 200-300ms
- p95 response time: 300-500ms
- Max response time: < 2000ms
- Virtual users: 50 concurrent
- Iterations: ~1000 complete
```

---

## Debug Commands

```bash
# Terminal 1: Restart backend with verbose logging
cd c:\xampp\htdocs\Clovia
go run main.go 2>&1 | Tee-Object -FilePath backend.log

# Terminal 2: Run quick k6 test (just 5 users, 30 seconds)
DEBUG=true k6 run -u 5 -d 30s clovia-performance-test.js

# Terminal 3: Monitor database connections
# Run every 2 seconds during test:
while ($true) { 
    mysql -h 127.0.0.1 -u root --protocol=TCP -e "SELECT COUNT(*) AS 'Active Connections' FROM INFORMATION_SCHEMA.PROCESSLIST WHERE COMMAND != 'Sleep';"
    Start-Sleep -Seconds 2
}
```

