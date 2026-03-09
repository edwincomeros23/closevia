import React from 'react'
import { Box, Skeleton, Grid, VStack, HStack } from '@chakra-ui/react'

export const ProductSkeleton: React.FC = () => {
  return (
    <Box
      borderRadius="lg"
      overflow="hidden"
      bg="white"
      boxShadow="sm"
      h="full"
      transition="all 0.2s"
      _hover={{ boxShadow: 'md' }}
    >
      {/* Image skeleton */}
      <Skeleton h="200px" w="100%" />

      {/* Content skeleton */}
      <VStack p={4} spacing={3} align="stretch">
        {/* Seller info */}
        <HStack spacing={2}>
          <Skeleton borderRadius="full" w={8} h={8} />
          <Skeleton h={4} w="40%" />
        </HStack>

        {/* Title */}
        <VStack spacing={1} align="stretch">
          <Skeleton h={5} w="100%" />
          <Skeleton h={4} w="80%" />
        </VStack>

        {/* Description */}
        <VStack spacing={1} align="stretch">
          <Skeleton h={3} w="100%" />
          <Skeleton h={3} w="90%" />
        </VStack>

        {/* Buttons */}
        <HStack spacing={2} mt="auto" pt={2}>
          <Skeleton h={8} flex={1} />
          <Skeleton h={8} flex={1} />
        </HStack>
      </VStack>
    </Box>
  )
}

interface ProductGridSkeletonProps {
  count?: number
}

export const ProductGridSkeleton: React.FC<ProductGridSkeletonProps> = ({ count = 12 }) => {
  return (
    <Grid
      templateColumns={{
        base: 'repeat(2, 1fr)',
        sm: 'repeat(2, 1fr)',
        md: 'repeat(auto-fill, minmax(240px, 1fr))',
        lg: 'repeat(3, 1fr)',
        xl: 'repeat(4, 1fr)',
        '2xl': 'repeat(5, 1fr)',
      }}
      gap={{ base: 2, md: 4 }}
      w="full"
    >
      {Array.from({ length: count }).map((_, idx) => (
        <ProductSkeleton key={idx} />
      ))}
    </Grid>
  )
}
