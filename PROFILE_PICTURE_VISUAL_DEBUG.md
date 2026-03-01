# Profile Picture Upload - Visual Debugging Guide

## The Upload Chain (What Should Happen)

```
┌─────────────────────────────────────────────────────────────────┐
│ YOU                                                              │
│ - Select new image                                              │
│ - Click Save                                                    │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ FRONTEND (Browser)                                              │
│ - Convert image to blob                                         │
│ - POST to /api/users/profile-picture with FormData             │
│ - Receive URL: https://res.cloudinary.com/.../profile-XXXXXXXXX│
│ - Add cache buster: URL + ?t=1707390000000                     │
│ - PUT to /api/users/profile with new URL                       │
│ - Call refreshUser() to fetch latest profile                   │
│ - Update Avatar component                                      │
│ - RESULT: New image appears immediately                        │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ BACKEND (Go/Fiber)                                              │
│ - Receive file in /api/users/profile-picture                   │
│ - Generate unique public ID:                                    │
│   publicID = "profile-" + time.Now().UnixNano()                │
│   Example: "profile-1738440000123456789"                       │
│ - Upload to Cloudinary                                          │
│ - Get back URL:                                                │
│   https://res.cloudinary.com/dbhq4jerf/image/upload/v1/       │
│   clovia/profile-pictures/profile-1738440000123456789.jpg      │
│ - Save URL to database                                          │
│ - Return URL to frontend                                        │
│ - RESULT: Database updated with unique URL                     │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ DATABASE (Aiven MySQL)                                          │
│ UPDATE users SET profile_picture = '[NEW_UNIQUE_URL]'           │
│ WHERE id = [YOUR_ID];                                           │
│ - RESULT: profile_picture column now has new URL with unique ID│
└─────────────────────────────────────────────────────────────────┘
```

## What Each Step Should Look Like

### Step 1: Frontend Upload
**In Browser Console (F12):**
```
📸 Image file selected: { name: "photo.jpg", size: 2048576, type: "image/jpeg" }
📸 Image converted to data URL, length: 2782144
📸 Uploading profile picture from data URL
📸 Blob created: { size: 2048576, type: "image/jpeg" }
📸 Profile picture uploaded successfully, URL: https://res.cloudinary.com/dbhq4jerf/image/upload/v1/clovia/profile-pictures/profile-1738440123456789.jpg
📸 Added cache buster to URL: https://res.cloudinary.com/dbhq4jerf/image/upload/v1/clovia/profile-pictures/profile-1738440123456789.jpg?t=1707390000000
```

**Check the URL:**
- ✅ Starts with `https://res.cloudinary.com/`
- ✅ Contains `/profile-pictures/`
- ✅ Has 19-digit timestamp: `-1738440123456789`
- ✅ Has cache buster: `?t=` at the end

### Step 2: Avatar Displays
**What You See:**
- Avatar immediately updates
- Shows the NEW image (completely different from before)

**What Browser Does:**
- Fetches image from `https://res.cloudinary.com/.../profile-1738440123456789.jpg?t=1707390000000`
- `?t=1707390000000` forces cache bypass
- Gets fresh image from Cloudinary, not from browser cache

### Step 3: Database Verification
**SQL Query:**
```sql
SELECT id, name, profile_picture, updated_at, created_at 
FROM users 
WHERE id = YOUR_USER_ID;
```

**Expected Result:**
```
id: 123
name: "Your Name"
profile_picture: "https://res.cloudinary.com/dbhq4jerf/image/upload/v1/clovia/profile-pictures/profile-1738440123456789.jpg"
updated_at: "2026-02-02 15:30:00"
created_at: "2026-01-15 10:00:00"
```

**Check:**
- ✅ `profile_picture` has unique timestamp (19 digits)
- ✅ `updated_at` is recent (just now)
- ✅ Different from previous timestamp

---

## What's Broken (Common Scenarios)

### Scenario 1: Avatar Shows Old Image Immediately After Upload

**What went wrong:**
- Browser cache is serving old image

**Diagnosis:**
```
Browser Console shows: 📸 Profile picture uploaded successfully, URL: https://res.cloudinary.com/.../profile-1738440123456789.jpg ✅
Database shows: profile_picture = "https://res.cloudinary.com/.../profile-1738440123456789.jpg" ✅
Avatar shows: OLD IMAGE ✗
```

**Fix:**
```
Ctrl + Shift + Delete → Clear all → Hard refresh
```

---

### Scenario 2: Upload Button Does Nothing

**What went wrong:**
- No console logs appear
- Network request fails

**Diagnosis:**
```
Browser Console shows: (no 📸 logs) ✗
Network tab shows: POST /api/users/profile-picture → 401, 403, or 5xx ✗
```

**Fix:**
```
1. Check if logged in: localStorage.getItem('clovia_token') should have a value
2. Check network error in console
3. Restart server
```

---

### Scenario 3: Console Shows New URL but Database Has Old URL

**What went wrong:**
- Upload to Cloudinary worked
- Database update failed

**Diagnosis:**
```
Browser Console shows: 📸 Profile picture uploaded successfully, URL: https://.../-1738440123456789.jpg ✅
Database shows: profile_picture = "https://.../-1738440000000000000.jpg" (old timestamp) ✗
Avatar shows: Sometimes new, sometimes old (inconsistent) ⚠️
```

**Fix:**
```
Check database connection in .env
Restart server
Check backend logs for errors
```

---

### Scenario 4: URL Has No Timestamp

**What went wrong:**
- Code fix not deployed
- Cloudinary fallback not adding timestamp

**Diagnosis:**
```
Browser Console shows: 📸 Profile picture uploaded successfully, URL: https://...cloudinary.../profile.jpg (no timestamp) ✗
Database shows: profile_picture = "https://...cloudinary.../profile.jpg" ✗
```

**Fix:**
```
1. Verify cloudinary_service.go has: if folder == "profile-pictures" { publicID = fmt.Sprintf("%s-%d", publicID, time.Now().UnixNano()) }
2. Rebuild: go build -o main.exe main.go
3. Restart: Stop-Process -Name main; Start-Process main.exe
```

---

## Step-by-Step Diagnosis

### Phase 1: Preparation
```
1. Browser:    Open incognito window or clear cache (Ctrl+Shift+Delete)
2. Console:    Open (F12) and go to Console tab  
3. Network:    Go to Network tab, filter to Fetch/XHR
4. Database:   Have SQL client ready to run SELECT query
```

### Phase 2: Upload
```
1. Settings page: Click "Change Avatar"
2. Select:       A COMPLETELY DIFFERENT image (obvious difference)
3. Save:         Click Save button
4. Watch:        Console for 📸 logs
5. Network:      Watch POST /api/users/profile-picture
6. Avatar:       Does it update immediately?
```

### Phase 3: Verification
```
1. Copy URL:     From console "📸 Profile picture uploaded successfully, URL:"
2. Query DB:     SELECT profile_picture FROM users WHERE id = YOUR_ID
3. Compare:      Console URL === Database URL?
4. Check image:  Avatar shows new image?
5. Hard refresh: Ctrl+F5 - still shows new image?
```

### Phase 4: Analysis
```
If ALL match:        ✅ Upload working correctly
If console ≠ DB:     ❌ Database update failed - check DB connection
If shows old image:  ❌ Browser cache - hard clear (Ctrl+Shift+Delete)
If no console logs:  ❌ Upload failed - check server/Cloudinary credentials
```

---

## Quick Sanity Check Commands

Run these in browser console to verify everything:

```javascript
// 1. Check current user profile
fetch('/api/users/profile').then(r=>r.json()).then(d=>console.log('Profile Picture:', d.data.profile_picture))

// 2. Check browser cache
document.querySelectorAll('img[src*="cloudinary"]').forEach(img => console.log('Avatar src:', img.src))

// 3. Check localStorage
console.log('Token:', localStorage.getItem('clovia_token') ? '✅ Logged in' : '❌ Not logged in')
console.log('Settings:', localStorage.getItem('user_settings') ? '✅ Settings cached' : '❌ No settings')

// 4. Force reload user
fetch('/api/users/profile').then(r=>r.json()).then(d=>console.log('Latest profile picture URL:', d.data.profile_picture))
```

---

## When to Check Each File

| Problem | File to Check |
|---------|---------------|
| Upload fails silently | `handlers/user_handler.go` - UploadProfilePicture() |
| Wrong URL format | `services/cloudinary_service.go` - uploadStream() |
| Old image displays | `client/src/pages/Settings.tsx` - cache buster logic |
| URL not saved | `handlers/user_handler.go` - UPDATE users query |
| Avatar doesn't update | `client/src/contexts/AuthContext.tsx` - refreshUser() |
| Can't refresh user | `client/src/contexts/AuthContext.tsx` - fetchUserProfile() |

---

## Summary Table

| Check | Expected | If Wrong |
|-------|----------|----------|
| Console URL | Has `-[19 digits]` | Server not generating unique IDs |
| DB URL | Matches console URL | Database update failed |
| Avatar display | Shows new image | Browser cache needs clear |
| Avatar after refresh | Still shows new | Working correctly ✅ |
| Other users see it | Yes | Working correctly ✅ |
