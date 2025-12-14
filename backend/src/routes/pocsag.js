import express from 'express';
import { startPocsagDecoding, stopPocsagDecoding, getPocsagMessages, getPocsagStatus } from '../services/pocsagService.js';

const router = express.Router();

router.post('/start', async (req, res) => {
  try {
    await startPocsagDecoding();
    res.json({ success: true, message: 'Décodage POCSAG démarré' });
  } catch (error) {
    console.error('Erreur lors du démarrage POCSAG:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/stop', async (req, res) => {
  try {
    await stopPocsagDecoding();
    res.json({ success: true, message: 'Décodage POCSAG arrêté' });
  } catch (error) {
    console.error('Erreur lors de l\'arrêt POCSAG:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/messages', (req, res) => {
  try {
    const { limit = 100, offset = 0 } = req.query;
    const messages = getPocsagMessages(parseInt(limit), parseInt(offset));
    res.json({ messages, total: messages.length });
  } catch (error) {
    console.error('Erreur lors de la récupération des messages:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/status', (req, res) => {
  try {
    const status = getPocsagStatus();
    res.json(status);
  } catch (error) {
    console.error('Erreur lors du statut POCSAG:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

