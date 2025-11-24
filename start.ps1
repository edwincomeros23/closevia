Write-Host "Starting Clovia Application..." -ForegroundColor Green
Write-Host ""

Write-Host "Starting Backend Server..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "go run main.go" -WindowStyle Normal

Write-Host "Waiting for backend to start..." -ForegroundColor Cyan
Start-Sleep -Seconds 3

Write-Host "Starting Frontend..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd client; npm run dev" -WindowStyle Normal

Write-Host ""
Write-Host "Clovia is starting up!" -ForegroundColor Green
Write-Host "Backend: http://localhost:4000" -ForegroundColor Cyan
Write-Host "Frontend: http://localhost:5173" -ForegroundColor Cyan
Write-Host ""
Write-Host "Press any key to close this window..." -ForegroundColor Yellow
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
