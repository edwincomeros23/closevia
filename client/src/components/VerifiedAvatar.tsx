import React from 'react'
import { Avatar, AvatarProps, Box, Icon } from '@chakra-ui/react'
import { FiCheckCircle } from 'react-icons/fi'

interface VerifiedAvatarProps extends AvatarProps {
  isVerified?: boolean
}

/**
 * Avatar component with an optional verified checkmark badge
 * Shows a blue checkmark in the bottom-right corner when user is verified
 */
const VerifiedAvatar: React.FC<VerifiedAvatarProps> = ({ isVerified = false, ...avatarProps }) => {
  return (
    <Box position="relative" display="inline-block">
      <Avatar {...avatarProps} />
      {isVerified && (
        <Box
          position="absolute"
          bottom={0}
          right={0}
          display="flex"
          alignItems="center"
          justifyContent="center"
          bg="white"
          borderRadius="full"
          p="1px"
          boxShadow="0 2px 4px rgba(0,0,0,0.2)"
        >
          <Icon
            as={FiCheckCircle}
            boxSize={5}
            color="brand.500"
            fill="brand.500"
          />
        </Box>
      )}
    </Box>
  )
}

export default VerifiedAvatar
