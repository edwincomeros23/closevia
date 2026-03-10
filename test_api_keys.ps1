# Test Gemini API Key
Write-Host "Testing Gemini API..." -ForegroundColor Cyan
Write-Host "Note: Set GEMINI_API_KEY environment variable before running this script" -ForegroundColor Yellow

$geminiKey = $env:GEMINI_API_KEY
if (-not $geminiKey) {
    Write-Host "❌ GEMINI_API_KEY environment variable not set" -ForegroundColor Red
    exit 1
}
$geminiUrl = "https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=$geminiKey"

$geminiPayload = @{
    contents = @(
        @{
            parts = @(
                @{ text = "Say hello" }
            )
        }
    )
} | ConvertTo-Json -Depth 10

try {
    $geminiResponse = Invoke-WebRequest -Uri $geminiUrl -Method POST -ContentType "application/json" -Body $geminiPayload -UseBasicParsing
    Write-Host "✅ Gemini API: SUCCESS (Status $($geminiResponse.StatusCode))" -ForegroundColor Green
    Write-Host "Response: $($geminiResponse.Content | ConvertFrom-Json | Select-Object -ExpandProperty candidates | Select-Object -First 1)" -ForegroundColor Green
} catch {
    Write-Host "❌ Gemini API: FAILED" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Status Code: $($_.Exception.Response.StatusCode)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $errorStream = $_.Exception.Response.GetResponseStream()
        $errorReader = New-Object System.IO.StreamReader($errorStream)
        $errorBody = $errorReader.ReadToEnd()
        Write-Host "Error Body: $errorBody" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Testing Groq API..." -ForegroundColor Cyan
Write-Host "Note: Set GROQ_API_KEY environment variable before running this script" -ForegroundColor Yellow

$groqKey = $env:GROQ_API_KEY
if (-not $groqKey) {
    Write-Host "❌ GROQ_API_KEY environment variable not set" -ForegroundColor Red
    exit 1
}
$groqUrl = "https://api.groq.com/openai/v1/chat/completions"

$groqPayload = @{
    model = "meta-llama/llama-4-maverick-17b-128e-instruct"
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
    $groqResponse = Invoke-WebRequest -Uri $groqUrl -Method POST -ContentType "application/json" -Body $groqPayload -Headers @{Authorization="Bearer $groqKey"} -UseBasicParsing
    Write-Host "✅ Groq API: SUCCESS (Status $($groqResponse.StatusCode))" -ForegroundColor Green
    Write-Host "Response: $($groqResponse.Content | ConvertFrom-Json | Select-Object -ExpandProperty choices | Select-Object -First 1)" -ForegroundColor Green
} catch {
    Write-Host "❌ Groq API: FAILED" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Status Code: $($_.Exception.Response.StatusCode)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $errorStream = $_.Exception.Response.GetResponseStream()
        $errorReader = New-Object System.IO.StreamReader($errorStream)
        $errorBody = $errorReader.ReadToEnd()
        Write-Host "Error Body: $errorBody" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Done!" -ForegroundColor Cyan
