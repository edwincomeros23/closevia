# Test Groq with different models
Write-Host "Testing Groq API with different models..." -ForegroundColor Cyan
Write-Host "Note: Set GROQ_API_KEY environment variable before running this script" -ForegroundColor Yellow

$groqKey = $env:GROQ_API_KEY
if (-not $groqKey) {
    Write-Host "❌ GROQ_API_KEY environment variable not set" -ForegroundColor Red
    exit 1
}
$groqUrl = "https://api.groq.com/openai/v1/chat/completions"

$models = @(
    "meta-llama/llama-4-maverick-17b-128e-instruct",
    "llama-3.3-70b-versatile",
    "llama-3.1-70b-versatile",
    "llama-3.1-8b-instant"
)

foreach ($model in $models) {
    Write-Host "Testing model: $model" -ForegroundColor Yellow
    
    $groqPayload = @{
        model = $model
        messages = @(
            @{
                role = "user"
                content = "Say hello"
            }
        )
        temperature = 0.2
        max_tokens = 100
    } | ConvertTo-Json -Depth 10

    try {
        $groqResponse = Invoke-WebRequest -Uri $groqUrl -Method POST -ContentType "application/json" -Body $groqPayload -Headers @{Authorization="Bearer $groqKey"} -UseBasicParsing -TimeoutSec 10
        Write-Host "  ✅ SUCCESS (Status $($groqResponse.StatusCode))" -ForegroundColor Green
    } catch {
        $errorMsg = $_.Exception.Message
        if ($_.Exception.Response) {
            $statusCode = $_.Exception.Response.StatusCode
            if ($statusCode -eq "NotFound") {
                Write-Host "  ❌ NOT FOUND (404)" -ForegroundColor Red
            } else {
                Write-Host "  ❌ FAILED (Status: $statusCode)" -ForegroundColor Red
            }
        } else {
            Write-Host "  ❌ FAILED: $errorMsg" -ForegroundColor Red
        }
    }
}

Write-Host ""
Write-Host "Done!" -ForegroundColor Cyan
