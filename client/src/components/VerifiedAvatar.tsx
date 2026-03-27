import React from 'react'
import { Avatar, AvatarProps, Box, Icon } from '@chakra-ui/react'
import { FiCheck } from 'react-icons/fi'

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
          bottom="-1px"
          right="-1px"
          w="16px"
          h="16px"
          display="flex"
          alignItems="center"
          justifyContent="center"
          bg="#0A66C2"
          border="1.5px solid"
          borderColor="white"
          borderRadius="full"
          boxShadow="0 1px 3px rgba(0,0,0,0.18)"
        >
          <Icon
            as={FiCheck}
            boxSize={2.5}
            color="white"
            strokeWidth={3}
          />
        </Box>
      )}
    </Box>
  )
}

export default VerifiedAvatar
