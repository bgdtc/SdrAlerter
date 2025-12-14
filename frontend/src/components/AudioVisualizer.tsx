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
  const audioBufferRef = useRef<number[]>([])
  const sampleRateRef = useRef<number>(22050)
  const mutedRef = useRef(muted)
  const isListeningRef = useRef(isListening)
  const volumeRef = useRef(volume)

  // Mettre à jour les refs quand les valeurs changent
  useEffect(() => {
    mutedRef.current = muted
  }, [muted])

  useEffect(() => {
    isListeningRef.current = isListening
  }, [isListening])

  useEffect(() => {
    volumeRef.current = volume
  }, [volume])

  // Initialiser le contexte audio et le ScriptProcessorNode
  useEffect(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
      
      // Créer un ScriptProcessorNode pour un streaming continu
      // bufferSize: 2048 pour moins de latence, inputs: 0, outputs: 1
      const processor = audioContextRef.current.createScriptProcessor(2048, 0, 1)
      const gainNode = audioContextRef.current.createGain()
      
      processor.onaudioprocess = (e) => {
        const output = e.outputBuffer.getChannelData(0)
        const outputLength = output.length
        const buffer = audioBufferRef.current

        // Utiliser les refs pour avoir les valeurs à jour
        if (mutedRef.current || !isListeningRef.current || buffer.length === 0) {
          output.fill(0)
          return
        }

        // Lire depuis le début du buffer (FIFO)
        for (let i = 0; i < outputLength; i++) {
          if (buffer.length > 0) {
            output[i] = buffer.shift()! * volumeRef.current
          } else {
            // Pas assez de données, remplir avec du silence
            output[i] = 0
          }
        }
      }

      gainNode.gain.value = volume
      processor.connect(gainNode)
      gainNode.connect(audioContextRef.current.destination)

      processorRef.current = processor
      gainNodeRef.current = gainNode

      // Toujours s'assurer que le contexte audio démarre
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().then(() => {
          console.log('Contexte audio démarré')
        }).catch(err => {
          console.error('Erreur démarrage audio:', err)
        })
      }
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

    // Toujours s'assurer que le contexte audio est actif
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume().catch(err => {
        console.error('Erreur lors de la reprise du contexte audio:', err)
      })
    }

    if (!isListening) {
      // Nettoyer le buffer quand l'écoute s'arrête
      audioBufferRef.current = []
    }
  }, [isListening, muted])

  // Ajouter les données audio au buffer FIFO
  useEffect(() => {
    if (!audioData || !isListening) return

    const sampleRate = audioData.sampleRate || 22050
    sampleRateRef.current = sampleRate

    // Convertir les données Int16 en Float32 et les ajouter au buffer
    const buffer = audioBufferRef.current
    const samplesToAdd = audioData.audio.length
    
    for (let i = 0; i < samplesToAdd; i++) {
      buffer.push(audioData.audio[i] / 32768.0)
    }

    // Log pour déboguer (à retirer après)
    if (buffer.length > sampleRate * 0.5) {
      console.log(`Buffer audio: ${buffer.length} échantillons (~${(buffer.length / sampleRate).toFixed(2)}s)`)
    }

    // Limiter la taille du buffer pour éviter les retards (garder max ~2 secondes)
    const maxBufferSize = sampleRate * 2 // 2 secondes
    if (buffer.length > maxBufferSize) {
      // Retirer les anciennes données (déjà lues normalement, mais sécurité)
      const excess = buffer.length - maxBufferSize
      buffer.splice(0, excess)
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
            onClick={() => {
              setMuted(!muted)
              // Forcer la reprise du contexte audio au clic
              if (audioContextRef.current) {
                if (audioContextRef.current.state === 'suspended') {
                  audioContextRef.current.resume().then(() => {
                    console.log('Audio repris')
                  }).catch(err => {
                    console.error('Erreur reprise audio:', err)
                  })
                }
              }
            }}
            className={`px-3 py-1 rounded text-sm ${
              muted
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-green-600 hover:bg-green-700'
            } transition-colors`}
          >
            {muted ? '🔇 Mute' : '🔊 Unmute'}
          </button>
          {audioContextRef.current?.state === 'suspended' && (
            <button
              onClick={() => {
                audioContextRef.current?.resume().then(() => {
                  console.log('Audio démarré manuellement')
                }).catch(err => {
                  console.error('Erreur démarrage audio:', err)
                })
              }}
              className="px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs"
            >
              ▶ Démarrer Audio
            </button>
          )}
          <div className="text-xs text-slate-500">
            {audioContextRef.current && (
              <>
                Audio: {audioContextRef.current.state} | 
                Buffer: {audioBufferRef.current.length} échantillons 
                (~{(audioBufferRef.current.length / sampleRateRef.current).toFixed(2)}s)
              </>
            )}
          </div>
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

