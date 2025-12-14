import express from 'express';
import { listDevices, startListening, stopListening, getListeningStatus } from '../services/sdrService.js';

const router = express.Router();

router.get('/devices', async (req, res) => {
  try {
    const devices = await listDevices();
    res.json({ devices });
  } catch (error) {
    console.error('Erreur lors de la liste des devices:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/start', async (req, res) => {
  try {
    const { deviceIndex, frequency, gain, sampleRate, mode, filterWidth } = req.body;

    if (!frequency || !deviceIndex) {
      return res.status(400).json({ error: 'frequency et deviceIndex sont requis' });
    }

    await startListening({
      deviceIndex: parseInt(deviceIndex),
      frequency: parseFloat(frequency),
      gain: gain !== undefined ? parseFloat(gain) : undefined,
      sampleRate: sampleRate ? parseInt(sampleRate) : 240000,
      mode: mode || 'fm',
      filterWidth: filterWidth ? parseFloat(filterWidth) : undefined
    });

    res.json({ success: true, message: 'Écoute démarrée' });
  } catch (error) {
    console.error('Erreur lors du démarrage:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/stop', async (req, res) => {
  try {
    await stopListening();
    res.json({ success: true, message: 'Écoute arrêtée' });
  } catch (error) {
    console.error('Erreur lors de l\'arrêt:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/status', (req, res) => {
  try {
    const status = getListeningStatus();
    res.json(status);
  } catch (error) {
    console.error('Erreur lors du statut:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

