import { spawn } from 'child_process';
import { setPocsagStreamCallback } from './sdrService.js';

let multimonProcess = null;
let isDecoding = false;
let messages = [];
const MAX_MESSAGES = 1000; // Limite d'historique

// Callback pour les nouvelles alertes
let alertCallback = null;

export function setAlertCallback(callback) {
  alertCallback = callback;
}

// Fonction appelée quand de nouvelles données audio arrivent
let audioDataHandler = null;

export async function startPocsagDecoding() {
  if (isDecoding) {
    throw new Error('Le décodage POCSAG est déjà actif');
  }

  const args = [
    '-t', 'raw',
    '-a', 'POCSAG512',
    '-a', 'POCSAG1200',
    '-a', 'POCSAG2400',
    '-'
  ];

  isDecoding = true;

  multimonProcess = spawn('multimon-ng', args);

  let buffer = '';

  multimonProcess.stdout.on('data', (data) => {
    buffer += data.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // Garder la dernière ligne incomplète

    for (const line of lines) {
      if (line.trim()) {
        parsePocsagMessage(line.trim());
      }
    }
  });

  multimonProcess.stderr.on('data', (data) => {
    console.error('multimon-ng stderr:', data.toString());
  });

  multimonProcess.on('error', (error) => {
    console.error('Erreur multimon-ng:', error);
    isDecoding = false;
    if (error.code === 'ENOENT') {
      throw new Error('multimon-ng n\'est pas installé ou n\'est pas dans le PATH');
    }
    throw error;
  });

  multimonProcess.on('close', (code) => {
    console.log(`multimon-ng s'est terminé avec le code ${code}`);
    multimonProcess = null;
    isDecoding = false;
    // Supprimer le callback
    setPocsagStreamCallback(null);
  });

  // Configurer le callback pour recevoir les données audio du SDR
  audioDataHandler = (chunk) => {
    if (multimonProcess && multimonProcess.stdin && !multimonProcess.stdin.destroyed) {
      try {
        multimonProcess.stdin.write(chunk);
      } catch (err) {
        console.error('Erreur lors de l\'écriture vers multimon-ng:', err);
      }
    }
  };

  setPocsagStreamCallback(audioDataHandler);
}

function parsePocsagMessage(line) {
  // Format typique: "POCSAG512: Address:  123456  Function: 1  Alpha:   Message text"
  // ou "POCSAG1200: Address: 123456 Function: A Alpha: Message"
  
  const patterns = [
    /POCSAG(?:512|1200|2400):\s*Address:\s*(\d+)\s+Function:\s*([0-9A-Z])\s+Alpha:\s*(.+)/i,
    /POCSAG(?:512|1200|2400):\s*Address:\s*(\d+).*?Alpha:\s*(.+)/i
  ];

  let match = null;
  for (const pattern of patterns) {
    match = line.match(pattern);
    if (match) break;
  }

  if (match) {
    const capcode = match[1];
    const func = match[2] || 'N/A';
    const message = match[3] || match[2] || '';

    const pocsagMessage = {
      id: Date.now() + Math.random(),
      timestamp: new Date().toISOString(),
      capcode: capcode.trim(),
      function: func.toString().trim(),
      message: message.trim(),
      raw: line
    };

    messages.unshift(pocsagMessage); // Ajouter au début
    if (messages.length > MAX_MESSAGES) {
      messages.pop(); // Retirer le plus ancien
    }

    // Déclencher l'alerte
    if (alertCallback) {
      alertCallback(pocsagMessage);
    }
  } else {
    // Si le parsing échoue, stocker quand même le message brut
    const pocsagMessage = {
      id: Date.now() + Math.random(),
      timestamp: new Date().toISOString(),
      capcode: 'N/A',
      function: 'N/A',
      message: line,
      raw: line
    };

    messages.unshift(pocsagMessage);
    if (messages.length > MAX_MESSAGES) {
      messages.pop();
    }
  }
}

export async function stopPocsagDecoding() {
  if (!multimonProcess) {
    throw new Error('Aucun décodage POCSAG actif');
  }

  setPocsagStreamCallback(null);
  audioDataHandler = null;

  if (multimonProcess.stdin && !multimonProcess.stdin.destroyed) {
    multimonProcess.stdin.end();
  }
  multimonProcess.kill();
  multimonProcess = null;
  isDecoding = false;
}

export function getPocsagMessages(limit = 100, offset = 0) {
  return messages.slice(offset, offset + limit);
}

export function getPocsagStatus() {
  return {
    isDecoding,
    messageCount: messages.length
  };
}


