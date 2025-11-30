import { initializeApp } from 'firebase/app'
import { getAnalytics } from 'firebase/analytics'
import { getAuth } from 'firebase/auth'

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: 'AIzaSyApuEzNJNUkZzumrEgNRKLK_ynZwuMnKdc',
  authDomain: 'wmsu-map-82e7c.firebaseapp.com',
  projectId: 'wmsu-map-82e7c',
  storageBucket: 'wmsu-map-82e7c.firebasestorage.app',
  messagingSenderId: '947635210340',
  appId: '1:947635210340:web:f2d2154b2fc84267b8b771',
  measurementId: 'G-N8WG534VBX',
}

// Initialize Firebase
const app = initializeApp(firebaseConfig)

// Initialize Analytics (only if not in development)
let analytics
if (typeof window !== 'undefined') {
  analytics = getAnalytics(app)
}

// Initialize Firebase Authentication
const auth = getAuth(app)

export { app, analytics, auth }
