/**
 * BordelBoxEasy - Client Overlay
 * Écoute les événements WebSocket et pilote l'affichage des médias, du texte et de l'indicateur d'état
 */

// Détection de l'adresse du serveur BordelBox
// 1. Si ouvert dans un navigateur classique (http://IP_SERVEUR:PORT/overlay), on utilise cette même origine
// 2. Si ouvert dans l'application de bureau Tauri (tauri:// ou tauri.localhost), on utilise l'URL configurée ou http://localhost:3000 par défaut
const isWebPage = window.location.protocol.startsWith('http') && !window.location.hostname.includes('tauri');
const defaultDesktopServer = localStorage.getItem('bordelbox_server_url') || 'http://localhost:3000';
const SERVER_URL = isWebPage ? window.location.origin : defaultDesktopServer;

console.log('[Overlay] Connexion WebSocket vers :', SERVER_URL);

const socket = io(SERVER_URL, {
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: Infinity,
});

socket.on('connect', () => {
  console.log('✅ [Overlay] Connecté au serveur BordelBox avec succès ! (Socket ID:', socket.id, ')');
});

socket.on('connect_error', (err) => {
  console.warn(`⚠️ [Overlay] En attente de connexion au serveur (${SERVER_URL}) :`, err.message);
});

socket.on('disconnect', (reason) => {
  console.log('ℹ️ [Overlay] Déconnecté du serveur :', reason);
});

// Éléments du DOM
const mediaCard = document.getElementById('media-card');
const authorAvatar = document.getElementById('author-avatar');
const authorName = document.getElementById('author-name');
const mediaBadge = document.getElementById('media-badge');

const playerVideo = document.getElementById('player-video');
const playerImage = document.getElementById('player-image');
const playerAudioBox = document.getElementById('player-audio-box');
const playerAudio = document.getElementById('player-audio');
const textBox = document.getElementById('text-box');
const textContent = document.getElementById('text-content');

const captionBox = document.getElementById('caption-box');
const captionText = document.getElementById('caption-text');
const progressBar = document.getElementById('progress-bar');

// Indicateur discret de statut en haut à droite
const statusIndicator = document.getElementById('overlay-status-indicator');
const statusLabel = document.getElementById('status-label');

let currentItemId = null;
let itemTimer = null;
let currentVolume = parseFloat(localStorage.getItem('bordelbox_volume') || '0.8');

// État d'activation de l'overlay (sauvegardé dans localStorage)
let isOverlayEnabled = localStorage.getItem('bordelbox_enabled') !== 'false';
let statusHideTimeout = null;

// Applique le volume initial
playerVideo.volume = currentVolume;
playerAudio.volume = currentVolume;

/**
 * Met à jour l'indicateur discret de statut en haut à droite
 */
function updateStatusIndicator() {
  if (!statusIndicator || !statusLabel) return;

  if (statusHideTimeout) {
    clearTimeout(statusHideTimeout);
    statusHideTimeout = null;
  }

  if (isOverlayEnabled) {
    statusIndicator.classList.remove('disabled');
    statusIndicator.classList.add('active');
    statusLabel.textContent = 'BORDELBOX';
  } else {
    statusIndicator.classList.remove('active');
    statusIndicator.classList.add('disabled');
    statusLabel.textContent = 'DÉSACTIVÉ';

    // Après 3 secondes d'affichage de "DÉSACTIVÉ", on masque l'indicateur pour ne pas gêner l'écran
    statusHideTimeout = setTimeout(() => {
      statusIndicator.classList.remove('disabled');
    }, 3000);
  }
}

/**
 * Active ou désactive l'overlay (raccourci F9 ou menu tray)
 * @param {boolean|null} forceState
 */
function toggleOverlay(forceState = null) {
  if (forceState !== null) {
    isOverlayEnabled = Boolean(forceState);
  } else {
    isOverlayEnabled = !isOverlayEnabled;
  }

  localStorage.setItem('bordelbox_enabled', isOverlayEnabled.toString());
  console.log(`[Overlay] Statut overlay basculé : ${isOverlayEnabled ? 'ACTIVÉ 🟢' : 'DÉSACTIVÉ 🔴'}`);

  updateStatusIndicator();

  if (!isOverlayEnabled) {
    // Si désactivé, on stoppe et masque immédiatement tout média en cours
    finishCurrentMedia();
  }
}

// Initialisation de l'indicateur au chargement
updateStatusIndicator();

/**
 * Démarre l'animation de la barre de progression
 * @param {number} durationSeconds
 */
function startProgressBar(durationSeconds) {
  if (!progressBar) return;
  const sec = Math.max(0.5, parseFloat(durationSeconds) || 5);
  // Réinitialisation avec forçage de reflow pour redémarrer l'animation de façon fluide
  progressBar.style.animation = 'none';
  void progressBar.offsetWidth;
  progressBar.style.animation = `countdownAnim ${sec}s linear forwards`;
}

/**
 * Arrête et réinitialise la barre de progression
 */
function stopProgressBar() {
  if (!progressBar) return;
  progressBar.style.animation = 'none';
  progressBar.style.width = '0%';
}

/**
 * Cache tous les éléments multimédias
 */
function hideAllMediaElements() {
  stopProgressBar();

  playerVideo.classList.add('hidden');
  playerVideo.pause();
  playerVideo.src = '';
  playerVideo.onloadedmetadata = null;

  playerImage.classList.add('hidden');
  playerImage.src = '';

  playerAudioBox.classList.add('hidden');
  playerAudio.pause();
  playerAudio.src = '';
  playerAudio.onloadedmetadata = null;

  textBox.classList.add('hidden');
  textContent.textContent = '';

  captionBox.classList.add('hidden');
  captionText.textContent = '';

  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }

  if (itemTimer) {
    clearTimeout(itemTimer);
    itemTimer = null;
  }
}

/**
 * Signale la fin du média au serveur pour passer au suivant
 */
function finishCurrentMedia() {
  if (!currentItemId) return;

  const id = currentItemId;
  currentItemId = null;

  if (itemTimer) {
    clearTimeout(itemTimer);
    itemTimer = null;
  }

  stopProgressBar();

  // Animation de sortie
  mediaCard.classList.add('hiding');

  setTimeout(() => {
    mediaCard.classList.add('hidden');
    mediaCard.classList.remove('hiding');
    hideAllMediaElements();
    if (socket && socket.connected) {
      socket.emit('media_ended', { id });
    }
  }, 350);
}

/**
 * Lit un texte avec la synthèse vocale Web Speech API
 * @param {string} text
 * @param {Function} onEnded
 */
function speakText(text, onEnded) {
  if (!('speechSynthesis' in window)) {
    console.warn('Synthèse vocale Web Speech non supportée dans ce navigateur.');
    if (onEnded) setTimeout(onEnded, 3000);
    return;
  }

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.05;
  utterance.pitch = 1.0;

  // Sélectionne une voix française si disponible
  const voices = window.speechSynthesis.getVoices();
  const frVoice = voices.find((v) => v.lang.startsWith('fr'));
  if (frVoice) {
    utterance.voice = frVoice;
  }

  utterance.onend = () => {
    if (onEnded) onEnded();
  };

  utterance.onerror = (e) => {
    console.error('Erreur TTS :', e);
    if (onEnded) onEnded();
  };

  window.speechSynthesis.speak(utterance);
}

/**
 * Affiche un élément multimédia ou texte sur l'overlay
 * @param {Object} item
 */
function displayMediaItem(item) {
  if (!item) return;

  // Si l'overlay est désactivé par le joueur (raccourci F9), on ignore le média et on prévient le serveur
  if (!isOverlayEnabled) {
    console.log('[Overlay] Média ignoré car l\'overlay est actuellement DÉSACTIVÉ (F9) :', item.id);
    if (socket && socket.connected) {
      socket.emit('media_ended', { id: item.id });
    }
    return;
  }

  console.log('[Overlay] Affichage média :', item);
  hideAllMediaElements();

  currentItemId = item.id;
  const maxDuration = item.maxDuration || 20;

  // Auteur
  authorName.textContent = item.author?.name || 'Pote anonyme';
  authorAvatar.src = item.author?.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png';
  mediaBadge.textContent = (item.type || 'MÉDIA').toUpperCase();

  // Légende supplémentaire sous le média (si renseignée dans /media)
  if (item.text && item.text.trim()) {
    captionText.textContent = item.text.trim();
    captionBox.classList.remove('hidden');
  }

  mediaCard.classList.remove('hidden');
  mediaCard.classList.remove('hiding');

  // Lance la barre de progression par défaut sur maxDuration
  startProgressBar(maxDuration);

  // Sécurité générale de durée maximale
  if (itemTimer) clearTimeout(itemTimer);
  itemTimer = setTimeout(() => {
    console.log('[Overlay] Durée maximale atteinte');
    finishCurrentMedia();
  }, maxDuration * 1000);

  // Rendu selon le type
  switch (item.type) {
    case 'video':
      playerVideo.classList.remove('hidden');
      playerVideo.src = item.url;
      playerVideo.volume = currentVolume;
      playerVideo.onloadedmetadata = () => {
        if (playerVideo.duration && isFinite(playerVideo.duration)) {
          const actualDuration = Math.min(playerVideo.duration, maxDuration);
          startProgressBar(actualDuration);
        }
      };
      playerVideo.play().catch((err) => {
        console.warn('[Overlay] Autoplay bloqué ou erreur vidéo :', err);
      });
      playerVideo.onended = () => finishCurrentMedia();
      break;

    case 'audio':
      playerAudioBox.classList.remove('hidden');
      playerAudio.src = item.url;
      playerAudio.volume = currentVolume;
      playerAudio.onloadedmetadata = () => {
        if (playerAudio.duration && isFinite(playerAudio.duration)) {
          const actualDuration = Math.min(playerAudio.duration, maxDuration);
          startProgressBar(actualDuration);
        }
      };
      playerAudio.play().catch((err) => {
        console.warn('[Overlay] Autoplay bloqué ou erreur audio :', err);
      });
      playerAudio.onended = () => finishCurrentMedia();
      break;

    case 'image':
      playerImage.classList.remove('hidden');
      playerImage.src = item.url;
      // Pour une image, durée par défaut de 8 secondes ou maxDuration
      const imageDisplayDuration = Math.min(8, maxDuration);
      if (itemTimer) clearTimeout(itemTimer);
      startProgressBar(imageDisplayDuration);
      itemTimer = setTimeout(() => finishCurrentMedia(), imageDisplayDuration * 1000);
      break;

    case 'text':
      textBox.classList.remove('hidden');
      textContent.textContent = item.message || '';
      mediaBadge.textContent = item.tts ? 'TEXTE + VOCAL' : 'TEXTE';

      if (item.tts) {
        speakText(item.message, () => {
          setTimeout(() => finishCurrentMedia(), 1500);
        });
      } else {
        const textDuration = Math.min(Math.max(5, Math.ceil((item.message || '').length / 10) + 2), maxDuration);
        if (itemTimer) clearTimeout(itemTimer);
        startProgressBar(textDuration);
        itemTimer = setTimeout(() => finishCurrentMedia(), textDuration * 1000);
      }
      break;

    default:
      console.warn('[Overlay] Type non géré :', item.type);
      setTimeout(() => finishCurrentMedia(), 4000);
      break;
  }
}

// Réception d'un nouveau média à jouer depuis le serveur
socket.on('media_play', (item) => {
  displayMediaItem(item);
});

// Arrêt d'urgence ou skip
socket.on('media_stopped', () => {
  console.log('[Overlay] Arrêt du média reçu.');
  finishCurrentMedia();
});

// Mise à jour du volume
socket.on('volume_updated', (newVol) => {
  currentVolume = Math.max(0, Math.min(1, parseFloat(newVol)));
  localStorage.setItem('bordelbox_volume', currentVolume.toString());
  playerVideo.volume = currentVolume;
  playerAudio.volume = currentVolume;
  console.log('[Overlay] Volume ajusté à :', Math.round(currentVolume * 100) + '%');
});

// Gestion de la taille / échelle de l'overlay (LiveChat)
function setOverlayScale(scale) {
  const s = parseFloat(scale) || 1.0;
  document.documentElement.style.setProperty('--overlay-scale', s.toString());
  localStorage.setItem('bordelbox_scale', s.toString());
  console.log('[Overlay] Taille ajustée à :', Math.round(s * 100) + '%');
}

// Appliquer la taille sauvegardée au démarrage
const savedScale = localStorage.getItem('bordelbox_scale') || '1.0';
setOverlayScale(savedScale);

// Synchronisation de la taille via Socket.io
socket.on('scale_updated', (scale) => {
  setOverlayScale(scale);
});

/**
 * Fonction de déclenchement de test accessible depuis Tauri tray et le panneau
 */
function triggerTestCard() {
  console.log('[Overlay] Déclenchement de la carte de test');
  if (socket && socket.connected) {
    socket.emit('trigger_test', {
      type: 'text',
      message: 'Test depuis le menu Tray (clic droit) réussi ! 🎯',
      tts: true,
      author: { name: 'BordelBox Tray', avatar: 'https://cdn.discordapp.com/embed/avatars/0.png' }
    });
  } else {
    // Si le serveur Socket.io n'est pas encore prêt, on affiche directement en local
    displayMediaItem({
      id: 'local_test_' + Date.now(),
      type: 'text',
      message: 'Test local direct réussi ! 🎯 (Serveur en cours de connexion)',
      tts: false,
      maxDuration: 6,
      author: { name: 'BordelBox App', avatar: 'https://cdn.discordapp.com/embed/avatars/0.png' }
    });
  }
}

/**
 * Configuration interactive de l'adresse du serveur BordelBox
 */
function configureServerUrl() {
  const current = localStorage.getItem('bordelbox_server_url') || 'http://localhost:3000';
  const newUrl = prompt('Entrez l\'adresse IP ou le domaine de votre serveur Ubuntu\nExemple : http://192.168.1.50:3000 ou http://mon-vps.com:3000\n\nAdresse actuelle :', current);
  if (newUrl && newUrl.trim() !== '') {
    let formatted = newUrl.trim();
    if (!formatted.startsWith('http://') && !formatted.startsWith('https://')) {
      formatted = 'http://' + formatted;
    }
    formatted = formatted.replace(/\/+$/, '');
    localStorage.setItem('bordelbox_server_url', formatted);
    alert(`✅ Serveur configuré sur : ${formatted}\nL'overlay va maintenant redémarrer.`);
    window.location.reload();
  }
}

// Exposition sur l'objet window pour invocation directe depuis Tauri (eval) ou la console
window.displayMediaItem = displayMediaItem;
window.setOverlayScale = setOverlayScale;
window.triggerTestCard = triggerTestCard;
window.configureServerUrl = configureServerUrl;
window.toggleOverlay = toggleOverlay;

// Raccourci clavier local (au cas où la fenêtre est ciblée ou dans le navigateur)
window.addEventListener('keydown', (e) => {
  if (e.key === 'F9' || (e.ctrlKey && e.shiftKey && (e.key === 'O' || e.key === 'o'))) {
    e.preventDefault();
    toggleOverlay();
  }
});

// Écoute des événements émis par le menu System Tray de Tauri (clic droit)
function initTauriTrayListeners() {
  if (window.__TAURI__ && window.__TAURI__.event) {
    window.__TAURI__.event.listen('set_overlay_scale', (event) => {
      console.log('[Tauri Tray] Changement de taille demandé :', event.payload);
      setOverlayScale(event.payload);
      if (socket && socket.connected) {
        socket.emit('change_scale', event.payload);
      }
    });

    window.__TAURI__.event.listen('trigger_test_overlay', () => {
      triggerTestCard();
    });

    window.__TAURI__.event.listen('toggle_overlay', () => {
      toggleOverlay();
    });
  } else {
    // Si l'objet Tauri n'est pas encore injecté, on réessaie après un court délai
    setTimeout(initTauriTrayListeners, 500);
  }
}

initTauriTrayListeners();

// Charger les voix Web Speech dès que le navigateur est prêt
if ('speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    window.speechSynthesis.getVoices();
  };
}
