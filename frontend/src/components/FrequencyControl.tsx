import { useState, useEffect } from 'react'
import axios from 'axios'

interface FrequencyControlProps {
  deviceId: string | null
  isListening: boolean
  onListeningChange: (listening: boolean) => void
}

export default function FrequencyControl({
  deviceId,
  isListening,
  onListeningChange
}: FrequencyControlProps) {
  const [frequency, setFrequency] = useState('145.500')
  const [gain, setGain] = useState('49.6')
  const [sampleRate, setSampleRate] = useState('240000')
  const [mode, setMode] = useState('fm')
  const [filterWidth, setFilterWidth] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Vérifier le statut périodiquement
    const interval = setInterval(async () => {
      try {
        const response = await axios.get('http://localhost:3000/api/sdr/status')
        if (response.data.isListening !== isListening) {
          onListeningChange(response.data.isListening)
        }
      } catch (err) {
        // Ignorer les erreurs de statut
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [isListening, onListeningChange])

  const handleStart = async () => {
    if (!deviceId) {
      setError('Veuillez sélectionner un device RTL-SDR')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const deviceIndex = parseInt(deviceId.split('-').pop() || '0')
      await axios.post('http://localhost:3000/api/sdr/start', {
        deviceIndex,
        frequency: parseFloat(frequency),
        gain: gain ? parseFloat(gain) : undefined,
        sampleRate: parseInt(sampleRate),
        mode,
        filterWidth: filterWidth ? parseFloat(filterWidth) : undefined
      })
      onListeningChange(true)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erreur lors du démarrage')
      console.error('Erreur:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleStop = async () => {
    setLoading(true)
    setError(null)

    try {
      await axios.post('http://localhost:3000/api/sdr/stop')
      onListeningChange(false)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erreur lors de l\'arrêt')
      console.error('Erreur:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    setFrequency('145.500')
    setGain('49.6')
    setSampleRate('240000')
    setMode('fm')
    setFilterWidth('')
  }

  return (
    <div className="bg-slate-800 rounded-lg p-6 shadow-lg">
      <h2 className="text-xl font-semibold mb-4">Paramètres d'écoute</h2>

      {error && (
        <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded text-red-200 text-sm">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">
            Fréquence centrale (MHz)
          </label>
          <input
            type="number"
            step="0.001"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value)}
            disabled={isListening}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded focus:outline-none focus:border-blue-500 disabled:opacity-50"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Gain (dB) - 0 à 49.6
          </label>
          <input
            type="number"
            step="0.1"
            min="0"
            max="49.6"
            value={gain}
            onChange={(e) => setGain(e.target.value)}
            disabled={isListening}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded focus:outline-none focus:border-blue-500 disabled:opacity-50"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Sample Rate (Hz)
          </label>
          <select
            value={sampleRate}
            onChange={(e) => setSampleRate(e.target.value)}
            disabled={isListening}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded focus:outline-none focus:border-blue-500 disabled:opacity-50"
          >
            <option value="250000">250k</option>
            <option value="240000">240k</option>
            <option value="1024000">1.024M</option>
            <option value="2048000">2.048M</option>
            <option value="3200000">3.2M</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Mode de démodulation
          </label>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            disabled={isListening}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded focus:outline-none focus:border-blue-500 disabled:opacity-50"
          >
            <option value="fm">FM</option>
            <option value="am">AM</option>
            <option value="usb">USB</option>
            <option value="lsb">LSB</option>
            <option value="raw">RAW</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Largeur de filtre (Hz) - Optionnel
          </label>
          <input
            type="number"
            value={filterWidth}
            onChange={(e) => setFilterWidth(e.target.value)}
            disabled={isListening}
            placeholder="Auto"
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded focus:outline-none focus:border-blue-500 disabled:opacity-50"
          />
        </div>

        <div className="flex gap-2 pt-2">
          <button
            onClick={handleStart}
            disabled={loading || isListening || !deviceId}
            className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-slate-600 disabled:cursor-not-allowed rounded font-medium transition-colors"
          >
            {loading ? '...' : 'Démarrer'}
          </button>
          <button
            onClick={handleStop}
            disabled={loading || !isListening}
            className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-slate-600 disabled:cursor-not-allowed rounded font-medium transition-colors"
          >
            Arrêter
          </button>
          <button
            onClick={handleReset}
            disabled={isListening}
            className="px-4 py-2 bg-slate-600 hover:bg-slate-700 disabled:opacity-50 rounded transition-colors"
          >
            Reset
          </button>
        </div>

        {isListening && (
          <div className="mt-4 p-3 bg-green-900/30 border border-green-700 rounded text-green-200 text-sm text-center">
            <span className="inline-block w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></span>
            Écoute en cours
          </div>
        )}
      </div>
    </div>
  )
}

