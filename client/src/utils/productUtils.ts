import { Product } from '../types'

/**
 * Get the product URL using slug if available, otherwise fall back to ID
 * This ensures backward compatibility while using SEO-friendly slugs
 */
export const getProductUrl = (product: Product | { id: number; slug?: string }): string => {
  const slug = 'slug' in product ? product.slug : undefined
  const id = 'id' in product ? product.id : undefined
  return `/products/${slug || id}`
}

/**
 * Get product identifier (slug or ID) for navigation
 */
export const getProductIdentifier = (product: Product | { id: number; slug?: string }): string | number => {
  const slug = 'slug' in product ? product.slug : undefined
  return slug || ('id' in product ? product.id : '')
}

