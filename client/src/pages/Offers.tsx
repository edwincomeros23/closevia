import React, { useEffect, useMemo, useState } from 'react'
import { Box, Heading, VStack, HStack, Text, Badge, Button, Spinner, Center, useToast, Tabs, TabList, TabPanels, Tab, TabPanel, Select } from '@chakra-ui/react'
import { api } from '../services/api'
import { Trade, TradeAction } from '../types'

const Offers: React.FC = () => {
  const [incoming, setIncoming] = useState<Trade[]>([])
  const [outgoing, setOutgoing] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest')
  const toast = useToast()

  const fetchAll = async () => {
    try {
      setLoading(true)
      const [incRes, outRes] = await Promise.all([
        api.get('/api/trades', { params: { direction: 'incoming' } }),
        api.get('/api/trades', { params: { direction: 'outgoing' } }),
      ])
      setIncoming(Array.isArray(incRes.data?.data) ? incRes.data.data : [])
      setOutgoing(Array.isArray(outRes.data?.data) ? outRes.data.data : [])
    } catch (e: any) {
      toast({ title: 'Error', description: e?.response?.data?.error || 'Failed to load offers', status: 'error' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAll() }, [])

  const updateTrade = async (id: number, action: TradeAction) => {
    try {
      await api.put(`/api/trades/${id}`, action)
      toast({ title: 'Success', description: 'Offer updated', status: 'success' })
      fetchAll()
    } catch (e: any) {
      toast({ title: 'Error', description: e?.response?.data?.error || 'Failed to update offer', status: 'error' })
    }
  }

  const sortList = (list: Trade[]) => {
    const sorted = [...list]
    sorted.sort((a, b) => {
      const at = new Date(a.created_at).getTime()
      const bt = new Date(b.created_at).getTime()
      return sort === 'newest' ? bt - at : at - bt
    })
    return sorted
  }

  const incomingSorted = useMemo(() => sortList(incoming), [incoming, sort])
  const outgoingSorted = useMemo(() => sortList(outgoing), [outgoing, sort])

  if (loading) {
    return (
      <Center h="50vh"><Spinner size="xl" color="brand.500" /></Center>
    )
  }

  const badgeColor = (status: Trade['status']) => status === 'pending' ? 'yellow' : status === 'accepted' ? 'green' : status === 'declined' ? 'red' : 'purple'

  return (
    <Box px={8} py={6}>
      <HStack justify="space-between" mb={4}>
        <Heading size="md">Offers</Heading>
        <HStack>
          <Text fontSize="sm" color="gray.600">Sort:</Text>
          <Select size="sm" value={sort} onChange={e => setSort(e.target.value as any)} w="160px">
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
          </Select>
        </HStack>
      </HStack>

      <Tabs colorScheme="brand">
        <TabList>
          <Tab>Incoming <Badge ml={2}>{incoming.filter(i => i.status === 'pending').length}</Badge></Tab>
          <Tab>Outgoing <Badge ml={2}>{outgoing.filter(i => i.status === 'pending').length}</Badge></Tab>
          <Tab>Active Trades</Tab>
          <Tab>Past Offers</Tab>
        </TabList>
        <TabPanels>
          <TabPanel>
            <VStack spacing={4} align="stretch">
              {incomingSorted.length === 0 ? (
                <Text color="gray.500">No incoming offers.</Text>
              ) : incomingSorted.map((t) => (
                <Box key={t.id} bg="white" borderWidth="1px" borderColor="gray.200" rounded="md" p={4}>
                  <HStack justify="space-between" align="start">
                    <VStack align="start" spacing={1}>
                      <Text fontWeight="semibold">{t.product_title || `Product #${t.target_product_id}`}</Text>
                      <Text fontSize="sm" color="gray.600">From: {t.buyer_name || `User #${t.buyer_id}`}</Text>
                      <Text fontSize="xs" color="gray.500">{new Date(t.created_at).toLocaleString()}</Text>
                    </VStack>
                    <Badge colorScheme={badgeColor(t.status)}>{t.status}</Badge>
                  </HStack>
                  <HStack mt={3} spacing={3}>
                    <Button size="sm" colorScheme="green" variant="solid" onClick={() => updateTrade(t.id, { action: 'accept' })} isDisabled={t.status !== 'pending'}>Accept</Button>
                    <Button size="sm" colorScheme="red" variant="outline" onClick={() => updateTrade(t.id, { action: 'decline' })} isDisabled={t.status !== 'pending'}>Decline</Button>
                  </HStack>
                </Box>
              ))}
            </VStack>
          </TabPanel>
          <TabPanel>
            <VStack spacing={4} align="stretch">
              {outgoingSorted.length === 0 ? (
                <Text color="gray.500">No outgoing offers.</Text>
              ) : outgoingSorted.map((t) => (
                <Box key={t.id} bg="white" borderWidth="1px" borderColor="gray.200" rounded="md" p={4}>
                  <HStack justify="space-between" align="start">
                    <VStack align="start" spacing={1}>
                      <Text fontWeight="semibold">{t.product_title || `Product #${t.target_product_id}`}</Text>
                      <Text fontSize="sm" color="gray.600">To: {t.seller_name || `User #${t.seller_id}`}</Text>
                      <Text fontSize="xs" color="gray.500">{new Date(t.created_at).toLocaleString()}</Text>
                    </VStack>
                    <Badge colorScheme={badgeColor(t.status)}>{t.status}</Badge>
                  </HStack>
                </Box>
              ))}
            </VStack>
          </TabPanel>
          <TabPanel>
            <VStack spacing={4} align="stretch">
              {incomingSorted.concat(outgoingSorted).filter(t => t.status === 'accepted').length === 0 ? (
                <Text color="gray.500">No active trades yet.</Text>
              ) : incomingSorted.concat(outgoingSorted).filter(t => t.status === 'accepted').map((t) => (
                <Box key={t.id} bg="white" borderWidth="1px" borderColor="gray.200" rounded="md" p={4}>
                  <HStack justify="space-between" align="start">
                    <VStack align="start" spacing={1}>
                      <Text fontWeight="semibold">{t.product_title || `Product #${t.target_product_id}`}</Text>
                      <Text fontSize="sm" color="gray.600">Buyer: {t.buyer_name || `#${t.buyer_id}`} • Seller: {t.seller_name || `#${t.seller_id}`}</Text>
                    </VStack>
                    <Badge colorScheme={badgeColor(t.status)}>{t.status}</Badge>
                  </HStack>
                </Box>
              ))}
            </VStack>
          </TabPanel>
          <TabPanel>
            <VStack spacing={4} align="stretch">
              {incomingSorted.concat(outgoingSorted).filter(t => t.status === 'declined').length === 0 ? (
                <Text color="gray.500">No past offers.</Text>
              ) : incomingSorted.concat(outgoingSorted).filter(t => t.status === 'declined').map((t) => (
                <Box key={t.id} bg="white" borderWidth="1px" borderColor="gray.200" rounded="md" p={4}>
                  <HStack justify="space-between" align="start">
                    <VStack align="start" spacing={1}>
                      <Text fontWeight="semibold">{t.product_title || `Product #${t.target_product_id}`}</Text>
                      <Text fontSize="sm" color="gray.600">Buyer: {t.buyer_name || `#${t.buyer_id}`} • Seller: {t.seller_name || `#${t.seller_id}`}</Text>
                    </VStack>
                    <Badge colorScheme={badgeColor(t.status)}>{t.status}</Badge>
                  </HStack>
                </Box>
              ))}
            </VStack>
          </TabPanel>
        </TabPanels>
      </Tabs>
    </Box>
  )
}

export default Offers
