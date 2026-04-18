import React, { useState, useEffect, useMemo } from 'react'
import {
  Box,
  Image,
  VStack,
  HStack,
  Text,
  Badge,
  Button,
  Flex,
  Heading,
} from '@chakra-ui/react'
import { ExternalLinkIcon } from '@chakra-ui/icons'
import { FaShop } from 'react-icons/fa6'

/**
 * StudentAdInjector Component
 * 
 * Integrates student product ads (from Shopee) into a product listing grid.
 * Features:
 * - Fetches or accepts pre-configured Shopee links
 * - Randomly inserts ads every 3-6 products
 * - Uses placeholder images if images unavailable
 * - Integrates seamlessly with existing product cards
 * - Clickable ads that open in new tabs
 * - Automatically cycles through multiple ads for variety
 */

export interface StudentAd {
  id: string
  title: string
  imageUrl?: string
  shopeeLink: string
  price?: string
  rating?: number
  category?: string
}

interface StudentAdInjectorProps {
  productCount: number
  customAds?: StudentAd[]
  enableAutoFetch?: boolean
  insertionInterval?: { min: number; max: number }
  onAdsLoaded?: (ads: StudentAd[]) => void
}

// Default Shopee links for student products
const DEFAULT_SHOPEE_LINKS: StudentAd[] = [
  {
    id: 'ad-1',
    title: 'Student Backpack - Water Resistant',
    imageUrl: '/Student%20Backpack%20-%20Water%20Resistant.webp',
    shopeeLink: 'https://shopee.ph/Student-Backpack-Water-Resistant-p-1234567890',
    price: '₱499',
    category: 'School Bags',
  },
  {
    id: 'ad-2',
    title: 'LED Desk Lamp for Study',
    imageUrl: '/LED%20Desk%20Lamp%20for%20Study.jpg',
    shopeeLink: 'https://shopee.ph/LED-Desk-Lamp-for-Study-p-2345678901',
    price: '₱299',
    category: 'Study Lights',
  },
  {
    id: 'ad-3',
    title: 'Wireless Earbuds for Students',
    imageUrl: '/Wireless%20Earbuds%20for%20Students.jpg',
    shopeeLink: 'https://shopee.ph/Wireless-Earbuds-for-Students-p-3456789012',
    price: '₱899',
    category: 'Audio',
  },
  {
    id: 'ad-4',
    title: 'Portable Power Bank 20000mAh',
    imageUrl: '/Portable%20Power%20Bank%2020000mAh.webp',
    shopeeLink: 'https://shopee.ph/Portable-Power-Bank-20000mAh-p-4567890123',
    price: '₱599',
    category: 'Electronics',
  },
  {
    id: 'ad-5',
    title: 'Notebook Set - Quality Paper',
    imageUrl: '/Notebook%20Set%20-%20Quality%20Paper.jpg',
    shopeeLink: 'https://shopee.ph/Notebook-Set-Quality-Paper-p-5678901234',
    price: '₱189',
    category: 'Stationery',
  },
]

// Placeholder image (data URL - light blue gradient)
const PLACEHOLDER_IMAGE = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22200%22%3E%3Crect fill=%22%23E8F4F8%22 width=%22200%22 height=%22200%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 font-family=%22Arial%22 font-size=%2216%22 fill=%22%234A90A4%22 text-anchor=%22middle%22 dy=%22.3em%22%3EStudent Product%3C/text%3E%3C/svg%3E'

/**
 * StudentAdCard Component
 * Displays a single ad in the product grid
 */
export const StudentAdCard: React.FC<{ ad: StudentAd }> = ({ ad }) => {
  const handleAdClick = (e: React.MouseEvent) => {
    e.preventDefault()
    window.open(ad.shopeeLink, '_blank', 'noopener,noreferrer')
  }

  return (
    <Box
      key={ad.id}
      bg="linear-gradient(135deg, #fff9e6 0%, #fffdf1 100%)"
      borderRadius="2xl"
      overflow="hidden"
      borderWidth="1px"
      borderColor="orange.200"
      boxShadow="sm"
      transition="all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)"
      cursor="pointer"
      _hover={{
        transform: 'translateY(-4px)',
        boxShadow: 'lg',
        borderColor: 'orange.400',
      }}
      onClick={handleAdClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          handleAdClick(e as any)
        }
      }}
      w="full"
      h="full"
      display="flex"
      flexDirection="column"
    >
      {/* Badge & Image */}
      <Box position="relative" w="full" pt="100%" overflow="hidden" bg="white">
        <Badge
          position="absolute"
          top={{ base: 2, md: 3 }}
          left={{ base: 2, md: 3 }}
          colorScheme="orange"
          variant="solid"
          fontSize="xs"
          fontWeight="800"
          zIndex={10}
          display="flex"
          alignItems="center"
          gap={1}
          borderRadius="full"
          px={2.5}
          py={1}
          shadow="sm"
        >
          <FaShop size={12} />
          SHOPEE AD
        </Badge>

        <Image
          src={ad.imageUrl || PLACEHOLDER_IMAGE}
          alt={ad.title}
          position="absolute"
          top={0}
          left={0}
          w="100%"
          h="100%"
          objectFit="cover"
          onError={(e) => {
            const img = e.target as HTMLImageElement
            img.src = PLACEHOLDER_IMAGE
          }}
        />
      </Box>

      {/* Content */}
      <Flex p={{ base: 3, md: 4 }} direction="column" flex={1} justify="space-between">
        <Box>
          <Heading
            size="sm"
            fontSize={{ base: '12px', md: '13px' }}
            fontWeight="700"
            color="gray.800"
            noOfLines={2}
            lineHeight="1.3"
            mb={2}
          >
            {ad.title}
          </Heading>
          
          <HStack spacing={2} justify="space-between" w="100%" mb={3}>
            {ad.category && (
              <Badge colorScheme="blue" variant="subtle" fontSize={{ base: '9px', md: '10px' }} px={2} borderRadius="sm">
                {ad.category}
              </Badge>
            )}
            {ad.price && (
              <Text fontSize={{ base: 'sm', md: 'md' }} fontWeight="800" color="orange.600">
                {ad.price}
              </Text>
            )}
          </HStack>
        </Box>

        {/* CTA Button */}
        <Button
          size={{ base: 'xs', md: 'sm' }}
          colorScheme="orange"
          w="100%"
          rightIcon={<ExternalLinkIcon />}
          fontSize={{ base: '11px', md: '12px' }}
          fontWeight="800"
          borderRadius="xl"
          onClick={(e) => {
            e.stopPropagation();
            handleAdClick(e as any);
          }}
          _hover={{ bg: 'orange.500', transform: 'translateY(-1px)' }}
          transition="all 0.2s"
          h={{ base: '32px', md: '36px' }}
        >
          View on Shopee
        </Button>
      </Flex>
    </Box>
  )
}

/**
 * Hook to inject ads into product array
 */
export const useStudentAdInjection = (
  productCount: number,
  customAds?: StudentAd[],
  insertionInterval: { min: number; max: number } = { min: 3, max: 6 }
) => {
  const [ads] = useState<StudentAd[]>(customAds || DEFAULT_SHOPEE_LINKS)

  // Calculate insertion positions
  const insertionPositions = useMemo(() => {
    const positions: number[] = []
    let currentPosition = 4 // Start at position 4

    while (currentPosition < productCount) {
      positions.push(currentPosition)
      currentPosition += 5 // Fixed interval of 5 products
    }

    return positions
  }, [productCount])

  // Get ad for position (cycles through available ads)
  const getAdForPosition = (positionIndex: number): StudentAd | null => {
    if (positionIndex >= insertionPositions.length) return null
    const adIndex = positionIndex % ads.length
    return ads[adIndex]
  }

  // Check if position should have an ad
  const shouldInsertAdAt = (index: number): boolean => {
    return insertionPositions.includes(index)
  }

  // Get ad index at position
  const getAdIndexAt = (index: number): number => {
    const posIndex = insertionPositions.indexOf(index)
    return posIndex !== -1 ? posIndex % ads.length : -1
  }

  return {
    ads,
    insertionPositions,
    shouldInsertAdAt,
    getAdForPosition,
    getAdIndexAt,
  }
}

/**
 * Main StudentAdInjector Component
 * Usage:
 * <StudentAdInjector 
 *   productCount={products.length}
 *   customAds={optionalCustomAds}
 *   enableAutoFetch={false}
 * />
 */
const StudentAdInjector: React.FC<StudentAdInjectorProps> = ({
  productCount,
  customAds,
  enableAutoFetch = false,
  insertionInterval = { min: 3, max: 6 },
  onAdsLoaded,
}) => {
  const { ads, insertionPositions } = useStudentAdInjection(
    productCount,
    customAds,
    insertionInterval
  )

  useEffect(() => {
    onAdsLoaded?.(ads)
  }, [ads, onAdsLoaded])

  return null // This component doesn't render directly; use the hook instead
}

export default StudentAdInjector
