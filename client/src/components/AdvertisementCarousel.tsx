import React, { useState, useEffect, useRef } from 'react'
import {
  Box,
  Image,
  IconButton,
  HStack,
  Text,
  Button,
  VStack,
  Flex,
  Skeleton,
} from '@chakra-ui/react'
import { ArrowLeftIcon, ArrowRightIcon } from '@chakra-ui/icons'
import { api } from '../services/api'
import { getImageUrl } from '../utils/imageUtils'

interface Advertisement {
  id: number
  title: string
  description: string
  media_url: string
  media_type: 'image' | 'video'
  link_url: string
  cta_text: string
  views: number
  clicks: number
}

const AdvertisementCarousel = () => {
  const [ads, setAds] = useState<Advertisement[]>([])
  const [loading, setLoading] = useState(true)
  const [slideIndex, setSlideIndex] = useState(0)
  const sliderIntervalRef = useRef<number | null>(null)
  const touchStartX = useRef<number | null>(null)

  useEffect(() => {
    const fetchAds = async () => {
      try {
        const response = await api.get('/api/advertisements/active')
        if (response.data?.success && response.data?.data) {
          setAds(response.data.data)
        }
      } catch (err) {
        console.error('Failed to fetch advertisements', err)
      } finally {
        setLoading(false)
      }
    }
    fetchAds()
  }, [])

  // Auto slide effect
  useEffect(() => {
    if (ads.length <= 1) return

    const startAuto = () => {
      sliderIntervalRef.current = window.setInterval(() => {
        setSlideIndex((prev) => (prev + 1) % ads.length)
      }, 5000)
    }

    startAuto()
    return () => {
      if (sliderIntervalRef.current) {
        window.clearInterval(sliderIntervalRef.current)
      }
    }
  }, [ads.length])

  // Track Views separately (when an ad becomes active on screen)
  useEffect(() => {
    if (ads.length > 0 && ads[slideIndex]) {
      const adId = ads[slideIndex].id
      api.post(`/api/advertisements/${adId}/view`).catch(() => {})
    }
  }, [slideIndex, ads])

  const scheduleResume = () => {
    if (sliderIntervalRef.current) window.clearInterval(sliderIntervalRef.current)
    if (ads.length > 1) {
      sliderIntervalRef.current = window.setInterval(() => {
        setSlideIndex((prev) => (prev + 1) % ads.length)
      }, 5000)
    }
  }

  const goNext = () => {
    if (ads.length <= 1) return
    setSlideIndex((i) => (i + 1) % ads.length)
    scheduleResume()
  }

  const goPrev = () => {
    if (ads.length <= 1) return
    setSlideIndex((i) => (i - 1 + ads.length) % ads.length)
    scheduleResume()
  }

  const handleCtaClick = (ad: Advertisement) => {
    api.post(`/api/advertisements/${ad.id}/click`).catch(() => {})
    if (ad.link_url) {
      window.open(ad.link_url, '_blank')
    }
  }

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null
  }

  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current == null) return
    const endX = e.changedTouches[0]?.clientX ?? 0
    const diff = touchStartX.current - endX
    if (Math.abs(diff) > 40) {
      if (diff > 0) goNext()
      else goPrev()
    }
    touchStartX.current = null
  }

  if (loading) {
    return (
      <Box w="full" maxW={{ lg: '1600px', xl: '1620px', '2xl': '1920px' }} mx={{ base: 'auto', lg: 0 }} ml={{ base: 0, md: -2, lg: -6, xl: -8 }} mb={8} px={{ base: 3, md: 6, lg: 8, xl: 10 }}>
        <Skeleton w="calc(100% - 30px)" mx="15px" h={{ base: 24, sm: 28, md: 32, lg: 40, xl: 44, '2xl': 48 }} rounded="lg" />
      </Box>
    )
  }

  // Fallback to static if no ads available
  if (ads.length === 0) {
    const staticAds = ['/1.jpg', '/2.jpg', '/3.jpg']
    return (
      <Box w="full" maxW={{ lg: '1600px', xl: '1620px', '2xl': '1920px' }} mx={{ base: 'auto', lg: 0 }} ml={{ base: 0, md: -2, lg: -6, xl: -8 }} mb={8} px={{ base: 3, md: 6, lg: 8, xl: 10 }}>
        <Box position="relative" overflow="hidden" w="calc(100% - 30px)" mx="15px" h={{ base: 24, sm: 28, md: 32, lg: 40, xl: 44, '2xl': 48 }} rounded="lg" bg="gray.100">
          <Image src={staticAds[0]} w="full" h="full" objectFit="cover" />
        </Box>
      </Box>
    )
  }

  return (
    <Box
      w="full"
      maxW={{ lg: '1600px', xl: '1620px', '2xl': '1920px' }}
      mx={{ base: 'auto', lg: 0 }}
      ml={{ base: 0, md: -2, lg: -6, xl: -8 }}
      mb={8}
      px={{ base: 3, md: 6, lg: 8, xl: 10 }}
    >
      <Box
        position="relative"
        overflow="hidden"
        w="calc(100% - 30px)"
        mx="15px"
        h={{ base: 32, sm: 40, md: 48, lg: 56, xl: 64, '2xl': 72 }}
        rounded="xl"
        bg="black"
        boxShadow="lg"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {ads.map((ad, idx) => (
          <Box
            key={ad.id}
            position="absolute"
            top={0}
            left={0}
            w="full"
            h="full"
            transition="opacity 600ms ease-in-out"
            opacity={idx === slideIndex ? 1 : 0}
            zIndex={idx === slideIndex ? 2 : 1}
            pointerEvents={idx === slideIndex ? 'auto' : 'none'}
          >
            {/* Background Media */}
            {ad.media_type === 'video' ? (
              <Box as="video" src={getImageUrl(ad.media_url)} autoPlay loop muted playsInline w="full" h="full" objectFit="cover" />
            ) : (
              <Image src={getImageUrl(ad.media_url)} w="full" h="full" objectFit="cover" />
            )}

            {/* Gradient Overlay for Text Readability */}
            <Box position="absolute" top={0} left={0} w="full" h="full" bgGradient="linear(to-r, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.2) 60%, transparent 100%)" />

            {/* Content Layer */}
            <Flex
              position="absolute"
              top={0}
              left={0}
              w="full"
              h="full"
              direction="column"
              justify="center"
              align="flex-start"
              px={{ base: 6, md: 12, lg: 16 }}
              color="white"
            >
              {ad.title && (
                <Text fontSize={{ base: 'xl', md: '3xl', lg: '4xl' }} fontWeight="extrabold" mb={2} textShadow="0 2px 10px rgba(0,0,0,0.5)" noOfLines={2} maxW="60%">
                  {ad.title}
                </Text>
              )}
              {ad.description && (
                <Text fontSize={{ base: 'sm', md: 'md', lg: 'lg' }} fontWeight="medium" mb={4} opacity={0.9} maxW="50%" display={{ base: 'none', sm: 'block' }} noOfLines={2}>
                  {ad.description}
                </Text>
              )}
              {ad.cta_text && ad.link_url && (
                <Button colorScheme="brand" size={{ base: 'sm', md: 'md' }} onClick={() => handleCtaClick(ad)} mt={2} _hover={{ transform: 'translateY(-2px)', shadow: 'md' }}>
                  {ad.cta_text}
                </Button>
              )}
              {!ad.cta_text && ad.link_url && (
                <Button colorScheme="whiteAlpha" backdropFilter="blur(5px)" variant="solid" size={{ base: 'sm', md: 'md' }} onClick={() => handleCtaClick(ad)} mt={2} _hover={{ transform: 'translateY(-2px)', shadow: 'md' }}>
                  Learn More
                </Button>
              )}
            </Flex>
          </Box>
        ))}

        {/* Navigation Arrows */}
        {ads.length > 1 && (
          <>
            <IconButton
              type="button"
              aria-label="Previous slide"
              icon={<ArrowLeftIcon />}
              position="absolute"
              left={{ base: 2, md: 4 }}
              top="50%"
              transform="translateY(-50%)"
              zIndex={10}
              size={{ base: 'sm', md: 'md' }}
              colorScheme="blackAlpha"
              variant="solid"
              backdropFilter="blur(5px)"
              display={{ base: 'none', sm: 'flex' }}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                goPrev()
              }}
            />
            <IconButton
              type="button"
              aria-label="Next slide"
              icon={<ArrowRightIcon />}
              position="absolute"
              right={{ base: 2, md: 4 }}
              top="50%"
              transform="translateY(-50%)"
              zIndex={10}
              size={{ base: 'sm', md: 'md' }}
              colorScheme="blackAlpha"
              variant="solid"
              backdropFilter="blur(5px)"
              display={{ base: 'none', sm: 'flex' }}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                goNext()
              }}
            />

            {/* Dots */}
            <HStack spacing={2} position="absolute" bottom={{ base: 2, md: 4 }} left="50%" transform="translateX(-50%)" zIndex={10}>
              {ads.map((_, i) => (
                <Box
                  key={i}
                  as="button"
                  w={i === slideIndex ? { base: 6, md: 10 } : { base: 2, md: 3 }}
                  h={i === slideIndex ? { base: 1.5, md: 2 } : { base: 2, md: 3 }}
                  bg={i === slideIndex ? 'brand.400' : 'whiteAlpha.600'}
                  borderRadius="full"
                  transition="all 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation()
                    setSlideIndex(i)
                    scheduleResume()
                  }}
                  _hover={{ bg: 'white' }}
                />
              ))}
            </HStack>
          </>
        )}
      </Box>
    </Box>
  )
}

export default AdvertisementCarousel
