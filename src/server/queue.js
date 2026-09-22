/**
 * Gestionnaire de file d'attente multimédia pour BordelBoxEasy
 */
class MediaQueue {
  constructor(io, maxDuration = 20) {
    this.io = io;
    this.maxDuration = maxDuration;
    this.queue = [];
    this.currentItem = null;
    this.timer = null;
  }

  /**
   * Ajoute un élément à la file d'attente
   * @param {Object} item
   */
  enqueue(item) {
    const mediaItem = {
      id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      timestamp: Date.now(),
      maxDuration: item.duration || this.maxDuration,
      ...item,
    };

    this.queue.push(mediaItem);
    console.log(`[Queue] Nouvel élément ajouté par ${item.author?.name || 'Inconnu'} (Total en attente: ${this.queue.length})`);

    this.io.emit('queue_updated', {
      queueLength: this.queue.length,
      current: this.currentItem,
    });

    // Si rien ne joue actuellement, on lance la lecture immédiatement
    if (!this.currentItem) {
      this.playNext();
    }

    return mediaItem;
  }

  /**
   * Joue le prochain élément de la file
   */
  playNext() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.queue.length === 0) {
      this.currentItem = null;
      console.log('[Queue] File vide, en attente de nouveaux médias.');
      this.io.emit('media_stopped');
      this.io.emit('queue_updated', { queueLength: 0, current: null });
      return;
    }

    this.currentItem = this.queue.shift();
    console.log(`[Queue] Diffusion de : [${this.currentItem.type}] de ${this.currentItem.author?.name}`);

    // Diffuse à tous les clients connectés (Overlay, Tauri, Panels)
    this.io.emit('media_play', this.currentItem);
    this.io.emit('queue_updated', {
      queueLength: this.queue.length,
      current: this.currentItem,
    });

    // Sécurité : timer de secours au cas où l'overlay ne renvoie pas l'événement "media_ended"
    const safetyDelay = (this.currentItem.maxDuration + 3) * 1000;
    this.timer = setTimeout(() => {
      console.log(`[Queue] Timeout de sécurité atteint pour ${this.currentItem?.id}`);
      this.playNext();
    }, safetyDelay);
  }

  /**
   * Appelé par le client overlay quand la lecture est terminée
   * @param {string} itemId
   */
  onItemEnded(itemId) {
    if (this.currentItem && this.currentItem.id === itemId) {
      console.log(`[Queue] Fin de lecture confirmée pour ${itemId}`);
      this.playNext();
    }
  }

  /**
   * Passer manuellement l'élément actuel
   */
  skip() {
    console.log('[Queue] Commande Skip reçue.');
    this.playNext();
  }

  /**
   * Vider complètement la file d'attente et stopper la lecture
   */
  clear() {
    console.log('[Queue] Nettoyage complet de la file.');
    this.queue = [];
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.currentItem = null;
    this.io.emit('media_stopped');
    this.io.emit('queue_updated', { queueLength: 0, current: null });
  }

  /**
   * Obtenir l'état actuel de la file
   */
  getStatus() {
    return {
      current: this.currentItem,
      queue: this.queue,
      count: this.queue.length,
    };
  }
}

module.exports = MediaQueue;
