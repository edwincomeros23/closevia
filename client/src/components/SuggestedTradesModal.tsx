import React, { useEffect, useState } from 'react';
import {
    Modal, ModalOverlay, ModalContent, ModalHeader, ModalCloseButton, ModalBody,
    VStack, HStack, Text, Image, Button, Spinner, Center, Box, Icon, Badge, useToast, Tooltip
} from '@chakra-ui/react';
import { FaExchangeAlt, FaRegLightbulb, FaHeart } from 'react-icons/fa';
import { api } from '../services/api';
import { Product } from '../types';
import { getFirstImage } from '../utils/imageUtils';

interface SuggestedTradesModalProps {
    isOpen: boolean;
    onClose: () => void;
    product: Product | null;
    onTradeClick: (targetProduct: Product) => void;
}

export const SuggestedTradesModal: React.FC<SuggestedTradesModalProps> = ({ isOpen, onClose, product, onTradeClick: _onTradeClick }) => {
    const [suggestions, setSuggestions] = useState<Product[]>([]);
    const [loading, setLoading] = useState(false);
    const [likingId, setLikingId] = useState<number | null>(null);
    const [likedIds, setLikedIds] = useState<Set<number>>(new Set());
    const toast = useToast();

    useEffect(() => {
        if (isOpen && product) {
            setLikedIds(new Set());
            fetchSuggestions();
        }
    }, [isOpen, product]);

    const fetchSuggestions = async () => {
        try {
            setLoading(true);

            const normalizeCategory = (value?: string): string => {
                const v = (value || '').trim().toLowerCase();
                if (!v) return '';
                return v === 'others' ? 'other' : v;
            };

            // Load full product details so we can reliably read wanted_categories (dashboard listing payload may omit it)
            let desiredCategories: string[] = [];
            try {
                const detailsRes = await api.get(`/api/products/${product!.id}`);
                const raw = detailsRes.data;
                const productData = raw?.data?.product || raw?.data || raw?.product || null;

                const wanted = productData?.wanted_categories;
                if (Array.isArray(wanted)) {
                    desiredCategories = wanted;
                } else if (typeof wanted === 'string' && wanted.trim()) {
                    try {
                        const parsed = JSON.parse(wanted);
                        if (Array.isArray(parsed)) desiredCategories = parsed;
                    } catch {
                        desiredCategories = wanted.split(',').map((s: string) => s.trim()).filter(Boolean);
                    }
                }

                // Fallback to the product's own category when preferences are empty
                if (desiredCategories.length === 0) {
                    const fallback = productData?.category || product?.category;
                    if (fallback) desiredCategories = [fallback];
                }
            } catch {
                // If details request fails, just proceed without client-side filtering
            }

            const desiredSet = new Set(desiredCategories.map(normalizeCategory).filter(Boolean));

            const res = await api.get(`/api/products/${product!.id}/suggested-trades`);
            if (res.data?.success) {
                const incoming: Product[] = Array.isArray(res.data.data) ? res.data.data : [];

                const filtered = desiredSet.size
                    ? incoming.filter((s) => {
                          // Treat empty category as "Other" only when "Other" is desired.
                          const cat = normalizeCategory(s.category);
                          const effective = cat || (desiredSet.has('other') ? 'other' : '');
                          return effective !== '' && desiredSet.has(effective);
                      })
                    : incoming;

                setSuggestions(filtered);
            }
        } catch (err) {
            console.error('Failed to fetch suggested trades', err);
        } finally {
            setLoading(false);
        }
    };

    const handleLike = async (target: Product) => {
        if (!product?.id) return;
        try {
            setLikingId(target.id);
            const res = await api.post('/api/trades/likes', {
                liked_product_id: target.id,
                offered_product_id: product.id,
            });
            if (res?.data?.data?.already_liked) {
                setLikedIds((prev) => {
                    const next = new Set(prev);
                    next.add(target.id);
                    return next;
                });
                toast({
                    id: `like-${target.id}`,
                    title: 'Already liked',
                    description: 'You already liked this item for your offer.',
                    status: 'info',
                    duration: 3000,
                    isClosable: true,
                });
                return;
            }
            setLikedIds((prev) => {
                const next = new Set(prev);
                next.add(target.id);
                return next;
            });
            toast({
                id: `like-${target.id}`,
                title: 'Liked!',
                description: 'We notified the owner. If they like your item back, a trade loop will be created.',
                status: 'success',
                duration: 3000,
                isClosable: true,
            });
        } catch (err: any) {
            toast({
                id: `like-error-${target.id}`,
                title: 'Failed to like',
                description: err?.response?.data?.error || 'Please try again.',
                status: 'error',
                duration: 3000,
                isClosable: true,
            });
        } finally {
            setLikingId(null);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} size="lg" scrollBehavior="inside" isCentered>
            <ModalOverlay />
            <ModalContent>
                <ModalHeader borderBottomWidth="1px" bg="gray.50" roundedTop="md">
                    <HStack>
                        <Icon as={FaRegLightbulb} color="yellow.500" />
                        <Text fontSize="lg">Trade Matches for "{product?.title}"</Text>
                    </HStack>
                </ModalHeader>
                <ModalCloseButton />
                <ModalBody p={4} bg="gray.50">
                    {loading ? (
                        <Center py={10}>
                            <Spinner color="brand.500" size="xl" />
                        </Center>
                    ) : suggestions.length === 0 ? (
                        <Center py={10} flexDir="column">
                            <Icon as={FaExchangeAlt} boxSize={10} color="gray.300" mb={4} />
                            <Text color="gray.500" fontWeight="medium">No matching trades found right now.</Text>
                            <Text fontSize="sm" color="gray.400">Try checking back later for more deals!</Text>
                        </Center>
                    ) : (
                        <VStack spacing={4} align="stretch">
                            {suggestions.map(s => (
                                <Box key={s.id} p={3} bg="white" rounded="lg" shadow="sm" borderWidth="1px" borderColor="gray.100" _hover={{ shadow: 'md', borderColor: 'brand.200' }} transition="all 0.2s">
                                    <HStack spacing={4}>
                                        <Image
                                            src={getFirstImage(s.image_urls)}
                                            fallbackSrc="/no-image.svg"
                                            boxSize="80px"
                                            objectFit="cover"
                                            rounded="md"
                                        />
                                        <VStack align="start" flex={1} spacing={1}>
                                            <Text fontWeight="bold" noOfLines={1}>{s.title}</Text>
                                            <HStack>
                                                {s.category && <Badge colorScheme="blue" variant="subtle" fontSize="2xs">{s.category}</Badge>}
                                                <Text fontSize="xs" color="gray.500" noOfLines={1}>Owned by {s.seller_name}</Text>
                                            </HStack>
                                        </VStack>
                                        <Tooltip
                                            label="Invite this item for Trade Match or Multi-Way loops."
                                            hasArrow
                                            placement="top"
                                        >
                                            <Button
                                                size="sm"
                                                colorScheme="pink"
                                                leftIcon={<FaHeart />}
                                                onClick={() => handleLike(s)}
                                                isLoading={likingId === s.id}
                                                loadingText="Inviting"
                                                isDisabled={likedIds.has(s.id)}
                                            >
                                                {likedIds.has(s.id) ? 'Invited' : 'Invite'}
                                            </Button>
                                        </Tooltip>
                                    </HStack>
                                </Box>
                            ))}
                        </VStack>
                    )}
                </ModalBody>
            </ModalContent>
        </Modal>
    );
};
