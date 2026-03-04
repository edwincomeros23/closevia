// Test Profile Picture Upload Flow
// Run this in browser console while on Settings page

console.log('=== Profile Picture Upload Diagnostic ===\n');

// Step 1: Get current user profile
async function testProfilePictureFlow() {
  console.log('📋 STEP 1: Fetching current user profile...\n');
  
  try {
    const profileRes = await fetch('/api/users/profile');
    const profileData = await profileRes.json();
    const user = profileData.data;
    
    console.log('✅ Current Profile:');
    console.log('  User ID:', user.id);
    console.log('  Name:', user.name);
    console.log('  Current Profile Picture URL:', user.profile_picture);
    console.log('  URL Analysis:');
    
    if (user.profile_picture) {
      const url = user.profile_picture;
      const hasCloudinary = url.includes('cloudinary');
      const hasTimestamp = /-\d{19}/.test(url); // matches -[nanoseconds]
      const hasProtocol = url.startsWith('http');
      
      console.log(`    - Is Cloudinary URL: ${hasCloudinary}`);
      console.log(`    - Has Nanosecond Timestamp: ${hasTimestamp}`);
      console.log(`    - Has Protocol: ${hasProtocol}`);
      
      if (hasTimestamp) {
        const match = url.match(/-(\d{19})/);
        if (match) {
          const nanos = match[1];
          const ms = Math.floor(nanos / 1000000);
          const date = new Date(ms);
          console.log(`    - Timestamp (nanos): ${nanos}`);
          console.log(`    - Upload Time: ${date.toISOString()}`);
        }
      }
    }
    
    // Step 2: Check what the Avatar component is actually displaying
    console.log('\n📋 STEP 2: Checking Avatar rendering...\n');
    
    const avatars = document.querySelectorAll('img[src*="cloudinary"], img[alt*="avatar"]');
    console.log(`✅ Found ${avatars.length} avatar image(s)`);
    
    avatars.forEach((img, idx) => {
      console.log(`  Avatar ${idx + 1}:`);
      console.log(`    - src: ${img.src}`);
      console.log(`    - alt: ${img.alt}`);
      console.log(`    - visible: ${img.offsetHeight > 0 && img.offsetWidth > 0}`);
      
      // Check if cache buster is present
      const hasCacheBuster = img.src.includes('?t=');
      console.log(`    - Has cache buster: ${hasCacheBuster}`);
    });
    
    // Step 3: Show what will be uploaded
    console.log('\n📋 STEP 3: Ready for upload test\n');
    console.log('Instructions:');
    console.log('1. Click "Change Avatar" button');
    console.log('2. Select a NEW, visibly DIFFERENT image');
    console.log('3. Watch console for 📸 logs');
    console.log('4. After upload, run this again: testProfilePictureFlow()');
    console.log('\nExpected behavior:');
    console.log('- URL should change (different Cloudinary public ID)');
    console.log('- Timestamp should be newer');
    console.log('- Avatar should update immediately');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Step 4: Test upload directly
async function testDirectUpload(imageFile) {
  console.log('\n📋 STEP 4: Direct Upload Test\n');
  
  if (!imageFile) {
    console.log('❌ No image file provided. Usage: testDirectUpload(imageFile)');
    return;
  }
  
  try {
    console.log('📸 Starting direct upload...');
    console.log('  File:', imageFile.name);
    console.log('  Size:', imageFile.size, 'bytes');
    console.log('  Type:', imageFile.type);
    
    const form = new FormData();
    form.append('image', imageFile);
    
    const uploadRes = await fetch('/api/users/profile-picture', {
      method: 'POST',
      body: form,
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('clovia_token')}`
      }
    });
    
    const uploadData = await uploadRes.json();
    console.log('\n📸 Upload Response:');
    console.log('  Status:', uploadRes.status);
    console.log('  Success:', uploadData.success);
    console.log('  URL Returned:', uploadData.data || uploadData.Data);
    
    // Analyze the returned URL
    const returnedUrl = uploadData.data || uploadData.Data;
    if (returnedUrl) {
      const hasTimestamp = /-\d{19}/.test(returnedUrl);
      console.log('  Has Nanosecond Timestamp:', hasTimestamp);
      
      // Extract upload time
      const match = returnedUrl.match(/-(\d{19})/);
      if (match) {
        const nanos = match[1];
        const ms = Math.floor(nanos / 1000000);
        const date = new Date(ms);
        console.log('  Upload Time:', date.toISOString());
      }
    }
    
    // Now fetch profile again to see if database was updated
    console.log('\n📸 Verifying database update...');
    const profileRes = await fetch('/api/users/profile');
    const profileData = await profileRes.json();
    const newUrl = profileData.data.profile_picture;
    
    console.log('  Database Now Shows:', newUrl);
    console.log('  URLs Match:', returnedUrl === newUrl);
    
  } catch (error) {
    console.error('❌ Upload error:', error);
  }
}

// Run immediately
console.log('Starting diagnostic...\n');
testProfilePictureFlow();

console.log('\n=== Available Functions ===');
console.log('- testProfilePictureFlow()  - Run this after uploading to see current state');
console.log('- testDirectUpload(file)    - Test upload directly from console');
