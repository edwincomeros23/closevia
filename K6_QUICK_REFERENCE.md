# K6 Performance Testing - Quick Reference

## Run Performance Tests

```bash
# Ensure backend is running first
go run main.go

# In another terminal, basic test (7 minutes)
k6 run clovia-performance-test.js

# Or with custom settings
k6 run -u 100 -d 5m clovia-performance-test.js    # 100 users, 5 minutes
k6 run -u 500 -d 10m clovia-performance-test.js   # Stress test
k6 run --out json=results.json clovia-performance-test.js  # Save results
```

## Interpret Results

### Response Time Performance (Most Important)

```
http_req_duration..............: avg=150ms  p(95)=400ms   p(99)=800ms   max=1500ms
```

| Metric | Status | Action |
|--------|--------|--------|
| **avg < 200ms** | ✅ Excellent | Perform well at baseline load |
| **avg 200-300ms** | 🟡 Acceptable | OK for most use cases |
| **avg > 500ms** | 🔴 Slow | Investigate database or code |
| **p(95) < 500ms** | ✅ Good | 95% of users experience fast responses |
| **p(95) > 1000ms** | 🔴 Poor | Users on slower connections struggle |
| **p(99) > 2000ms** | 🔴 Problematic | 1% of users have very slow experience |

### Error Rate

```
http_req_failed: 0.5%
```

| Rate | Status | Action |
|------|--------|--------|
| **< 0.1%** | ✅ Excellent | No action needed |
| **0.1-1%** | 🟡 Minor | Monitor for patterns |
| **1-5%** | 🟠 Concerning | Investigate causes |
| **> 5%** | 🔴 Critical | Stop load test, fix issue |

### Throughput

```
http_reqs......: 25000   4166.67/sec
```

| Rate | Status | Notes |
|------|--------|-------|
| **> 1000/sec** | ✅ Good | Solid API throughput |
| **500-1000/sec** | 🟡 OK | Acceptable for most apps |
| **< 500/sec** | 🔴 Low | Check if database is bottleneck |

## Endpoint-Specific Performance

```
product_create_duration: avg=250ms, p(95)=600ms
trade_create_duration: avg=300ms, p(95)=700ms
```

### CRUD Operation Targets

| Operation | Target P95 | Red Flag |
|-----------|-----------|----------|
| GET (list) | < 300ms | > 600ms |
| GET (detail) | < 200ms | > 500ms |
| POST (create) | < 400ms | > 800ms |
| PUT (update) | < 400ms | > 800ms |
| DELETE | < 300ms | > 600ms |

## Quick Diagnostics

### Problem: High Response Time Under Load

```
Response time at 20 users: 150ms
Response time at 50 users: 1000ms  ← 6.7x increase (BAD)
```

**Likely Causes:**
1. ❌ Database N+1 queries
2. ❌ Connection pool exhausted
3. ❌ Missing database indexes
4. ❌ CPU bottleneck

**Fix:**
```bash
# Check slow queries in MySQL
SET SESSION long_query_time = 0.1;  # Log queries > 100ms
SET GLOBAL log_queries_not_using_indexes = ON;

# Then rerun test and check slow query log
```

### Problem: Increasing Error Rate at High Load

```
Error rate at 10 users: 0%
Error rate at 50 users: 2%  ← Increasing errors (BAD)
```

**Likely Causes:**
1. ❌ Database connection pool too small
2. ❌ Request timeout too low
3. ❌ Database deadlock
4. ❌ Memory leak

**Fix:**
```go
// In main.go, increase connection pool
db.SetMaxOpenConns(150)     // Increase from default
db.SetMaxIdleConns(50)
db.SetConnMaxLifetime(time.Hour)
```

### Problem: Memory Usage Keeps Growing

```
Memory at 5 min:  200 MB
Memory at 10 min: 300 MB
Memory at 15 min: 450 MB  ← Growing (BAD - memory leak)
```

**Likely Causes:**
1. ❌ Cache not evicting old data
2. ❌ Goroutine leak
3. ❌ Database prepared statement leak
4. ❌ Message queue filling up

**Fix:**
```bash
# Monitor goroutines during test
curl http://localhost:6061/debug/pprof/goroutine?debug=1 | head -5

# Should be stable, not increasing
```

## Real Metrics Examples

### ✅ HEALTHY API

```
virtual_users..............: 50    ✓
http_reqs......: 18500  3083.33/sec  ✓

http_req_duration..............: avg=165ms  p(95)=320ms   p(99)=580ms   max=1200ms  ✓
http_req_failed: 0%  ✓

api_error_rate: 0.1%  ✓
product_create_duration: avg=230ms
trade_create_duration: avg=280ms
```

**Interpretation:** ✅ Ready for production. Handles 50 concurrent users comfortably.

### 🟡 ACCEPTABLE API

```
virtual_users..............: 50    ✓
http_reqs......: 12000  2000/sec  🟡

http_req_duration..............: avg=400ms  p(95)=800ms   p(99)=1200ms  ✓
http_req_failed: 0.5%  🟡

api_error_rate: 1%  🟡
product_create_duration: avg=350ms
trade_create_duration: avg=420ms
```

**Interpretation:** 🟡 Works but shows stress under 50 concurrent users. Review database queries.

### 🔴 PROBLEMATIC API

```
virtual_users..............: 50    
http_reqs......: 5000   833/sec  🔴

http_req_duration..............: avg=1200ms p(95)=2500ms  p(99)=4000ms  🔴
http_req_failed: 5%  🔴

api_error_rate: 8%  🔴
product_create_duration: avg=1500ms
trade_create_duration: avg=1800ms
```

**Interpretation:** 🔴 API is struggling. Stop load test, fix critical issues before production.

## Performance Baseline Recording

```bash
# Record your baseline after first successful test
echo "Baseline - 50 concurrent users, 7 min test:" > baseline.txt
echo "P95 Response Time: 320ms" >> baseline.txt
echo "P99 Response Time: 580ms" >> baseline.txt
echo "Error Rate: 0%" >> baseline.txt
echo "Max Memory: 350 MB" >> baseline.txt

# After optimization, compare:
echo "After optimization:" >> baseline.txt
echo "P95: 280ms (↓ 12.5%)" >> baseline.txt
```

## Command Cheat Sheet

```bash
# Basic test
k6 run clovia-performance-test.js

# Custom users and duration
k6 run -u 100 -d 10m clovia-performance-test.js

# Stress test (find breaking point)
k6 run -u 1000 -d 5m clovia-performance-test.js

# Save JSON results
k6 run --out json=results.json clovia-performance-test.js

# High verbosity (debug)
k6 run -u 10 -d 30s --verbose clovia-performance-test.js

# Custom think time between requests
THINK_TIME=2000 k6 run clovia-performance-test.js

# Different API endpoint
BASE_URL=http://production:4000/api k6 run clovia-performance-test.js
```

## Test Result Checklist

After running `k6 run clovia-performance-test.js`, verify:

- [ ] Response times reported (avg, p95, p99)
- [ ] No "Connection refused" errors
- [ ] Error rate < 1%
- [ ] P95 response time < 500ms
- [ ] P99 response time < 1000ms
- [ ] Virtual users reached target (50)
- [ ] Total requests > 5000
- [ ] Memory stable (not constantly growing)

## Profile Backend During Test

In separate terminal while k6 is running:

```bash
# View expensive operations
curl http://localhost:6061/debug/pprof/profile?seconds=30 > cpu.prof
go tool pprof cpu.prof

# Check memory usage
curl http://localhost:6061/debug/pprof/heap > mem.prof
go tool pprof mem.prof

# Count goroutines (should be stable, not grow)
curl http://localhost:6061/debug/pprof/goroutine?debug=1 | head -5
```

## Common Performance Issues & Fixes

| Issue | Likely Cause | Quick Fix |
|-------|--------------|-----------|
| Response time increases with load | N+1 queries | Add indexes, use batch queries |
| Errors start at high load | Connection pool too small | Increase `MaxOpenConns` in code |
| Memory keeps growing | Leak | Check goroutines, cache eviction |
| Slow at low concurrency | Code logic, external API | Profile CPU, check external calls |
| Consistent timeouts | Hardware limit | Scale up server, optimize code |

---

**Quick Start:**
```bash
k6 run clovia-performance-test.js
# Wait 7 minutes, review metrics, compare to tables above
```

For detailed guide: See `K6_PERFORMANCE_TESTING_GUIDE.md`

