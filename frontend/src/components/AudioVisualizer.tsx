import { useEffect, useRef, useState } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js'
import { Line } from 'react-chartjs-2'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
)

interface AudioVisualizerProps {
  isListening: boolean
}

export default function AudioVisualizer({ isListening }: AudioVisualizerProps) {
  const { audioData, isConnected } = useWebSocket()
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<AudioBufferSourceNode | null>(null)
  const audioQueueRef = useRef<number[][]>([])
  const nextPlayTimeRef = useRef<number>(0)

  // Initialiser le contexte audio
  useEffect(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
      nextPlayTimeRef.current = audioContextRef.current.currentTime
    }
  }, [])

  // Nettoyer la queue audio quand l'écoute s'arrête
  useEffect(() => {
    if (!isListening) {
      audioQueueRef.current = []
      nextPlayTimeRef.current = audioContextRef.current?.currentTime || 0
    }
  }, [isListening])

  // Gérer le playback audio avec streaming continu
  useEffect(() => {
    if (!audioData || !audioContextRef.current || muted || !isListening) return

    const audioContext = audioContextRef.current
    const sampleRate = audioData.sampleRate || 22050

    // Ajouter les données à la queue
    audioQueueRef.current.push(audioData.audio)

    // Limiter la taille de la queue pour éviter les retards
    if (audioQueueRef.current.length > 10) {
      audioQueueRef.current.shift()
      nextPlayTimeRef.current = audioContext.currentTime
    }

    // Fonction pour jouer le prochain buffer de la queue
    const playNextBuffer = () => {
      if (audioQueueRef.current.length === 0 || muted || !isListening) return

      const audioDataArray = audioQueueRef.current.shift()!
      if (!audioDataArray || audioDataArray.length === 0) {
        playNextBuffer()
        return
      }

      // Créer un buffer audio depuis les données avec le bon sample rate
      const buffer = audioContext.createBuffer(1, audioDataArray.length, sampleRate)
      const channelData = buffer.getChannelData(0)

      // Normaliser les données Int16 vers Float32
      for (let i = 0; i < audioDataArray.length; i++) {
        channelData[i] = audioDataArray[i] / 32768.0
      }

      // Créer une source et la jouer au bon moment
      const source = audioContext.createBufferSource()
      const gainNode = audioContext.createGain()
      
      gainNode.gain.value = volume
      source.buffer = buffer
      source.connect(gainNode)
      gainNode.connect(audioContext.destination)

      // Planifier la lecture au bon moment pour un streaming continu
      const startTime = Math.max(audioContext.currentTime, nextPlayTimeRef.current)
      source.start(startTime)
      
      // Mettre à jour le temps de la prochaine lecture
      nextPlayTimeRef.current = startTime + buffer.duration

      source.onended = () => {
        // Jouer le prochain buffer quand celui-ci se termine
        playNextBuffer()
      }
    }

    // Jouer immédiatement le premier buffer si c'est le premier
    if (audioQueueRef.current.length === 1) {
      playNextBuffer()
    }

    return () => {
      // Nettoyer si nécessaire
    }
  }, [audioData, volume, muted, isListening])

  // Dessiner l'oscilloscope
  useEffect(() => {
    if (!audioData || !canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const width = canvas.width
    const height = canvas.height

    ctx.fillStyle = '#0f172a'
    ctx.fillRect(0, 0, width, height)

    ctx.strokeStyle = '#3b82f6'
    ctx.lineWidth = 2
    ctx.beginPath()

    const samples = audioData.audio.slice(-1024) // Derniers 1024 échantillons
    const stepX = width / samples.length

    for (let i = 0; i < samples.length; i++) {
      const x = i * stepX
      const normalized = samples[i] / 32768.0
      const y = height / 2 - (normalized * height / 2)

      if (i === 0) {
        ctx.moveTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }
    }

    ctx.stroke()
  }, [audioData])

  // Préparer les données pour le graphique FFT
  const fftChartData = {
    labels: audioData?.fft.map((_, i) => i.toString()) || [],
    datasets: [
      {
        label: 'Spectre FFT',
        data: audioData?.fft || [],
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.4
      }
    ]
  }

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      },
      title: {
        display: true,
        text: 'Spectre FFT',
        color: '#e2e8f0'
      }
    },
    scales: {
      x: {
        ticks: { color: '#94a3b8' },
        grid: { color: 'rgba(148, 163, 184, 0.1)' }
      },
      y: {
        ticks: { color: '#94a3b8' },
        grid: { color: 'rgba(148, 163, 184, 0.1)' },
        beginAtZero: true
      }
    }
  }

  return (
    <div className="bg-slate-800 rounded-lg p-6 shadow-lg space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Visualisation</h2>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400">Volume:</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="w-24"
            />
            <span className="text-sm w-10">{Math.round(volume * 100)}%</span>
          </div>
          <button
            onClick={() => setMuted(!muted)}
            className={`px-3 py-1 rounded text-sm ${
              muted
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-green-600 hover:bg-green-700'
            } transition-colors`}
          >
            {muted ? '🔇 Mute' : '🔊 Unmute'}
          </button>
        </div>
      </div>

      {!isConnected && (
        <div className="p-4 bg-yellow-900/30 border border-yellow-700 rounded text-yellow-200 text-center">
          Connexion WebSocket en attente...
        </div>
      )}

      {isListening && (
        <>
          <div className="h-64">
            <Line data={fftChartData} options={chartOptions} />
          </div>

          <div>
            <h3 className="text-lg font-medium mb-2">Oscilloscope</h3>
            <canvas
              ref={canvasRef}
              width={800}
              height={200}
              className="w-full h-48 bg-slate-900 rounded"
            />
          </div>
        </>
      )}

      {!isListening && (
        <div className="text-center text-slate-400 py-12">
          Démarrez l'écoute pour voir les visualisations
        </div>
      )}
    </div>
  )
}

