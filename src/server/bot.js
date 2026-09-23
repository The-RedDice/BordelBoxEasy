const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActivityType,
} = require('discord.js');

/**
 * Détection du type de média à partir du content-type ou de l'extension
 */
function detectMediaType(url, contentType = '') {
  const cleanUrl = url.split('?')[0].toLowerCase();
  const ct = contentType.toLowerCase();

  if (ct.startsWith('video/') || cleanUrl.endsWith('.mp4') || cleanUrl.endsWith('.webm') || cleanUrl.endsWith('.mov')) {
    return 'video';
  }
  if (ct.startsWith('audio/') || cleanUrl.endsWith('.mp3') || cleanUrl.endsWith('.wav') || cleanUrl.endsWith('.ogg') || cleanUrl.endsWith('.m4a')) {
    return 'audio';
  }
  if (ct.startsWith('image/') || cleanUrl.endsWith('.gif') || cleanUrl.endsWith('.png') || cleanUrl.endsWith('.jpg') || cleanUrl.endsWith('.jpeg') || cleanUrl.endsWith('.webp')) {
    return 'image';
  }

  // Vérification des plateformes externes connues
  if (cleanUrl.includes('youtube.com') || cleanUrl.includes('youtu.be')) {
    return 'youtube';
  }
  if (cleanUrl.includes('tenor.com') || cleanUrl.includes('giphy.com')) {
    return 'image';
  }

  return 'unknown';
}

/**
 * Initialise et démarre le bot Discord
 * @param {import('./queue')} queue
 * @param {Object} config
 * @param {Function} [getConnectedOverlays]
 */
function initBot(queue, config, getConnectedOverlays) {
  const token = config.token || process.env.DISCORD_TOKEN;
  const clientId = config.clientId || process.env.DISCORD_CLIENT_ID;
  const guildId = config.guildId || process.env.DISCORD_GUILD_ID;

  if (!token || token === 'TON_TOKEN_ICI') {
    console.warn('\n⚠️ [Discord Bot] Aucun token Discord valide trouvé dans le fichier .env.');
    console.warn('➡️ Le serveur web et l\'overlay restent 100% utilisables via le panneau de test : http://localhost:3000\n');
    return null;
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  // Définition des commandes Slash
  const commands = [
    // 1. Commande /media
    new SlashCommandBuilder()
      .setName('media')
      .setDescription('Affiche une vidéo, une image, un son ou un GIF sur l\'overlay avec texte optionnel')
      .addAttachmentOption((opt) =>
        opt
          .setName('fichier')
          .setDescription('Fichier média direct (vidéo MP4/WebM, son MP3, image, GIF)')
          .setRequired(false)
      )
      .addStringOption((opt) =>
        opt
          .setName('url')
          .setDescription('Lien URL du média (YouTube, GIF Tenor, lien direct MP4/MP3/Image)')
          .setRequired(false)
      )
      .addStringOption((opt) =>
        opt
          .setName('texte')
          .setDescription('Texte / légende facultative qui s\'affiche sous le média')
          .setRequired(false)
      )
      .addBooleanOption((opt) =>
        opt
          .setName('fond_vert')
          .setDescription('Supprimer automatiquement le fond vert du média (Chroma Key)')
          .setRequired(false)
      ),

    // 2. Commande /texte
    new SlashCommandBuilder()
      .setName('texte')
      .setDescription('Affiche un message stylisé sur l\'overlay avec lecture vocale (TTS)')
      .addStringOption((opt) =>
        opt
          .setName('message')
          .setDescription('Le message à afficher à l\'écran')
          .setRequired(true)
      )
      .addBooleanOption((opt) =>
        opt
          .setName('tts')
          .setDescription('Activer la lecture vocale par synthèse (TTS) (Oui par défaut)')
          .setRequired(false)
      ),

    // 3. Commande /online
    new SlashCommandBuilder()
      .setName('online')
      .setDescription('Affiche le nombre et les pseudos des personnes connectées à l\'overlay'),

    // 4. Commande /download
    new SlashCommandBuilder()
      .setName('download')
      .setDescription('Donne le lien pour télécharger l\'application overlay BordelBox (Windows)'),
  ];

  /**
   * Met à jour la bio / statut d'activité du bot en temps réel
   * @param {number} count
   */
  function updatePresence(count = 0) {
    if (!client || !client.user) return;
    const text = count === 0
      ? "📺 Personne sur l'overlay"
      : count === 1
      ? "📺 1 connecté à l'overlay"
      : `📺 ${count} connectés à l'overlay`;

    client.user.setPresence({
      activities: [{ name: text, type: ActivityType.Watching }],
      status: count > 0 ? 'online' : 'idle',
    });
  }

  // Enregistrement des commandes auprès de l'API Discord
  async function registerSlashCommands() {
    try {
      const rest = new REST({ version: '10' }).setToken(token);
      console.log('[Discord Bot] Enregistrement des commandes Slash (/media, /texte, /online, /download)...');

      if (guildId) {
        // Enregistrement instantané pour un serveur spécifique
        await rest.put(
          Routes.applicationGuildCommands(clientId, guildId),
          { body: commands.map((c) => c.toJSON()) }
        );
        console.log(`[Discord Bot] Commandes enregistrées immédiatement pour le serveur ${guildId}`);
      } else {
        // Enregistrement global (peut prendre quelques minutes à se propager sur Discord)
        await rest.put(
          Routes.applicationCommands(clientId),
          { body: commands.map((c) => c.toJSON()) }
        );
        console.log('[Discord Bot] Commandes enregistrées de manière globale');
      }
    } catch (err) {
      console.error('[Discord Bot] Erreur lors de l\'enregistrement des commandes :', err);
    }
  }

  client.once('ready', async () => {
    console.log(`✅ [Discord Bot] Connecté en tant que ${client.user.tag}`);
    const initialCount = typeof getConnectedOverlays === 'function' ? getConnectedOverlays().length : 0;
    updatePresence(initialCount);
    if (clientId && clientId !== 'TON_CLIENT_ID_ICI') {
      await registerSlashCommands();
    } else {
      console.warn('[Discord Bot] DISCORD_CLIENT_ID non configuré. Les commandes slash n\'ont pas été rafraîchies.');
    }
  });

  // Gestion des commandes Slash
  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;
    const author = {
      id: interaction.user.id,
      name: interaction.member?.displayName || interaction.user.username,
      avatar: interaction.user.displayAvatarURL({ extension: 'png', size: 128 }),
    };

    // Commande /media
    if (commandName === 'media') {
      const fileAttachment = interaction.options.getAttachment('fichier');
      const urlOption = interaction.options.getString('url');
      const textOption = interaction.options.getString('texte') || '';
      const fondVert = interaction.options.getBoolean('fond_vert') || false;

      if (!fileAttachment && !urlOption) {
        return interaction.reply({
          content: '❌ Veuillez fournir soit un fichier joint, soit une URL de média !',
          ephemeral: true,
        });
      }

      const mediaUrl = fileAttachment ? fileAttachment.url : urlOption;
      const contentType = fileAttachment?.contentType || '';
      const mediaType = detectMediaType(mediaUrl, contentType);

      if (mediaType === 'unknown') {
        return interaction.reply({
          content: '⚠️ Format de média non reconnu. Formats supportés : MP4, WebM, MP3, WAV, GIF, PNG, JPG, WebP, YouTube.',
          ephemeral: true,
        });
      }

      queue.enqueue({
        type: mediaType,
        url: mediaUrl,
        text: textOption,
        chromakey: fondVert,
        author,
        duration: parseInt(process.env.MAX_MEDIA_DURATION, 10) || 20,
      });

      const details = [];
      if (textOption) details.push('avec texte');
      if (fondVert) details.push('🟢 fond vert retiré');
      const detailStr = details.length > 0 ? ` (${details.join(' • ')})` : '';

      return interaction.reply({
        content: `🎉 Média envoyé à l'écran ! [${mediaType.toUpperCase()}]${detailStr}`,
        ephemeral: false,
      });
    }

    // Commande /texte
    if (commandName === 'texte') {
      const message = interaction.options.getString('message');
      const tts = interaction.options.getBoolean('tts') !== false; // true par défaut

      // Estimation de la durée d'affichage selon la longueur du message (min 6s, max 15s)
      const duration = Math.min(Math.max(6, Math.ceil(message.length / 10) + 3), 15);

      queue.enqueue({
        type: 'text',
        message,
        tts,
        author,
        duration,
      });

      return interaction.reply({
        content: `💬 Message envoyé à l'écran ! ${tts ? '🔊 (avec synthèse vocale)' : ''}`,
        ephemeral: false,
      });
    }

    // Commande /online
    if (commandName === 'online') {
      const overlays = typeof getConnectedOverlays === 'function' ? getConnectedOverlays() : [];
      const count = overlays.length;

      const embed = new EmbedBuilder()
        .setColor(count > 0 ? 0x57f287 : 0xed4245)
        .setTitle('📺 Joueurs connectés à l\'Overlay')
        .setTimestamp();

      if (count === 0) {
        embed.setDescription('🔴 **Aucun joueur n\'est actuellement connecté à l\'overlay.**\nLancez l\'application de bureau BordelBox ou ouvrez l\'overlay dans votre navigateur !');
      } else {
        const userList = overlays.map((o) => `• 🟢 **${o.username || 'Anonyme'}** *(${o.platform || 'Overlay'})*`).join('\n');
        embed.setDescription(`**${count} joueur${count > 1 ? 's' : ''} connecté${count > 1 ? 's' : ''} en direct :**\n\n${userList}`);
      }

      return interaction.reply({ embeds: [embed] });
    }

    // Commande /download
    if (commandName === 'download') {
      const downloadUrl = 'https://github.com/The-RedDice/BordelBoxEasy/releases/latest';
      const allReleasesUrl = 'https://github.com/The-RedDice/BordelBoxEasy/releases';

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('📥 Télécharger l\'Overlay BordelBox')
        .setDescription(
          "Installe l'application de bureau pour afficher les médias et messages directement sur ton écran en jeu !\n\n" +
          `🚀 **[Clique ici pour télécharger le dernier installeur Windows (.exe)](${downloadUrl})**\n\n` +
          `📂 **[Consulter toutes les versions sur GitHub](${allReleasesUrl})**`
        )
        .addFields(
          {
            name: '✨ Fonctionnalités en jeu',
            value: '• **100% transparent & passe-clic** : tes clics de souris traversent l\'overlay pour ne jamais gêner tes tirs en jeu.\n• **Touche F9** : masque ou réactive l\'overlay à tout moment.\n• **Personnalisation** : clic droit sur l\'icône en barre des tâches pour changer de pseudo ou régler la taille.',
          },
          {
            name: '🌐 Overlay Web / OBS',
            value: 'Tu peux aussi ouvrir l\'overlay dans un navigateur ou comme source de navigateur OBS via `/overlay`.',
          }
        )
        .setFooter({ text: 'BordelBoxEasy • Visible uniquement par vous' })
        .setTimestamp();

      return interaction.reply({
        embeds: [embed],
        ephemeral: true,
      });
    }
  });

  // Connexion
  client.login(token).catch((err) => {
    console.error('❌ [Discord Bot] Échec de la connexion à Discord :', err.message);
  });

  return {
    client,
    updatePresence,
  };
}

module.exports = { initBot, detectMediaType };
