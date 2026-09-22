/**
 * BordelBoxEasy - Client Overlay
 * Écoute les événements WebSocket et pilote l'affichage des médias et du texte
 */

const socket = io();

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

let currentItemId = null;
let itemTimer = null;
let currentVolume = parseFloat(localStorage.getItem('bordelbox_volume') || '0.8');

// Applique le volume initial
playerVideo.volume = currentVolume;
playerAudio.volume = currentVolume;

/**
 * Cache tous les éléments multimédias
 */
function hideAllMediaElements() {
  playerVideo.classList.add('hidden');
  playerVideo.pause();
  playerVideo.src = '';

  playerImage.classList.add('hidden');
  playerImage.src = '';

  playerAudioBox.classList.add('hidden');
  playerAudio.pause();
  playerAudio.src = '';

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

  // Animation de sortie
  mediaCard.classList.add('hiding');

  setTimeout(() => {
    mediaCard.classList.add('hidden');
    mediaCard.classList.remove('hiding');
    hideAllMediaElements();
    socket.emit('media_ended', { id });
  }, 350);
}

/**
 * Démarre l'animation de la barre de progression
 * @param {number} durationSeconds
 */
function startProgressBar(durationSeconds) {
  progressBar.style.transition = 'none';
  progressBar.style.width = '100%';

  requestAnimationFrame(() => {
    progressBar.style.transition = `width ${durationSeconds}s linear`;
    progressBar.style.width = '0%';
  });
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

// Réception d'un nouveau média à jouer
socket.on('media_play', (item) => {
  console.log('[Overlay] Nouveau média reçu :', item);
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
  startProgressBar(maxDuration);

  // Sécurité générale de durée maximale
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
      playerVideo.play().catch((err) => {
        console.warn('[Overlay] Autoplay bloqué ou erreur vidéo :', err);
      });
      playerVideo.onended = () => finishCurrentMedia();
      break;

    case 'audio':
      playerAudioBox.classList.remove('hidden');
      playerAudio.src = item.url;
      playerAudio.volume = currentVolume;
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

// Écoute des événements émis par le menu System Tray de Tauri (clic droit)
function initTauriTrayListeners() {
  if (window.__TAURI__ && window.__TAURI__.event) {
    window.__TAURI__.event.listen('set_overlay_scale', (event) => {
      console.log('[Tauri Tray] Changement de taille demandé :', event.payload);
      setOverlayScale(event.payload);
      socket.emit('change_scale', event.payload);
    });

    window.__TAURI__.event.listen('trigger_test_overlay', () => {
      socket.emit('trigger_test', {
        type: 'text',
        message: 'Test depuis le menu Tray (clic droit) réussi ! 🎯',
        tts: true,
        author: { name: 'BordelBox Tray', avatar: 'https://cdn.discordapp.com/embed/avatars/0.png' }
      });
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
