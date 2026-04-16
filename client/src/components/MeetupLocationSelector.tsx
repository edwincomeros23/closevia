import React, { useState, useEffect } from 'react'
import {
  Box,
  VStack,
  HStack,
  Text,
  Button,
  Input,
  InputGroup,
  InputLeftElement,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  useDisclosure,
  Badge,
  Spinner,
  useToast,
  Icon,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
} from '@chakra-ui/react'
import { MapContainer, TileLayer, Marker, Popup, CircleMarker, Tooltip } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { FiMapPin, FiSearch } from 'react-icons/fi'
import { FaMapMarkerAlt } from 'react-icons/fa'

// Fix leaflet default icon
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
})

interface LocationOption {
  id: string
  name: string
  address: string
  type: 'cafe' | 'mall' | 'public' | 'transport' | 'other'
  lat: number
  lng: number
  isPartner?: boolean
  distance?: number
  available24h?: boolean
}

interface MeetupLocationSelectorProps {
  userLat?: number
  userLng?: number
  onLocationSelect: (location: LocationOption) => void
  isOpen: boolean
  onClose: () => void
}

const MeetupLocationSelector: React.FC<MeetupLocationSelectorProps> = ({
  userLat = 6.9214,
  userLng = 122.0790,
  onLocationSelect,
  isOpen,
  onClose,
}) => {
  const [selectedLocation, setSelectedLocation] = useState<LocationOption | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(false)
  const toast = useToast()

  // Suggested meetup locations (Zamboanga City example)
  const suggestedLocations: LocationOption[] = [
    {
      id: 'meet_n_eat',
      name: 'Meet n Eat Cafe',
      address: 'Gov. Camins Ave, Zamboanga City',
      type: 'cafe',
      lat: 6.9150,
      lng: 122.0630,
      isPartner: true,
      distance: 0.8,
      available24h: false,
    },
    {
      id: 'wmsu',
      name: 'WMSU Campus',
      address: 'Normal Road, Zamboanga City',
      type: 'public',
      lat: 6.9142,
      lng: 122.0620,
      distance: 0.3,
      available24h: true,
    },
    {
      id: 'sm_mindpro',
      name: 'SM Mindpro Mall',
      address: 'La Purisima St, Zamboanga City',
      type: 'mall',
      lat: 6.9080,
      lng: 122.0745,
      isPartner: true,
      distance: 1.2,
      available24h: false,
    },
    {
      id: 'zachos_park',
      name: 'Pasonanca Park',
      address: 'Valderosa St, Zamboanga City',
      type: 'public',
      lat: 6.9030,
      lng: 122.0780,
      distance: 1.5,
      available24h: true,
    },
    {
      id: 'kcc_zamboanga',
      name: 'KCC de Zamboanga',
      address: 'Gov. Camins Ave, Zamboanga City',
      type: 'mall',
      lat: 6.9214,
      lng: 122.0790,
      isPartner: true,
      distance: 0.9,
      available24h: false,
    },
    {
      id: 'amethyst_eatery',
      name: 'Amethyst Eatery',
      address: 'Johnston Road, Zamboanga City',
      type: 'cafe',
      lat: 6.9125,
      lng: 122.0720,
      isPartner: true,
      distance: 0.5,
      available24h: false,
    },
  ]

  // Filtered locations based on search
  const filteredLocations = suggestedLocations.filter(
    loc =>
      loc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      loc.address.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Sort by distance
  const sortedLocations = [...filteredLocations].sort((a, b) => (a.distance || 0) - (b.distance || 0))

  const getLocationIcon = (type: string) => {
    const icons: Record<string, string> = {
      cafe: '☕',
      mall: '🏬',
      public: '🏛️',
      transport: '🚌',
      other: '📍',
    }
    return icons[type] || '📍'
  }

  const handleSelectLocation = () => {
    if (selectedLocation) {
      onLocationSelect(selectedLocation)
      toast({
        title: '✅ Location Selected',
        description: `${selectedLocation.name} is now your meetup location`,
        status: 'success',
        duration: 2000,
        isClosable: true,
      })
      onClose()
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" isCentered>
      <ModalOverlay />
      <ModalContent maxH="75vh">
        <ModalHeader py={3} bg="linear-gradient(135deg, #667eea 0%, #764ba2 100%)" color="white" borderRadius="lg 0 0 0" fontSize="lg">
          📍 Select Meetup Location
        </ModalHeader>
        <ModalCloseButton color="white" />

        <ModalBody p={3} overflowY="auto" maxH="70vh">
          <Tabs>
            {/* Tab 1: Suggested Locations */}
            <TabList>
              <Tab fontSize="sm">Suggested Locations</Tab>
              <Tab fontSize="sm">Map View</Tab>
            </TabList>

            <TabPanels>
              {/* Suggested Locations Tab */}
              <TabPanel p={2}>
                <VStack spacing={1.5} align="stretch">
                  {/* Search Input */}
                  <InputGroup size="sm">
                    <InputLeftElement pointerEvents="none">
                      <Icon as={FiSearch} color="gray.400" boxSize={4} />
                    </InputLeftElement>
                    <Input
                      placeholder="Search locations..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      borderColor="purple.300"
                      fontSize="sm"
                      _focus={{ borderColor: 'purple.500', boxShadow: '0 0 0 1px #764ba2' }}
                    />
                  </InputGroup>

                  {/* Locations List */}
                  <VStack spacing={1} align="stretch">
                    {sortedLocations.length === 0 ? (
                      <Box p={4} textAlign="center">
                        <Text fontSize="sm" color="gray.500">No locations found matching your search</Text>
                      </Box>
                    ) : (
                      sortedLocations.map((location) => (
                        <Box
                          key={location.id}
                          py={1.5}
                          px={2.5}
                          border="1px"
                          borderColor={selectedLocation?.id === location.id ? 'purple.500' : 'gray.200'}
                          borderRadius="md"
                          cursor="pointer"
                          transition="all 0.2s"
                          _hover={{
                            borderColor: 'purple.400',
                            shadow: 'sm',
                            bg: 'gray.50',
                          }}
                          bg={selectedLocation?.id === location.id ? 'purple.50' : 'white'}
                          onClick={() => setSelectedLocation(location)}
                        >
                          <HStack spacing={2} align="start" mb={0.5}>
                            <Text fontSize="18px" flexShrink={0}>{getLocationIcon(location.type)}</Text>
                            <VStack align="start" spacing={0} flex={1} minW={0}>
                              <HStack spacing={1.5}>
                                <Text fontSize="sm" fontWeight="bold" noOfLines={1}>{location.name}</Text>
                                {location.isPartner && (
                                  <Badge colorScheme="green" fontSize="xs">
                                    Partner
                                  </Badge>
                                )}
                                {location.available24h && (
                                  <Badge colorScheme="blue" fontSize="xs">
                                    24/7
                                  </Badge>
                                )}
                              </HStack>
                              <Text fontSize="xs" color="gray.600" noOfLines={1}>
                                {location.address}
                              </Text>
                            </VStack>
                          </HStack>

                          <HStack spacing={4} fontSize="xs" color="gray.500" mt={0.5}>
                            <HStack spacing={0.5}>
                              <Icon as={FaMapMarkerAlt} boxSize={3} />
                              <Text>{location.distance?.toFixed(1)} km</Text>
                            </HStack>
                            <Badge colorScheme="gray" variant="subtle" fontSize="xs">
                              {location.type.charAt(0).toUpperCase() + location.type.slice(1)}
                            </Badge>
                          </HStack>
                        </Box>
                      ))
                    )}
                  </VStack>
                </VStack>
              </TabPanel>

              {/* Map View Tab */}
              <TabPanel p={1} h="300px" mb={2}>
                <MapContainer
                  center={[userLat, userLng]}
                  zoom={14}
                  style={{ height: '100%', borderRadius: '8px', marginTop: '4px' }}
                >
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; OpenStreetMap contributors'
                  />

                  {/* User Location */}
                  <CircleMarker
                    center={[userLat, userLng]}
                    radius={8}
                    fillColor="blue"
                    color="white"
                    weight={2}
                    opacity={0.8}
                    fillOpacity={0.8}
                  >
                    <Tooltip>Your Location</Tooltip>
                  </CircleMarker>

                  {/* Suggested Locations */}
                  {sortedLocations.map((location) => (
                    <Marker
                      key={location.id}
                      position={[location.lat, location.lng]}
                      icon={
                        selectedLocation?.id === location.id
                          ? L.icon({
                              iconUrl:
                                'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
                              shadowUrl:
                                'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                              iconSize: [25, 41],
                              iconAnchor: [12, 41],
                              popupAnchor: [1, -34],
                              shadowSize: [41, 41],
                            })
                          : undefined
                      }
                      eventHandlers={{
                        click: () => setSelectedLocation(location),
                      }}
                    >
                      <Popup>
                        <VStack spacing={1} align="start">
                          <Text fontWeight="bold">{location.name}</Text>
                          <Text fontSize="sm">{location.address}</Text>
                          <Button
                            size="sm"
                            colorScheme="purple"
                            onClick={() => setSelectedLocation(location)}
                          >
                            Select
                          </Button>
                        </VStack>
                      </Popup>
                    </Marker>
                  ))}
                </MapContainer>
              </TabPanel>
            </TabPanels>
          </Tabs>

          {/* Selected Location Summary */}
          {selectedLocation && (
            <Box py={2} px={2.5} bg="green.50" borderRadius="md" border="1px" borderColor="green.200" mt={3}>
              <HStack spacing={2}>
                <Text fontSize="18px" flexShrink={0}>{getLocationIcon(selectedLocation.type)}</Text>
                <VStack align="start" spacing={0} flex={1} minW={0}>
                  <Text fontSize="sm" fontWeight="bold" noOfLines={1}>{selectedLocation.name}</Text>
                  <Text fontSize="xs" color="gray.600" noOfLines={1}>
                    {selectedLocation.address}
                  </Text>
                </VStack>
              </HStack>
            </Box>
          )}
        </ModalBody>

        <ModalFooter gap={2} py={2}>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            colorScheme="purple"
            size="sm"
            isDisabled={!selectedLocation}
            onClick={handleSelectLocation}
            leftIcon={<FiMapPin />}
          >
            Confirm
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}

export default MeetupLocationSelector
