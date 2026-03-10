import React, { useEffect, useState } from 'react';
import { Box, HStack, Text, Icon } from '@chakra-ui/react';
import { keyframes } from '@emotion/react';
import { FaExchangeAlt, FaTag } from 'react-icons/fa';
import { api } from '../services/api';

const scrollAnimation = keyframes`
  0% { transform: translateX(100vw); }
  100% { transform: translateX(-100%); }
`;

interface Activity {
    type: string;
    id: number;
    message: string;
    image_url: string;
    timestamp: string;
}

const ActivityFeed = () => {
    const [activities, setActivities] = useState<Activity[]>([]);

    useEffect(() => {
        const fetchActivities = async () => {
            try {
                const res = await api.get('/activities');
                if (res.data?.success && res.data?.data) {
                    setActivities(res.data.data);
                }
            } catch (err) {
                console.error('Failed to fetch activities', err);
            }
        };
        fetchActivities();
        const interval = setInterval(fetchActivities, 15000);
        return () => clearInterval(interval);
    }, []);

    if (activities.length === 0) return null;

    return (
        <Box w="full" bgGradient="linear(to-r, brand.600, brand.500)" color="white" py={2.5} overflow="hidden" position="relative" borderY="1px solid" borderColor="brand.700" shadow="sm" zIndex={10}>
            <Box animation={`${scrollAnimation} 35s linear infinite`} whiteSpace="nowrap" display="inline-block" pl="100%">
                <HStack spacing={12} display="inline-flex">
                    {activities.map((act, index) => (
                        <HStack key={`${act.id}-${index}`} spacing={2}>
                            <Icon as={act.type === 'trade' ? FaExchangeAlt : FaTag} color="yellow.300" boxSize={3.5} />
                            <Text fontSize="sm" fontWeight="semibold" letterSpacing="wide">
                                {act.message}
                            </Text>
                            <Text fontSize="xs" color="whiteAlpha.800" ml={1}>
                                {new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </Text>
                        </HStack>
                    ))}
                    {/* Duplicate to prevent tearing at the end of the Marquee */}
                    {activities.map((act, index) => (
                        <HStack key={`dup-${act.id}-${index}`} spacing={2}>
                            <Icon as={act.type === 'trade' ? FaExchangeAlt : FaTag} color="yellow.300" boxSize={3.5} />
                            <Text fontSize="sm" fontWeight="semibold" letterSpacing="wide">
                                {act.message}
                            </Text>
                            <Text fontSize="xs" color="whiteAlpha.800" ml={1}>
                                {new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </Text>
                        </HStack>
                    ))}
                </HStack>
            </Box>
        </Box>
    );
};

export default ActivityFeed;
