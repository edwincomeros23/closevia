import React, { useEffect, useState } from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  Button,
  Text,
  Image,
  VStack,
  useDisclosure,
  Box,
} from '@chakra-ui/react';
import { api } from '../services/api';
import { Campaign } from '../pages/AdminDashboard';
import { useAuth } from '../contexts/AuthContext';

const GlobalPopup: React.FC = () => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(null);
  const { user } = useAuth(); // Needed to determine if user is logged in, verified, etc if needed on frontend, though backend filters it.

  useEffect(() => {
    const fetchActiveCampaignParams = async () => {
      try {
        const response = await api.get('/api/campaigns/active');
        if (response.data?.success && response.data.data?.length > 0) {
          const campaigns: Campaign[] = response.data.data;

          // Find the first campaign that should be shown based on frequency rules
          const campaignToShow = campaigns.find((camp) => {
            const viewedKey = `campaign_viewed_${camp.id}`;
            const lastViewed = localStorage.getItem(viewedKey) || sessionStorage.getItem(viewedKey);

            if (camp.frequency === 'once_per_user') {
              if (localStorage.getItem(viewedKey)) return false; // Already seen it forever
            } else if (camp.frequency === 'once_per_day') {
              if (lastViewed) {
                const lastDate = new Date(parseInt(lastViewed, 10)).toDateString();
                const today = new Date().toDateString();
                if (lastDate === today) return false; // Already seen it today
              }
            } else if (camp.frequency === 'every_login') {
              if (sessionStorage.getItem(viewedKey)) return false; // Seen this session
            }
            return true;
          });

          if (campaignToShow) {
            setActiveCampaign(campaignToShow);
            onOpen();
          }
        }
      } catch (err) {
        console.error('Failed to fetch active campaigns', err);
      }
    };

    // Delay popup slightly for better UX
    const timer = setTimeout(() => {
      fetchActiveCampaignParams();
    }, 2000);

    return () => clearTimeout(timer);
  }, [onOpen, user]); // Re-evaluate if user changes (log in/out)

  const handleClose = () => {
    if (activeCampaign) {
      const viewedKey = `campaign_viewed_${activeCampaign.id}`;
      const now = Date.now().toString();

      if (activeCampaign.frequency === 'once_per_user') {
        localStorage.setItem(viewedKey, 'true');
      } else if (activeCampaign.frequency === 'once_per_day') {
        localStorage.setItem(viewedKey, now);
      } else if (activeCampaign.frequency === 'every_login') {
        sessionStorage.setItem(viewedKey, 'true');
      }
    }
    onClose();
  };

  const handleAction = () => {
    if (activeCampaign?.button_link) {
      if (activeCampaign.button_link.startsWith('http')) {
        window.open(activeCampaign.button_link, '_blank');
      } else {
        window.location.href = activeCampaign.button_link;
      }
    }
    handleClose();
  };

  if (!activeCampaign) return null;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} isCentered size="md" motionPreset="slideInBottom">
      <ModalOverlay backdropFilter="blur(2px)" />
      <ModalContent overflow="hidden" borderRadius="xl" mx={4}>
        {activeCampaign.image_url && (
          <Box pos="relative">
            <Image
              src={activeCampaign.image_url}
              alt={activeCampaign.title}
              width="100%"
              height="200px"
              objectFit="cover"
            />
            <ModalCloseButton
              color="white"
              bg="blackAlpha.600"
              _hover={{ bg: 'blackAlpha.800' }}
              borderRadius="full"
              top={2}
              right={2}
            />
          </Box>
        )}
        {!activeCampaign.image_url && <ModalCloseButton />}
        
        <ModalHeader
          pt={activeCampaign.image_url ? 4 : 6}
          pb={2}
          textAlign="center"
          fontSize="xl"
          fontWeight="bold"
        >
          {activeCampaign.title}
        </ModalHeader>
        
        <ModalBody pb={6} px={6}>
          <VStack spacing={4} align="stretch" textAlign="center">
            {activeCampaign.description && (
              <Text color="gray.600" fontSize="md">
                {activeCampaign.description}
              </Text>
            )}
          </VStack>
        </ModalBody>

        <ModalFooter bg="gray.50" borderTop="1px" borderColor="gray.100" justifyContent="center">
          {activeCampaign.button_text ? (
            <Button colorScheme="blue" width="full" onClick={handleAction}>
              {activeCampaign.button_text}
            </Button>
          ) : (
            <Button variant="outline" width="full" onClick={handleClose}>
              Dismiss
            </Button>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default GlobalPopup;
