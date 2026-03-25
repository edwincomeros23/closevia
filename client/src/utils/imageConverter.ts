/**
 * Image Converter Utility
 * 
 * Handles conversion of various image formats (HEIC, HEIF, WebP) to JPEG
 * for compatibility with older APIs and devices that don't support newer formats.
 * This is particularly important for mobile camera uploads from iPhones.
 */

/**
 * Check if browser supports HEIC format
 */
export const supportsHEIC = (): boolean => {
  const canvas = document.createElement('canvas')
  return canvas.toDataURL('image/heic') !== `data:image/heic` || 
         canvas.toDataURL('image/heif') !== `data:image/heif`
}

/**
 * Detect if file is HEIC/HEIF or WebP format based on file extension or MIME type
 */
export const isUnsupportedFormat = (file: File): boolean => {
  const mimeType = file.type.toLowerCase()
  const fileName = file.name.toLowerCase()
  
  // Check MIME types
  if (mimeType.includes('heic') || mimeType.includes('heif') || mimeType.includes('webp')) {
    return true
  }
  
  // Check file extensions
  if (fileName.endsWith('.heic') || fileName.endsWith('.heif') || fileName.endsWith('.webp')) {
    return true
  }
  
  return false
}

/**
 * Convert image file to JPEG format with proper orientation
 * Handles HEIC, HEIF, WebP, and other formats by drawing to canvas
 * Also fixes EXIF orientation issues from phone cameras
 */
export const convertToJPEG = async (file: File, quality: number = 0.85): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (event) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')

        if (!ctx) {
          reject(new Error('Failed to get canvas context'))
          return
        }

        // Set canvas size to match image
        canvas.width = img.width
        canvas.height = img.height

        // Fill with white background to handle transparency
        ctx.fillStyle = '#FFFFFF'
        ctx.fillRect(0, 0, canvas.width, canvas.height)

        // Draw image on canvas
        ctx.drawImage(img, 0, 0)

        // Convert canvas to JPEG blob
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob)
            } else {
              reject(new Error('Failed to convert image to JPEG'))
            }
          },
          'image/jpeg',
          quality
        )
      }

      img.onerror = () => {
        reject(new Error('Failed to load image for conversion'))
      }

      // Set image source - use data URL
      img.src = event.target?.result as string
    }

    reader.onerror = () => {
      reject(new Error('Failed to read file'))
    }

    // Read file as data URL
    reader.readAsDataURL(file)
  })
}

/**
 * Read EXIF orientation from image file
 * Returns orientation value (1-8) or 1 (normal) if not found
 */
const getExifOrientation = async (file: File): Promise<number> => {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const view = new DataView(e.target?.result as ArrayBuffer)
      if (view.getUint16(0, false) !== 0xFFD8) {
        resolve(1) // Not a JPEG
        return
      }

      const length = view.byteLength
      let offset = 2

      while (offset < length) {
        if (view.getUint16(offset + 2, false) <= 8) {
          resolve(1)
          return
        }
        const marker = view.getUint16(offset, false)
        offset += 2

        if (marker === 0xFFE1) { // EXIF marker
          if (view.getUint32(offset += 2, false) !== 0x45786966) {
            resolve(1)
            return
          }

          const little = view.getUint16(offset += 6, false) === 0x4949
          offset += view.getUint32(offset + 4, little)
          const tags = view.getUint16(offset, little)
          offset += 2

          for (let i = 0; i < tags; i++) {
            if (view.getUint16(offset + (i * 12), little) === 0x0112) {
              resolve(view.getUint16(offset + (i * 12) + 8, little))
              return
            }
          }
        } else if ((marker & 0xFF00) !== 0xFF00) {
          break
        } else {
          offset += view.getUint16(offset, false)
        }
      }
      resolve(1)
    }
    reader.onerror = () => resolve(1)
    reader.readAsArrayBuffer(file.slice(0, 65536)) // Only read first 64KB for EXIF
  })
}

/**
 * Fix image orientation based on EXIF data
 * This ensures mobile camera photos display correctly after upload
 */
export const fixImageOrientation = async (file: File, quality: number = 0.92): Promise<Blob> => {
  const orientation = await getExifOrientation(file)

  // If orientation is normal (1), just return original converted blob
  if (orientation === 1) {
    // Still need to process through canvas to strip EXIF and ensure consistency
    return convertToJPEG(file, quality)
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (event) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')

        if (!ctx) {
          reject(new Error('Failed to get canvas context'))
          return
        }

        // Swap width/height for 90° rotations
        if (orientation >= 5 && orientation <= 8) {
          canvas.width = img.height
          canvas.height = img.width
        } else {
          canvas.width = img.width
          canvas.height = img.height
        }

        // Fill with white background
        ctx.fillStyle = '#FFFFFF'
        ctx.fillRect(0, 0, canvas.width, canvas.height)

        // Apply orientation transformation
        switch (orientation) {
          case 2: // Flip horizontal
            ctx.transform(-1, 0, 0, 1, img.width, 0)
            break
          case 3: // Rotate 180°
            ctx.transform(-1, 0, 0, -1, img.width, img.height)
            break
          case 4: // Flip vertical
            ctx.transform(1, 0, 0, -1, 0, img.height)
            break
          case 5: // Rotate 90° CW + flip horizontal
            ctx.transform(0, 1, 1, 0, 0, 0)
            break
          case 6: // Rotate 90° CW
            ctx.transform(0, 1, -1, 0, img.height, 0)
            break
          case 7: // Rotate 90° CCW + flip horizontal
            ctx.transform(0, -1, -1, 0, img.height, img.width)
            break
          case 8: // Rotate 90° CCW
            ctx.transform(0, -1, 1, 0, 0, img.width)
            break
        }

        // Draw the image
        ctx.drawImage(img, 0, 0)

        // Convert to blob
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob)
            } else {
              reject(new Error('Failed to convert image'))
            }
          },
          'image/jpeg',
          quality
        )
      }

      img.onerror = () => reject(new Error('Failed to load image'))
      img.src = event.target?.result as string
    }

    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

/**
 * Prepare image file for upload
 * - Fixes EXIF orientation for all images (phone camera photos)
 * - Converts unsupported formats (HEIC, HEIF, WebP) to JPEG
 * - Validates file size
 * - Returns processed file
 */
export const prepareImageForUpload = async (
  file: File,
  maxSizeMB: number = 5
): Promise<{ file: File; isConverted: boolean; warning?: string }> => {
  // Check file size (in bytes)
  const maxSizeBytes = maxSizeMB * 1024 * 1024
  if (file.size > maxSizeBytes) {
    throw new Error(`File size (${(file.size / 1024 / 1024).toFixed(2)}MB) exceeds ${maxSizeMB}MB limit`)
  }

  try {
    // Always fix orientation for JPEG/JPG files (most common from phone cameras)
    // This ensures the image displays the same way after upload as it did in preview
    const needsOrientationFix = file.type === 'image/jpeg' || file.name.toLowerCase().endsWith('.jpg') || file.name.toLowerCase().endsWith('.jpeg')
    const needsConversion = isUnsupportedFormat(file)

    if (needsOrientationFix || needsConversion) {
      const processedBlob = await fixImageOrientation(file, 0.92)

      // Create new File object with processed blob
      const fileName = file.name.replace(/\.[^.]+$/, '.jpg')
      const processedFile = new File([processedBlob], fileName, {
        type: 'image/jpeg',
        lastModified: Date.now(),
      })

      return {
        file: processedFile,
        isConverted: needsConversion,
        warning: needsConversion
          ? `Image converted from ${file.type} to JPEG for compatibility`
          : undefined,
      }
    }

    // For other formats (PNG, GIF, etc.), return as-is
    return { file, isConverted: false }
  } catch (error) {
    console.error('Error processing image:', error)
    // If processing fails, return original and let server handle it
    return {
      file,
      isConverted: false,
      warning: 'Image processing failed, uploading original format',
    }
  }
}

/**
 * Batch prepare multiple images for upload
 */
export const prepareImagesForUpload = async (
  files: File[],
  maxSizeMB: number = 5
): Promise<{
  files: File[]
  conversions: Array<{ original: string; isConverted: boolean; warning?: string }>
  errors: Array<{ file: string; error: string }>
}> => {
  const results: File[] = []
  const conversions: Array<{ original: string; isConverted: boolean; warning?: string }> = []
  const errors: Array<{ file: string; error: string }> = []

  for (const file of files) {
    try {
      const { file: processedFile, isConverted, warning } = await prepareImageForUpload(file, maxSizeMB)
      results.push(processedFile)
      conversions.push({
        original: file.name,
        isConverted,
        warning,
      })
    } catch (error: any) {
      errors.push({
        file: file.name,
        error: error.message || 'Failed to prepare image',
      })
    }
  }

  return { files: results, conversions, errors }
}

/**
 * Get human-readable file type description
 */
export const getFileTypeDescription = (file: File): string => {
  const mimeType = file.type.toLowerCase()
  
  if (mimeType.includes('heic')) return 'HEIC (Apple Image)'
  if (mimeType.includes('heif')) return 'HEIF (High Efficiency)'
  if (mimeType.includes('webp')) return 'WebP'
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'JPEG'
  if (mimeType.includes('png')) return 'PNG'
  if (mimeType.includes('gif')) return 'GIF'
  if (mimeType.includes('bmp')) return 'Bitmap'
  
  return 'Image'
}
