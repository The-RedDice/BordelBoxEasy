require('dotenv').config();
const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const MediaQueue = require('./queue');
const { initBot } = require('./bot');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const PORT = process.env.PORT || 3000;
const MAX_MEDIA_DURATION = parseInt(process.env.MAX_MEDIA_DURATION, 10) || 20;

// Dossier public pour l'overlay et le panneau de contrôle
const overlayDir = path.join(__dirname, '..', 'overlay');

// Routes principales
app.get('/', (req, res) => {
  res.sendFile(path.join(overlayDir, 'test-panel.html'));
});

app.get('/overlay', (req, res) => {
  res.sendFile(path.join(overlayDir, 'index.html'));
});

app.use(express.static(overlayDir, { index: false }));
app.use(express.json());

// API HTTP pour récupérer le statut ou envoyer des événements
app.get('/api/status', (req, res) => {
  res.json(queue.getStatus());
});

app.post('/api/skip', (req, res) => {
  queue.skip();
  res.json({ success: true, message: 'Passé au média suivant' });
});

app.post('/api/clear', (req, res) => {
  queue.clear();
  res.json({ success: true, message: 'File d\'attente vidée' });
});

app.post('/api/test', (req, res) => {
  const item = queue.enqueue({
    duration: MAX_MEDIA_DURATION,
    ...req.body,
  });
  res.json({ success: true, item });
});

// Suivi des clients connectés à l'overlay
const connectedOverlays = new Map(); // socket.id -> { username, platform, connectedAt }

function getConnectedOverlays() {
  return Array.from(connectedOverlays.values());
}

let bot = null;

function broadcastOverlayStatus() {
  const count = connectedOverlays.size;
  const users = getConnectedOverlays();
  io.emit('online_count_updated', { count, users });
  if (bot && typeof bot.updatePresence === 'function') {
    bot.updatePresence(count);
  }
}

// Initialisation de la file d'attente
const queue = new MediaQueue(io, MAX_MEDIA_DURATION);

// Gestion des connexions Socket.io
io.on('connection', (socket) => {
  console.log(`[Socket] Nouveau client connecté (${socket.id})`);

  // Envoi de l'état actuel au nouveau client
  socket.emit('queue_updated', {
    queueLength: queue.queue.length,
    current: queue.currentItem,
  });

  socket.emit('online_count_updated', {
    count: connectedOverlays.size,
    users: getConnectedOverlays(),
  });

  // Enregistrement d'un client overlay avec son pseudo choisi
  socket.on('register_overlay', (data) => {
    const username = (data?.username || '').trim() || `Pote_${socket.id.substring(0, 4)}`;
    const platform = (data?.platform || 'Overlay').trim();
    connectedOverlays.set(socket.id, {
      username,
      platform,
      connectedAt: Date.now(),
    });
    console.log(`[Overlay Online] +1 Connecté : ${username} [${platform}] (Total en direct: ${connectedOverlays.size})`);
    broadcastOverlayStatus();
  });

  // Mise à jour dynamique du pseudo
  socket.on('update_username', (data) => {
    if (connectedOverlays.has(socket.id)) {
      const user = connectedOverlays.get(socket.id);
      const oldName = user.username;
      const newName = (data?.username || '').trim();
      if (newName) {
        user.username = newName;
        console.log(`[Overlay Online] Pseudo changé : ${oldName} -> ${newName}`);
        broadcastOverlayStatus();
      }
    }
  });

  // Événement quand l'overlay a fini de jouer un média
  socket.on('media_ended', (data) => {
    const itemId = typeof data === 'object' ? data.id : data;
    queue.onItemEnded(itemId);
  });

  // Passer manuellement (depuis le panneau de contrôle)
  socket.on('skip', () => {
    queue.skip();
  });

  // Vider la file
  socket.on('clear', () => {
    queue.clear();
  });

  // Contrôle du volume global
  socket.on('change_volume', (vol) => {
    io.emit('volume_updated', vol);
  });

  // Contrôle de la taille de l'overlay (LiveChat)
  socket.on('change_scale', (scale) => {
    io.emit('scale_updated', scale);
  });

  // Déclencher un média de test depuis le panel
  socket.on('trigger_test', (payload) => {
    console.log('[Test Panel] Événement de test déclenché :', payload.type);
    queue.enqueue({
      duration: MAX_MEDIA_DURATION,
      ...payload,
    });
  });

  socket.on('disconnect', () => {
    if (connectedOverlays.has(socket.id)) {
      const user = connectedOverlays.get(socket.id);
      connectedOverlays.delete(socket.id);
      console.log(`[Overlay Online] -1 Déconnecté : ${user.username} (Total restant: ${connectedOverlays.size})`);
      broadcastOverlayStatus();
    } else {
      console.log(`[Socket] Client déconnecté (${socket.id})`);
    }
  });
});

// Initialisation du bot Discord avec suivi des overlays en ligne
bot = initBot(
  queue,
  {
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.DISCORD_CLIENT_ID,
    guildId: process.env.DISCORD_GUILD_ID,
  },
  getConnectedOverlays
);

const HOST = process.env.HOST || '0.0.0.0';

// Démarrage du serveur
server.listen(PORT, HOST, () => {
  console.log('====================================================');
  console.log('🎉 BORDELBOX EASY EST PRÊT !');
  console.log(`📺 Overlay (Navigateur / OBS) : http://localhost:${PORT}/overlay`);
  console.log(`🎛️ Panneau de contrôle        : http://localhost:${PORT}/`);
  console.log(`🌐 Écoute sur                 : ${HOST}:${PORT}`);
  console.log('====================================================\n');
});
