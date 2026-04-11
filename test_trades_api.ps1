# Test script to check the trades API endpoint
$baseUrl = "http://127.0.0.1:4000"

# First, check if backend is running
try {
    $healthCheck = Invoke-WebRequest -Uri "$baseUrl/health" -ErrorAction SilentlyContinue -TimeoutSec 5
    Write-Host "✓ Backend is running"
} catch {
    Write-Host "✗ Backend is NOT running. Error: $_"
    exit 1
}

# Try to login (or use a test token if available)
Write-Host "Attempting to test trades API endpoint..."

try {
    # Try without auth first
    $uri = "$baseUrl/api/trades?direction=outgoing`&status=pending`&limit=100"
    $response = Invoke-WebRequest -Uri $uri -ErrorAction Stop
    Write-Host "✓ API Response: $($response.StatusCode)"
    Write-Host "Response Content: $($response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 2)"
} catch {
    Write-Host "✗ API Error: $($_.Exception.Message)"
    $errorResponse = $_.Exception.Response
    if ($errorResponse) {
        $reader = New-Object System.IO.StreamReader($errorResponse.GetResponseStream())
        $errorBody = $reader.ReadToEnd()
        Write-Host "Error Body: $errorBody"
    }
}
