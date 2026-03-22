import React, { useEffect, useState } from 'react';
import { Box, HStack, Text, Icon } from '@chakra-ui/react';
import { keyframes } from '@emotion/react';
import { FaExchangeAlt, FaTag, FaMapMarkerAlt } from 'react-icons/fa';
import { api } from '../services/api';

const scrollAnimation = keyframes`
  0% { transform: translateX(0); }
  100% { transform: translateX(-50%); }
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
        let intervalId: ReturnType<typeof setInterval> | null = null;
        let isMounted = true;

        const fetchActivities = async (lat?: number, lng?: number) => {
            try {
                const params: Record<string, string> = {};
                if (lat !== undefined && lng !== undefined) {
                    params.lat = lat.toFixed(6);
                    params.lng = lng.toFixed(6);
                }
                const res = await api.get('/api/activities', { params });
                if (isMounted && res.data?.success && res.data?.data) {
                    setActivities(res.data.data);
                }
            } catch (err) {
                console.error('Failed to fetch activities', err);
            }
        };

        const startPolling = (lat?: number, lng?: number) => {
            fetchActivities(lat, lng);
            intervalId = setInterval(() => fetchActivities(lat, lng), 30000);
        };

        // Try to get user location once; fall back to no-location fetch
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const { latitude, longitude } = pos.coords;
                    startPolling(latitude, longitude);
                },
                () => {
                    // Permission denied or unavailable — fetch without coordinates
                    startPolling();
                },
                { timeout: 4000, maximumAge: 60000 }
            );
        } else {
            startPolling();
        }

        return () => {
            isMounted = false;
            if (intervalId) clearInterval(intervalId);
        };
    }, []);

    if (activities.length === 0) return null;

    return (
        <Box w="full" bgGradient="linear(to-r, brand.600, brand.500)" color="white" py={2.5} overflow="hidden" position="relative" borderY="1px solid" borderColor="brand.700" shadow="sm" zIndex={10}>
            <Box animation={`${scrollAnimation} ${Math.max(activities.length * 6, 30)}s linear infinite`} whiteSpace="nowrap" display="inline-flex">
                <HStack spacing={12} display="inline-flex" pr={12}>
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
                </HStack>
                <HStack spacing={12} display="inline-flex" pr={12}>
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
                </HStack>
            </Box>
        </Box>
    );
};

export default ActivityFeed;
