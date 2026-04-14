import { registerSW } from 'virtual:pwa-register'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

let deferredInstallPrompt: BeforeInstallPromptEvent | null = null

export const isRunningStandalone = (): boolean => {
  // Check for standalone display (PWA)
  const isStandaloneDisplay = window.matchMedia('(display-mode: standalone)').matches
  
  // Check for iOS standalone
  const isIosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  
  // Check for TWA (Trusted Web Activity) - Android native app
  const isTWA = (window as any).navigator.userAgent?.includes('Chrome/') && 
                (window as any).navigationInterface !== undefined
  
  // Check for Android app wrapper (Capacitor, etc.)
  const isAndroidApp = (window as any).Capacitor !== undefined
  
  // Check if running in Chrome Custom Tab (TWA uses this)
  const isChromeCustomTab = window.matchMedia('(display-mode: minimal-ui)').matches ||
                            (window as any).navigator.userAgent?.includes('NoStaticShellMode') === true
  
  return isStandaloneDisplay || isIosStandalone || isTWA || isAndroidApp || isChromeCustomTab
}

export const registerServiceWorker = (): void => {
  if (!import.meta.env.PROD) {
    // If a service worker was previously registered (e.g. after running a production build),
    // it may continue to serve cached assets and make localhost appear "stuck" on old UI.
    // In dev, proactively unregister and clear caches.
    try {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then((regs) => {
          regs.forEach((r) => r.unregister())
        })
      }
      if ('caches' in window) {
        caches.keys().then((keys) => {
          keys.forEach((k) => caches.delete(k))
        })
      }
    } catch {
      // ignore
    }
    return
  }

  registerSW({
    immediate: true,
    onRegistered(registration: ServiceWorkerRegistration | undefined) {
      if (registration) {
        console.info('Service worker registered')
      }
    },
    onRegisterError(error: unknown) {
      console.error('Service worker registration failed:', error)
    },
  })
}

export const initializeInstallPrompt = (onChange?: (isAvailable: boolean) => void): (() => void) => {
  const handleBeforeInstallPrompt = (event: Event) => {
    event.preventDefault()
    deferredInstallPrompt = event as BeforeInstallPromptEvent
    onChange?.(true)
  }

  const handleAppInstalled = () => {
    deferredInstallPrompt = null
    onChange?.(false)
  }

  window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
  window.addEventListener('appinstalled', handleAppInstalled)

  return () => {
    window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.removeEventListener('appinstalled', handleAppInstalled)
  }
}

export const canShowInstallPrompt = (): boolean => deferredInstallPrompt !== null

export const promptInstall = async (): Promise<boolean> => {
  if (!deferredInstallPrompt) {
    return false
  }

  await deferredInstallPrompt.prompt()
  const choice = await deferredInstallPrompt.userChoice
  const accepted = choice.outcome === 'accepted'

  if (accepted) {
    deferredInstallPrompt = null
  }

  return accepted
}
