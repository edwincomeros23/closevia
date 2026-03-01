# Profile Picture Upload - Debug Guide

## Summary of Fixes Applied

### 1. **Fixed URL Extraction in Settings.tsx** ✅
- **Issue**: The frontend was extracting the uploaded image URL incorrectly
- **Root Cause**: API response has field `Data` (capital D), but code was looking for `data` (lowercase)
- **Fix**: Updated extraction to check `uploadRes.data?.Data || uploadRes.data?.data || uploadRes.data`
- **Line**: `client/src/pages/Settings.tsx` line ~453

### 2. **Fixed UpdateProfile Query Duplication in Backend** ✅
- **Issue**: The `profile_picture` field was being added to the UPDATE query TWICE
- **Root Cause**: Duplicate if-statement checking for `ProfilePicture`
- **Fix**: Removed the duplicate condition and added logging
- **File**: `handlers/user_handler.go` line 358-362
- **Result**: Profile picture is now correctly updated in database

### 3. **Added Comprehensive Logging** ✅
- **Settings.tsx**: 
  - Logs when upload starts: `📸 Uploading profile picture from data URL`
  - Logs returned URL: `📸 Profile picture uploaded successfully, URL: [URL]`
  - Logs full response: `📸 Full upload response: [response object]`
  - Logs profile save: `📸 Saving profile with picture URL: [URL]`

- **Backend (user_handler.go)**:
  - `✅ Setting profile_picture for user [ID]: '[URL]'` - When URL is saved in GetUserByID
  - `✅ UpdateProfile: Setting profile_picture to '[URL]' for user [ID]` - When profile is updated

---

## How to Test

### Step 1: Navigate to Settings Page
1. Go to your profile
2. Click on "Settings" or navigate to `/settings`

### Step 2: Upload a Profile Picture
1. Scroll to "Profile Picture" section
2. Click on the upload button
3. Select a test image (JPG, PNG, etc.)
4. You should see the preview immediately

### Step 3: Open Browser Developer Tools
1. Press `F12` or right-click → "Inspect"
2. Go to the **Console** tab
3. You should see a clear log of the upload flow

### Step 4: Click Save
1. Click the "Save Settings" button
2. Watch the console for logs in this order:

```
📸 Uploading profile picture from data URL
📸 Profile picture uploaded successfully, URL: [THE_URL_HERE]
📸 Full upload response: {Success: true, Data: "[URL]", Message: "Uploaded"}
📸 Saving profile with picture URL: [THE_URL_HERE]
✅ Profile updated successfully on backend, response: {...}
```

### Step 5: Verify in Network Tab
1. Go to **Network** tab in DevTools
2. Filter for "profile" requests
3. You should see:
   - `POST /api/users/profile-picture` - Status 200, returns image URL
   - `PUT /api/users/profile` - Status 200, saves profile metadata

### Step 6: Check Avatar in UserProfile
1. Navigate to **Home** page
2. Click on **your avatar/profile name**
3. The profile picture should now display on the avatar
4. Go back to **Settings** - the uploaded image should still be visible in the preview

---

## Expected API Responses

### Upload Endpoint Response (`POST /api/users/profile-picture`)
```json
{
  "Success": true,
  "Data": "https://res.cloudinary.com/...image-url..." 
  // OR
  "Data": "http://your-server/uploads/profile-pictures/image.jpg",
  "Message": "Uploaded"
}
```

### Profile Update Response (`PUT /api/users/profile`)
```json
{
  "Success": true,
  "Message": "Profile updated successfully"
}
```

### Get User Profile Response (`GET /api/users/{id}`)
```json
{
  "Success": true,
  "Data": {
    "id": 123,
    "name": "Your Name",
    "email": "your@email.com",
    "profile_picture": "https://res.cloudinary.com/...image-url...",
    ...other fields...
  }
}
```

---

## Troubleshooting

### Symptom: No 📸 logs appearing in console
**Possible Causes:**
1. JavaScript hasn't been rebuilt - run `npm run build` in the client folder
2. Browser cache - press `Ctrl+Shift+Delete` to clear cache, then try again
3. Upload button not actually triggering - check if form validation is blocking upload

**Solution:**
- Clear browser cache and hard refresh (Ctrl+Shift+R)
- Check Settings page form validation
- Verify image file is valid (under 5MB, JPG/PNG)

### Symptom: URL returned from upload is malformed
**Possible Causes:**
1. Cloudinary is not configured - falls back to local storage
2. Local storage path is incorrect
3. buildAbsoluteURL() function is returning wrong path

**Solution:**
- Check console log for actual URL returned
- Verify it starts with `http://` or `https://` or `/uploads/`
- If it's a Cloudinary URL, check that Cloudinary credentials are valid
- If it's a local URL, verify the file exists at that path

### Symptom: URL is returned but not showing as avatar
**Possible Causes:**
1. Profile picture not being saved to database (UPDATE query failed)
2. UserProfile component not fetching the updated data
3. getImageUrl() function not handling the URL correctly
4. Browser caching issue

**Solution:**
- Check backend logs for `✅ UpdateProfile: Setting profile_picture...` message
- Query database: `SELECT id, profile_picture FROM users WHERE id = [YOUR_ID]`
- Refresh the browser (Ctrl+R)
- Check UserProfile console logs - look for `🔍 API User Response` showing profile_picture

### Symptom: Profile updates but avatar doesn't change
**Possible Causes:**
1. Chakra UI Avatar component caching the old image
2. AuthContext not being refreshed
3. Component not re-rendering after profile update

**Solution:**
- Force full refresh: press Ctrl+Shift+Delete to clear cache, then Ctrl+R
- Log out and log back in
- Check if other profile fields (name, bio) updated successfully
- Verify in Network tab that GET /api/users/{id} returns updated profile_picture

---

## Database Verification

### Check if profile_picture column exists
```sql
SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME='users' AND COLUMN_NAME='profile_picture';
```

### Check if your profile has picture saved
```sql
SELECT id, name, email, profile_picture FROM users WHERE id = [YOUR_ID];
```

### Verify file exists in local uploads (if using local storage)
```bash
dir C:\xampp\htdocs\closevia\uploads\profile-pictures\
```

---

## Code Changes Made

### 1. Settings.tsx (client/src/pages/Settings.tsx)
- Lines ~445-455: Fixed URL extraction from API response
- Added detailed logging at each step of the save process

### 2. user_handler.go (handlers/user_handler.go)
- Lines 358-362: Removed duplicate profile_picture update
- Added console logging when setting profile picture
- Added logging when updating profile

### 3. Rebuilt Applications
- Frontend: `npm run build`
- Backend: `go build -o main.exe main.go`

---

## What Happens Now

1. **Upload**: Image converted to blob → sent to `/api/users/profile-picture`
2. **Backend**: File saved to Cloudinary or `/uploads/profile-pictures/` → URL returned
3. **Save Profile**: URL extracted from response → sent to `/api/users/profile` 
4. **Database**: Profile_picture field updated with URL
5. **Fetch**: UserProfile component calls `/api/users/{id}` → gets profile_picture field
6. **Display**: Avatar component receives URL → displays image

Each step now has logging to track the flow.

---

## Next Steps

1. **Test the upload** following the steps above
2. **Share console logs** if it's still not working
3. **Check database** to verify profile_picture value was saved
4. **Verify Network requests** are returning correct URLs
