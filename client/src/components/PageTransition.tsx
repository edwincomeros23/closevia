import React from 'react'
import { motion } from 'framer-motion'

interface PageTransitionProps {
  children: React.ReactNode
}

/**
 * PageTransition component wraps page content with smooth fade and slide animations
 * Creates a consistent, professional feel across page changes
 */
export const PageTransition: React.FC<PageTransitionProps> = ({ children }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      style={{ width: '100%' }}
    >
      {children}
    </motion.div>
  )
}

export default PageTransition
