// Utility function to construct proper image URLs
export const getImageUrl = (imagePath: string | null | undefined): string => {
  if (!imagePath) {
    return 'https://via.placeholder.com/400x300?text=No+Image'
  }
  
  // If it's already a full URL, return as is
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath
  }
  
  // If it's a relative path, prepend the backend URL
  const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000'
  return `${backendUrl}${imagePath}`
}

// Utility function to get the first image from an array
export const getFirstImage = (imageUrls: string[] | null | undefined): string => {
  if (!imageUrls || imageUrls.length === 0) {
    return 'https://via.placeholder.com/400x300?text=No+Image'
  }
  
  return getImageUrl(imageUrls[0])
}
