const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const baseDir = path.join(__dirname, 'public');

// Create SVG icons first
const createSVGIcon = (size) => {
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#9F7AEA;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#6B46C1;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" fill="url(#grad)"/>
  <text x="50%" y="50%" font-size="${size * 0.5}" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle" font-family="Arial, sans-serif">C</text>
</svg>`;
};

async function generateIcons() {
  try {
    // Convert SVG to PNG for 192x192
    await sharp(Buffer.from(createSVGIcon(192)))
      .png()
      .toFile(path.join(baseDir, 'icon-192.png'));
    console.log('✓ Created icon-192.png');

    // Convert SVG to PNG for 512x512
    await sharp(Buffer.from(createSVGIcon(512)))
      .png()
      .toFile(path.join(baseDir, 'icon-512.png'));
    console.log('✓ Created icon-512.png');

    // Also create maskable versions
    await sharp(Buffer.from(createSVGIcon(192)))
      .png()
      .toFile(path.join(baseDir, 'icon-192-maskable.png'));
    console.log('✓ Created icon-192-maskable.png');

    await sharp(Buffer.from(createSVGIcon(512)))
      .png()
      .toFile(path.join(baseDir, 'icon-512-maskable.png'));
    console.log('✓ Created icon-512-maskable.png');

    console.log('\n✅ All PWA icons generated successfully!');
    console.log('⚠️  These are placeholder icons. Replace them with your branded icons.');
  } catch (error) {
    console.error('Error generating icons:', error.message);
    console.error('\nTo fix this, install sharp:');
    console.error('  npm install -D sharp');
    process.exit(1);
  }
}

generateIcons();
