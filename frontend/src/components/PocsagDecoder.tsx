import { useState, useEffect } from 'react'
import { apiClient } from '../utils/api'

interface PocsagMessage {
  id: number
  timestamp: string
  capcode: string
  function: string
  message: string
  raw: string
}

interface PocsagDecoderProps {
  deviceId: string | null
  onMessagesChange?: (messages: PocsagMessage[]) => void
}

export default function PocsagDecoder({ deviceId, onMessagesChange }: PocsagDecoderProps) {
  const [isDecoding, setIsDecoding] = useState(false)
  const [messages, setMessages] = useState<PocsagMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [filterCapcode, setFilterCapcode] = useState('')

  // Récupérer les messages périodiquement
  useEffect(() => {
    if (!isDecoding) return

    const fetchMessages = async () => {
      try {
        const response = await apiClient.get('/api/pocsag/messages?limit=100')
        const newMessages = response.data.messages || []
        setMessages(newMessages)
        if (onMessagesChange) {
          onMessagesChange(newMessages)
        }
      } catch (err) {
        console.error('Erreur lors de la récupération des messages:', err)
      }
    }

    fetchMessages()
    const interval = setInterval(fetchMessages, 2000)

    return () => clearInterval(interval)
  }, [isDecoding, onMessagesChange])

  // Vérifier le statut périodiquement
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const response = await apiClient.get('/api/pocsag/status')
        if (response.data.isDecoding !== isDecoding) {
          setIsDecoding(response.data.isDecoding)
        }
      } catch (err) {
        // Ignorer les erreurs
      }
    }

    const interval = setInterval(checkStatus, 2000)
    return () => clearInterval(interval)
  }, [isDecoding])

  const handleToggleDecoding = async () => {
    setLoading(true)
    setError(null)

    try {
      if (isDecoding) {
        await apiClient.post('/api/pocsag/stop')
        setIsDecoding(false)
      } else {
        await apiClient.post('/api/pocsag/start')
        setIsDecoding(true)
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erreur lors du changement d\'état')
      console.error('Erreur:', err)
    } finally {
      setLoading(false)
    }
  }

  const filteredMessages = messages.filter((msg) => {
    if (filter && !msg.message.toLowerCase().includes(filter.toLowerCase())) {
      return false
    }
    if (filterCapcode && !msg.capcode.includes(filterCapcode)) {
      return false
    }
    return true
  })

  const exportMessages = (format: 'json' | 'csv') => {
    const data = filteredMessages.map(msg => ({
      timestamp: msg.timestamp,
      capcode: msg.capcode,
      function: msg.function,
      message: msg.message
    }))

    if (format === 'json') {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `pocsag-messages-${Date.now()}.json`
      a.click()
    } else {
      const csv = [
        'Timestamp,Capcode,Function,Message',
        ...data.map(msg => 
          `"${msg.timestamp}","${msg.capcode}","${msg.function}","${msg.message.replace(/"/g, '""')}"`
        )
      ].join('\n')
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `pocsag-messages-${Date.now()}.csv`
      a.click()
    }
  }

  return (
    <div className="bg-slate-800 rounded-lg p-6 shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Décodage POCSAG</h2>
        <button
          onClick={handleToggleDecoding}
          disabled={loading || !deviceId}
          className={`px-4 py-2 rounded font-medium transition-colors ${
            isDecoding
              ? 'bg-red-600 hover:bg-red-700'
              : 'bg-green-600 hover:bg-green-700'
          } disabled:bg-slate-600 disabled:cursor-not-allowed`}
        >
          {loading ? '...' : isDecoding ? 'Arrêter' : 'Démarrer POCSAG'}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded text-red-200 text-sm">
          {error}
        </div>
      )}

      {isDecoding && (
        <div className="mb-4 p-3 bg-green-900/30 border border-green-700 rounded text-green-200 text-sm">
          <span className="inline-block w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></span>
          Décodage actif - {messages.length} message(s) reçu(s)
        </div>
      )}

      {isDecoding && messages.length > 0 && (
        <>
          <div className="mb-4 flex gap-2">
            <input
              type="text"
              placeholder="Filtrer par message..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded focus:outline-none focus:border-blue-500"
            />
            <input
              type="text"
              placeholder="Filtrer par capcode..."
              value={filterCapcode}
              onChange={(e) => setFilterCapcode(e.target.value)}
              className="w-32 px-3 py-2 bg-slate-700 border border-slate-600 rounded focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={() => exportMessages('json')}
              className="px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm"
            >
              Export JSON
            </button>
            <button
              onClick={() => exportMessages('csv')}
              className="px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm"
            >
              Export CSV
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left p-2">Timestamp</th>
                  <th className="text-left p-2">Capcode</th>
                  <th className="text-left p-2">Fonction</th>
                  <th className="text-left p-2">Message</th>
                </tr>
              </thead>
              <tbody>
                {filteredMessages.map((msg) => (
                  <tr key={msg.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                    <td className="p-2 text-slate-400">{new Date(msg.timestamp).toLocaleString('fr-FR')}</td>
                    <td className="p-2 font-mono">{msg.capcode}</td>
                    <td className="p-2">{msg.function}</td>
                    <td className="p-2">{msg.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredMessages.length === 0 && (
            <div className="text-center text-slate-400 py-8">
              Aucun message ne correspond aux filtres
            </div>
          )}
        </>
      )}

      {isDecoding && messages.length === 0 && (
        <div className="text-center text-slate-400 py-8">
          En attente de messages POCSAG...
        </div>
      )}

      {!isDecoding && (
        <div className="text-center text-slate-400 py-8">
          Démarrez le décodage POCSAG pour recevoir des messages
        </div>
      )}
    </div>
  )
}

