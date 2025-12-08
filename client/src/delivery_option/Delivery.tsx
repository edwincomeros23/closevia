import React from 'react'
import { Box, Heading, VStack, Button, Text } from '@chakra-ui/react'
import { Link as RouterLink } from 'react-router-dom'

const DeliveryPage: React.FC = () => {
  return (
    <Box p={6}>
      <Heading size="lg">Delivery</Heading>
      <Text mt={3} color="gray.600">Choose a delivery option or view deliveries below.</Text>
      <VStack spacing={3} mt={6} align="start">
        <Button as={RouterLink} to="/rider" colorScheme="brand">Rider Dashboard</Button>
        <Button as={RouterLink} to="/rider-queue" variant="outline">Rider Queue</Button>
        <Button as={RouterLink} to="/batch-preview/1" variant="ghost">Batch Preview (example)</Button>
        <Button as={RouterLink} to="/batch-status/1" variant="ghost">Batch Status (example)</Button>
        <Button as={RouterLink} to="/remittance-ledger" variant="ghost">Remittance Ledger</Button>
        <Button as={RouterLink} to="/task-stepper/1" variant="ghost">Task Stepper (example)</Button>
      </VStack>
    </Box>
  )
}

export default DeliveryPage
