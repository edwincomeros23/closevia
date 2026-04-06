import React, { useEffect, useState } from 'react'
import { Box, Image as ChakraImage, Skeleton, ImageProps } from '@chakra-ui/react'
import { generateCloudinarySrcSet, getOptimizedImageWithFallback } from '../utils/imageUtils'

interface OptimizedImageProps extends Omit<ImageProps, 'src' | 'alt' | 'objectFit'> {
  src?: string
  alt: string
  width?: number
  height?: number
  displayWidth?: string | number  // CSS width
  displayHeight?: string | number  // CSS height
  objectFit?: any  // Chakra ResponsiveValue
  borderRadius?: string
  fallbackSrc?: string
  loading?: 'lazy' | 'eager'
  onClick?: (e: React.MouseEvent) => void
  cursor?: string
}

/**
 * OptimizedImage Component
 * 
 * Renders images with automatic Cloudinary optimization:
 * - WebP/AVIF format with JPG fallback
 * - Responsive srcset for different screen sizes
 * - Lazy loading by default
 * - Proper aspect ratio handling
 * - Fallback support for non-Cloudinary images
 * 
 * Usage:
 * <OptimizedImage 
 *   src="https://res.cloudinary.com/.../image.jpg"
 *   alt="Product"
 *   displayWidth="286px"
 *   displayHeight="381px"
 *   borderRadius="md"
 * />
 */
const OptimizedImage: React.FC<OptimizedImageProps> = ({
  src,
  alt,
  width = 300,
  height,
  displayWidth = 'full',
  displayHeight = 'auto',
  objectFit = 'cover',
  borderRadius = '0px',
  fallbackSrc = '/placeholder.svg',
  loading = 'lazy',
  onClick,
  cursor = 'default',
  ...restProps
}) => {
  const [isLoaded, setIsLoaded] = useState(false)
  const [imageSrc, setImageSrc] = useState<string>('')

  useEffect(() => {
    if (!src) {
      setImageSrc(fallbackSrc)
      setIsLoaded(true)
      return
    }

    // For Cloudinary images, use optimized version
    if (src.includes('cloudinary.com')) {
      const { fallback } = getOptimizedImageWithFallback(src, width)
      setImageSrc(fallback)
    } else {
      // For non-Cloudinary images, use as-is
      setImageSrc(src)
    }
  }, [src, width, fallbackSrc])

  const isCloudinary = imageSrc.includes('cloudinary.com')
  const srcSet = isCloudinary ? generateCloudinarySrcSet(imageSrc, width) : undefined

  // Build sizes string for responsive loading
  // Covers mobile (100vw - padding), tablet (50vw), desktop (25-33vw)
  const sizes = isCloudinary
    ? '(max-width: 480px) calc(100vw - 32px), (max-width: 768px) calc(50vw - 32px), (max-width: 1280px) calc(33vw - 16px), 300px'
    : undefined

  return (
    <Skeleton isLoaded={isLoaded} borderRadius={borderRadius} {...restProps}>
      {isCloudinary ? (
        // Use picture element for better format support
        <Box
          as="picture"
          style={{
            width: displayWidth,
            height: displayHeight,
            display: 'block'
          }}
        >
          {/* WebP format for modern browsers */}
          <source
            srcSet={generateCloudinarySrcSet(imageSrc.replace(/f_jpg/, 'f_webp'), width)}
            type="image/webp"
            sizes={sizes}
          />
          {/* AVIF format for best compression (some browser support) */}
          <source
            srcSet={generateCloudinarySrcSet(imageSrc.replace(/f_jpg/, 'f_auto'), width)}
            type="image/webp"
            sizes={sizes}
          />
          {/* JPG fallback */}
          <ChakraImage
            src={imageSrc}
            srcSet={srcSet}
            sizes={sizes}
            alt={alt}
            w={displayWidth}
            h={displayHeight}
            objectFit={objectFit}
            borderRadius={borderRadius}
            loading={loading}
            onLoad={() => setIsLoaded(true)}
            onError={() => setImageSrc(fallbackSrc)}
            onClick={onClick}
            cursor={cursor}
            {...restProps}
          />
        </Box>
      ) : (
        // For non-Cloudinary images, render directly
        <ChakraImage
          src={imageSrc}
          alt={alt}
          w={displayWidth}
          h={displayHeight}
          objectFit={objectFit}
          borderRadius={borderRadius}
          loading={loading}
          fallbackSrc={fallbackSrc}
          onLoad={() => setIsLoaded(true)}
          onClick={onClick}
          cursor={cursor}
          {...restProps}
        />
      )}
    </Skeleton>
  )
}

export default OptimizedImage
