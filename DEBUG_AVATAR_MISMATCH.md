# Profile Picture Upload - Detailed Debugging Steps

## What We're Testing

We've added detailed logging to figure out why a DIFFERENT image appears when you upload.

## Steps to Reproduce & Debug

### Step 1: Open Console & Terminal

1. **Browser Console**: Press `F12` and go to **Console** tab
2. **Server Terminal**: You should see the server logs from PowerShell terminal

### Step 2: Upload a New Image

1. Go to Settings: `http://localhost:5173/settings`
2. Click "Upload Photo"
3. Select a **NEW, COMPLETELY DIFFERENT** image (important!)
4. **DO NOT CLICK SAVE YET** - just upload the image

### Step 3: Watch the Logs

#### Frontend (Browser Console) Should Show:
```
📸 Image file selected: { name: "...", size: ..., type: "..." }
📸 Image converted to data URL, length: ...
📸 Uploading profile picture from data URL
📸 Blob created: { size: ..., type: "..." }
📸 Profile picture uploaded successfully, URL: https://res.cloudinary.com/.../profile-XXXXXXXXXX.jpg
```

#### Backend (Server Terminal) Should Show:
```
🖼️  [UploadProfilePicture] Starting upload for user ID: [YOUR_ID]
🖼️  [UploadProfilePicture] File received: photo.jpg (size: 2048576 bytes)
🖼️  [Cloudinary] Uploading with publicID: profile-1738440123456789 to folder: profile-pictures
🖼️  [UploadProfilePicture] Cloudinary upload successful: https://res.cloudinary.com/...
🖼️  [UploadProfilePicture] Saving URL to database for user [YOUR_ID]: https://...
🖼️  [UploadProfilePicture] Successfully updated user [YOUR_ID] with profile picture: https://...
```

### Step 4: Click Save

1. Click **Save Changes** button
2. Watch for more logs

### Step 5: Check What Displays

1. Avatar should show the image you just uploaded
2. If it shows a DIFFERENT image:
   - Copy the URL from `🖼️  [UploadProfilePicture] Successfully updated` log
   - Open that URL in a new tab
   - What image do you see?

### Step 6: Query Database

Run this SQL query:
```sql
SELECT id, name, profile_picture 
FROM users 
WHERE id = YOUR_USER_ID;
```

Compare:
- **URL in backend logs**: From `Successfully updated` message
- **URL in database**: From SELECT query
- **Image displayed**: What you see in avatar

If all three are the SAME but shows wrong image, the issue is at Cloudinary level.

---

## What to Report

Send me:
1. **Backend logs output** (the 🖼️  logs from terminal)
2. **Frontend console logs** (the 📸 logs from browser)
3. **Database query result** (the profile_picture column value)
4. **What image displays** (description)
5. **What image you uploaded** (description)
6. **Screenshot of Settings page** showing wrong avatar

This will tell us exactly where the break is.

---

## Possible Outcomes

### Outcome 1: URL is CORRECT but Wrong Image Displays
**Diagnosis**: Browser cache showing old image
**Fix**: Hard refresh (Ctrl+Shift+Delete) and clear all data

### Outcome 2: Backend Log Shows WRONG URL
**Diagnosis**: Cloudinary returned wrong image file
**Fix**: Check Cloudinary dashboard, may need to delete old files

### Outcome 3: Database Has DIFFERENT URL Than Backend Log
**Diagnosis**: Database update failed or query wrong
**Fix**: Check database connection and logs

### Outcome 4: Everything MATCHES but Wrong Image
**Diagnosis**: The file on Cloudinary is actually the wrong one
**Fix**: Need to check Cloudinary file directly

---

## Quick Verification

After uploading, run this in browser console:
```javascript
// Check what URL is stored
fetch('/api/users/profile')
  .then(r => r.json())
  .then(d => {
    const url = d.data?.profile_picture
    console.log('Profile picture URL:', url)
    // Extract the public ID
    const match = url?.match(/\/profile-(\d+)\./)
    if (match) {
      console.log('Public ID:', 'profile-' + match[1])
      console.log('Check if this ID is recent (19-digit timestamp)')
    }
  })
```

The public ID should be: `profile-[19-digit-number]`

If it's just `profile.jpg` (no number), the timestamp fix didn't work.
