import { useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'

interface AudioData {
  audio: number[]
  fft: number[]
  timestamp: number
}

export function useWebSocket() {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [audioData, setAudioData] = useState<AudioData | null>(null)

  useEffect(() => {
    const socketInstance = io('http://localhost:3000', {
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

