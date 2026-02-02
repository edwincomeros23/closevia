# Profile Picture Upload Diagnosis Guide

## Problem
When uploading a new profile picture, an old/different image appears instead of the newly uploaded one.

## Root Cause Analysis Checklist

### Step 1: Clear Browser Cache
The most common cause of this issue is browser caching. Do this first:

1. **Hard Refresh Your Page**
   - Press: `Ctrl + Shift + Delete` (Windows) or `Cmd + Shift + Delete` (Mac)
   - Select "All time" or "Everything"
   - Check: Images and files
   - Click Clear data

2. **Alternative: Use DevTools**
   - Open DevTools: `F12`
   - Right-click Reload button
   - Select "Empty cache and hard reload"

### Step 2: Monitor Upload in Browser Console
When you upload a new image:

1. Open DevTools: `F12`
2. Go to **Console** tab
3. Look for logs starting with `📸`
4. Check these specific logs:
   - `📸 Image file selected` - confirms file was picked
   - `📸 Uploading profile picture from data URL` - upload started
   - `📸 Profile picture uploaded successfully, URL: [URL]` - check if URL changed
   - `📸 Full upload response` - verify response structure
   - `📸 Added cache buster to URL` - should have `?t=timestamp`

### Step 3: Verify Network Request
In DevTools:

1. Go to **Network** tab
2. Click the filter and select `Fetch/XHR`
3. Upload a new image
4. Look for POST request to `/api/users/profile-picture`
5. Click on it and check **Response** tab
6. Should see a Cloudinary URL like: `https://res.cloudinary.com/dbhq4jerf/image/upload/v.../profile-[TIMESTAMP].jpg`
   - The `[TIMESTAMP]` part proves each upload gets a unique ID

### Step 4: Check Database Value
The database should store the URL with the timestamp. To verify:

```sql
SELECT id, name, profile_picture, updated_at 
FROM users 
WHERE id = YOUR_USER_ID;
```

Look for:
- **Profile picture URL** should contain a timestamp (nanoseconds): `-1738440000123456789`
- **Updated_at** timestamp should match when you uploaded

### Step 5: Test API Endpoint Directly
Get your current profile using:

```bash
# In browser console:
fetch('/api/users/profile').then(r => r.json()).then(d => console.log('Profile:', d.data))
```

Check if the returned `profile_picture` has:
- A Cloudinary URL (not a local path)
- A unique timestamp in the public ID
- The cache buster `?t=` parameter

### Step 6: Verify Cloudinary Behavior
Cloudinary unique IDs are generated in this format:

```
profile-[UNIX_NANOSECONDS]
```

For example:
- First upload: `profile-1738440000123456789.jpg`
- Second upload: `profile-1738440000234567890.jpg` (different nanoseconds = different file)

### Step 7: Check Avatar Component Rendering
In Settings.tsx, find the Avatar display (around line 700+):

```jsx
<Avatar src={profileImage} size="xl" />
```

Should show the image with cache buster parameter.

## Common Issues & Solutions

### Issue 1: Same Image Appears Every Upload
**Cause:** Browser cache not being cleared
**Fix:** Hard refresh (Ctrl+Shift+Delete) and clear all caches

### Issue 2: Wrong Image URL Stored
**Cause:** Upload response not properly extracted
**Fix:** Check browser console for `📸 Response structure` logs to see if Data/data field is correct

### Issue 3: Cloudinary Not Generating Unique IDs
**Cause:** Code change didn't get deployed
**Fix:** 
- Verify `cloudinary_service.go` has the timestamp logic
- Rebuild backend: `go build -o main.exe main.go`
- Restart server

### Issue 4: Database Shows Correct URL but Wrong Image Displays
**Cause:** Browser caching of the actual image file
**Fix:** Add cache buster to image src: `?t=${Date.now()}`

## Debug Commands

### Clear All Local Storage
```javascript
// In browser console:
localStorage.clear()
sessionStorage.clear()
```

### Force Reload User Data
```javascript
// In browser console:
window.location.reload(true)  // Hard refresh
```

### Check Current User Profile
```javascript
// In browser console:
fetch('/api/users/profile')
  .then(r => r.json())
  .then(d => {
    console.log('Full profile:', d.data)
    console.log('Profile picture URL:', d.data?.profile_picture)
  })
```

### Log All Avatar Sources on Page
```javascript
// In browser console:
document.querySelectorAll('img[alt*="avatar"], img[alt*="profile"]').forEach(img => {
  console.log('Image src:', img.src)
})
```

## Testing Steps

1. **Clear cache** - Hard refresh with Ctrl+Shift+Delete
2. **Pick a visibly different image** - Make it obvious if the old one displays
3. **Upload** - Watch console for 📸 logs
4. **Verify URL changed** - Check "Profile picture uploaded successfully, URL:"
5. **Check avatar immediately** - Should show new image
6. **Refresh page** - Go to home, then back to settings
7. **Check database** - Confirm URL has timestamp

## Expected Behavior After Upload

1. Console shows unique Cloudinary URL with nanosecond timestamp
2. Avatar immediately updates (with cache buster)
3. Database stores URL with timestamp
4. Refreshing page still shows the new image
5. Other users see the new image too

---

If you've done all these steps and still see the old image, please:
1. Share the `📸 Profile picture uploaded successfully, URL:` value from console
2. Share the database query result for `profile_picture` column
3. Share what image displays (describe it)
4. Share what new image you tried to upload (describe it)
