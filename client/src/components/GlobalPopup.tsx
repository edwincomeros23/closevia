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
  Heading,
} from '@chakra-ui/react';
import { api } from '../services/api';
import { Campaign } from '../pages/AdminDashboard';
import { useAuth } from '../contexts/AuthContext';

const GlobalPopup: React.FC = () => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(null);
  const { user } = useAuth(); // Needed to re-trigger if auth state changes

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

    // Delay popup slightly for better UX (allows page to load first)
    const timer = setTimeout(() => {
      fetchActiveCampaignParams();
    }, 2000);

    return () => clearTimeout(timer);
  }, [onOpen, user]);

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
    <Modal isOpen={isOpen} onClose={handleClose} isCentered size="md" motionPreset="scale">
      <ModalOverlay bg="blackAlpha.600" backdropFilter="blur(5px)" />
      <ModalContent 
        overflow="hidden" 
        borderRadius="2xl" 
        mx={4} 
        boxShadow="2xl"
        bg="white"
      >
        {activeCampaign.image_url ? (
          <Box pos="relative" w="full" h="240px">
            <Image
              src={activeCampaign.image_url}
              alt={activeCampaign.title}
              width="100%"
              height="100%"
              objectFit="cover"
            />
            {/* Gradient Dark Overlay for text readability if needed & to blend image into the card */}
            <Box
              pos="absolute"
              bottom={0}
              w="full"
              h="50%"
              bgGradient="linear(to-t, white, transparent)"
            />
            <ModalCloseButton
              color="white"
              bg="blackAlpha.500"
              backdropFilter="blur(4px)"
              _hover={{ bg: 'blackAlpha.700', transform: 'scale(1.1)' }}
              _active={{ bg: 'blackAlpha.800' }}
              borderRadius="full"
              size="sm"
              top={3}
              right={3}
              transition="all 0.2s"
            />
          </Box>
        ) : (
          <ModalCloseButton 
             color="gray.400" 
             _hover={{ color: "gray.600", bg: "gray.100" }} 
             borderRadius="full" 
          />
        )}
        
        <ModalHeader
          pt={activeCampaign.image_url ? 2 : 8}
          pb={1}
          textAlign="center"
        >
          <Heading 
            size="lg" 
            fontWeight="extrabold" 
            bgGradient="linear(to-r, blue.500, brand.500, purple.500)"
            bgClip="text"
            letterSpacing="tight"
          >
            {activeCampaign.title}
          </Heading>
        </ModalHeader>
        
        <ModalBody pb={6} px={8}>
          <VStack spacing={5} align="stretch" textAlign="center">
            {activeCampaign.description && (
              <Text color="gray.500" fontSize="md" lineHeight="tall">
                {activeCampaign.description}
              </Text>
            )}
          </VStack>
        </ModalBody>

        <ModalFooter 
          bg="white" 
          pb={8} 
          px={8}
          pt={2} 
          flexDirection="column" 
          gap={3}
        >
          {activeCampaign.button_text ? (
            <Button 
              w="full" 
              size="lg"
              rounded="full"
              bgGradient="linear(to-r, blue.400, purple.500)"
              color="white"
              fontWeight="bold"
              boxShadow="lg"
              _hover={{ 
                bgGradient: "linear(to-r, blue.500, purple.600)", 
                transform: "translateY(-2px)", 
                boxShadow: "xl" 
              }}
              _active={{
                transform: "translateY(0)",
              }}
              transition="all 0.2s"
              onClick={handleAction}
            >
              {activeCampaign.button_text}
            </Button>
          ) : null}
          <Button 
            variant="ghost" 
            size="md"
            rounded="full"
            color="gray.400"
            _hover={{ color: "gray.600", bg: "gray.50" }}
            onClick={handleClose}
          >
            {activeCampaign.button_text ? "No thanks" : "Dismiss"}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default GlobalPopup;
