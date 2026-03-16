import React, { useCallback } from 'react'
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
import { FaTag, FaHandshake } from 'react-icons/fa'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import { getFirstImage, getImageUrl } from '../utils/imageUtils'
import { getProductUrl } from '../utils/productUtils'
import { IconButton } from '@chakra-ui/react'
import VerifiedAvatar from './VerifiedAvatar'

interface ProductCardProps {
  product: any
  onTradeClick: (productId: number) => void
  onBuyoutClick: (productId: number) => void
  onBuyClick: (productId: number) => void
  onViewOffers: (productId: number) => void
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
}) => {
  const navigate = useNavigate()

  const sellerAvatar = product.seller_profile_picture
    ? getImageUrl(product.seller_profile_picture)
    : undefined

  // Memoize click handlers
  const handleCardClick = useCallback(() => {
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
          fallbackSrc="https://via.placeholder.com/600x600?text=No+Image"
        />

        {/* Premium / type badge */}
        {product.premium && (
          <Badge
            position="absolute"
            top={2}
            right={2}
            colorScheme="yellow"
            variant="solid"
            borderRadius="full"
            px={2}
          >
            <StarIcon mr={0} />
          </Badge>
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
          {product.distance || 'Nearby'}
        </Badge>
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
        </Flex>

        {/* Action buttons */}
        <HStack spacing={1} mt="auto" flexWrap={{ base: 'wrap', md: 'nowrap' }}>
          <Button
            size="xs"
            variant="outline"
            colorScheme="brand"
            flex={1}
            minW={{ base: '50px', md: 'auto' }}
            fontSize={{ base: '11px', md: '12px' }}
            onClick={handleTradeClick}
            isDisabled={product.status === 'sold'}
            transition="all 0.2s"
            _hover={{ transform: 'translateY(-1px)' }}
            _active={{ transform: 'scale(0.98)' }}
          >
            {product.status === 'sold' ? 'Sold' : 'Trade'}
          </Button>

          <Tooltip label="Buyout offer" placement="top">
            <IconButton
              aria-label="Buyout offer"
              icon={<Icon as={FaTag} color="yellow.500" />}
              size="xs"
              variant="outline"
              borderColor="yellow.400"
              _hover={{ borderColor: 'yellow.500', bg: 'yellow.50', transform: 'translateY(-1px)' }}
              _active={{ transform: 'scale(0.98)' }}
              onClick={handleBuyoutClick}
              isDisabled={product.status === 'sold'}
              flexShrink={0}
              transition="all 0.2s"
            />
          </Tooltip>

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
