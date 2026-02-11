import { initializeApp, FirebaseApp } from 'firebase/app'
import { getAnalytics, Analytics } from 'firebase/analytics'
import { getAuth, Auth } from 'firebase/auth'

// Firebase configuration - placeholder values for React Native
// In production, these should be configured via app.config.js or .env with Expo
const firebaseConfig = {
    apiKey: '',
    authDomain: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: '',
    measurementId: '',
}

// Function to set Firebase config (call this from app initialization)
export const setFirebaseConfig = (config: typeof firebaseConfig) => {
    Object.assign(firebaseConfig, config)
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

// Lazy initialization - will be called when Firebase is needed
export const initFirebase = () => {
    if (app) return { app, analytics, auth }

    try {
        if (!isFirebaseConfigValid()) {
            console.warn('Firebase configuration is incomplete. Some features may not work properly.')
            return { app: null, analytics: null, auth: null }
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

    return { app, analytics, auth }
}

export { app, analytics, auth }
