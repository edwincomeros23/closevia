import { initializeApp, FirebaseApp } from 'firebase/app'
import { getAnalytics, Analytics } from 'firebase/analytics'
import { getAuth, Auth } from 'firebase/auth'

// Firebase configuration - will use environment variables from the consuming app
const getFirebaseConfig = () => {
    // For web (Vite)
    if (typeof import.meta !== 'undefined' && import.meta.env) {
        return {
            apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
            authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
            projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
            storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
            messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
            appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
            measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
        }
    }

    // For React Native (process.env)
    if (typeof process !== 'undefined' && process.env) {
        return {
            apiKey: process.env.FIREBASE_API_KEY || '',
            authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
            projectId: process.env.FIREBASE_PROJECT_ID || '',
            storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
            messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
            appId: process.env.FIREBASE_APP_ID || '',
            measurementId: process.env.FIREBASE_MEASUREMENT_ID,
        }
    }

    return {}
}

const firebaseConfig = getFirebaseConfig()

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
    }

    app = initializeApp(firebaseConfig)

    // Initialize Analytics (optional - only if measurement ID is available and in browser)
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
