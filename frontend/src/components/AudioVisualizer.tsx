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
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)
  const audioBufferRef = useRef<Float32Array>(new Float32Array(0))
  const sampleRateRef = useRef<number>(22050)
  const bufferWritePosRef = useRef<number>(0)

  // Initialiser le contexte audio et le ScriptProcessorNode
  useEffect(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
      
      // Créer un ScriptProcessorNode pour un streaming continu
      // bufferSize: 2048 pour moins de latence, inputs: 0, outputs: 1
      const processor = audioContextRef.current.createScriptProcessor(2048, 0, 1)
      const gainNode = audioContextRef.current.createGain()
      
      processor.onaudioprocess = (e) => {
        if (muted || !isListening) {
          e.outputBuffer.getChannelData(0).fill(0)
          return
        }

        const output = e.outputBuffer.getChannelData(0)
        const outputLength = output.length
        const buffer = audioBufferRef.current
        const bufferLength = buffer.length

        // Copier les données du buffer vers la sortie
        for (let i = 0; i < outputLength; i++) {
          if (bufferWritePosRef.current < bufferLength) {
            output[i] = buffer[bufferWritePosRef.current] * volume
            bufferWritePosRef.current++
          } else {
            // Pas assez de données, remplir avec du silence
            output[i] = 0
          }
        }

        // Si on a lu tout le buffer, le réinitialiser
        if (bufferWritePosRef.current >= bufferLength) {
          audioBufferRef.current = new Float32Array(0)
          bufferWritePosRef.current = 0
        }
      }

      gainNode.gain.value = volume
      processor.connect(gainNode)
      gainNode.connect(audioContextRef.current.destination)

      processorRef.current = processor
      gainNodeRef.current = gainNode
    }

    return () => {
      if (processorRef.current) {
        processorRef.current.disconnect()
        processorRef.current = null
      }
    }
  }, [])

  // Mettre à jour le volume
  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = volume
    }
  }, [volume])

  // Démarrer/arrêter le ScriptProcessorNode selon l'état d'écoute
  useEffect(() => {
    if (!processorRef.current || !audioContextRef.current) return

    if (isListening && !muted) {
      // S'assurer que le contexte audio est actif
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume()
      }
    } else {
      // Nettoyer le buffer quand l'écoute s'arrête
      audioBufferRef.current = new Float32Array(0)
      bufferWritePosRef.current = 0
    }
  }, [isListening, muted])

  // Ajouter les données audio au buffer circulaire
  useEffect(() => {
    if (!audioData || !isListening) return

    const sampleRate = audioData.sampleRate || 22050
    sampleRateRef.current = sampleRate

    // Convertir les données Int16 en Float32
    const newSamples = new Float32Array(audioData.audio.length)
    for (let i = 0; i < audioData.audio.length; i++) {
      newSamples[i] = audioData.audio[i] / 32768.0
    }

    // Ajouter les nouveaux échantillons au buffer existant
    const currentBuffer = audioBufferRef.current
    const newBuffer = new Float32Array(currentBuffer.length + newSamples.length)
    newBuffer.set(currentBuffer, 0)
    newBuffer.set(newSamples, currentBuffer.length)
    audioBufferRef.current = newBuffer

    // Limiter la taille du buffer pour éviter les retards (garder max ~1 seconde)
    const maxBufferSize = sampleRate * 1 // 1 seconde
    if (audioBufferRef.current.length > maxBufferSize) {
      // Garder seulement les dernières données
      const excess = audioBufferRef.current.length - maxBufferSize
      audioBufferRef.current = audioBufferRef.current.slice(excess)
      bufferWritePosRef.current = Math.max(0, bufferWritePosRef.current - excess)
    }
  }, [audioData, isListening])

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

