#!/bin/bash
# Test the Gemini API endpoint with debug output

# Create a temporary test image (small 1x1 pixel PNG)
$pngBytes = @(0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, 0x54, 0x08, 0x99, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82)
[IO.File]::WriteAllBytes("$PSScriptRoot\test_image.png", [byte[]]$pngBytes)

# Create 3 copies for testing
Copy-Item "$PSScriptRoot\test_image.png" "$PSScriptRoot\test_image2.png"
Copy-Item "$PSScriptRoot\test_image.png" "$PSScriptRoot\test_image3.png"

# Get JWT token from login or use a test one
$token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiMSJ9.test"

# Test the endpoint
Write-Host "Testing /api/products/generate-details endpoint..."
Write-Host ""

$form = @{
    images = @(
        Get-Item "$PSScriptRoot\test_image.png",
        Get-Item "$PSScriptRoot\test_image2.png",
        Get-Item "$PSScriptRoot\test_image3.png"
    )
}

try {
    $response = Invoke-WebRequest -Uri "http://localhost:4000/api/products/generate-details" `
        -Method POST `
        -Headers @{ Authorization = "Bearer $token" } `
        -Form $form `
        -Verbose
    
    Write-Host "Response Status: $($response.StatusCode)"
    Write-Host "Response Content:"
    Write-Host $response.Content
} catch {
    Write-Host "Error Status: $($_.Exception.Response.StatusCode.Value) $($_.Exception.Response.StatusDescription)"
    Write-Host "Error Response:"
    Write-Host $_.Exception.Response.Content
}

# Cleanup
Remove-Item "$PSScriptRoot\test_image*.png" -Force
