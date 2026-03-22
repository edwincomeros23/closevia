import { registerSW } from 'virtual:pwa-register'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

let deferredInstallPrompt: BeforeInstallPromptEvent | null = null

export const isRunningStandalone = (): boolean => {
  const isStandaloneDisplay = window.matchMedia('(display-mode: standalone)').matches
  const isIosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  return isStandaloneDisplay || isIosStandalone
}

export const registerServiceWorker = (): void => {
  if (!import.meta.env.PROD) {
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
