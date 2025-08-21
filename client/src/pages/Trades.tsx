import React, { useEffect, useState } from 'react'
import { Box, Heading, VStack, HStack, Text, Badge, Button, Spinner, Center, useToast, Input, Divider } from '@chakra-ui/react'
import { api } from '../services/api'
import { Trade, TradeAction } from '../types'

const Trades: React.FC = () => {
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)
  const toast = useToast()

  const fetchTrades = async () => {
    try {
      setLoading(true)
      const res = await api.get('/api/trades')
      setTrades(Array.isArray(res.data?.data) ? res.data.data : [])
    } catch (e: any) {
      toast({ title: 'Error', description: e?.response?.data?.error || 'Failed to load trades', status: 'error' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchTrades() }, [])

  const [activeTradeId, setActiveTradeId] = useState<number | null>(null)
  const [messages, setMessages] = useState<Array<{id:number; trade_id:number; sender_id:number; content:string; created_at:string}>>([])
  const [newMessage, setNewMessage] = useState('')

  const openTrade = async (id: number) => {
    setActiveTradeId(id)
    setMessages([])
    try {
      const res = await api.get(`/api/trades/${id}/messages`)
      setMessages(Array.isArray(res.data?.data) ? res.data.data : [])
    } catch {}
  }

  const sendMessage = async () => {
    if (!activeTradeId || !newMessage.trim()) return
    try {
      await api.post(`/api/trades/${activeTradeId}/messages`, { content: newMessage.trim() })
      setNewMessage('')
      const res = await api.get(`/api/trades/${activeTradeId}/messages`)
      setMessages(Array.isArray(res.data?.data) ? res.data.data : [])
    } catch (e:any) {
      toast({ title: 'Error', description: e?.response?.data?.error || 'Failed to send message', status: 'error' })
    }
  }

  const updateTrade = async (id: number, action: TradeAction) => {
    try {
      await api.put(`/api/trades/${id}`, action)
      toast({ title: 'Success', description: 'Trade updated', status: 'success' })
      fetchTrades()
    } catch (e: any) {
      toast({ title: 'Error', description: e?.response?.data?.error || 'Failed to update trade', status: 'error' })
    }
  }

  if (loading) {
    return (
      <Center h="50vh"><Spinner size="xl" color="brand.500" /></Center>
    )
  }

  return (
    <Box px={8} py={6}>
      <Heading size="md" mb={4}>Trades</Heading>
      <VStack spacing={4} align="stretch">
        {trades.length === 0 ? (
          <Text color="gray.500">No trades yet.</Text>
        ) : trades.map((t) => (
          <Box key={t.id} bg="white" borderWidth="1px" borderColor="gray.200" rounded="md" p={4}>
            <HStack justify="space-between" align="start">
              <VStack align="start" spacing={1}>
                <Text fontWeight="semibold">Trade #{t.id}</Text>
                <Text fontSize="sm" color="gray.600">Target Product ID: {t.target_product_id}</Text>
                <Text fontSize="sm" color="gray.600">Items offered: {t.items?.length || 0}</Text>
              </VStack>
              <Badge colorScheme={t.status === 'pending' ? 'yellow' : t.status === 'accepted' ? 'green' : t.status === 'declined' ? 'red' : 'purple'}>{t.status}</Badge>
            </HStack>
            <HStack mt={3} spacing={3}>
              <Button size="sm" colorScheme="green" variant="outline" onClick={() => updateTrade(t.id, { action: 'accept' })}>Accept</Button>
              <Button size="sm" colorScheme="red" variant="outline" onClick={() => updateTrade(t.id, { action: 'decline' })}>Decline</Button>
              <Button size="sm" variant="ghost" onClick={() => openTrade(t.id)}>Open</Button>
            </HStack>
            {activeTradeId === t.id && (
              <Box mt={4}>
                <Divider mb={3} />
                <VStack align="stretch" spacing={2} maxH="240px" overflowY="auto">
                  {messages.map((m) => (
                    <Box key={m.id} bg="gray.50" rounded="md" p={2}>
                      <Text fontSize="xs" color="gray.500">{new Date(m.created_at).toLocaleString()}</Text>
                      <Text>{m.content}</Text>
                    </Box>
                  ))}
                  {messages.length === 0 && (
                    <Text color="gray.400">No messages yet.</Text>
                  )}
                </VStack>
                <HStack mt={3}>
                  <Input placeholder="Type a message" value={newMessage} onChange={(e) => setNewMessage(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') sendMessage() }} />
                  <Button onClick={sendMessage} colorScheme="brand">Send</Button>
                </HStack>
              </Box>
            )}
          </Box>
        ))}
      </VStack>
    </Box>
  )
}

export default Trades


