import { initializeApp } from 'firebase/app'
import { getAnalytics, Analytics } from 'firebase/analytics'
import { getAuth, Auth } from 'firebase/auth'
import { FirebaseApp } from 'firebase/app'

// Firebase configuration loaded from environment variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
}

// Validate that required Firebase config values are present
const isFirebaseConfigValid = () => {
  const required = ['apiKey', 'authDomain', 'projectId', 'appId']
  return required.every((key) => firebaseConfig[key as keyof typeof firebaseConfig])
}

// Initialize Firebase
let app: FirebaseApp | null = null
let analytics: Analytics | null = null
let auth: Auth | null = null

try {
  if (!isFirebaseConfigValid()) {
    console.warn('Firebase configuration is incomplete. Some features may not work properly.')
    console.warn('Please check your environment variables:', {
      VITE_FIREBASE_API_KEY: !!import.meta.env.VITE_FIREBASE_API_KEY,
      VITE_FIREBASE_AUTH_DOMAIN: !!import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      VITE_FIREBASE_PROJECT_ID: !!import.meta.env.VITE_FIREBASE_PROJECT_ID,
      VITE_FIREBASE_APP_ID: !!import.meta.env.VITE_FIREBASE_APP_ID,
    })
  }

  app = initializeApp(firebaseConfig)

  // Initialize Analytics (optional - only if measurement ID is available)
  if (typeof window !== 'undefined') {
    if (firebaseConfig.measurementId) {
      try {
        analytics = getAnalytics(app)
        console.log('Firebase Analytics initialized')
      } catch (error) {
        console.warn('Analytics initialization warning:', error)
        // Analytics is optional
      }
    }
  }

  // Initialize Firebase Authentication
  auth = getAuth(app)
  console.log('Firebase initialized successfully')
} catch (error) {
  console.error('Firebase initialization failed:', error)
  // Allow app to continue without Firebase
  app = null
  analytics = null
  auth = null
}

export { app, analytics, auth }
