import axios, { AxiosError, AxiosRequestConfig } from 'axios'

// API Base URL - hardcoded to production for React Native
// (Environment variables in React Native/Expo require different setup via app.config.js)
export const API_BASE_URL = 'https://closevia.onrender.com'

// Storage abstraction - will be overridden in mobile with AsyncStorage
export interface StorageAdapter {
    getItem(key: string): string | null | Promise<string | null>
    setItem(key: string, value: string): void | Promise<void>
    removeItem(key: string): void | Promise<void>
}

// Default to localStorage for web (will be replaced in mobile)
let storage: StorageAdapter = {
    getItem: (key: string) => {
        if (typeof localStorage !== 'undefined') {
            return localStorage.getItem(key)
        }
        return null
    },
    setItem: (key: string, value: string) => {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(key, value)
        }
    },
    removeItem: (key: string) => {
        if (typeof localStorage !== 'undefined') {
            localStorage.removeItem(key)
        }
    }
}

// Function to set custom storage (for React Native AsyncStorage)
export const setStorage = (customStorage: StorageAdapter) => {
    storage = customStorage
}

const DEBUG_API = false // Can be enabled via environment variable

export const api = axios.create({
    baseURL: API_BASE_URL,
})

// Request interceptor to add auth token and log
api.interceptors.request.use(
    async (config) => {
        const token = await storage.getItem('clovia_token')
        // Ensure headers object exists
        config.headers = config.headers || {}
        if (token) {
            // Do not override if explicitly set by caller
            if (!config.headers['Authorization']) {
                config.headers['Authorization'] = `Bearer ${token}`
            }
        }

        // Ensure Content-Type is set for JSON payloads, but do not override for FormData
        if (config.data && !(config.data instanceof FormData)) {
            config.headers = config.headers || {}
            if (!config.headers['Content-Type']) {
                config.headers['Content-Type'] = 'application/json'
            }
        }

        if (DEBUG_API) {
            try {
                const method = (config.method || 'get').toUpperCase()
                const url = `${config.baseURL || ''}${config.url || ''}`
                console.log(`[API REQUEST] ${method} ${url}`)
            } catch { }
        }

        return config
    },
    (error) => Promise.reject(error)
)

// Response interceptor to log and handle auth
api.interceptors.response.use(
    (response) => {
        if (DEBUG_API) {
            try {
                const cfg = response.config
                const method = (cfg.method || 'get').toUpperCase()
                const url = `${cfg.baseURL || ''}${cfg.url || ''}`
                console.log(`[API RESPONSE] ${method} ${url} -> ${response.status}`)
            } catch { }
        }
        return response
    },
    async (error: AxiosError) => {
        const cfg = error.config as (AxiosRequestConfig & { _retry?: boolean }) | undefined
        const status = error.response?.status

        if (DEBUG_API) {
            try {
                const method = (cfg?.method || 'get').toUpperCase()
                const url = `${cfg?.baseURL || ''}${cfg?.url || ''}`
                console.log(`[API ERROR] ${method} ${url} -> ${status}`)
            } catch { }
        }

        // Simple one-time retry on 401 if token exists but header was missing/not set
        if (status === 401 && cfg && !cfg._retry) {
            const token = await storage.getItem('clovia_token')
            if (token) {
                cfg._retry = true
                cfg.headers = cfg.headers || {}
                cfg.headers['Authorization'] = `Bearer ${token}`
                return api(cfg)
            }
        }

        // On 401, clear token (platform-specific navigation handled by app)
        if (status === 401) {
            await storage.removeItem('clovia_token')
        }

        return Promise.reject(error)
    }
)
