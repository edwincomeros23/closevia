import React, { useCallback, useState, useEffect } from 'react'
import {
  Box,
  Heading,
  Text,
  Button,
  Image,
  Badge,
  HStack,
  Flex,
  Tooltip,
  Icon,
} from '@chakra-ui/react'
import { StarIcon } from '@chakra-ui/icons'
import { FaMoneyBillWave, FaHandshake, FaExchangeAlt, FaRocket } from 'react-icons/fa'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import { getFirstImage, getImageUrl } from '../utils/imageUtils'
import { getProductUrl } from '../utils/productUtils'
import { IconButton } from '@chakra-ui/react'
import VerifiedAvatar from './VerifiedAvatar'
import { api } from '../services/api'

interface ProductCardProps {
  product: any
  onTradeClick: (productId: number) => void
  onBuyoutClick: (productId: number) => void
  onBuyClick: (productId: number) => void
  onViewOffers: (productId: number) => void
  showPriceOverlay?: boolean
  onBoostClick?: (productId: number) => void
  isStagnant?: boolean
}

/**
 * ProductCard - Memoized product card component to prevent unnecessary re-renders
 * Displays product image, seller info, title, description, wishlist count, and action buttons
 */
const ProductCard: React.FC<ProductCardProps> = ({
  product,
  onTradeClick,
  onBuyoutClick,
  onBuyClick,
  onViewOffers,
  showPriceOverlay = false,
  onBoostClick,
  isStagnant = false,
}) => {
  const navigate = useNavigate()
  const [boostTimeRemaining, setBoostTimeRemaining] = useState<string | null>(null)
  const [isBoosted, setIsBoosted] = useState(false)

  // Calculate boost remaining time
  useEffect(() => {
    if (!product.boosted_at) {
      setIsBoosted(false)
      return
    }

    const calculateRemaining = () => {
      const boostedTime = new Date(product.boosted_at).getTime()
      const expiresAt = boostedTime + 3 * 60 * 60 * 1000 // 3 hours in ms
      const now = new Date().getTime()
      const remaining = expiresAt - now

      if (remaining <= 0) {
        setIsBoosted(false)
        setBoostTimeRemaining(null)
      } else {
        setIsBoosted(true)
        const hours = Math.floor(remaining / (60 * 60 * 1000))
        const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000))
        
        if (hours > 0) {
          setBoostTimeRemaining(`${hours}h ${minutes}m`)
        } else {
          setBoostTimeRemaining(`${minutes}m`)
        }
      }
    }

    calculateRemaining()
    const interval = setInterval(calculateRemaining, 60000) // Update every minute

    return () => clearInterval(interval)
  }, [product.boosted_at])

  const formatDistanceCompact = (rawDistance: unknown): string => {
    if (!rawDistance) return ''

    const raw = String(rawDistance).trim().toLowerCase()
    if (!raw) return ''

    const match = raw.match(/([\d.]+)\s*(km|m)\b/)
    if (!match) return ''

    const value = Number(match[1])
    const unit = match[2]
    if (!Number.isFinite(value)) return ''

    if (unit === 'm') {
      if (value < 1000) {
        return `${Math.round(value)}m`
      }

      const km = value / 1000
      const oneDecimal = Math.round(km * 10) / 10
      return `${oneDecimal.toString().replace(/\.0$/, '.0')}km`
    }

    const meters = value * 1000
    if (meters <= 2000) {
      return `${Math.round(meters)}m`
    }

    if (value < 10) {
      const oneDecimal = Math.round(value * 10) / 10
      return `${oneDecimal.toString().replace(/\.0$/, '')}km`
    }

    return `${Math.round(value)}km`
  }

  const compactDistance = formatDistanceCompact(product.distance)

  const sellerAvatar = product.seller_profile_picture
    ? getImageUrl(product.seller_profile_picture)
    : undefined

  // Memoize click handlers
  const handleCardClick = useCallback(async () => {
    // Increment view count when user clicks on the product card
    try {
      await api.post(`/api/products/${product.id}/view`)
    } catch (error) {
      // Silently fail - don't block navigation if view tracking fails
      console.error('Failed to track view:', error)
    }
    // Navigate to product details page
    navigate(getProductUrl(product))
  }, [product, navigate])

  const handleTradeClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onTradeClick(product.id)
    },
    [product.id, onTradeClick]
  )

  const handleBuyoutClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onBuyoutClick(product.id)
    },
    [product.id, onBuyoutClick]
  )

  const handleBuyClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onBuyClick(product.id)
    },
    [product.id, onBuyClick]
  )

  const handleViewOffers = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onViewOffers(product.id)
    },
    [product.id, onViewOffers]
  )

  const formatPriceCompact = (value: unknown): string => {
    const num = Number(value)
    if (!Number.isFinite(num)) return ''
    return num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })
  }

  const formatPriceUltraCompact = (value: unknown): string => {
    const num = Number(value)
    if (!Number.isFinite(num)) return ''
    if (num >= 1000000) return (num / 1000000).toFixed(0) + 'M'
    if (num >= 1000) return (num / 1000).toFixed(0) + 'k'
    return num.toString()
  }

  return (
    <Box
      key={product.id}
      bg="white"
      rounded="lg"
      shadow="sm"
      borderWidth="1px"
      borderColor="gray.100"
      overflow="hidden"
      transition="all 0.2s ease"
      w="full"
      h="full"
      display="flex"
      flexDirection="column"
      _hover={{ boxShadow: 'md', transform: 'translateY(-2px)', cursor: 'pointer' }}
      onClick={handleCardClick}
    >
      {/* Image section */}
      <Box position="relative" w="full" pt="100%" overflow="hidden" bg="gray.100">
        <Image
          src={getFirstImage(product.image_urls)}
          alt={product.title}
          position="absolute"
          top={0}
          left={0}
          w="100%"
          h="100%"
          objectFit="cover"
          loading="lazy"
          fallbackSrc="/no-image.svg"
        />

        {/* Top-right image badges */}
        <Box position="absolute" top={{ base: 1.5, md: 2 }} right={{ base: 1.5, md: 2 }} zIndex={1}>
          <Box display="flex" flexDirection="column" gap={1} alignItems="flex-end">
            {isStagnant && onBoostClick && (
              <Tooltip label="Boost this listing" placement="left" hasArrow>
                <Button
                  size="xs"
                  colorScheme="blue"
                  variant="solid"
                  fontSize={{ base: '10px', md: '11px' }}
                  px={{ base: 1, md: 1.5 }}
                  py={{ base: 0.5, md: 1 }}
                  onClick={(e) => {
                    e.stopPropagation()
                    onBoostClick(product.id)
                  }}
                  fontWeight="bold"
                  boxShadow="md"
                  _hover={{ transform: 'scale(1.05)', boxShadow: 'lg' }}
                  transition="all 0.2s"
                >
                  Boost
                </Button>
              </Tooltip>
            )}
            {product.premium && (
              <Badge
                colorScheme="yellow"
                variant="solid"
                borderRadius="full"
                px={2}
              >
                <StarIcon mr={0} />
              </Badge>
            )}

            {/* Boosted indicator - Minimal and lowkey */}
            {isBoosted && boostTimeRemaining && (
              <Tooltip label={`Boosted for ${boostTimeRemaining} more`} placement="left" hasArrow>
                <Badge
                  colorScheme="orange"
                  variant="subtle"
                  borderRadius="md"
                  px={1.5}
                  py={0.5}
                  display="flex"
                  alignItems="center"
                  gap={0.5}
                  fontSize="9px"
                  fontWeight="600"
                  bg="orange.50"
                  color="orange.700"
                  borderWidth="1px"
                  borderColor="orange.200"
                >
                  <Icon as={FaRocket} boxSize={2.5} />
                  <Text fontSize="9px">{boostTimeRemaining}</Text>
                </Badge>
              </Tooltip>
            )}

            {showPriceOverlay && (
              <Box
                px={{ base: 1.5, md: 2.5 }}
                py={{ base: 0.75, md: 1.5 }}
                bg="blackAlpha.700"
                color="white"
                borderRadius="lg"
                textAlign="right"
                display="inline-flex"
                flexDirection="column"
                alignItems="flex-end"
                w="auto"
                borderWidth="1px"
                borderColor="whiteAlpha.300"
                boxShadow="md"
                backdropFilter="blur(4px)"
              >
                <Text fontSize={{ base: '2xs', md: 'xs' }} fontWeight="bold" lineHeight="1.2" letterSpacing="0.01em">
                  {product.price && product.price > 0
                    ? `₱${formatPriceCompact(product.price)}`
                    : product.estimated_value_min && product.estimated_value_max
                      ? `₱${formatPriceCompact(product.estimated_value_min)} – ₱${formatPriceCompact(product.estimated_value_max)}`
                      : 'Price Unavailable'}
                </Text>
                {product.price && product.price > 0 && product.estimated_value_min && product.estimated_value_max && (
                  <Text display={{ base: 'none', sm: 'block' }} fontSize="2xs" color="brand.100" lineHeight="1.25" mt={0.5} fontWeight="medium" whiteSpace="nowrap">
                    📊 Market Est. ₱{formatPriceCompact(product.estimated_value_min)} – ₱{formatPriceCompact(product.estimated_value_max)}
                  </Text>
                )}
                {product.price && product.price > 0 && product.estimated_value_min && product.estimated_value_max && (
                  <Text display={{ base: 'block', sm: 'none' }} fontSize="2xs" color="brand.100" lineHeight="1.2" mt={0.5} fontWeight="medium" whiteSpace="nowrap">
                    📊 Est. ₱{formatPriceUltraCompact(product.estimated_value_min)}-₱{formatPriceUltraCompact(product.estimated_value_max)}
                  </Text>
                )}
                {(!product.price || product.price <= 0) && product.estimated_value_min && product.estimated_value_max && (
                  <Text fontSize="2xs" color="brand.100" lineHeight="1.25" mt={0.5} fontWeight="medium">
                    📊 Market Est. range
                  </Text>
                )}
              </Box>
            )}
          </Box>
        </Box>

        {/* Trade Ready score badge */}
        {product.tradeMatchScore != null && product.tradeMatchScore > 0 && (
          <Tooltip
            hasArrow
            placement="top-start"
            label={
              product.tradeMatchBreakdown
                ? `${product.tradeMatchBreakdown.isSuperCheap ? 'Warning: super cheap vs AI estimate | ' : ''}Value ${product.tradeMatchBreakdown.value} | Category ${product.tradeMatchBreakdown.category} | Demand ${product.tradeMatchBreakdown.demand} | Distance ${product.tradeMatchBreakdown.distance}${product.tradeMatchBreakdown.valueNote ? ` | ${product.tradeMatchBreakdown.valueNote}` : ''}`
                : 'Trade ready score'
            }
          >
            <Badge
              position="absolute"
              top={2}
              left={2}
              variant="solid"
              borderRadius="full"
              px={2}
              py={0.5}
              fontSize="10px"
              fontWeight="bold"
              bg={product.tradeMatchScore >= 70 ? 'green.500' : product.tradeMatchScore >= 40 ? 'yellow.500' : 'gray.500'}
              color="white"
            >
              <Text display={{ base: 'block', md: 'none' }}>{product.tradeMatchScore}% ✓</Text>
              <Text display={{ base: 'none', md: 'block' }}>{product.tradeMatchScore}% Ready</Text>
            </Badge>
          </Tooltip>
        )}

        {/* Status badge (e.g. sold) */}
        {product.status === 'sold' && (
          <Badge
            position="absolute"
            bottom={2}
            right={2}
            colorScheme="red"
            variant="solid"
            borderRadius="full"
            px={2}
          >
            Sold
          </Badge>
        )}

        {/* Location badge */}
        {compactDistance && (
          <Badge
            position="absolute"
            bottom={2}
            left={2}
            colorScheme="gray"
            variant="solid"
            borderRadius="full"
            px={2}
            bg="blackAlpha.600"
            color="white"
            fontSize="xs"
          >
            <Text as="span" mr={1}>
              📍
            </Text>
            {compactDistance}
          </Badge>
        )}
      </Box>

      {/* Info section */}
      <Box
        p={{ base: 2, md: 2.5 }}
        display="flex"
        flexDirection="column"
        flex={1}
        overflow="hidden"
      >
        {/* Seller row (desktop) */}
        <Flex justify="space-between" align="center" mb={1}>
          <HStack spacing={1} align="center" mt="auto">
            {((product as any).seller_slug || product.seller_id) ? (
              <RouterLink to={`/users/${(product as any).seller_slug || product.seller_id}`} onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                <VerifiedAvatar
                  size={{ base: 'xs', md: 'sm' } as any}
                  src={sellerAvatar}
                  name={product.seller_name || 'U'}
                  bg="brand.500"
                  flexShrink={0}
                  cursor="pointer"
                  _hover={{ opacity: 0.8 }}
                  isVerified={product.seller_verified || false}
                />
              </RouterLink>
            ) : (
              <VerifiedAvatar
                size={{ base: 'xs', md: 'sm' } as any}
                src={sellerAvatar}
                name={product.seller_name || 'U'}
                bg="brand.500"
                flexShrink={0}
                isVerified={product.seller_verified || false}
              />
            )}
            <Text fontSize={{ base: 'xs', md: 'xs' }} color="black" fontWeight="medium" noOfLines={1}>
              {product.seller_name || 'Unknown'}
            </Text>
          </HStack>
          <Badge fontSize={{ base: 'xs', md: '2xs' }} colorScheme="blue" flexShrink={0} borderWidth="1px">
            {product.condition || 'Used'}
          </Badge>
        </Flex>

        {/* Title */}
        <Heading
          size="sm"
          noOfLines={1}
          mb={1}
          color="gray.800"
          flexShrink={0}
          textAlign="left"
          fontSize={{ base: '12px', md: '13px' }}
          lineHeight="1.3"
        >
          {product.title}
        </Heading>

        {/* Description */}
        <Text
          color="gray.600"
          noOfLines={1}
          mb={1}
          fontSize={{ base: '11px', md: '12px' }}
          flexShrink={0}
          textAlign="left"
        >
          {product.description
            ? product.description
              .split(' ')
              .slice(0, product.description.split(' ').length > 15 ? 8 : 15)
              .join(' ') + (product.description.split(' ').length > 15 ? '...' : '')
            : 'No description available'}
        </Text>

        {/* Product Value */}
        {product.value !== undefined && product.value > 0 && (
          <Text
            fontSize="xs"
            fontWeight="bold"
            color="green.600"
            mb={0.5}
          >
            ₱{(product.value as number).toLocaleString()}
          </Text>
        )}

        {/* Wishlist badge */}
        <Flex mb={1} align="center" gap={1} minH={{ base: '16px', md: '18px' }}>
          {product.wishlist_count > 0 && (
            <Badge
              colorScheme="pink"
              variant="subtle"
              borderRadius="full"
              px={2}
              py={0.5}
              fontSize="xs"
            >
              ❤️ {product.wishlist_count} {product.wishlist_count === 1 ? 'person wants' : 'people want'}
            </Badge>
          )}
          
          {/* Boosted indicator - minimal at bottom */}
          {isBoosted && (
            <Badge
              colorScheme="orange"
              variant="subtle"
              borderRadius="full"
              px={2}
              py={0.5}
              fontSize="xs"
              bg="orange.50"
              color="orange.600"
              ml="auto"
              display="flex"
              alignItems="center"
              gap={0.5}
            >
              <Icon as={FaRocket} boxSize={3} />
              Boosted
            </Badge>
          )}
        </Flex>

        {/* Organization Tags */}
        {product.organization_tags && product.organization_tags.length > 0 && (
          <Flex mb={1.5} align="center" gap={1} flexWrap="wrap">
            {product.organization_tags.map((org: any) => (
              <Tooltip key={org.id} label={org.description || org.name} placement="top" hasArrow>
                <Badge
                  as="a"
                  href={`/organizations/${org.slug}`}
                  onClick={(e: React.MouseEvent) => e.stopPropagation()}
                  colorScheme="purple"
                  variant="subtle"
                  borderRadius="full"
                  px={2}
                  py={0.5}
                  fontSize="xs"
                  cursor="pointer"
                  _hover={{ transform: 'scale(1.05)', boxShadow: 'sm' }}
                  transition="all 0.2s"
                  display="flex"
                  alignItems="center"
                  gap={1}
                >
                  {org.logo_url && (
                    <Image
                      src={org.logo_url}
                      alt={org.name}
                      boxSize="14px"
                      borderRadius="50%"
                      onError={(e: any) => {
                        e.target.style.display = 'none'
                      }}
                    />
                  )}
                  <Text fontSize="10px" noOfLines={1}>
                    {org.name}
                  </Text>
                </Badge>
              </Tooltip>
            ))}
          </Flex>
        )}

        {/* Action buttons */}
        <HStack spacing={1} mt="auto" flexWrap={{ base: 'wrap', md: 'nowrap' }}>
          <Tooltip label="Trade" placement="top">
            <Button
              size="xs"
              variant="outline"
              colorScheme="brand"
              leftIcon={<Icon as={FaExchangeAlt} />}
              flex={1}
              fontSize={{ base: '11px', md: '12px' }}
              onClick={handleTradeClick}
              isDisabled={product.status === 'sold'}
              transition="all 0.2s"
              _hover={{ transform: 'translateY(-1px)' }}
              _active={{ transform: 'scale(0.98)' }}
            >
              {product.status === 'sold' ? 'Sold' : 'Trade'}
            </Button>
          </Tooltip>

          <Button
            size="xs"
            variant="outline"
            colorScheme="orange"
            leftIcon={<Icon as={FaMoneyBillWave} />}
            flex={1}
            fontSize={{ base: '11px', md: '12px' }}
            _hover={{ transform: 'translateY(-1px)' }}
            _active={{ transform: 'scale(0.98)' }}
            onClick={handleBuyoutClick}
            isDisabled={product.status === 'sold'}
            transition="all 0.2s"
          >
            Buyout
          </Button>

          <Tooltip label="View offers" placement="top">
            <IconButton
              aria-label="View offers"
              icon={<FaHandshake />}
              size="xs"
              variant="outline"
              colorScheme="blue"
              onClick={handleViewOffers}
              isDisabled={product.status === 'sold'}
              flexShrink={0}
              transition="all 0.2s"
              _hover={{ transform: 'translateY(-1px)' }}
              _active={{ transform: 'scale(0.98)' }}
            />
          </Tooltip>
        </HStack>
      </Box>
    </Box>
  )
}

export default React.memo(ProductCard)
