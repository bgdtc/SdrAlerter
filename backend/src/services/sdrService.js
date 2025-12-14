import { spawn } from 'child_process';
import { emitAudioData } from '../websocket/streamHandler.js';

let rtlFmProcess = null;
let currentParams = null;
let isListening = false;
let socketIO = null;
let pocsagStreamCallback = null;

// Référence au serveur IO (sera défini depuis server.js)
export function setSocketIO(io) {
  socketIO = io;
}

// Callback pour rediriger le stream vers POCSAG
export function setPocsagStreamCallback(callback) {
  pocsagStreamCallback = callback;
}

export async function listDevices() {
  return new Promise((resolve, reject) => {
    const process = spawn('rtl_test', ['-t']);
    let output = '';

    process.stdout.on('data', (data) => {
      output += data.toString();
    });

    process.stderr.on('data', (data) => {
      output += data.toString();
    });

    process.on('close', (code) => {
      if (code !== 0) {
        // Essayer de parser quand même si des devices sont trouvés
        const devices = parseDevices(output);
        if (devices.length > 0) {
          return resolve(devices);
        }
        return reject(new Error(`rtl_test a échoué avec le code ${code}`));
      }

      const devices = parseDevices(output);
      resolve(devices);
    });

    process.on('error', (error) => {
      if (error.code === 'ENOENT') {
        reject(new Error('rtl_test n\'est pas installé ou n\'est pas dans le PATH'));
      } else {
        reject(error);
      }
    });
  });
}

function parseDevices(output) {
  const devices = [];
  const lines = output.split('\n');
  
  for (const line of lines) {
    // Chercher des patterns comme "Found 1 device(s):" ou "usb_claim_interface error -6"
    if (line.includes('Found') && line.includes('device')) {
      const match = line.match(/Found (\d+) device/);
      if (match) {
        const count = parseInt(match[1]);
        for (let i = 0; i < count; i++) {
          devices.push({
            index: i,
            id: `rtl-sdr-${i}`,
            name: `RTL-SDR Device ${i}`,
            serial: `Device ${i}`
          });
        }
      }
    }
  }

  // Si aucun device trouvé dans la sortie, essayer de détecter via USB
  if (devices.length === 0) {
    // Fallback: retourner au moins un device par défaut
    devices.push({
      index: 0,
      id: 'rtl-sdr-0',
      name: 'RTL-SDR Device',
      serial: 'Default'
    });
  }

  return devices;
}

export async function startListening(params) {
  if (rtlFmProcess) {
    throw new Error('L\'écoute est déjà en cours');
  }

  const {
    deviceIndex = 0,
    frequency,
    gain,
    sampleRate = 240000,
    mode = 'fm',
    filterWidth
  } = params;

  // Validation des paramètres
  if (!frequency || frequency < 0) {
    throw new Error('Fréquence invalide');
  }

  if (gain !== undefined && (gain < 0 || gain > 49.6)) {
    throw new Error('Gain doit être entre 0 et 49.6 dB');
  }

  // Normaliser le mode en minuscules
  const normalizedMode = mode.toLowerCase();

  // Construction de la commande rtl_fm
  const args = [
    '-f', `${frequency}M`,
    '-s', sampleRate.toString(),
    '-M', normalizedMode
  ];

  // Pour FM, ajouter le sample rate audio de sortie (22050 Hz pour qualité audio standard)
  // Cela permet d'avoir un audio de bonne qualité sans downsampling côté serveur
  if (normalizedMode === 'fm') {
    args.push('-r', '22050'); // Sample rate audio de sortie pour FM
    console.log('Mode FM détecté, ajout de -r 22050');
  }

  console.log('Commande rtl_fm:', 'rtl_fm', args.join(' '));

  if (gain !== undefined) {
    args.push('-g', gain.toString());
  }

  if (filterWidth) {
    args.push('-l', filterWidth.toString());
  }

  // Mode raw pour streaming
  args.push('-');

  currentParams = params;
  isListening = true;

  rtlFmProcess = spawn('rtl_fm', args);

  const audioBuffer = [];
  let fftBuffer = [];

  // Sample rate audio effectif (22050 pour FM, sinon le sample rate configuré)
  const audioSampleRate = normalizedMode === 'fm' ? 22050 : sampleRate;

  rtlFmProcess.stdout.on('data', (chunk) => {
    // Rediriger vers POCSAG si actif (utiliser les données brutes avant conversion)
    if (pocsagStreamCallback) {
      pocsagStreamCallback(chunk);
    }

    // Convertir les données binaires en Int16Array
    const samples = new Int16Array(chunk.buffer, chunk.byteOffset, chunk.byteLength / 2);
    audioBuffer.push(...Array.from(samples));

    // Émettre des chunks audio plus fréquemment pour un streaming fluide
    // Pour FM avec -r 22050, on envoie des chunks de ~1102 échantillons (~50ms à 22050 Hz)
    // Plus petits chunks = moins de latence et streaming plus fluide
    const chunkSize = normalizedMode === 'fm' ? 1102 : 2048;

    if (audioBuffer.length >= chunkSize) {
      // Calcul FFT pour visualisation (utiliser plus d'échantillons pour meilleure résolution)
      const fftSize = 4096;
      if (audioBuffer.length >= fftSize) {
        fftBuffer = calculateSimpleFFT(audioBuffer.slice(0, fftSize));
      }

      // Extraire un chunk pour l'envoi
      const chunkToSend = audioBuffer.splice(0, chunkSize);

      // Émettre via WebSocket si disponible
      if (socketIO) {
        emitAudioData(socketIO, Array.from(chunkToSend), fftBuffer, audioSampleRate);
      }
    }
  });

  rtlFmProcess.stderr.on('data', (data) => {
    console.error('rtl_fm stderr:', data.toString());
  });

  rtlFmProcess.on('error', (error) => {
    console.error('Erreur rtl_fm:', error);
    isListening = false;
    if (error.code === 'ENOENT') {
      throw new Error('rtl_fm n\'est pas installé ou n\'est pas dans le PATH');
    }
    throw error;
  });

  rtlFmProcess.on('close', (code) => {
    console.log(`rtl_fm s'est terminé avec le code ${code}`);
    rtlFmProcess = null;
    isListening = false;
    currentParams = null;
  });
}

function calculateSimpleFFT(samples) {
  // FFT simple pour visualisation (pas une vraie FFT mais suffisant pour l'affichage)
  const fftSize = 512;
  const result = [];

  for (let i = 0; i < fftSize; i++) {
    let sum = 0;
    const step = Math.floor(samples.length / fftSize);
    for (let j = 0; j < step && i * step + j < samples.length; j++) {
      sum += Math.abs(samples[i * step + j]);
    }
    result.push(sum / step);
  }

  return result;
}

export async function stopListening() {
  if (!rtlFmProcess) {
    throw new Error('Aucune écoute en cours');
  }

  rtlFmProcess.kill();
  rtlFmProcess = null;
  isListening = false;
  currentParams = null;
}

export function getListeningStatus() {
  return {
    isListening,
    params: currentParams
  };
}

export function getAudioStream() {
  // Cette fonction peut être utilisée pour obtenir le stream audio
  // Actuellement géré directement dans startListening
  return rtlFmProcess?.stdout || null;
}

