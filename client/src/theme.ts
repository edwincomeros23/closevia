import { extendTheme } from '@chakra-ui/react'

export const theme = extendTheme({
  colors: {
    brand: {
      50: '#e6fffa',
      100: '#b3f5ff',
      500: '#319795',
      600: '#2c7a7b',
      700: '#285e61',
      900: '#1a202c',
    },
  },
  fonts: {
    heading: 'Inter, system-ui, sans-serif',
    body: 'Inter, system-ui, sans-serif',
  },
  components: {
    Button: {
      defaultProps: {
        colorScheme: 'brand',
      },
    },
  },
  styles: {
    global: {
      body: {
        bg: 'gray.50',
        color: 'gray.800',
      },
    },
  },
})
