/**
 * BordelBoxEasy - Client Overlay
 * Écoute les événements WebSocket et pilote l'affichage des médias, du texte,
 * du filtre Chroma Key (fond vert supprimé) et de l'indicateur d'état.
 */

// Détection de l'adresse du serveur BordelBox
// 1. Si ouvert dans un navigateur classique (http://IP_SERVEUR:PORT/overlay), on utilise cette même origine
// 2. Si ouvert dans l'application de bureau Tauri (tauri:// ou tauri.localhost), on utilise l'URL configurée ou http://localhost:3000 par défaut
const isWebPage = window.location.protocol.startsWith('http') && !window.location.hostname.includes('tauri');
const defaultDesktopServer = localStorage.getItem('bordelbox_server_url') || 'http://localhost:3000';
const SERVER_URL = isWebPage ? window.location.origin : defaultDesktopServer;

console.log('[Overlay] Connexion WebSocket vers :', SERVER_URL);

let isSocketConnected = false;

const socket = io(SERVER_URL, {
  query: { type: 'overlay' },
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: Infinity,
});

function registerThisOverlay() {
  if (socket && socket.connected) {
    socket.emit('register_overlay', {
      username: getSavedUsername(),
      platform: isWebPage ? 'Web / OBS' : 'App Bureau',
    });
  }
}

socket.on('connect', () => {
  isSocketConnected = true;
  console.log('✅ [Overlay] Connecté au serveur BordelBox avec succès ! (Socket ID:', socket.id, ')');
  registerThisOverlay();
  updateStatusIndicator();
});

socket.io.on('reconnect', () => {
  isSocketConnected = true;
  console.log('🔄 [Overlay] Reconnecté au serveur BordelBox');
  registerThisOverlay();
  updateStatusIndicator();
});

socket.on('connect_error', (err) => {
  isSocketConnected = false;
  console.warn(`⚠️ [Overlay] En attente de connexion au serveur (${SERVER_URL}) :`, err.message);
  updateStatusIndicator();
});

socket.on('disconnect', (reason) => {
  isSocketConnected = false;
  console.log('ℹ️ [Overlay] Déconnecté du serveur :', reason);
  updateStatusIndicator();
});

// Envoi périodique du statut toutes les 25 secondes pour maintenir la présence active
setInterval(registerThisOverlay, 25000);

// Éléments du DOM
const mediaCard = document.getElementById('media-card');
const authorAvatar = document.getElementById('author-avatar');
const authorName = document.getElementById('author-name');
const mediaBadge = document.getElementById('media-badge');

const playerVideo = document.getElementById('player-video');
const playerImage = document.getElementById('player-image');
const chromaCanvas = document.getElementById('chroma-canvas');
const chromaCtx = chromaCanvas ? chromaCanvas.getContext('2d', { willReadFrequently: true }) : null;

// Support CORS pour le traitement Chroma Key sur les URLs externes
playerVideo.crossOrigin = 'anonymous';
playerImage.crossOrigin = 'anonymous';

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

// État du filtre Chroma Key (fond vert)
let chromaActive = false;
let chromaRafId = null;

// État d'activation de l'overlay (sauvegardé dans localStorage)
let isOverlayEnabled = localStorage.getItem('bordelbox_enabled') !== 'false';
let statusHideTimeout = null;

// Applique le volume initial
playerVideo.volume = currentVolume;
playerAudio.volume = currentVolume;

/**
 * Récupère le pseudo choisi pour cet overlay (ou en génère un aléatoire au premier lancement)
 */
function getSavedUsername() {
  let name = localStorage.getItem('bordelbox_username');
  if (!name || !name.trim()) {
    name = 'Pote_' + Math.floor(100 + Math.random() * 900);
    localStorage.setItem('bordelbox_username', name);
  }
  return name.trim();
}

/**
 * Polices d'écriture personnalisables pour les médias et textes
 */
const ALL_FONT_CLASSES = [
  'font-impact',
  'font-comic',
  'font-pixel',
  'font-cyber',
  'font-marker',
  'font-horror',
  'font-cursive',
];

/**
 * Applique une police personnalisée à un élément de texte
 * @param {HTMLElement} element
 * @param {string|null} fontName
 */
function applyCustomFont(element, fontName) {
  if (!element) return;
  element.classList.remove(...ALL_FONT_CLASSES);
  if (fontName && fontName !== 'default' && typeof fontName === 'string') {
    const className = `font-${fontName.trim().toLowerCase()}`;
    if (ALL_FONT_CLASSES.includes(className)) {
      element.classList.add(className);
    }
  }
}

/**
 * Met à jour l'indicateur discret de statut en haut à droite
 */
function updateStatusIndicator() {
  if (!statusIndicator || !statusLabel) return;

  if (statusHideTimeout) {
    clearTimeout(statusHideTimeout);
    statusHideTimeout = null;
  }

  const user = getSavedUsername();

  if (!isSocketConnected) {
    statusIndicator.classList.remove('active', 'disabled');
    statusIndicator.classList.add('offline');
    statusLabel.textContent = 'HORS LIGNE';
    statusIndicator.title = isWebPage
      ? 'Déconnecté du serveur BordelBox'
      : `Déconnecté (${SERVER_URL}) - Cliquez pour configurer l'adresse IP de votre serveur Ubuntu`;
    return;
  }

  statusIndicator.classList.remove('offline');
  statusIndicator.title = `Pseudo : ${user} (Cliquer pour changer • F9 pour masquer/afficher)`;

  if (isOverlayEnabled) {
    statusIndicator.classList.remove('disabled');
    statusIndicator.classList.add('active');
    statusLabel.textContent = user.toUpperCase();
  } else {
    statusIndicator.classList.remove('active');
    statusIndicator.classList.add('disabled');
    statusLabel.textContent = 'DÉSACTIVÉ';

    // Après 1 seconde d'affichage de "DÉSACTIVÉ", on masque l'indicateur pour ne pas gêner l'écran
    statusHideTimeout = setTimeout(() => {
      statusIndicator.classList.remove('disabled');
    }, 1000);
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
 * Algorithme Chroma Key en temps réel : suppression du fond vert avec adoucissement et despill
 * @param {HTMLVideoElement|HTMLImageElement} sourceElement
 */
function renderChromaFrame(sourceElement) {
  if (!chromaActive || !chromaCanvas || !chromaCtx) return;

  const w = sourceElement.videoWidth || sourceElement.naturalWidth || sourceElement.width || 640;
  const h = sourceElement.videoHeight || sourceElement.naturalHeight || sourceElement.height || 360;

  if (w === 0 || h === 0) {
    if (sourceElement.tagName === 'VIDEO' && !sourceElement.paused && !sourceElement.ended) {
      chromaRafId = requestAnimationFrame(() => renderChromaFrame(sourceElement));
    }
    return;
  }

  if (chromaCanvas.width !== w || chromaCanvas.height !== h) {
    chromaCanvas.width = w;
    chromaCanvas.height = h;
  }

  try {
    chromaCtx.drawImage(sourceElement, 0, 0, w, h);
    const frame = chromaCtx.getImageData(0, 0, w, h);
    const data = frame.data;
    const len = data.length;

    for (let i = 0; i < len; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      const maxRB = Math.max(r, b);

      // Critère fond vert : le vert domine nettement le rouge et le bleu
      if (g > 65 && g > r * 1.25 && g > b * 1.25) {
        const diff = g - maxRB;
        if (diff > 35) {
          // Complètement transparent
          data[i + 3] = 0;
        } else {
          // Contour doux (anti-aliasing)
          const factor = diff / 35;
          data[i + 3] = Math.round((1 - factor) * 255);
          // Élimination du reflet vert sur les contours (despill)
          data[i + 1] = maxRB;
        }
      }
    }

    chromaCtx.putImageData(frame, 0, 0);
  } catch (err) {
    // Si la ressource externe bloque le canvas (CORS), on bascule proprement sur l'élément standard
    console.warn('[Chroma Key] CORS externe non autorisé sur ce média, basculement en mode normal :', err.message);
    stopChromaProcessing();
    sourceElement.classList.remove('hidden');
    return;
  }

  if (sourceElement.tagName === 'VIDEO' && !sourceElement.paused && !sourceElement.ended) {
    chromaRafId = requestAnimationFrame(() => renderChromaFrame(sourceElement));
  }
}

/**
 * Lance le traitement Chroma Key sur la source vidéo ou image
 * @param {HTMLVideoElement|HTMLImageElement} sourceElement
 */
function startChromaProcessing(sourceElement) {
  stopChromaProcessing();
  chromaActive = true;
  if (chromaCanvas) chromaCanvas.classList.remove('hidden');

  if (sourceElement.tagName === 'VIDEO') {
    renderChromaFrame(sourceElement);
  } else if (sourceElement.tagName === 'IMG') {
    if (sourceElement.complete && sourceElement.naturalWidth > 0) {
      renderChromaFrame(sourceElement);
    } else {
      sourceElement.onload = () => renderChromaFrame(sourceElement);
    }
  }
}

/**
 * Arrête le traitement Chroma Key et nettoie le canvas
 */
function stopChromaProcessing() {
  chromaActive = false;
  if (chromaRafId) {
    cancelAnimationFrame(chromaRafId);
    chromaRafId = null;
  }
  if (chromaCanvas) {
    chromaCanvas.classList.add('hidden');
    if (chromaCtx && chromaCanvas.width > 0 && chromaCanvas.height > 0) {
      chromaCtx.clearRect(0, 0, chromaCanvas.width, chromaCanvas.height);
    }
  }
}

/**
 * Cache tous les éléments multimédias et réinitialise les styles
 */
function hideAllMediaElements() {
  stopProgressBar();
  stopChromaProcessing();

  mediaCard.classList.remove('chroma-mode');

  playerVideo.classList.add('hidden');
  playerVideo.pause();
  playerVideo.src = '';
  playerVideo.onloadedmetadata = null;
  playerVideo.onplay = null;
  playerVideo.onloadeddata = null;

  playerImage.classList.add('hidden');
  playerImage.src = '';
  playerImage.onload = null;

  playerAudioBox.classList.add('hidden');
  playerAudio.pause();
  playerAudio.src = '';
  playerAudio.onloadedmetadata = null;

  textBox.classList.add('hidden');
  textContent.textContent = '';
  applyCustomFont(textContent, null);

  captionBox.classList.add('hidden');
  captionText.textContent = '';
  applyCustomFont(captionText, null);

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
  stopChromaProcessing();

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
  const isChroma = Boolean(item.chromakey);

  // Auteur
  authorName.textContent = item.author?.name || 'Pote anonyme';
  authorAvatar.src = item.author?.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png';

  // Mode Chroma Key (Fond vert) : affichage transparent sans carte opaque
  if (isChroma) {
    mediaCard.classList.add('chroma-mode');
    mediaBadge.textContent = '🟢 FOND VERT';
  } else {
    mediaCard.classList.remove('chroma-mode');
    mediaBadge.textContent = (item.type || 'MÉDIA').toUpperCase();
  }

  // Légende supplémentaire sous le média (si renseignée dans /media)
  if (item.text && item.text.trim()) {
    captionText.textContent = item.text.trim();
    applyCustomFont(captionText, item.font);
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
      playerVideo.src = item.url;
      playerVideo.volume = currentVolume;

      if (isChroma) {
        playerVideo.classList.add('hidden'); // Le canvas affiche le flux sans fond vert
        playerVideo.onplay = () => startChromaProcessing(playerVideo);
        playerVideo.onloadeddata = () => startChromaProcessing(playerVideo);
      } else {
        playerVideo.classList.remove('hidden');
      }

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
      playerImage.src = item.url;

      if (isChroma) {
        playerImage.classList.add('hidden');
        startChromaProcessing(playerImage);
      } else {
        playerImage.classList.remove('hidden');
      }

      // Pour une image, durée par défaut de 8 secondes ou maxDuration
      const imageDisplayDuration = Math.min(8, maxDuration);
      if (itemTimer) clearTimeout(itemTimer);
      startProgressBar(imageDisplayDuration);
      itemTimer = setTimeout(() => finishCurrentMedia(), imageDisplayDuration * 1000);
      break;

    case 'text':
      textBox.classList.remove('hidden');
      textContent.textContent = item.message || '';
      applyCustomFont(textContent, item.font);
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
  if (window.__TAURI__ && window.__TAURI__.event) {
    window.__TAURI__.event.emit('disable_clickthrough', {});
  }
  try {
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
  } finally {
    if (window.__TAURI__ && window.__TAURI__.event) {
      window.__TAURI__.event.emit('restore_clickthrough', {});
    }
  }
}

/**
 * Permet au joueur de choisir son pseudo d'overlay
 */
function promptUsername() {
  if (window.__TAURI__ && window.__TAURI__.event) {
    window.__TAURI__.event.emit('disable_clickthrough', {});
  }
  try {
    const current = getSavedUsername();
    const newName = prompt('Entrez votre pseudo pour l\'overlay :\n(Ce pseudo s\'affichera sur votre écran et sera visible par vos potes avec la commande Discord /online)\n\nPseudo actuel :', current);
    if (newName && newName.trim() !== '') {
      const cleanName = newName.trim().substring(0, 24);
      localStorage.setItem('bordelbox_username', cleanName);
      updateStatusIndicator();
      if (socket && socket.connected) {
        socket.emit('update_username', { username: cleanName });
      }
      alert(`✅ Votre pseudo pour l'overlay est désormais : ${cleanName}`);
    }
  } finally {
    if (window.__TAURI__ && window.__TAURI__.event) {
      window.__TAURI__.event.emit('restore_clickthrough', {});
    }
  }
}

// Rendre l'indicateur cliquable : si hors ligne configure l'IP du serveur, sinon change le pseudo
if (statusIndicator) {
  statusIndicator.addEventListener('click', () => {
    if (!isSocketConnected && !isWebPage) {
      configureServerUrl();
    } else {
      promptUsername();
    }
  });
}

// Exposition sur l'objet window pour invocation directe depuis Tauri (eval) ou la console
window.displayMediaItem = displayMediaItem;
window.setOverlayScale = setOverlayScale;
window.triggerTestCard = triggerTestCard;
window.configureServerUrl = configureServerUrl;
window.toggleOverlay = toggleOverlay;
window.promptUsername = promptUsername;

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

    window.__TAURI__.event.listen('change_username', () => {
      promptUsername();
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

// ========================================================
// Système de détection de mise à jour de l'overlay
// ========================================================
// Ce tag est automatiquement remplacé par le numéro de build lors de la compilation GitHub Actions
const CURRENT_OVERLAY_BUILD = '__OVERLAY_BUILD_TAG__';

/**
 * Compare une version distante avec la version courante de l'overlay
 */
function isNewerRelease(latestTag, currentTag) {
  if (!latestTag || !currentTag) return false;
  // En mode développement ou overlay web direct (non packagé dans un .exe), pas de notification
  if (currentTag === '__OVERLAY_BUILD_TAG__') return false;
  if (latestTag.toLowerCase() === currentTag.toLowerCase()) return false;

  const buildRegex = /b(\d+)/i;
  const lBuild = latestTag.match(buildRegex);
  const cBuild = currentTag.match(buildRegex);

  // Si les deux versions ont un numéro de build (ex: b12 vs b11)
  if (lBuild && cBuild) {
    const lNum = parseInt(lBuild[1], 10);
    const cNum = parseInt(cBuild[1], 10);
    return lNum > cNum;
  }

  const clean = (str) => str.replace(/^overlay-v?|^v?/, '').trim();
  const lParts = clean(latestTag).split('-')[0].split('.').map((n) => parseInt(n, 10) || 0);
  const cParts = clean(currentTag).split('-')[0].split('.').map((n) => parseInt(n, 10) || 0);

  for (let i = 0; i < Math.max(lParts.length, cParts.length); i++) {
    const l = lParts[i] || 0;
    const c = cParts[i] || 0;
    if (l > c) return true;
    if (l < c) return false;
  }

  return false;
}

/**
 * Affiche la notification discrète de mise à jour sur l'overlay
 */
function showUpdateNotification(releaseInfo) {
  const notif = document.getElementById('update-notification');
  const label = document.getElementById('update-version-label');
  const dlBtn = document.getElementById('update-download-btn');
  const closeBtn = document.getElementById('update-dismiss-btn');
  if (!notif) return;

  const latestTag = releaseInfo.tagName || 'nouvelle version';
  if (sessionStorage.getItem('dismissed_update_' + latestTag) === 'true') {
    return;
  }

  if (label) {
    const currentName = CURRENT_OVERLAY_BUILD === '__OVERLAY_BUILD_TAG__'
      ? 'Locale'
      : CURRENT_OVERLAY_BUILD.replace('overlay-', '');
    label.textContent = `Version ${latestTag} disponible (actuelle : ${currentName})`;
  }

  const downloadUrl = releaseInfo.downloadUrl || releaseInfo.htmlUrl || 'https://github.com/The-RedDice/BordelBoxEasy/releases/latest';

  if (dlBtn) {
    dlBtn.href = downloadUrl;
    dlBtn.onclick = () => {
      if (window.__TAURI__ && window.__TAURI__.event) {
        window.__TAURI__.event.emit('disable_clickthrough', {});
        setTimeout(() => {
          window.__TAURI__.event.emit('restore_clickthrough', {});
        }, 1500);
      }
    };
  }

  notif.classList.remove('hidden');
  notif.classList.remove('dismissed');

  if (closeBtn) {
    closeBtn.onclick = () => {
      sessionStorage.setItem('dismissed_update_' + latestTag, 'true');
      notif.classList.add('dismissed');
      setTimeout(() => notif.classList.add('hidden'), 400);
    };
  }

  // Masquage automatique après 25 secondes pour ne pas gêner en jeu
  setTimeout(() => {
    if (notif && !notif.classList.contains('dismissed')) {
      notif.classList.add('dismissed');
      setTimeout(() => notif.classList.add('hidden'), 400);
    }
  }, 25000);
}

// Écoute de l'événement version_info envoyé par le serveur
socket.on('version_info', (releaseInfo) => {
  // L'overlay ouvert dans un navigateur / OBS a toujours le code à jour du serveur
  if (isWebPage) return;

  if (releaseInfo && isNewerRelease(releaseInfo.tagName, CURRENT_OVERLAY_BUILD)) {
    console.log(`[Overlay] 🚀 Mise à jour détectée : ${CURRENT_OVERLAY_BUILD} -> ${releaseInfo.tagName}`);
    showUpdateNotification(releaseInfo);
  }
});

