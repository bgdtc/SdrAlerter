import { useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { API_BASE_URL } from '../utils/api'

interface AudioData {
  audio: number[]
  fft: number[]
  sampleRate?: number
  timestamp: number
}

export function useWebSocket() {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [audioData, setAudioData] = useState<AudioData | null>(null)

  useEffect(() => {
    const socketInstance = io(API_BASE_URL, {
      transports: ['websocket', 'polling']
    })

    socketInstance.on('connect', () => {
      console.log('WebSocket connecté')
      setIsConnected(true)
    })

    socketInstance.on('disconnect', () => {
      console.log('WebSocket déconnecté')
      setIsConnected(false)
    })

    socketInstance.on('audioData', (data: AudioData) => {
      setAudioData(data)
    })

    setSocket(socketInstance)

    return () => {
      socketInstance.close()
    }
  }, [])

  return { socket, isConnected, audioData }
}

