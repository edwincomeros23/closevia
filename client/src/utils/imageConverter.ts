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
 * Convert image file to JPEG format
 * Handles HEIC, HEIF, WebP, and other formats by drawing to canvas
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
 * Fix EXIF orientation by reading orientation data and rotating image if needed
 * This ensures mobile camera photos display with correct rotation
 */
export const fixImageOrientation = async (blob: Blob): Promise<Blob> => {
  return new Promise((resolve) => {
    // For now, just resolve the blob as-is
    // Full EXIF handling would require an EXIF library
    // This is a placeholder for future enhancement
    resolve(blob)
  })
}

/**
 * Prepare image file for upload
 * - Converts unsupported formats (HEIC, HEIF, WebP) to JPEG
 * - Validates file size
 * - Handles orientation
 * - Returns converted file or original if already compatible
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

  // If already a supported format, return as-is
  if (!isUnsupportedFormat(file)) {
    return { file, isConverted: false }
  }

  try {
    // Convert to JPEG
    const jpegBlob = await convertToJPEG(file, 0.85)
    
    // Fix orientation (placeholder for now)
    const orientedBlob = await fixImageOrientation(jpegBlob)
    
    // Create new File object with converted blob
    const fileName = file.name.replace(/\.[^.]+$/, '.jpg')
    const convertedFile = new File([orientedBlob], fileName, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    })
    
    return {
      file: convertedFile,
      isConverted: true,
      warning: `Image converted from ${file.type} to JPEG for compatibility`,
    }
  } catch (error) {
    console.error('Error converting image:', error)
    // If conversion fails, return original and let server handle it
    return {
      file,
      isConverted: false,
      warning: 'Image conversion failed, uploading original format',
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
