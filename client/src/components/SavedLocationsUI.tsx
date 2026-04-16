import React, { useState } from 'react'
import {
  Box,
  VStack,
  HStack,
  Button,
  Text,
  Input,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
  IconButton,
  Divider,
  Alert,
  AlertIcon,
  SimpleGrid,
} from '@chakra-ui/react'
import { DeleteIcon, EditIcon, AddIcon } from '@chakra-ui/icons'
import { CustomLocation } from '../hooks/useCustomLocations'

interface SavedLocationsUIProps {
  locations: CustomLocation[]
  onSelectLocation: (location: CustomLocation) => void
  onAddLocation: (name: string, address: string, lat: number, lng: number) => void
  onDeleteLocation: (id: string) => void
  onRenameLocation: (id: string, updates: Partial<CustomLocation>) => void
  currentLocation?: { address: string; lat: number; lng: number }
  onAddNew: () => void
}

export const SavedLocationsUI: React.FC<SavedLocationsUIProps> = ({
  locations,
  onSelectLocation,
  onAddLocation,
  onDeleteLocation,
  onRenameLocation,
  currentLocation,
  onAddNew,
}) => {
  const { isOpen, onOpen, onClose } = useDisclosure()
  const [newLocationName, setNewLocationName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  const handleSaveCurrentLocation = () => {
    if (!newLocationName.trim() || !currentLocation) return
    onAddLocation(
      newLocationName.trim(),
      currentLocation.address,
      currentLocation.lat,
      currentLocation.lng
    )
    setNewLocationName('')
    onClose()
  }

  const handleSaveEdit = (id: string) => {
    if (!editingName.trim()) return
    onRenameLocation(id, { name: editingName.trim() })
    setEditingId(null)
    setEditingName('')
  }

  return (
    <Box w="full">
      {/* Saved Locations Grid */}
      {locations.length > 0 && (
        <Box mb={3}>
          <Text fontSize="9px" fontWeight="600" color="yellow.700" mb={1.5}>
            📍 Your Saved Locations
          </Text>
          <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={1.5}>
            {locations.map((loc) => (
              <HStack
                key={loc.id}
                p={2}
                bg="white"
                border="1px solid"
                borderColor="yellow.200"
                borderRadius="md"
                spacing={1}
                _hover={{ borderColor: 'yellow.400', shadow: 'sm' }}
                transition="all 0.2s"
              >
                <VStack align="start" spacing={0} flex={1} minW={0}>
                  {editingId === loc.id ? (
                    <Input
                      size="xs"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      placeholder="Location name..."
                      fontSize="8px"
                      h="20px"
                      autoFocus
                    />
                  ) : (
                    <>
                      <Text
                        fontSize="8px"
                        fontWeight="600"
                        color="gray.800"
                        noOfLines={1}
                        cursor="pointer"
                        _hover={{ color: 'blue.600' }}
                        onClick={() => onSelectLocation(loc)}
                      >
                        {loc.name}
                      </Text>
                      <Text fontSize="7px" color="gray.500" noOfLines={1}>
                        {loc.address}
                      </Text>
                    </>
                  )}
                </VStack>
                <HStack spacing={0.5} flex="0 0 auto">
                  {editingId === loc.id ? (
                    <Button
                      size="xs"
                      h="18px"
                      fontSize="7px"
                      colorScheme="green"
                      onClick={() => handleSaveEdit(loc.id)}
                    >
                      Save
                    </Button>
                  ) : (
                    <>
                      <IconButton
                        size="xs"
                        icon={<EditIcon />}
                        aria-label="Edit"
                        variant="ghost"
                        h="18px"
                        w="18px"
                        fontSize="7px"
                        onClick={() => {
                          setEditingId(loc.id)
                          setEditingName(loc.name)
                        }}
                      />
                      <IconButton
                        size="xs"
                        icon={<DeleteIcon />}
                        aria-label="Delete"
                        variant="ghost"
                        colorScheme="red"
                        h="18px"
                        w="18px"
                        fontSize="7px"
                        onClick={() => onDeleteLocation(loc.id)}
                      />
                    </>
                  )}
                </HStack>
              </HStack>
            ))}
          </SimpleGrid>
        </Box>
      )}

      {/* Add New Location Button */}
      <Button
        size="xs"
        leftIcon={<AddIcon />}
        w="full"
        h="24px"
        fontSize="8px"
        colorScheme="yellow"
        onClick={onOpen}
        mb={2}
      >
        Save Current Location
      </Button>

      {/* Save Location Modal */}
      <Modal isOpen={isOpen} onClose={onClose} size="sm">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader fontSize="sm" fontWeight="600">
            Save This Location
          </ModalHeader>
          <ModalBody>
            {currentLocation ? (
              <VStack align="stretch" spacing={2}>
                <Box>
                  <Text fontSize="9px" fontWeight="600" mb={1} color="gray.700">
                    Location
                  </Text>
                  <Text fontSize="8px" color="gray.600">
                    {currentLocation.address}
                  </Text>
                  <Text fontSize="7px" color="gray.500">
                    {currentLocation.lat.toFixed(4)}, {currentLocation.lng.toFixed(4)}
                  </Text>
                </Box>
                <Divider />
                <Box>
                  <Text fontSize="9px" fontWeight="600" mb={1} color="gray.700">
                    Custom Name
                  </Text>
                  <Input
                    placeholder="e.g. My sister's place, Boarding house, Gym..."
                    value={newLocationName}
                    onChange={(e) => setNewLocationName(e.target.value)}
                    size="sm"
                    fontSize="8px"
                    h="28px"
                  />
                  <Text fontSize="7px" color="gray.500" mt={1}>
                    Give this location a personal name for quick identification
                  </Text>
                </Box>
              </VStack>
            ) : (
              <Alert status="error" borderRadius="md" fontSize="8px">
                <AlertIcon boxSize="12px" />
                No location detected yet. Please select a location first.
              </Alert>
            )}
          </ModalBody>
          <ModalFooter gap={2}>
            <Button size="xs" variant="ghost" onClick={onClose} fontSize="8px">
              Cancel
            </Button>
            <Button
              size="xs"
              colorScheme="yellow"
              onClick={handleSaveCurrentLocation}
              isDisabled={!newLocationName.trim() || !currentLocation}
              fontSize="8px"
            >
              Save Location
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  )
}
