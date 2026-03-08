import React, { createContext, useContext, useRef, useCallback } from 'react'
import { useDisclosure } from '@chakra-ui/react'

type MobileNavContextValue = Required<Pick<ReturnType<typeof useDisclosure>, 'isOpen' | 'onOpen' | 'onClose'>>

const MobileNavContext = createContext<MobileNavContextValue>({
  isOpen: false,
  onOpen: () => {},
  onClose: () => {},
})

export const MobileNavProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isOpen, onOpen: baseOnOpen, onClose: baseOnClose } = useDisclosure()
  const isAnimatingRef = useRef(false)
  const closeTimeoutRef = useRef<NodeJS.Timeout>()

  // Prevent duplicate opens with strict guard
  const onOpen = useCallback(() => {
    // If already open or animating, ignore the request
    if (isOpen || isAnimatingRef.current) {
      return
    }
    isAnimatingRef.current = true
    baseOnOpen()
  }, [isOpen, baseOnOpen])

  // Handle close with animation state reset
  const onClose = useCallback(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current)
    }
    baseOnClose()
    // Reset animating flag after animation completes (300ms for Framer motion)
    closeTimeoutRef.current = setTimeout(() => {
      isAnimatingRef.current = false
    }, 300)
  }, [baseOnClose])

  // Reset animating flag when drawer finishes opening
  React.useEffect(() => {
    if (isOpen && isAnimatingRef.current) {
      // Wait for drawer animation to complete
      const timer = setTimeout(() => {
        isAnimatingRef.current = false
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [isOpen])

  return (
    <MobileNavContext.Provider value={{ isOpen, onOpen, onClose }}>
      {children}
    </MobileNavContext.Provider>
  )
}

export const useMobileNav = () => useContext(MobileNavContext)


