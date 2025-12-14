import { useState } from 'react'
import SdrSelector from './components/SdrSelector'
import FrequencyControl from './components/FrequencyControl'
import AudioVisualizer from './components/AudioVisualizer'
import PocsagDecoder from './components/PocsagDecoder'
import AlertManager from './components/AlertManager'

function App() {
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null)
  const [isListening, setIsListening] = useState(false)
  const [pocsagMessages, setPocsagMessages] = useState<any[]>([])

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <div className="container mx-auto px-4 py-8">
        <header className="mb-8">
          <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            SDR Alerter
          </h1>
          <p className="text-slate-400">Contrôle RTL-SDR avec décodage POCSAG</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-6">
            <SdrSelector
              selectedDevice={selectedDevice}
              onDeviceSelect={setSelectedDevice}
            />
            <FrequencyControl
              deviceId={selectedDevice}
              isListening={isListening}
              onListeningChange={setIsListening}
            />
            <PocsagDecoder 
              deviceId={selectedDevice}
              onMessagesChange={setPocsagMessages}
            />
            <AlertManager messages={pocsagMessages} />
          </div>
          <div className="lg:col-span-2">
            <AudioVisualizer isListening={isListening} />
          </div>
        </div>
      </div>
    </div>
  )
}

export default App

