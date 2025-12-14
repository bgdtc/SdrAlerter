import { useState, useEffect, useRef } from 'react'

interface PocsagMessage {
  id: number
  timestamp: string
  capcode: string
  function: string
  message: string
}

interface AlertSettings {
  browserNotification: boolean
  soundAlert: boolean
  visualPopup: boolean
  soundVolume: number
  popupDuration: number
  whitelistCapcodes: string[]
  blacklistCapcodes: string[]
}

interface AlertManagerProps {
  messages: PocsagMessage[]
}

export default function AlertManager({ messages }: AlertManagerProps) {
  const [settings, setSettings] = useState<AlertSettings>(() => {
    const saved = localStorage.getItem('alertSettings')
    return saved
      ? JSON.parse(saved)
      : {
          browserNotification: true,
          soundAlert: true,
          visualPopup: true,
          soundVolume: 0.7,
          popupDuration: 5000,
          whitelistCapcodes: [],
          blacklistCapcodes: []
        }
  })

  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default')
  const [currentAlert, setCurrentAlert] = useState<PocsagMessage | null>(null)
  const [alertHistory, setAlertHistory] = useState<PocsagMessage[]>([])
  const previousMessageCountRef = useRef(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Sauvegarder les paramètres
  useEffect(() => {
    localStorage.setItem('alertSettings', JSON.stringify(settings))
  }, [settings])

  // Vérifier les permissions de notification
  useEffect(() => {
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission)
    }
  }, [])

  // Demander permission pour les notifications
  const requestNotificationPermission = async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      const permission = await Notification.requestPermission()
      setNotificationPermission(permission)
    }
  }

  // Vérifier si un message doit déclencher une alerte
  const shouldAlert = (message: PocsagMessage): boolean => {
    // Vérifier whitelist
    if (settings.whitelistCapcodes.length > 0) {
      if (!settings.whitelistCapcodes.includes(message.capcode)) {
        return false
      }
    }

    // Vérifier blacklist
    if (settings.blacklistCapcodes.includes(message.capcode)) {
      return false
    }

    return true
  }

  // Jouer une alerte sonore
  const playSoundAlert = () => {
    if (!settings.soundAlert) return

    try {
      // Créer un contexte audio et générer un bip
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)

      oscillator.frequency.value = 800
      oscillator.type = 'sine'

      gainNode.gain.setValueAtTime(0, audioContext.currentTime)
      gainNode.gain.linearRampToValueAtTime(settings.soundVolume * 0.3, audioContext.currentTime + 0.01)
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3)

      oscillator.start(audioContext.currentTime)
      oscillator.stop(audioContext.currentTime + 0.3)
    } catch (err) {
      console.error('Erreur lors de la lecture sonore:', err)
    }
  }

  // Afficher une notification navigateur
  const showBrowserNotification = (message: PocsagMessage) => {
    if (!settings.browserNotification || notificationPermission !== 'granted') return

    try {
      const notification = new Notification('Message POCSAG', {
        body: `Capcode: ${message.capcode}\n${message.message}`,
        icon: '/vite.svg',
        tag: `pocsag-${message.id}`,
        requireInteraction: false
      })

      notification.onclick = () => {
        window.focus()
        notification.close()
      }

      setTimeout(() => notification.close(), settings.popupDuration)
    } catch (err) {
      console.error('Erreur lors de la notification:', err)
    }
  }

  // Détecter les nouveaux messages et déclencher les alertes
  useEffect(() => {
    if (messages.length > previousMessageCountRef.current) {
      const newMessages = messages.slice(0, messages.length - previousMessageCountRef.current)
      
      newMessages.forEach((message) => {
        if (shouldAlert(message)) {
          // Ajouter à l'historique
          setAlertHistory((prev) => [message, ...prev.slice(0, 49)])

          // Afficher popup visuel
          if (settings.visualPopup) {
            setCurrentAlert(message)
            setTimeout(() => setCurrentAlert(null), settings.popupDuration)
          }

          // Jouer son
          playSoundAlert()

          // Notification navigateur
          showBrowserNotification(message)
        }
      })
    }

    previousMessageCountRef.current = messages.length
  }, [messages, settings, notificationPermission])

  return (
    <>
      {/* Popup visuel d'alerte */}
      {currentAlert && settings.visualPopup && (
        <div className="fixed top-4 right-4 bg-red-600 text-white p-4 rounded-lg shadow-2xl z-50 max-w-md animate-slide-in">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="font-bold mb-1">🚨 Nouveau message POCSAG</div>
              <div className="text-sm mb-2">
                <span className="font-mono">{currentAlert.capcode}</span>
                <span className="mx-2">|</span>
                <span>{new Date(currentAlert.timestamp).toLocaleTimeString('fr-FR')}</span>
              </div>
              <div className="text-sm">{currentAlert.message}</div>
            </div>
            <button
              onClick={() => setCurrentAlert(null)}
              className="ml-4 text-white hover:text-gray-200"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Panneau de paramètres d'alerte */}
      <div className="bg-slate-800 rounded-lg p-6 shadow-lg mt-6">
        <h2 className="text-xl font-semibold mb-4">Paramètres d'alerte</h2>

        {notificationPermission !== 'granted' && (
          <div className="mb-4 p-3 bg-yellow-900/30 border border-yellow-700 rounded">
            <p className="text-yellow-200 text-sm mb-2">
              Les notifications navigateur nécessitent une permission
            </p>
            <button
              onClick={requestNotificationPermission}
              className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 rounded text-sm"
            >
              Autoriser les notifications
            </button>
          </div>
        )}

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-sm">Notification navigateur</label>
            <input
              type="checkbox"
              checked={settings.browserNotification}
              onChange={(e) =>
                setSettings({ ...settings, browserNotification: e.target.checked })
              }
              className="w-4 h-4"
            />
          </div>

          <div className="flex items-center justify-between">
            <label className="text-sm">Alerte sonore</label>
            <input
              type="checkbox"
              checked={settings.soundAlert}
              onChange={(e) => setSettings({ ...settings, soundAlert: e.target.checked })}
              className="w-4 h-4"
            />
          </div>

          <div className="flex items-center justify-between">
            <label className="text-sm">Popup visuel</label>
            <input
              type="checkbox"
              checked={settings.visualPopup}
              onChange={(e) => setSettings({ ...settings, visualPopup: e.target.checked })}
              className="w-4 h-4"
            />
          </div>

          <div>
            <label className="block text-sm mb-2">
              Volume sonore: {Math.round(settings.soundVolume * 100)}%
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={settings.soundVolume}
              onChange={(e) =>
                setSettings({ ...settings, soundVolume: parseFloat(e.target.value) })
              }
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-sm mb-2">
              Durée popup: {settings.popupDuration / 1000}s
            </label>
            <input
              type="range"
              min="2000"
              max="10000"
              step="500"
              value={settings.popupDuration}
              onChange={(e) =>
                setSettings({ ...settings, popupDuration: parseInt(e.target.value) })
              }
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-sm mb-2">Whitelist capcodes (un par ligne)</label>
            <textarea
              value={settings.whitelistCapcodes.join('\n')}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  whitelistCapcodes: e.target.value.split('\n').filter((c) => c.trim())
                })
              }
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded focus:outline-none focus:border-blue-500 text-sm font-mono"
              rows={3}
              placeholder="123456&#10;789012"
            />
          </div>

          <div>
            <label className="block text-sm mb-2">Blacklist capcodes (un par ligne)</label>
            <textarea
              value={settings.blacklistCapcodes.join('\n')}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  blacklistCapcodes: e.target.value.split('\n').filter((c) => c.trim())
                })
              }
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded focus:outline-none focus:border-blue-500 text-sm font-mono"
              rows={3}
              placeholder="999999"
            />
          </div>
        </div>

        {alertHistory.length > 0 && (
          <div className="mt-6">
            <h3 className="text-lg font-medium mb-2">Historique des alertes ({alertHistory.length})</h3>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {alertHistory.slice(0, 10).map((alert) => (
                <div
                  key={alert.id}
                  className="p-2 bg-slate-700/50 rounded text-sm"
                >
                  <span className="font-mono text-blue-400">{alert.capcode}</span>
                  <span className="mx-2 text-slate-500">|</span>
                  <span className="text-slate-400">{new Date(alert.timestamp).toLocaleTimeString('fr-FR')}</span>
                  <div className="mt-1 text-slate-300">{alert.message.substring(0, 50)}...</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes slide-in {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        .animate-slide-in {
          animation: slide-in 0.3s ease-out;
        }
      `}</style>
    </>
  )
}

