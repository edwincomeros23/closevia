import { useState, useEffect, useRef, useMemo } from 'react'
import { Product } from '../types'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../services/api'

// Weights for each scoring component
const VALUE_WEIGHT = 0.35
const CATEGORY_WEIGHT = 0.30
const DEMAND_WEIGHT = 0.20
const PROXIMITY_WEIGHT = 0.15

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

function calcValueScore(userProducts: Product[], target: Product): number {
  const targetValue = getProductValue(target)
  if (!targetValue) return 50 // neutral if no value data

  let bestScore = 0
  for (const up of userProducts) {
    const userValue = getProductValue(up)
    if (!userValue) continue
    // Ratio-based similarity: 1.0 = perfect match, decays as ratio diverges
    const ratio = Math.min(userValue, targetValue) / Math.max(userValue, targetValue)
    const score = ratio * 100
    if (score > bestScore) bestScore = score
  }
  return bestScore || 30 // default if no user products have values
}

function calcCategoryScore(userProducts: Product[], target: Product): number {
  let score = 0
  const userCategories = new Set(userProducts.map(p => p.category?.toLowerCase()).filter(Boolean))
  const userWantedCats = new Set(
    userProducts.flatMap(p => (p.wanted_categories || []).map(c => c.toLowerCase()))
  )

  // Does the target product match what the user wants?
  const targetCat = target.category?.toLowerCase() || ''
  if (targetCat && userWantedCats.has(targetCat)) {
    score += 50 // user explicitly wants this category
  }

  // Does the user have products the target seller wants?
  const targetWantedCats = (target.wanted_categories || []).map(c => c.toLowerCase())
  for (const twc of targetWantedCats) {
    if (userCategories.has(twc)) {
      score += 50 // seller wants what user has
      break
    }
  }

  // Bonus for same-category products (easier to compare value)
  if (targetCat && userCategories.has(targetCat)) {
    score += 20
  }

  return Math.min(score, 100)
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

function calculateTradeScore(userProducts: Product[], target: Product): number {
  const value = calcValueScore(userProducts, target)
  const category = calcCategoryScore(userProducts, target)
  const demand = calcDemandScore(target)
  const proximity = calcProximityScore(target)

  const weighted = (
    value * VALUE_WEIGHT +
    category * CATEGORY_WEIGHT +
    demand * DEMAND_WEIGHT +
    proximity * PROXIMITY_WEIGHT
  )

  return Math.round(Math.max(0, Math.min(100, weighted)))
}

export function useTradeMatchScores(feedProducts: Product[]): Map<number, number> {
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
    const map = new Map<number, number>()
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
