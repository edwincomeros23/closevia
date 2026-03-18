import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const baseDir = path.join(__dirname, 'public');
const sourceLogoPath = path.join(baseDir, 'logoimage.png');

async function generateIconsFromLogo() {
  try {
    // Check if source logo exists
    if (!fs.existsSync(sourceLogoPath)) {
      console.error(`❌ Error: logoimage.png not found at ${sourceLogoPath}`);
      console.error('Available files in public/:', fs.readdirSync(baseDir).filter(f => f.includes('logo')));
      process.exit(1);
    }

    console.log('📦 Using existing logo to generate PWA icons...\n');

    // Generate 192x192 icon with white background
    await sharp(sourceLogoPath)
      .resize(192, 192, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      })
      .png()
      .toFile(path.join(baseDir, 'icon-192.png'));
    console.log('✓ Created icon-192.png');

    // Generate 512x512 icon with white background
    await sharp(sourceLogoPath)
      .resize(512, 512, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      })
      .png()
      .toFile(path.join(baseDir, 'icon-512.png'));
    console.log('✓ Created icon-512.png');

    // Generate 192x192 maskable icon (with transparent background for modern PWAs)
    await sharp({
      create: {
        width: 192,
        height: 192,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    })
      .composite([
        {
          input: await sharp(sourceLogoPath)
            .resize(160, 160, { fit: 'contain' })
            .toBuffer(),
          top: 16,
          left: 16,
        }
      ])
      .png()
      .toFile(path.join(baseDir, 'icon-192-maskable.png'));
    console.log('✓ Created icon-192-maskable.png');

    // Generate 512x512 maskable icon
    await sharp({
      create: {
        width: 512,
        height: 512,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    })
      .composite([
        {
          input: await sharp(sourceLogoPath)
            .resize(450, 450, { fit: 'contain' })
            .toBuffer(),
          top: 31,
          left: 31,
        }
      ])
      .png()
      .toFile(path.join(baseDir, 'icon-512-maskable.png'));
    console.log('✓ Created icon-512-maskable.png');

    console.log('\n✅ All PWA icons generated successfully from your logo!');
    console.log('📁 Icons saved to: public/');
    console.log('🚀 Your app branding is now consistent across all platforms!');
  } catch (error) {
    console.error('Error generating icons:', error.message);
    process.exit(1);
  }
}

generateIconsFromLogo();
