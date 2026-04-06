# PowerShell script to set up performance indexes
# Usage: powershell -ExecutionPolicy Bypass -File setup-performance-indexes.ps1

param(
    [string]$Host = "127.0.0.1",
    [string]$User = "root",
    [string]$Password = "",
    [string]$Database = "defaultdb"
)

Write-Host ""
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "Clovia Performance Optimization Setup" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host ""

# Function to test MySQL connection
function Test-MySQLConnection {
    param(
        [string]$Host,
        [string]$User,
        [string]$Password,
        [string]$Database
    )
    
    try {
        if ([string]::IsNullOrEmpty($Password)) {
            $output = mysql -h $Host -u $User -e "SELECT 1;" 2>&1
        } else {
            $output = mysql -h $Host -u $User -p$Password -e "SELECT 1;" 2>&1
        }
        
        if ($LASTEXITCODE -eq 0) {
            return $true
        } else {
            return $false
        }
    }
    catch {
        return $false
    }
}

# Check if MySQL is installed
Write-Host "[INFO] Checking for MySQL client..." -ForegroundColor Yellow
if (-not (Get-Command mysql -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] MySQL client not found in PATH" -ForegroundColor Red
    Write-Host ""
    Write-Host "To fix this:" -ForegroundColor Yellow
    Write-Host "1. Find MySQL bin directory: C:\Program Files\MySQL\MySQL Server 8.0\bin" -ForegroundColor Gray
    Write-Host "2. Add to Windows PATH environment variable" -ForegroundColor Gray
    Write-Host "3. Restart PowerShell" -ForegroundColor Gray
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "[OK] MySQL client found" -ForegroundColor Green
Write-Host ""

# Get credentials if not provided
if ([string]::IsNullOrEmpty($Host)) {
    $Host = Read-Host "[INPUT] Enter MySQL host (default: 127.0.0.1)" -DefaultValue "127.0.0.1"
}

if ([string]::IsNullOrEmpty($User)) {
    $User = Read-Host "[INPUT] Enter MySQL username (default: root)" -DefaultValue "root"
}

if ([string]::IsNullOrEmpty($Password)) {
    $secPassword = Read-Host "[INPUT] Enter MySQL password (press Enter if no password)" -AsSecureString
    if ($secPassword.Length -gt 0) {
        $Password = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto([System.Runtime.InteropServices.Marshal]::SecureStringToCoTaskMemUni($secPassword))
    }
}

if ([string]::IsNullOrEmpty($Database)) {
    $Database = Read-Host "[INPUT] Enter database name (default: defaultdb)" -DefaultValue "defaultdb"
}

# Test connection
Write-Host ""
Write-Host "[INFO] Testing database connection..." -ForegroundColor Yellow
if (-not (Test-MySQLConnection -Host $Host -User $User -Password $Password -Database $Database)) {
    Write-Host "[ERROR] Failed to connect to MySQL at $Host" -ForegroundColor Red
    Write-Host "[DEBUG] Check your credentials and try again" -ForegroundColor Gray
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "[OK] Connection successful" -ForegroundColor Green
Write-Host ""

# Create SQL commands
$sqlCommands = @"
ALTER TABLE users ADD INDEX IF NOT EXISTS idx_users_email (email);
ALTER TABLE users ADD INDEX IF NOT EXISTS idx_users_slug (slug);
ALTER TABLE users ADD INDEX IF NOT EXISTS idx_users_verified (verified);
ALTER TABLE users ADD INDEX IF NOT EXISTS idx_users_email_otp_hash (email_otp_hash);
ALTER TABLE users ADD INDEX IF NOT EXISTS idx_users_email_verified (email, verified);
"@

# Save to temporary file
$tempFile = [System.IO.Path]::GetTempFileName() -replace '\.tmp$', '.sql'
$sqlCommands | Out-File -FilePath $tempFile -Encoding UTF8

Write-Host "[INFO] Applying performance indexes..." -ForegroundColor Yellow

# Execute SQL file
try {
    if ([string]::IsNullOrEmpty($Password)) {
        $output = & mysql -h $Host -u $User $Database -e $sqlCommands 2>&1
    } else {
        $output = & mysql -h $Host -u $User -p$Password $Database -e $sqlCommands 2>&1
    }
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Failed to create indexes" -ForegroundColor Red
        Write-Host "[OUTPUT] $output" -ForegroundColor Gray
        Remove-Item -Path $tempFile -Force
        Read-Host "Press Enter to exit"
        exit 1
    }
    
    Write-Host "[OK] Indexes created successfully" -ForegroundColor Green
}
catch {
    Write-Host "[ERROR] Exception occurred: $_" -ForegroundColor Red
    Remove-Item -Path $tempFile -Force
    Read-Host "Press Enter to exit"
    exit 1
}

# Verify indexes
Write-Host ""
Write-Host "[INFO] Verifying indexes..." -ForegroundColor Yellow

$verifySql = "SHOW INDEXES FROM users WHERE Key_name IN ('idx_users_email', 'idx_users_slug', 'idx_users_verified', 'idx_users_email_otp_hash', 'idx_users_email_verified');"

try {
    if ([string]::IsNullOrEmpty($Password)) {
        & mysql -h $Host -u $User $Database -e $verifySql
    } else {
        & mysql -h $Host -u $User -p$Password $Database -e $verifySql
    }
}
catch {
    Write-Host "[WARNING] Could not verify indexes: $_" -ForegroundColor Yellow
}

# Cleanup
Remove-Item -Path $tempFile -Force

Write-Host ""
Write-Host "===================================================" -ForegroundColor Green
Write-Host "[OK] Setup complete!" -ForegroundColor Green
Write-Host "===================================================" -ForegroundColor Green
Write-Host ""

Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Rebuild the Go application:" -ForegroundColor White
Write-Host "   go build -o clovia.exe main.go" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Restart the backend server:" -ForegroundColor White
Write-Host "   start-backend.bat" -ForegroundColor Gray
Write-Host ""
Write-Host "3. Run the baseline test:" -ForegroundColor White
Write-Host "   k6 run -u 1 -d 2m clovia-performance-test.js" -ForegroundColor Gray
Write-Host ""

Read-Host "Press Enter to exit"
