/**
 * Fallback price estimation based on product category and condition
 * Used when AI analysis fails to provide an estimate
 */

const CATEGORY_PRICE_RANGES: Record<string, { new: [number, number]; likeNew: [number, number]; good: [number, number]; used: [number, number]; forParts: [number, number] }> = {
  'Electronics': {
    new: [15000, 50000],
    likeNew: [10000, 40000],
    good: [5000, 25000],
    used: [3000, 15000],
    forParts: [1000, 5000],
  },
  'Mobile Phones': {
    new: [20000, 80000],
    likeNew: [15000, 60000],
    good: [8000, 35000],
    used: [5000, 20000],
    forParts: [2000, 8000],
  },
  'Home Appliances': {
    new: [10000, 60000],
    likeNew: [7000, 45000],
    good: [4000, 25000],
    used: [2000, 15000],
    forParts: [500, 5000],
  },
  'Fashion': {
    new: [500, 8000],
    likeNew: [400, 6000],
    good: [300, 4000],
    used: [200, 2000],
    forParts: [100, 800],
  },
  'Collectibles': {
    new: [2000, 100000],
    likeNew: [1500, 80000],
    good: [1000, 50000],
    used: [800, 30000],
    forParts: [500, 10000],
  },
  'Sports': {
    new: [2000, 25000],
    likeNew: [1500, 20000],
    good: [1000, 12000],
    used: [500, 8000],
    forParts: [300, 3000],
  },
  'Toys': {
    new: [500, 8000],
    likeNew: [400, 6000],
    good: [300, 4000],
    used: [200, 2000],
    forParts: [100, 800],
  },
  'Books': {
    new: [300, 5000],
    likeNew: [250, 4000],
    good: [200, 2500],
    used: [100, 1500],
    forParts: [50, 500],
  },
  'Automotive': {
    new: [50000, 2000000],
    likeNew: [40000, 1500000],
    good: [25000, 1000000],
    used: [15000, 600000],
    forParts: [5000, 200000],
  },
  'Other': {
    new: [1000, 15000],
    likeNew: [800, 12000],
    good: [500, 8000],
    used: [300, 5000],
    forParts: [100, 2000],
  },
}

/**
 * Estimate price based on category and condition
 * Returns min and max price range as a fallback when AI analysis is unavailable
 */
export const getBackupPriceEstimate = (
  category: string,
  condition: string
): { min: number; max: number } | null => {
  const categoryRanges = CATEGORY_PRICE_RANGES[category]
  
  if (!categoryRanges) {
    return null
  }

  const conditionKey = (condition || 'good').toLowerCase()
  const range = (categoryRanges as any)[conditionKey] || categoryRanges.good

  return {
    min: Math.round(range[0]),
    max: Math.round(range[1]),
  }
}
