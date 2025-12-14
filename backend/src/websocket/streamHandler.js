import { getAudioStream } from '../services/sdrService.js';

export function setupWebSocket(io) {
  io.on('connection', (socket) => {
    console.log('Client connecté:', socket.id);

    socket.on('disconnect', () => {
      console.log('Client déconnecté:', socket.id);
    });

    // Le streaming audio sera géré par le service SDR
    // qui émettra directement sur le socket
  });

  // Exporter io pour utilisation dans les services
  return io;
}

// Fonction pour émettre des données audio vers tous les clients
export function emitAudioData(io, audioData, fftData) {
  io.emit('audioData', {
    audio: audioData,
    fft: fftData,
    timestamp: Date.now()
  });
}

