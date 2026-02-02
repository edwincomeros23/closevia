# Debug Profile Picture Upload Issue
Write-Host "=== Profile Picture Diagnostic ===" -ForegroundColor Cyan

# Load .env file
$envPath = "C:\xampp\htdocs\closevia\.env"
$env_content = Get-Content $envPath | Where-Object { $_ -notmatch '^\s*#' -and $_ -notmatch '^\s*$' }

foreach ($line in $env_content) {
    $parts = $line -split '=', 2
    if ($parts.Count -eq 2) {
        $key = $parts[0].Trim()
        $value = $parts[1].Trim()
        [Environment]::SetEnvironmentVariable($key, $value)
    }
}

# Connect to Aiven database
$dbHost = $env:DB_HOST
$dbPort = $env:DB_PORT
$dbUser = $env:DB_USER
$dbPassword = $env:DB_PASSWORD
$dbName = $env:DB_NAME

Write-Host "`nDatabase Connection:" -ForegroundColor Yellow
Write-Host "Host: $dbHost" 
Write-Host "Port: $dbPort"
Write-Host "User: $dbUser"
Write-Host "Database: $dbName"

# Create connection string
$connectionString = "Server=$dbHost,$dbPort;Database=$dbName;User Id=$dbUser;Password=$dbPassword;Encrypt=true;TrustServerCertificate=false;"

Write-Host "`nAttempting to connect..." -ForegroundColor Yellow

try {
    $connection = New-Object System.Data.SqlClient.SqlConnection
    $connection.ConnectionString = $connectionString
    $connection.Open()
    Write-Host "Connection successful!" -ForegroundColor Green
    
    # Query for recent profile picture updates
    $query = @"
        SELECT 
            id,
            name,
            profile_picture,
            updated_at,
            created_at
        FROM users 
        WHERE profile_picture IS NOT NULL
        ORDER BY updated_at DESC
        LIMIT 5
    "@
    
    $command = New-Object System.Data.SqlClient.SqlCommand
    $command.Connection = $connection
    $command.CommandText = $query
    
    $reader = $command.ExecuteReader()
    
    Write-Host "`nRecent Users with Profile Pictures:" -ForegroundColor Yellow
    while ($reader.Read()) {
        Write-Host "`nUser: $($reader['name']) (ID: $($reader['id']))"
        Write-Host "Profile Picture URL: $($reader['profile_picture'])"
        Write-Host "Last Updated: $($reader['updated_at'])"
    }
    
    $connection.Close()
} catch {
    Write-Host "Error connecting to database: $_" -ForegroundColor Red
    Write-Host "`nNote: Using MySQL connection instead of SQL Server..." -ForegroundColor Yellow
    
    # Use MySQL connection
    $MySQLConnectionString = "Server=$dbHost;Port=$dbPort;Database=$dbName;Uid=$dbUser;Pwd=$dbPassword;SslMode=Required;"
    
    # Using PowerShell's MySQL module if available, or output the connection details
    Write-Host "`nMySQL Connection String (for manual inspection):" -ForegroundColor Cyan
    Write-Host $MySQLConnectionString
    
    Write-Host "`nTo check profile pictures manually, run this SQL query:" -ForegroundColor Cyan
    Write-Host @"
SELECT 
    id,
    name,
    profile_picture,
    updated_at,
    created_at
FROM users 
WHERE profile_picture IS NOT NULL
ORDER BY updated_at DESC
LIMIT 5;
"@
}

Write-Host "`n=== End Diagnostic ===" -ForegroundColor Cyan
