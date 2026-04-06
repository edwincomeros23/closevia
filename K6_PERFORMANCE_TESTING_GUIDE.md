# K6 Performance Testing Guide for Clovia Trading Platform

## Overview

This guide explains how to run comprehensive performance tests on your Clovia API using k6, a modern load testing tool. The included test script (`clovia-performance-test.js`) simulates realistic user behavior including CRUD operations, authentication, and concurrent user loads.

## Prerequisites

### Install k6

**Windows:**
```powershell
# Using Chocolatey
choco install k6

# Or using Windows Subsystem for Linux (WSL)
sudo apt-get update
sudo apt-get install k6
```

**macOS:**
```bash
brew install k6
```

**Linux:**
```bash
sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6-stable.list
sudo apt-get update
sudo apt-get install k6
```

### Verify Installation

```powershell
& "C:\Program Files\k6\k6.exe" version
# or: k6 version (if in PATH)
```

## Running Performance Tests

### Quick Start (Basic Load Test)

```bash
# Start your API backend first (ensure it's running on localhost:4000)
go run main.go

# In another terminal, run the test
k6 run clovia-performance-test.js
```

### Ramp-Up Test (Default 7 Minutes)

```bash
# Gradually increases virtual users: 5 → 20 → 50 → stable → ramp down
k6 run clovia-performance-test.js
```

**Timeline:**
- 0-10 seconds: Ramp up to 5 users
- 10 seconds-1 min 10 sec: Ramp up to 20 users
- 1 min 10 sec-4 min 10 sec: Ramp up to 50 users
- 4 min 10 sec-6 min 10 sec: Maintain 50 users  
- 6 min 10 sec-7 min 10 sec: Ramp down to 20 users
- 7 min 10 sec-7 min 40 sec: Ramp down to 0

### Custom Configuration

```bash
# Adjust number of Virtual Users and duration
k6 run -u 100 -d 5m clovia-performance-test.js

# Parameters:
# -u NUM    = number of Virtual Users (default: 5 → 50)
# -d TIME   = test duration (e.g., 5m, 10s, 1h)
```

### Advanced Options

```bash
# High-concurrency test
k6 run -u 500 -d 10m --vus=500 clovia-performance-test.js

# With custom API endpoint
BASE_URL=http://production.api.com:4000/api k6 run clovia-performance-test.js

# With think time between operations
THINK_TIME=1000 k6 run clovia-performance-test.js

# Debug mode (verbose logging)
DEBUG=true k6 run -u 10 -d 30s clovia-performance-test.js

# Save results to JSON for analysis
k6 run --out json=results.json clovia-performance-test.js
```

## Understanding Performance Metrics

### Key Metrics Reported

#### 1. **Response Time (Duration)**
```
http_req_duration: 
  avg=150ms, p(50)=120ms, p(90)=250ms, p(95)=400ms, p(99)=800ms, max=2500ms
```

**Interpretation:**
- 🟢 Good: p95 < 500ms, p99 < 1000ms
- 🟡 Acceptable: p95 < 1000ms, p99 < 2000ms
- 🔴 Concerning: p95 > 1000ms or p99 > 2000ms

**What they mean:**
- `avg` = Average response time
- `p(50)` = Median - half of responses faster, half slower
- `p(95)` = 95th percentile - 95% of requests faster than this
- `p(99)` = 99th percentile - 99% of requests faster than this
- `max` = Longest single response time

#### 2. **Request Rate**
```
http_reqs......: 15432  2574.90/sec
```

**Interpretation:**
- Shows total requests completed and requests per second
- Good indicator of API throughput
- Should increase with more concurrent users

#### 3. **Error Rate**
```
http_req_failed: 0.00%  ✓
api_error_rate..: 0.1%  (with threshold check)
```

**Thresholds in script:**
- ✓ Pass: `http_req_failed < 10%`
- ✓ Pass: `api_error_rate < 5%`

#### 4. **CRUD Operation Specific Metrics**
```
product_create_duration: avg=250ms, p(95)=600ms, max=1200ms
trade_create_duration: avg=300ms, p(95)=700ms, max=1500ms
```

#### 5. **Data Received/Sent**
```
data_received: 2.5 MB
data_sent: 1.2 MB
```

## Sample Test Output Analysis

```
     data_received..................: 2.5 MB   435 kB/sec
     data_sent......................: 1.2 MB   210 kB/sec
     http_req_blocked...............: avg=1ms    p(95)=2ms    p(99)=3ms    max=10ms
     http_req_connecting............: avg=0ms    p(95)=0ms    p(99)=1ms    max=5ms
     http_req_duration..............: avg=147ms  p(95)=298ms   p(99)=543ms   max=1234ms  
     
     Checks Passed:
     ✓ 14850 checks passed
     ✗ 150 checks failed (1%)
     
     Virtual Users:
     ✓ 50 VUs running
     ✓ 2 VUs initializing
```

### What This Means

1. **Response Times ✓ GOOD**
   - Avg 147ms is excellent
   - P95 298ms is within target
   - P99 543ms is acceptable
   - Max 1234ms is reasonable

2. **Throughput**
   - 2.5 MB downloaded = reasonable payload sizes
   - 1.2 MB uploaded = reasonable request bodies

3. **Check Pass Rate (98.2%)**
   - Most operations succeeded
   - 150 failures out of 15,000 checks
   - Need to investigate specific failures

4. **Concurrent Load**
   - Successfully handling 50 concurrent users
   - 2 users still initializing = normal

## Performance Benchmarks by Test Stage

### Stage 1-2: Ramp Up (5→20 users)
```
Expected behavior:
- Response time: relatively flat
- Error rate: 0%
- CPU/Memory: low increase
Problem indicators:
- Response time doubles = potential bottleneck
- Error rate > 0% = stability issue
```

### Stage 3-4: Load Increase (20→50 users)
```
Expected behavior:
- Response time: slight increase (1-1.5x)
- Throughput: increases proportionally
- Error rate: still 0%
Problem indicators:
- Response time > 3x increase = database issue
- Response time plateaus while VUs increase = resource limit
- Error rate jumps = connection pool exhausted
```

### Stage 5-6: Ramp Down
```
Expected behavior:
- Response time: returns to baseline
- Confirms values improve with fewer users
- Good sign that system recovers
Problem indicators:
- Response time stays high = connection leak
- Memory usage doesn't drop = memory leak
```

## Analyzing CRUD Speed

### Product CRUD Test Results

From the test output:
```
product_create_duration: avg=250ms, p(95)=600ms, max=1200ms
```

**Analysis:**

| Operation | Target | Status | Action |
|-----------|--------|--------|--------|
| Create | < 300ms avg | ✓ Pass at 250ms | Good |
| Create p95 | < 600ms | ✓ Pass at 600ms | Acceptable |
| Create max | < 2000ms | ✓ Pass at 1200ms | OK |

### Trade CRUD Test Results

```
trade_create_duration: avg=300ms, p(95)=700ms, max=1500ms
```

**Analysis:** Slightly slower than product creation (expected - more complex)

### API Endpoint Speed Breakdown

```
GET /products (list):        avg=80ms    ← Fast (cached well)
GET /products/:id (detail):  avg=120ms   ← Good
POST /products (create):     avg=250ms   ← Acceptable
PUT /products/:id (update):  avg=280ms   ← Acceptable
DELETE /products/:id:        avg=150ms   ← Good

GET /trades (list):          avg=200ms   ← Good (might include joins)
POST /trades (create):       avg=300ms   ← Acceptable
GET /chat/conversations:     avg=90ms    ← Fast
GET /notifications:          avg=100ms   ← Fast
```

## Identifying Performance Issues

### Issue: High Response Time at High Concurrency

```
❌ Problem:
p95 response time: 150ms @ 20 VUs → 1500ms @ 50 VUs (10x increase)

Causes:
1. Database query N+1 problem
2. Connection pool exhausted
3. CPU bottleneck
4. Memory pressure/GC pauses

Solutions:
1. Check database indexes (use ANALYZE SLOW QUERIES)
2. Increase connection pool: DB_MAX_CONNECTIONS=100
3. Profile CPU with pprof
4. Check for goroutine leaks: /debug/pprof/goroutine
```

### Issue: Increasing Error Rate at High Concurrency

```
❌ Problem:
Error rate: 0% @ 20 VUs → 5% @ 50 VUs

Causes:
1. Connection pool exhaustion
2. Request timeout
3. Database deadlock
4. Out of memory

Solutions:
1. Set database connection pool: DB_MAX_CONNECTIONS=150
2. Increase request timeout: set higher in k6 params
3. Review database locks: query_time > 5 seconds
4. Monitor system resources during test
```

### Issue: Memory Leak

```
❌ Problem:
Memory usage: 200MB @ start → 800MB @ 20 min → OOM

Causes:
1. Cache not evicting old entries
2. Goroutine leak
3. Database connection leak
4. Message queue filling up

Solutions:
1. Profile memory: go tool pprof http://localhost:6060/debug/pprof/heap
2. Check goroutines: go tool pprof http://localhost:6060/debug/pprof/goroutine
3. Review cache TTLs
4. Add connection limits/cleanup
```

## Tips for Best Results

### 1. Establish Baseline (Single User)
```bash
# Run with 1 user to get baseline
k6 run -u 1 -d 1m clovia-performance-test.js

# Record p95 response time - this is your target
# e.g., if p95=200ms, target at higher load is p95<400-500ms
```

### 2. Test in Controlled Environment
```bash
# Ensure no other heavy processes running
# Check system resource before test
# Monitor backend server during test

# In separate terminal, monitor backend
watch -n 1 'ps aux | grep "go run"'
```

### 3. Run Multiple Times
```bash
# Test results can vary, run 3 times
# Take average of results
k6 run --summary-trend=avg clovia-performance-test.js
```

### 4. Test Specific Endpoints

Modify `clovia-performance-test.js` to focus on problematic endpoints:

```javascript
// Test only product operations extensively
export default function () {
  testProductBrowsing();
  sleep(1);
  testProductCRUD(token);
  sleep(1);
  // Repeat
}
```

### 5. Monitor Backend During Test

**In another terminal:**
```bash
# Monitor CPU/Memory
top

# Monitor network connections
netstat -an | grep ESTABLISHED | wc -l

# Monitor database connections (Go)
curl http://localhost:6061/debug/pprof/goroutine?debug=1 | head -20

# Monitor Go profiling
go tool pprof http://localhost:6061/debug/pprof/profile?seconds=30
```

## Advanced: Profile Your API During Test

### 1. Enable pprof in your Go backend

Add to `main.go`:
```go
import _ "net/http/pprof"

go func() {
  log.Println(http.ListenAndServe("localhost:6061", nil))
}()
```

### 2. Start test and concurrently profile

```bash
# Terminal 1: Start test
k6 run -u 50 -d 5m clovia-performance-test.js

# Terminal 2: Profile CPU
go tool pprof http://localhost:6061/debug/pprof/profile?seconds=30

# Terminal 3: Profile memory
go tool pprof http://localhost:6061/debug/pprof/heap

# Terminal 4: Check goroutines
go tool pprof http://localhost:6061/debug/pprof/goroutine
```

## Expected Performance Targets

### Healthy API Performance

| Metric | Target | Acceptable | Red Flag |
|--------|--------|-----------|----------|
| Avg Response | < 200ms | < 300ms | > 500ms |
| P95 Response | < 400ms | < 700ms | > 1000ms |
| P99 Response | < 800ms | < 1500ms | > 2500ms |
| Error Rate | < 0.1% | < 1% | > 5% |
| Request Rate | > 1000/sec | > 500/sec | < 100/sec |
| Max Memory | Stable | +20% | +50% |

## Real-World Load Test Scenarios

### Scenario 1: Peak Load (Black Friday)
```bash
# Simulate 500 concurrent users for 2 hours
k6 run -u 500 -d 2h clovia-performance-test.js
```

### Scenario 2: Sustained Load (Normal Day)
```bash
# Simulate typical weekday load
k6 run -u 50 -d 8h clovia-performance-test.js
```

### Scenario 3: Stress Test (Breaking Point)
```bash
# Slowly increase until API breaks
k6 run --stage 1m:100 --stage 1m:200 --stage 1m:500 --stage 1m:1000 clovia-performance-test.js
```

### Scenario 4: Spike Test (Sudden Surge)
```bash
# Rapidly increase then hold
stages: [
  { duration: '5s', target: 100 },  // Sudden surge
  { duration: '5m', target: 100 },  // Hold spike
  { duration: '5s', target: 0 }     // Rapid drop
]
```

## JSON Results Export & Analysis

### Export Results
```bash
# Save to JSON file
k6 run --out json=results.json clovia-performance-test.js
```

### Parse Results with jq
```bash
# Get summary stats
jq '.metrics | keys[].name' results.json

# Extract response time data
jq '.samples[] | select(.metric == "http_req_duration") | .value' results.json

# Find errors
jq '.samples[] | select(.metric == "http_req_failed" and .value == 1)' results.json
```

### Import into Grafana
```bash
# Use k6 Cloud for visualization
k6 cloud clovia-performance-test.js
```

## Troubleshooting Common Issues

### Issue: "Connection refused" errors
```
Error: dial tcp: connect: connection refused

Solution:
1. Verify backend is running: go run main.go
2. Check port: lsof -i :4000
3. Update BASE_URL if needed
```

### Issue: "Too many open files"
```
Error: too many open files

Solution:
# Increase ulimit
ulimit -n 10000

# Then retry test
k6 run -u 50 -d 5m clovia-performance-test.js
```

### Issue: Tests complete quickly with many errors
```
Problem: High error rate, test completes too fast

Causes:
1. API not actually running
2. Incorrect BASE_URL
3. Authentication failing
4. Firewall blocking requests

Solutions:
1. Test manually: curl http://localhost:4000/api/health
2. Check BASE_URL: echo $BASE_URL
3. Run with DEBUG=true for detailed logs
```

## Files Included

- `clovia-performance-test.js` - Main performance test script
- This README with comprehensive guide

## Next Steps

1. ✅ Run basic test: `k6 run clovia-performance-test.js`
2. ✅ Review output metrics and compare to benchmarks
3. ✅ Identify performance bottlenecks
4. ✅ Profile backend during test if needed
5. ✅ Fix issues and retest
6. ✅ Establish performance baseline for CI/CD

## References

- [k6 Official Documentation](https://k6.io/docs/)
- [HTTP Performance Testing Best Practices](https://k6.io/docs/testing-guides/load-testing/)
- [Go Profiling](https://golang.org/blog/profiling-go-programs)
- [Database Query Optimization](https://dev.mysql.com/doc/)

---

**Ready to test?** Run: `k6 run clovia-performance-test.js`

