@echo off
echo 🚀 Starting Clovia Backend...
echo.

REM Check if Go is installed
go version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Go is not installed or not in PATH
    echo Please install Go from https://golang.org/
    pause
    exit /b 1
)

REM Check if .env file exists
if not exist ".env" (
    echo ⚠️  .env file not found. Creating from template...
    if exist "env.example" (
        copy "env.example" ".env"
    ) else (
        echo PORT=8080 > .env
        echo DATABASE_URL=postgres://postgres:password@localhost:5432/clovia >> .env
        echo JWT_SECRET=your-secret-key >> .env
    )
    echo ✅ Please edit .env file with your database credentials
    echo.
)

echo 🌐 Starting backend server...
echo 📊 Server will be available at: http://localhost:8080
echo 🔐 API endpoints: http://localhost:8080/api
echo.
echo Press Ctrl+C to stop the server
echo.

go run main.go
