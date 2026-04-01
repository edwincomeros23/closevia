import React, { useEffect, useState } from 'react';
import {
    Modal, ModalOverlay, ModalContent, ModalHeader, ModalCloseButton, ModalBody,
    VStack, HStack, Text, Image, Button, Spinner, Center, Box, Icon, Badge
} from '@chakra-ui/react';
import { FaExchangeAlt, FaRegLightbulb } from 'react-icons/fa';
import { api } from '../services/api';
import { Product } from '../types';
import { getFirstImage } from '../utils/imageUtils';

interface SuggestedTradesModalProps {
    isOpen: boolean;
    onClose: () => void;
    product: Product | null;
    onTradeClick: (targetProduct: Product) => void;
}

export const SuggestedTradesModal: React.FC<SuggestedTradesModalProps> = ({ isOpen, onClose, product, onTradeClick }) => {
    const [suggestions, setSuggestions] = useState<Product[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen && product) {
            fetchSuggestions();
        }
    }, [isOpen, product]);

    const fetchSuggestions = async () => {
        try {
            setLoading(true);
            const res = await api.get(`/api/products/${product!.id}/suggested-trades`);
            if (res.data?.success) {
                setSuggestions(res.data.data || []);
            }
        } catch (err) {
            console.error('Failed to fetch suggested trades', err);
        } finally {
            setLoading(false);
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
                                            fallbackSrc="https://via.placeholder.com/80"
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
                                        <Button
                                            size="sm"
                                            colorScheme="brand"
                                            leftIcon={<FaExchangeAlt />}
                                            onClick={() => {
                                                onClose();
                                                onTradeClick(s);
                                            }}
                                        >
                                            Offer
                                        </Button>
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
