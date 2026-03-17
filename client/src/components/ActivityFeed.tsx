import React, { useEffect, useState } from 'react';
import { Box, HStack, Text, Icon } from '@chakra-ui/react';
import { keyframes } from '@emotion/react';
import { FaExchangeAlt, FaTag, FaMapMarkerAlt } from 'react-icons/fa';
import { api } from '../services/api';

const scrollAnimation = keyframes`
  0% { transform: translateX(0); }
  100% { transform: translateX(calc(-100% * 4 - 144px)); }
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
        const fetchActivities = async (lat?: number, lng?: number) => {
            try {
                const params: Record<string, string> = {};
                if (lat !== undefined && lng !== undefined) {
                    params.lat = lat.toFixed(6);
                    params.lng = lng.toFixed(6);
                }
                const res = await api.get('/api/activities', { params });
                if (res.data?.success && res.data?.data) {
                    setActivities(res.data.data);
                }
            } catch (err) {
                console.error('Failed to fetch activities', err);
            }
        };

        // Try to get user location once; fall back to no-location fetch
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const { latitude, longitude } = pos.coords;
                    fetchActivities(latitude, longitude);
                    const interval = setInterval(() => fetchActivities(latitude, longitude), 15000);
                    return () => clearInterval(interval);
                },
                () => {
                    // Permission denied or unavailable — fetch without coordinates
                    fetchActivities();
                    const interval = setInterval(() => fetchActivities(), 15000);
                    return () => clearInterval(interval);
                },
                { timeout: 4000, maximumAge: 60000 }
            );
        } else {
            fetchActivities();
            const interval = setInterval(() => fetchActivities(), 15000);
            return () => clearInterval(interval);
        }
    }, []);

    if (activities.length === 0) return null;

    return (
        <Box w="full" bgGradient="linear(to-r, brand.600, brand.500)" color="white" py={2.5} overflow="hidden" position="relative" borderY="1px solid" borderColor="brand.700" shadow="sm" zIndex={10}>
            <Box animation={`${scrollAnimation} 80s linear infinite`} whiteSpace="nowrap" display="inline-block" pl="0">
                <HStack spacing={12} display="inline-flex">
                    {activities.map((act, index) => (
                        <HStack key={`${act.id}-${index}-0`} spacing={2}>
                            <Icon as={act.type === 'trade' ? FaExchangeAlt : act.type === 'near_you' ? FaMapMarkerAlt : FaTag} color={act.type === 'near_you' ? 'green.300' : 'yellow.300'} boxSize={3.5} />
                            <Text fontSize="sm" fontWeight="semibold" letterSpacing="wide">
                                {act.message}
                            </Text>
                            <Text fontSize="xs" color="whiteAlpha.800" ml={1}>
                                {new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </Text>
                        </HStack>
                    ))}
                    {/* Duplicate 1 */}
                    {activities.map((act, index) => (
                        <HStack key={`${act.id}-${index}-1`} spacing={2}>
                            <Icon as={act.type === 'trade' ? FaExchangeAlt : act.type === 'near_you' ? FaMapMarkerAlt : FaTag} color={act.type === 'near_you' ? 'green.300' : 'yellow.300'} boxSize={3.5} />
                            <Text fontSize="sm" fontWeight="semibold" letterSpacing="wide">
                                {act.message}
                            </Text>
                            <Text fontSize="xs" color="whiteAlpha.800" ml={1}>
                                {new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </Text>
                        </HStack>
                    ))}
                    {/* Duplicate 2 */}
                    {activities.map((act, index) => (
                        <HStack key={`${act.id}-${index}-2`} spacing={2}>
                            <Icon as={act.type === 'trade' ? FaExchangeAlt : act.type === 'near_you' ? FaMapMarkerAlt : FaTag} color={act.type === 'near_you' ? 'green.300' : 'yellow.300'} boxSize={3.5} />
                            <Text fontSize="sm" fontWeight="semibold" letterSpacing="wide">
                                {act.message}
                            </Text>
                            <Text fontSize="xs" color="whiteAlpha.800" ml={1}>
                                {new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </Text>
                        </HStack>
                    ))}
                    {/* Duplicate 3 */}
                    {activities.map((act, index) => (
                        <HStack key={`${act.id}-${index}-3`} spacing={2}>
                            <Icon as={act.type === 'trade' ? FaExchangeAlt : act.type === 'near_you' ? FaMapMarkerAlt : FaTag} color={act.type === 'near_you' ? 'green.300' : 'yellow.300'} boxSize={3.5} />
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
