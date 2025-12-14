import { useState, useEffect } from 'react'
import axios from 'axios'

interface Device {
  index: number
  id: string
  name: string
  serial: string
}

interface SdrSelectorProps {
  selectedDevice: string | null
  onDeviceSelect: (deviceId: string | null) => void
}

export default function SdrSelector({ selectedDevice, onDeviceSelect }: SdrSelectorProps) {
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchDevices = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await axios.get('http://localhost:3000/api/sdr/devices')
      setDevices(response.data.devices || [])
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erreur lors de la récupération des devices')
      console.error('Erreur:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDevices()
  }, [])

  return (
    <div className="bg-slate-800 rounded-lg p-6 shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Sélection RTL-SDR</h2>
        <button
          onClick={fetchDevices}
          disabled={loading}
          className="px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 rounded text-sm transition-colors"
        >
          {loading ? '...' : 'Actualiser'}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded text-red-200 text-sm">
          {error}
        </div>
      )}

      {devices.length === 0 && !loading && (
        <div className="text-slate-400 text-sm mb-4">
          Aucun device RTL-SDR détecté
        </div>
      )}

      <div className="space-y-2">
        {devices.map((device) => (
          <button
            key={device.id}
            onClick={() => onDeviceSelect(device.id)}
            className={`w-full p-3 rounded border-2 transition-all text-left ${
              selectedDevice === device.id
                ? 'border-blue-500 bg-blue-900/30'
                : 'border-slate-700 bg-slate-700/50 hover:border-slate-600'
            }`}
          >
            <div className="font-medium">{device.name}</div>
            <div className="text-sm text-slate-400">
              Index: {device.index} | Serial: {device.serial}
            </div>
          </button>
        ))}
      </div>

      {selectedDevice && (
        <button
          onClick={() => onDeviceSelect(null)}
          className="mt-4 w-full px-4 py-2 bg-red-600 hover:bg-red-700 rounded transition-colors"
        >
          Déconnecter
        </button>
      )}
    </div>
  )
}

