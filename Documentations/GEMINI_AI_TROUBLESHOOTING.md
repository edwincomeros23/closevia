# Gemini AI Product Generation Troubleshooting

## Overview
This guide helps you troubleshoot the `GenerateProductDetails` function that uses Google Gemini AI to analyze product images.

## Recent Improvements
✅ Added comprehensive error logging and debugging
✅ Added proper error response parsing from Gemini API
✅ Added content blocking detection
✅ Improved error messages in handlers

## 500 Error - Common Causes & Solutions

### 1. **Invalid or Missing API Key**
**Symptoms:** 
- 500 error when calling `/products/generate-details`
- Error messages like "Invalid API key" or "API key not found"

**Solution:**
```env
# In your .env file, make sure you have:
GEMINI_API_KEY=YOUR_VALID_API_KEY

# If you don't have an API key:
# 1. Go to https://makersuite.google.com/app/apikey
# 2. Create a new API key
# 3. Add it to your .env file
# 4. Restart the backend
```

### 2. **Gemini API Quota Exceeded**
**Symptoms:**
- Error: "429 Too Many Requests" or "Quota exceeded"
- Happens after many requests in short time

**Solution:**
- Gemini API has rate limits (60 requests per minute for free tier)
- Wait a minute before retrying
- Consider upgrading to a paid plan if you need higher limits

### 3. **Content Policy Violations**
**Symptoms:**
- Error: "Request blocked by Gemini content filter"
- `blockReason: "SAFETY"` in response

**This happens if:**
- Images contain violent, explicit, or harmful content
- Images are flagged by Gemini's safety filters

**Solution:**
- Ensure images are legitimate product photos
- Try with different product images
- Images should clearly show the actual product

### 4. **Insufficient Valid Images**
**Symptoms:**
- Error: "at least 3 images required"
- Error: "no valid images found"

**Solution:**
- Upload exactly 3 or more image files
- Ensure images are valid formats: JPG, PNG, GIF, WebP
- Check file sizes (Gemini has limits on image size)

### 5. **Image Format Issues**
**Symptoms:**
- Error: "no valid images found" even with 3 images uploaded
- Only some images are processed

**Solution:**
- Check image MIME types are correct
- Use standard formats: image/jpeg, image/png, image/webp, image/gif
- Avoid corrupted or incomplete image files

## Debugging Steps

### Step 1: Check Backend Logs
Run the backend and watch for detailed error messages:
```bash
# In PowerShell at c:\xampp\htdocs\Clovia
go run main.go
```

Look for log messages like:
```
Making request to Gemini API with X image parts
Gemini API response status: 200
Error unmarshaling product details JSON: ...
Gemini API returned error: ...
```

### Step 2: Verify Images are Valid
```bash
# In PowerShell
$file = Get-Item "C:\path\to\image.jpg"
Write-Host "File size: $($file.Length) bytes"
Write-Host "Last modified: $($file.LastWriteTime)"
```

### Step 3: Test API Key Directly
```bash
# Save this as test_gemini.ps1
$apiKey = $env:GEMINI_API_KEY
$url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=$apiKey"

$payload = @{
    contents = @(
        @{
            parts = @(
                @{ text = "Say hello" }
            )
        }
    )
} | ConvertTo-Json -Depth 10

Invoke-WebRequest -Uri $url -Method POST -ContentType "application/json" -Body $payload
```

### Step 4: Check Network Connectivity
```bash
# Test if you can reach Gemini API
Test-NetConnection -ComputerName generativelanguage.googleapis.com -Port 443
```

## Frontend Testing

### Testing the API Endpoint
```bash
# Using curl (if available) or PowerShell

# Create a test multipart form with images
$form = @{
    images = @(Get-Item "path/to/image1.jpg"), @(Get-Item "path/to/image2.jpg"), @(Get-Item "path/to/image3.jpg")
}

# POST to your backend
Invoke-WebRequest -Uri "http://localhost:4000/products/generate-details" `
    -Method POST `
    -Headers @{ Authorization = "Bearer YOUR_JWT_TOKEN" } `
    -Form $form
```

## Response Examples

### Successful Response (200 OK)
```json
{
  "success": true,
  "data": {
    "title": "Vintage Watch",
    "description": "Classic vintage watch in excellent working condition. Features a leather strap and Roman numeral display.",
    "condition": "Like-New",
    "category": "Collectibles"
  }
}
```

### Error Response (400 Bad Request)
```json
{
  "success": false,
  "error": "At least 3 images are required for AI analysis"
}
```

### Error Response (500 Internal Server Error)
```json
{
  "success": false,
  "error": "AI generation failed: gemini API error (status 400): {\"error\":{\"code\":400,\"message\":\"Invalid API key\"}}"
}
```

## Advanced Debugging

### Enable Verbose Logging
The backend now logs all API interactions. Check your console for:

1. **Image Processing:**
   ```
   Error opening image 0: ...
   Error reading image 1: ...
   Image 2 has invalid mime type: ...
   ```

2. **API Request:**
   ```
   Making request to Gemini API with 3 image parts
   ```

3. **API Response:**
   ```
   Gemini API response status: 200
   Successfully generated product details: title=..., condition=..., category=...
   ```

4. **Parsing Errors:**
   ```
   Error unmarshaling product details JSON: ...
   Text was: ...
   ```

### Common JSON Parsing Issues

If Gemini returns wrapped JSON:
```
```json
{"title": "...", ...}
```
```

The code now handles these automatically by stripping backticks and whitespace.

## Performance Considerations

- **Timeout:** Default HTTP timeout is 30 seconds
- **Image Size:** Large images (~5MB+) may be slow to process
- **Rate Limiting:** Gemini free tier: 60 requests/minute

## Production Checklist

- [ ] Verify GEMINI_API_KEY is set in production .env
- [ ] Monitor API usage in Google Cloud Console
- [ ] Set up error tracking/monitoring
- [ ] Consider caching results for identical images
- [ ] Implement rate limiting on your endpoint
- [ ] Set up alerts for API failures
- [ ] Test with various product types
- [ ] Document expected response format for frontend

## Getting Help

If issues persist:

1. Check Google Cloud Console for API quota errors
2. Verify API key has Generative Language API enabled
3. Check network/firewall isn't blocking generativelanguage.googleapis.com
4. Review recent code changes in gemini_service.go
5. Check backend logs for detailed error information

## Code Location
- Service: `services/gemini_service.go`
- Handler: `handlers/product_handler.go` (GenerateProductDetailsWithAI)
- Route: `/products/generate-details` (POST)

## API Documentation
- [Gemini API Docs](https://ai.google.dev/tutorials/rest_quickstart)
- [Models Reference](https://ai.google.dev/models)
- [Content Types](https://ai.google.dev/tutorials/rest_quickstart#content_types)
