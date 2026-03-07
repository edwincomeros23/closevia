import React from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalBody,
  ModalCloseButton,
  Image,
  Box,
  useColorModeValue,
} from '@chakra-ui/react';

interface ImageZoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  altText?: string;
}

const ImageZoomModal: React.FC<ImageZoomModalProps> = ({ isOpen, onClose, imageUrl, altText }) => {
  const bgColor = useColorModeValue('white', 'gray.800');

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="full" isCentered>
      <ModalOverlay bg="blackAlpha.800" backdropFilter="blur(5px)" />
      <ModalContent 
        bg="transparent" 
        boxShadow="none" 
        m={0} 
        p={0}
        onClick={onClose}
        cursor="zoom-out"
      >
        <ModalCloseButton 
          color="white" 
          zIndex={2} 
          size="lg" 
          bg="blackAlpha.500"
          _hover={{ bg: 'blackAlpha.700' }}
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
        />
        <ModalBody 
          display="flex" 
          alignItems="center" 
          justifyContent="center" 
          p={0}
          height="100vh"
        >
          <Box 
            maxW="95vw" 
            maxH="95vh" 
            bg={bgColor} 
            p={1} 
            borderRadius="md" 
            boxShadow="2xl"
            onClick={(e) => e.stopPropagation()}
            cursor="default"
          >
            <Image
              src={imageUrl}
              alt={altText || 'Zoomed image'}
              maxW="100%"
              maxH="90vh"
              objectFit="contain"
              fallbackSrc="https://via.placeholder.com/800x600?text=Loading+Image..."
            />
          </Box>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};

export default ImageZoomModal;
