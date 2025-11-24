import { API_BASE_URL } from '../services/api'

// Utility function to construct proper image URLs
export const getImageUrl = (imagePath: string | null | undefined): string => {
  if (!imagePath) {
    // Use a local static fallback to avoid external network failures
    return '/barter.jpg'
  }
  
  // If it's already a full URL, return as is
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath
  }
  
  // If it's a relative path, prepend the backend URL
  const backendUrl = API_BASE_URL.replace(/\/$/, '')
  return `${backendUrl}${imagePath}`
}

// Utility function to get the first image from an array
export const getFirstImage = (imageUrls: string[] | null | undefined): string => {
  if (!imageUrls || imageUrls.length === 0) {
    // Use a local static fallback to avoid external network failures
    return '/barter.jpg'
  }
  
  return getImageUrl(imageUrls[0])
}
