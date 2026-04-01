import React, { useState } from 'react'
import {
  Button,
  HStack,
  useToast,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  FormControl,
  FormLabel,
  Input,
  Textarea,
  useDisclosure,
} from '@chakra-ui/react'
import { api } from '../services/api'

export interface ActionData {
  label: string
  actionType: string
  data?: Record<string, any>
  variant?: 'primary' | 'secondary' | 'danger'
}

interface MeetupActionButtonsProps {
  actions: ActionData[]
  tradeID: number
  onActionSuccess?: (action: string, response?: any) => void
  onActionFail?: (action: string, error: string) => void
}

interface TimeModalState {
  date: string
  time: string
}

interface NoShowModalState {
  reason: string
  details: string
}

const MeetupActionButtons: React.FC<MeetupActionButtonsProps> = ({
  actions,
  tradeID,
  onActionSuccess,
  onActionFail,
}) => {
  const [loading, setLoading] = useState<string | null>(null)
  const toast = useToast()
  const {
    isOpen: isTimeOpen,
    onOpen: onTimeOpen,
    onClose: onTimeClose,
  } = useDisclosure()
  const {
    isOpen: isNoShowOpen,
    onOpen: onNoShowOpen,
    onClose: onNoShowClose,
  } = useDisclosure()

  const [timeModal, setTimeModal] = useState<TimeModalState>({
    date: '',
    time: '',
  })
  const [noShowModal, setNoShowModal] = useState<NoShowModalState>({
    reason: '',
    details: '',
  })

  const getActionColor = (variant?: string) => {
    switch (variant) {
      case 'danger':
        return 'red'
      case 'secondary':
        return 'gray'
      default:
        return 'green'
    }
  }

  const getActionEmoji = (actionType: string) => {
    const emojis: Record<string, string> = {
      propose_time: '📅',
      confirm_match: '✅',
      heading_out: '🚗',
      arrived: '✅',
      confirm_completion: '💯',
      report_no_show: '⚠️',
      contact_support: '📞',
      proceed: '▶️',
      cancel: '❌',
    }
    return emojis[actionType] || '🔘'
  }

  const handleProposalSubmit = async () => {
    if (!timeModal.date || !timeModal.time) {
      toast({
        title: 'Required fields',
        description: 'Please provide both date and time',
        status: 'warning',
        duration: 2000,
      })
      return
    }

    setLoading('propose_time')
    try {
      const proposedTime = `${timeModal.date}T${timeModal.time}`
      const response = await api.post(`/api/trades/${tradeID}/meetup/propose`, {
        trade_id: tradeID,
        proposed_time: proposedTime,
      })

      toast({
        title: 'Success',
        description: 'Meetup time proposed! Waiting for seller confirmation.',
        status: 'success',
        duration: 3000,
      })
      onActionSuccess?.('propose_time', response.data)
      onTimeClose()
      setTimeModal({ date: '', time: '' })
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || 'Failed to propose time'
      toast({
        title: 'Error',
        description: errorMsg,
        status: 'error',
        duration: 3000,
      })
      onActionFail?.('propose_time', errorMsg)
    } finally {
      setLoading(null)
    }
  }

  const handleNoShowSubmit = async () => {
    if (!noShowModal.reason) {
      toast({
        title: 'Required field',
        description: 'Please select a reason',
        status: 'warning',
        duration: 2000,
      })
      return
    }

    setLoading('report_no_show')
    try {
      const response = await api.post(`/api/trades/${tradeID}/meetup/report-no-show`, {
        trade_id: tradeID,
        reason: noShowModal.reason,
        details: noShowModal.details,
      })

      toast({
        title: 'Reported',
        description: 'No-show reported to support team. Investigation in progress.',
        status: 'info',
        duration: 3000,
      })
      onActionSuccess?.('report_no_show', response.data)
      onNoShowClose()
      setNoShowModal({ reason: '', details: '' })
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || 'Failed to report no-show'
      toast({
        title: 'Error',
        description: errorMsg,
        status: 'error',
        duration: 3000,
      })
      onActionFail?.('report_no_show', errorMsg)
    } finally {
      setLoading(null)
    }
  }

  const handleSimpleAction = async (actionType: string) => {
    setLoading(actionType)
    try {
      let endpoint = ''

      switch (actionType) {
        case 'confirm_match':
          endpoint = `/api/trades/${tradeID}/meetup/confirm`
          break
        case 'heading_out':
          endpoint = `/api/trades/${tradeID}/meetup/heading-out`
          break
        case 'arrived':
          endpoint = `/api/trades/${tradeID}/meetup/arrived`
          break
        case 'confirm_completion':
          endpoint = `/api/trades/${tradeID}/meetup/confirm-completion`
          break
        default:
          return
      }

      const response = await api.post(endpoint, { trade_id: tradeID })

      const successMessages: Record<string, string> = {
        confirm_match: '✅ Deal confirmed! See you soon!',
        heading_out: '🚗 On the way! Stay alert.',
        arrived: '✅ Arrival confirmed! Ready to complete the trade.',
        confirm_completion: '🎉 Trade completed successfully!',
      }

      toast({
        title: 'Success',
        description: successMessages[actionType] || 'Action completed',
        status: 'success',
        duration: 3000,
      })
      onActionSuccess?.(actionType, response.data)
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || 'Action failed'
      toast({
        title: 'Error',
        description: errorMsg,
        status: 'error',
        duration: 3000,
      })
      onActionFail?.(actionType, errorMsg)
    } finally {
      setLoading(null)
    }
  }

  return (
    <>
      <HStack spacing={2} flexWrap="wrap" mb={2}>
        {actions.map((action, idx) => (
          <React.Fragment key={idx}>
            <Button
              size="sm"
              colorScheme={getActionColor(action.variant)}
              variant={action.variant === 'secondary' ? 'outline' : 'solid'}
              onClick={() => {
                if (action.actionType === 'propose_time') {
                  onTimeOpen()
                } else if (action.actionType === 'report_no_show') {
                  onNoShowOpen()
                } else {
                  handleSimpleAction(action.actionType)
                }
              }}
              isLoading={loading === action.actionType}
              fontSize="xs"
              _hover={{ transform: 'translateY(-2px)', shadow: 'md' }}
            >
              {getActionEmoji(action.actionType)} {action.label}
            </Button>
          </React.Fragment>
        ))}
      </HStack>

      {/* Time Proposal Modal */}
      <Modal isOpen={isTimeOpen} onClose={onTimeClose} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>📅 Propose Meetup Time</ModalHeader>
          <ModalBody>
            <FormControl mb={4}>
              <FormLabel>Date</FormLabel>
              <Input
                type="date"
                value={timeModal.date}
                onChange={(e) => setTimeModal({ ...timeModal, date: e.target.value })}
              />
            </FormControl>
            <FormControl>
              <FormLabel>Time</FormLabel>
              <Input
                type="time"
                value={timeModal.time}
                onChange={(e) => setTimeModal({ ...timeModal, time: e.target.value })}
              />
            </FormControl>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onTimeClose}>
              Cancel
            </Button>
            <Button
              colorScheme="green"
              onClick={handleProposalSubmit}
              isLoading={loading === 'propose_time'}
            >
              Propose Time
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* No-Show Report Modal */}
      <Modal isOpen={isNoShowOpen} onClose={onNoShowClose} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>⚠️ Report No-Show</ModalHeader>
          <ModalBody>
            <FormControl mb={4}>
              <FormLabel>Reason</FormLabel>

              <select
                value={noShowModal.reason}
                onChange={(e) => setNoShowModal({ ...noShowModal, reason: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px',
                  borderRadius: '4px',
                  border: '1px solid #e2e8f0',
                }}
              >
                <option value="">-- Select Reason --</option>
                <option value="seller_not_appeared">Seller didn't appear</option>
                <option value="buyer_not_appeared">Buyer didn't appear</option>
                <option value="item_not_available">Item not available</option>
                <option value="item_damaged">Item damaged/different condition</option>
                <option value="price_dispute">Price dispute</option>
                <option value="other">Other reason</option>
              </select>
            </FormControl>
            <FormControl>
              <FormLabel>Details (Optional)</FormLabel>
              <Textarea
                placeholder="Describe what happened..."
                value={noShowModal.details}
                onChange={(e) => setNoShowModal({ ...noShowModal, details: e.target.value })}
                rows={3}
              />
            </FormControl>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onNoShowClose}>
              Cancel
            </Button>
            <Button
              colorScheme="red"
              onClick={handleNoShowSubmit}
              isLoading={loading === 'report_no_show'}
            >
              Report No-Show
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  )
}

export default MeetupActionButtons
