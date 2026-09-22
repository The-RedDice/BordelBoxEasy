const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
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
 */
function initBot(queue, config) {
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
  ];

  // Enregistrement des commandes auprès de l'API Discord
  async function registerSlashCommands() {
    try {
      const rest = new REST({ version: '10' }).setToken(token);
      console.log('[Discord Bot] Enregistrement des commandes Slash (/media, /texte)...');

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
        author,
        duration: parseInt(process.env.MAX_MEDIA_DURATION, 10) || 20,
      });

      return interaction.reply({
        content: `🎉 Média envoyé à l'écran ! (${mediaType.toUpperCase()}${textOption ? ' avec texte' : ''})`,
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
  });

  // Connexion
  client.login(token).catch((err) => {
    console.error('❌ [Discord Bot] Échec de la connexion à Discord :', err.message);
  });

  return client;
}

module.exports = { initBot, detectMediaType };
