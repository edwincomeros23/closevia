import React, { createContext, useContext } from 'react'
import { useDisclosure } from '@chakra-ui/react'

type MobileNavContextValue = Required<Pick<ReturnType<typeof useDisclosure>, 'isOpen' | 'onOpen' | 'onClose'>>

const MobileNavContext = createContext<MobileNavContextValue>({
  isOpen: false,
  onOpen: () => {},
  onClose: () => {},
})

export const MobileNavProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isOpen, onOpen, onClose } = useDisclosure()
  return (
    <MobileNavContext.Provider value={{ isOpen, onOpen, onClose }}>
      {children}
    </MobileNavContext.Provider>
  )
}

export const useMobileNav = () => useContext(MobileNavContext)


