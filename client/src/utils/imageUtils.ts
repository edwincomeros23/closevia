import { API_BASE_URL } from '../services/api'

// Utility function to add Cloudinary transformations for optimized image loading
export const optimizeCloudinaryUrl = (url: string, options?: { width?: number; quality?: string }): string => {
  if (!url.includes('cloudinary.com')) return url
  
  const { width = 200, quality = 'auto' } = options || {}
  
  // Insert transformation parameters into Cloudinary URL
  // Format: https://res.cloudinary.com/{cloud_name}/image/upload/w_{width},q_{quality}/{path}
  const parts = url.split('/upload/')
  if (parts.length === 2) {
    return `${parts[0]}/upload/w_${width},q_${quality},f_auto/${parts[1]}`
  }
  return url
}

// Utility function to add cache busting to image URLs
export const addCacheBuster = (url: string | null | undefined): string => {
  if (!url) return ''
  
  const cacheBuster = `t=${Date.now()}`
  if (url.includes('?')) {
    return `${url}&${cacheBuster}`
  }
  return `${url}?${cacheBuster}`
}

// Utility function to construct proper image URLs
export const getImageUrl = (imagePath: string | null | undefined, cacheBust: boolean = false, optimize: boolean = false): string => {
  if (!imagePath) {
    // Use a local static fallback to avoid external network failures
    return '/placeholder.svg'
  }
  
  // If it's already a full URL, optionally optimize if Cloudinary
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    const optimized = optimize ? optimizeCloudinaryUrl(imagePath, { width: 200, quality: 'auto' }) : imagePath
    return cacheBust ? addCacheBuster(optimized) : optimized
  }
  
  // If it's a relative path, prepend the backend URL
  const backendUrl = API_BASE_URL.replace(/\/$/, '')
  const fullUrl = `${backendUrl}${imagePath}`
  return cacheBust ? addCacheBuster(fullUrl) : fullUrl
}

// Utility function to get the first image from an array
export const getFirstImage = (imageUrls: string[] | null | undefined): string => {
  if (!imageUrls || imageUrls.length === 0) {
    // Use a local static fallback to avoid external network failures
    return '/placeholder.svg'
  }
  
  return getImageUrl(imageUrls[0])
}
