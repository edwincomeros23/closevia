@echo off
REM Performance Fix Setup Script for Windows
REM Applies database indexes and optimizations

setlocal enabledelayedexpansion

echo.
echo ==================================================
echo Clovia Performance Optimization Setup
echo ==================================================
echo.

REM Check if MySQL is available
mysql --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] MySQL client not found. Please add MySQL to your PATH.
    echo.
    echo To fix:
    echo 1. Find your MySQL installation (usually C:\Program Files\MySQL\MySQL Server X.X\bin)
    echo 2. Add it to System Environment Variables PATH
    echo 3. Restart Command Prompt
    pause
    exit /b 1
)

echo [INFO] MySQL client found
echo.

REM Get database credentials
set MYSQL_HOST=127.0.0.1
set MYSQL_USER=root
set MYSQL_PASS=
set MYSQL_DB=defaultdb

echo [INPUT] Enter MySQL host (press Enter for default 127.0.0.1):
set /p MYSQL_HOST=^>

echo [INPUT] Enter MySQL username (press Enter for default 'root'):
set /p MYSQL_USER=^>

echo [INPUT] Enter MySQL password (press Enter if no password):
for /f "delims=" %%A in ('powershell -Command "$pword = Read-Host -AsSecureString; [System.Runtime.InteropServices.Marshal]::PtrToStringAuto([System.Runtime.InteropServices.Marshal]::SecureStringToCoTaskMemUni($pword))"') do set MYSQL_PASS=%%A

echo [INPUT] Enter database name (press Enter for default 'defaultdb'):
set /p MYSQL_DB=^>

echo.
echo [INFO] Testing database connection...
if "%MYSQL_PASS%"=="" (
    mysql -h %MYSQL_HOST% -u %MYSQL_USER% -e "SELECT 1;" >nul 2>&1
) else (
    mysql -h %MYSQL_HOST% -u %MYSQL_USER% -p%MYSQL_PASS% -e "SELECT 1;" >nul 2>&1
)

if errorlevel 1 (
    echo [ERROR] Failed to connect to MySQL. Please check your credentials.
    pause
    exit /b 1
)
echo [OK] Connection successful
echo.

echo [INFO] Applying performance indexes...
echo.

REM Create temporary SQL file
setlocal enabledelayedexpansion
set SQLFILE=%TEMP%\clovia_indexes.sql
(
    echo ALTER TABLE users ADD INDEX IF NOT EXISTS idx_users_email (email);
    echo ALTER TABLE users ADD INDEX IF NOT EXISTS idx_users_slug (slug);
    echo ALTER TABLE users ADD INDEX IF NOT EXISTS idx_users_verified (verified);
    echo ALTER TABLE users ADD INDEX IF NOT EXISTS idx_users_email_otp_hash (email_otp_hash);
    echo ALTER TABLE users ADD INDEX IF NOT EXISTS idx_users_email_verified (email^, verified);
) > %SQLFILE%

REM Run the SQL file
if "%MYSQL_PASS%"=="" (
    mysql -h %MYSQL_HOST% -u %MYSQL_USER% %MYSQL_DB% < %SQLFILE%
) else (
    mysql -h %MYSQL_HOST% -u %MYSQL_USER% -p%MYSQL_PASS% %MYSQL_DB% < %SQLFILE%
)

if errorlevel 1 (
    echo [ERROR] Failed to create indexes
    del %SQLFILE%
    pause
    exit /b 1
)

echo [OK] Indexes created successfully
echo.

echo [INFO] Verifying indexes...
if "%MYSQL_PASS%"=="" (
    mysql -h %MYSQL_HOST% -u %MYSQL_USER% %MYSQL_DB% -e "SHOW INDEXES FROM users WHERE Key_name IN ('idx_users_email', 'idx_users_slug', 'idx_users_verified', 'idx_users_email_otp_hash', 'idx_users_email_verified');"
) else (
    mysql -h %MYSQL_HOST% -u %MYSQL_USER% -p%MYSQL_PASS% %MYSQL_DB% -e "SHOW INDEXES FROM users WHERE Key_name IN ('idx_users_email', 'idx_users_slug', 'idx_users_verified', 'idx_users_email_otp_hash', 'idx_users_email_verified');"
)

REM Cleanup
del %SQLFILE%

echo.
echo ==================================================
echo [OK] Setup complete!
echo ==================================================
echo.
echo Next steps:
echo 1. Rebuild the Go application:
echo    go build -o clovia.exe main.go
echo.
echo 2. Restart the backend server:
echo    start-backend.bat
echo.
echo 3. Run the performance test:
echo    k6 run -u 1 -d 2m clovia-performance-test.js
echo.

pause
