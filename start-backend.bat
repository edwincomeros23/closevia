@echo off
echo 🚀 Starting Clovia Backend...
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Check if dependencies are installed
if not exist "node_modules" (
    echo 📦 Installing dependencies...
    npm install
    if %errorlevel% neq 0 (
        echo ❌ Failed to install dependencies
        pause
        exit /b 1
    )
)

REM Check if .env file exists
if not exist ".env" (
    echo ⚠️  .env file not found. Creating from template...
    copy "env.backend" ".env"
    echo ✅ Please edit .env file with your database credentials
    echo.
)

echo 🌐 Starting backend server...
echo 📊 Server will be available at: http://localhost:4000
echo 🔐 API endpoints: http://localhost:4000/api
echo.
echo Press Ctrl+C to stop the server
echo.

npm run dev
