import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import sdrRoutes from './routes/sdr.js';
import pocsagRoutes from './routes/pocsag.js';
import { setupWebSocket } from './websocket/streamHandler.js';
import { setSocketIO } from './services/sdrService.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use('/api/sdr', sdrRoutes);
app.use('/api/pocsag', pocsagRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

setSocketIO(io);
setupWebSocket(io);

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
  console.log(`Accessible sur http://localhost:${PORT} et http://<IP_RASPBERRY>:${PORT}`);
});

