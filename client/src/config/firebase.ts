import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAnalytics, type Analytics } from 'firebase/analytics'
import { getAuth, type Auth } from 'firebase/auth'

// Firebase configuration loaded from environment variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
}

// Basic validation: we need at least projectId, apiKey and appId to initialize safely
const hasRequiredFirebaseConfig = Boolean(
  firebaseConfig.projectId && firebaseConfig.apiKey && firebaseConfig.appId
)

let app: FirebaseApp | null = null
let analytics: Analytics | null = null
let auth: Auth | null = null

if (hasRequiredFirebaseConfig) {
  try {
    app = initializeApp(firebaseConfig)

    // Initialize Analytics (only if running in a browser environment)
    if (typeof window !== 'undefined') {
      try {
        analytics = getAnalytics(app)
      } catch (e) {
        // Analytics can fail in some environments (server-side or missing measurementId)
        // Don't let analytics errors break the app
        // eslint-disable-next-line no-console
        console.warn('Firebase analytics initialization failed:', e)
        analytics = null
      }
    }

    // Initialize Firebase Authentication
    try {
      auth = getAuth(app)
    } catch (e) {
      // Auth initialization shouldn't block the app if it fails
      // eslint-disable-next-line no-console
      console.warn('Firebase auth initialization failed:', e)
      auth = null
    }
  } catch (err) {
    // If initializeApp itself fails (for example missing fields), log and continue
    // eslint-disable-next-line no-console
    console.warn('Firebase initialization skipped due to incomplete config:', err)
    app = null
    analytics = null
    auth = null
  }
} else {
  // eslint-disable-next-line no-console
  console.warn('Firebase config incomplete - skipping Firebase initialization')
}

export { app, analytics, auth }
