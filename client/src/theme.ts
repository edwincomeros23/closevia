import { extendTheme } from '@chakra-ui/react'

// Chakra default breakpoints: sm 30em, md 48em, lg 62em, xl 80em, 2xl 96em (1536px)
// Ensure desktop (xl/2xl) is usable; optional custom container for very wide
const breakpoints = {
  sm: '30em',
  md: '48em',
  lg: '62em',
  xl: '80em',
  '2xl': '96em', // 1536px - desktop monitor
}

export const theme = extendTheme({
  breakpoints,
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
