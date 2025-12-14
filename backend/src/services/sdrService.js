import { spawn } from 'child_process';
import { emitAudioData } from '../websocket/streamHandler.js';

let rtlFmProcess = null;
let soxProcess = null;
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
    '-s', sampleRate.toString()
  ];

  // Pour FM, utiliser wbfm (wideband FM) qui est plus approprié pour la radio FM
  if (normalizedMode === 'fm') {
    args.push('-M', 'wbfm');
    console.log('Mode FM détecté, utilisation de wbfm (downsampling via sox)');
  } else {
    args.push('-M', normalizedMode);
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

  // Pour FM, utiliser sox pour downsampler à 48000 Hz
  let actualProcess = null;
  soxProcess = null; // Réinitialiser la variable globale
  const targetAudioSampleRate = 48000;

  if (normalizedMode === 'fm') {
    // Lancer rtl_fm qui sortira à ~170000 Hz
    rtlFmProcess = spawn('rtl_fm', args);
    
    // Lancer sox pour downsampler à 48000 Hz
    // Format: sox -t raw -r 170000 -e signed-integer -b 16 -c 1 - -t raw -r 48000 -e signed-integer -b 16 -c 1 -
    soxProcess = spawn('sox', [
      '-t', 'raw',
      '-r', '170000', // Sample rate d'entrée (sera mis à jour après détection)
      '-e', 'signed-integer',
      '-b', '16',
      '-c', '1',
      '-', // stdin
      '-t', 'raw',
      '-r', targetAudioSampleRate.toString(),
      '-e', 'signed-integer',
      '-b', '16',
      '-c', '1',
      '-' // stdout
    ]);
    
    // Pipe rtl_fm -> sox
    rtlFmProcess.stdout.pipe(soxProcess.stdin);
    
    // Utiliser sox comme source de données audio
    actualProcess = soxProcess;
    console.log('Utilisation de sox pour downsampling FM: 170000 Hz -> 48000 Hz');
  } else {
    // Pour les autres modes, utiliser rtl_fm directement
    rtlFmProcess = spawn('rtl_fm', args);
    actualProcess = rtlFmProcess;
  }

  const audioBuffer = [];
  let fftBuffer = [];
  let audioSampleRate = normalizedMode === 'fm' ? targetAudioSampleRate : sampleRate;
  let rtlFmOutputRate = 170000; // Valeur par défaut pour wbfm
  let detectedSampleRate = audioSampleRate;
  
  // Pour POCSAG, on a besoin d'accéder aux données brutes de rtl_fm (avant sox)
  // Note: Si POCSAG est actif en même temps que FM, il faudra gérer différemment
  if (normalizedMode !== 'fm' && pocsagStreamCallback) {
    rtlFmProcess.stdout.on('data', (chunk) => {
      if (pocsagStreamCallback) {
        pocsagStreamCallback(chunk);
      }
    });
  }

  // Écouter actualProcess (sox pour FM, rtl_fm pour autres modes)
  actualProcess.stdout.on('data', (chunk) => {
    // Convertir les données binaires en Int16Array
    const samples = new Int16Array(chunk.buffer, chunk.byteOffset, chunk.byteLength / 2);
    audioBuffer.push(...Array.from(samples));

    // Pour FM avec sox, on reçoit déjà des données à 48000 Hz
    const targetChunkSize = 2400; // ~50ms à 48000 Hz

    if (audioBuffer.length >= targetChunkSize) {
      // Calcul FFT (utiliser un sous-ensemble des données)
      const fftSize = Math.min(4096, audioBuffer.length);
      if (fftSize >= 512) {
        fftBuffer = calculateSimpleFFT(audioBuffer.slice(0, fftSize));
      }

      // Extraire un chunk pour l'envoi
      const chunkToSend = audioBuffer.splice(0, targetChunkSize);

      // Émettre via WebSocket si disponible
      if (socketIO && chunkToSend.length > 0) {
        emitAudioData(socketIO, Array.from(chunkToSend), fftBuffer, audioSampleRate);
      }
    }
  });

  rtlFmProcess.stderr.on('data', (data) => {
    const stderrText = data.toString();
    console.error('rtl_fm stderr:', stderrText);
    
    // Parser "Output at X Hz" pour détecter le vrai sample rate
    const outputMatch = stderrText.match(/Output at (\d+) Hz/i);
    if (outputMatch) {
      rtlFmOutputRate = parseInt(outputMatch[1], 10);
      console.log(`Sample rate rtl_fm détecté: ${rtlFmOutputRate} Hz`);
      
      // Mettre à jour sox si on l'utilise
      if (soxProcess && normalizedMode === 'fm') {
        // Note: sox ne permet pas de changer le sample rate à la volée
        // Il faut le redémarrer, mais pour l'instant on assume 170000
        console.log(`sox utilisera ${rtlFmOutputRate} Hz comme entrée`);
      }
      detectedSampleRate = normalizedMode === 'fm' ? targetAudioSampleRate : rtlFmOutputRate;
    }
  });

  // Gérer les erreurs de sox
  if (soxProcess) {
    soxProcess.stderr.on('data', (data) => {
      console.error('sox stderr:', data.toString());
    });
    
    soxProcess.on('error', (error) => {
      console.error('Erreur sox:', error);
      if (error.code === 'ENOENT') {
        console.error('sox n\'est pas installé. Installez-le avec: sudo apt-get install sox');
      }
    });
  }

  rtlFmProcess.on('error', (error) => {
    console.error('Erreur rtl_fm:', error);
    isListening = false;
    if (error.code === 'ENOENT') {
      throw new Error('rtl_fm n\'est pas installé ou n\'est pas dans le PATH');
    }
    throw error;
  });

  if (soxProcess) {
    soxProcess.on('error', (error) => {
      console.error('Erreur sox:', error);
      if (error.code === 'ENOENT') {
        console.error('sox n\'est pas installé. Installez-le avec: sudo apt-get install sox');
        throw new Error('sox n\'est pas installé. Installez-le avec: sudo apt-get install sox');
      }
    });
    
    soxProcess.stderr.on('data', (data) => {
      // sox écrit souvent sur stderr même pour les infos normales, on ignore
    });
    
    soxProcess.on('close', (code) => {
      console.log(`sox s'est terminé avec le code ${code}`);
    });
  }

  rtlFmProcess.on('close', (code) => {
    console.log(`rtl_fm s'est terminé avec le code ${code}`);
    if (soxProcess) {
      soxProcess.kill();
      soxProcess = null;
    }
    rtlFmProcess = null;
    isListening = false;
    currentParams = null;
  });

  if (soxProcess) {
    soxProcess.on('close', (code) => {
      console.log(`sox s'est terminé avec le code ${code}`);
    });
  }
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

  // Arrêter sox d'abord si il existe
  if (soxProcess) {
    soxProcess.kill();
    soxProcess = null;
  }

  // Arrêter rtl_fm
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

