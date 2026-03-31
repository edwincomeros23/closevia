import { useState, useEffect, useRef, useMemo } from 'react'
import { Product } from '../types'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../services/api'

// Weights for each scoring component
const VALUE_WEIGHT = 0.65
const CATEGORY_WEIGHT = 0.15
const DEMAND_WEIGHT = 0.10
const PROXIMITY_WEIGHT = 0.10

// Price-alignment thresholds (tunable in one place)
const SLIGHTLY_BELOW_MIN_RATIO = 0.85
const SUPER_CHEAP_MIN_RATIO = 0.70
const SLIGHTLY_ABOVE_MAX_RATIO = 1.15
const MODERATELY_ABOVE_MAX_RATIO = 1.40

export interface TradeMatchBreakdown {
  value: number
  category: number
  demand: number
  distance: number
  total: number
  isSuperCheap?: boolean
  valueNote?: string
}

function getProductValue(p: Product): number | null {
  // Use typed value fields: price, estimated range, suggested_value
  if (p.price && p.price > 0) return p.price
  if (p.estimated_value_min && p.estimated_value_max) {
    return (p.estimated_value_min + p.estimated_value_max) / 2
  }
  if (p.suggested_value && p.suggested_value > 0) return p.suggested_value
  if (p.desired_price && p.desired_price > 0) return p.desired_price
  return null
}

function calcEstimateAlignment(target: Product): { score: number; isSuperCheap: boolean; note: string } {
  const listedPrice = Number(target.price)
  const fairMin = Number(target.estimated_value_min)
  const fairMax = Number(target.estimated_value_max)

  const hasPrice = Number.isFinite(listedPrice) && listedPrice > 0
  const hasFairRange = Number.isFinite(fairMin) && Number.isFinite(fairMax) && fairMin > 0 && fairMax > fairMin

  if (!hasPrice || !hasFairRange) {
    return { score: 60, isSuperCheap: false, note: 'No AI range data' }
  }

  // In range gets high value confidence.
  if (listedPrice >= fairMin && listedPrice <= fairMax) {
    return { score: 95, isSuperCheap: false, note: 'Price within AI range' }
  }

  const belowRatio = listedPrice / fairMin

  // Slightly below fair range is still considered attractive/healthy.
  if (listedPrice < fairMin && belowRatio >= SLIGHTLY_BELOW_MIN_RATIO) {
    return { score: 88, isSuperCheap: false, note: 'Slightly below AI range (good)' }
  }

  // Moderately below range: still okay but lower confidence.
  if (listedPrice < fairMin && belowRatio >= SUPER_CHEAP_MIN_RATIO) {
    return { score: 62, isSuperCheap: false, note: 'Below AI range' }
  }

  // Extremely low price can indicate mismatch/risk; flag it.
  if (listedPrice < fairMin && belowRatio < SUPER_CHEAP_MIN_RATIO) {
    return { score: 25, isSuperCheap: true, note: 'Super cheap vs AI range' }
  }

  // Above range gets lower value confidence but not as severe as extreme underpricing.
  const aboveRatio = listedPrice / fairMax
  if (aboveRatio <= SLIGHTLY_ABOVE_MAX_RATIO) {
    return { score: 72, isSuperCheap: false, note: 'Slightly above AI range' }
  }
  if (aboveRatio <= MODERATELY_ABOVE_MAX_RATIO) {
    return { score: 52, isSuperCheap: false, note: 'Above AI range' }
  }
  return { score: 35, isSuperCheap: false, note: 'Far above AI range' }
}

function calcValueScore(userProducts: Product[], target: Product): { score: number; isSuperCheap: boolean; note: string } {
  const targetValue = getProductValue(target)
  const estimate = calcEstimateAlignment(target)
  if (!targetValue) {
    return { score: estimate.score, isSuperCheap: estimate.isSuperCheap, note: estimate.note }
  }

  const similarityScores: number[] = []
  for (const up of userProducts) {
    const userValue = getProductValue(up)
    if (!userValue) continue
    // Ratio-based similarity: 1.0 = perfect match, decays as ratio diverges
    const ratio = Math.min(userValue, targetValue) / Math.max(userValue, targetValue)
    const score = ratio * 100
    similarityScores.push(score)
  }

  if (similarityScores.length === 0) {
    return { score: estimate.score, isSuperCheap: estimate.isSuperCheap, note: estimate.note }
  }

  // Use average of the best 3 matches to avoid one lucky outlier dominating the score.
  const topThree = similarityScores.sort((a, b) => b - a).slice(0, 3)
  const avgTopThree = topThree.reduce((sum, s) => sum + s, 0) / topThree.length

  // Blend personal inventory matching with AI fair-range alignment.
  const blended = avgTopThree * 0.6 + estimate.score * 0.4

  return {
    score: Math.round(blended),
    isSuperCheap: estimate.isSuperCheap,
    note: estimate.note,
  }
}

function calcCategoryScore(userProducts: Product[], target: Product): number {
  let score = 0
  const userCategories = new Set(userProducts.map(p => p.category?.toLowerCase()).filter(Boolean))
  const userWantedCats = new Set(
    userProducts.flatMap(p => (p.wanted_categories || []).map(c => c.toLowerCase()))
  )

  const targetCat = target.category?.toLowerCase() || ''
  const targetWantedCats = (target.wanted_categories || []).map(c => c.toLowerCase())

  const userWantsTargetCategory = targetCat ? userWantedCats.has(targetCat) : false
  const targetWantsUserCategoryMatches = targetWantedCats.filter((cat) => userCategories.has(cat))
  const targetWantsUserCategory = targetWantsUserCategoryMatches.length > 0

  // Full intent points require both sides to express category intent.
  if (userWantsTargetCategory && targetWantsUserCategory) {
    score += 70
  } else if (userWantsTargetCategory || targetWantsUserCategory) {
    score += 30
  }

  // Precision bonus: how much of target's wanted categories can user satisfy.
  if (targetWantedCats.length > 0) {
    const overlapRatio = targetWantsUserCategoryMatches.length / targetWantedCats.length
    score += overlapRatio * 20
  }

  // Small fallback relevance if user already trades in this category.
  if (targetCat && userCategories.has(targetCat)) {
    score += 10
  }

  return Math.round(Math.min(score, 100))
}

function calcDemandScore(target: Product): number {
  const wants = target.want_count || 0
  const offers = target.offer_count || 0
  const total = wants + offers
  // Logarithmic scaling: 0→0, 1→40, 3→60, 10→80, 30+→95
  if (total === 0) return 20
  return Math.min(20 + Math.log(total + 1) * 22, 100)
}

function calcProximityScore(target: Product): number {
  const km = target.distanceKm
  if (km === undefined || km === null || km === Infinity) return 40 // unknown location
  if (km <= 1) return 100
  if (km <= 5) return 90
  if (km <= 10) return 75
  if (km <= 25) return 55
  if (km <= 50) return 35
  return 15
}

function calculateTradeScore(userProducts: Product[], target: Product): TradeMatchBreakdown {
  const valueResult = calcValueScore(userProducts, target)
  const value = valueResult.score
  const category = calcCategoryScore(userProducts, target)
  const demand = calcDemandScore(target)
  const proximity = calcProximityScore(target)

  const weighted = Math.round(
    value * VALUE_WEIGHT +
    category * CATEGORY_WEIGHT +
    demand * DEMAND_WEIGHT +
    proximity * PROXIMITY_WEIGHT
  )

  return {
    value: Math.round(value),
    category: Math.round(category),
    demand: Math.round(demand),
    distance: Math.round(proximity),
    total: Math.max(0, Math.min(100, weighted)),
    isSuperCheap: valueResult.isSuperCheap,
    valueNote: valueResult.note,
  }
}

export function useTradeMatchScores(feedProducts: Product[]): Map<number, TradeMatchBreakdown> {
  const { user } = useAuth()
  const [userProducts, setUserProducts] = useState<Product[]>([])
  const fetchedRef = useRef(false)
  const userIdRef = useRef<number | null>(null)

  // Fetch user's products once
  useEffect(() => {
    if (!user?.id) {
      setUserProducts([])
      fetchedRef.current = false
      userIdRef.current = null
      return
    }

    // Only refetch if user changed
    if (fetchedRef.current && userIdRef.current === user.id) return
    fetchedRef.current = true
    userIdRef.current = user.id

    const fetch = async () => {
      try {
        const res = await api.get(`/api/products/user/${user.id}?page=1&limit=50`)
        const data = res.data?.data
        if (data?.data && Array.isArray(data.data)) {
          setUserProducts(data.data.filter((p: Product) => p.status === 'available'))
        }
      } catch {
        // Silent fail — scores just won't show
      }
    }
    fetch()
  }, [user?.id])

  // Calculate scores for all feed products
  const scores = useMemo(() => {
    const map = new Map<number, TradeMatchBreakdown>()
    if (userProducts.length === 0 || !user?.id) return map

    for (const product of feedProducts) {
      // Don't score user's own products
      if (product.seller_id === user.id) continue
      map.set(product.id, calculateTradeScore(userProducts, product))
    }
    return map
  }, [feedProducts, userProducts, user?.id])

  return scores
}
