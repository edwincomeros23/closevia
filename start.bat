@echo off
echo Starting Clovia Application...
echo.

echo Starting Backend Server...
start "Clovia Backend" cmd /k "go run main.go"

echo Waiting for backend to start...
timeout /t 3 /nobreak > nul

echo Starting Frontend...
start "Clovia Frontend" cmd /k "cd client && npm run dev"

echo.
echo Clovia is starting up!
echo Backend: http://localhost:4000
echo Frontend: http://localhost:5173
echo.
echo Press any key to close this window...
pause > nul
