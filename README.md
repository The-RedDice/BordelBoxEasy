# 🔊 BordelBoxEasy

> **L'overlay de bureau transparent et léger pour déconner entre potes en jeu via Discord.**

Inspiré de l'esprit *Cacabox*, **BordelBoxEasy** permet à tes potes d'envoyer des vidéos, images, sons, GIFs ou messages vocaux (TTS) directement sur ton écran de jeu en temps réel via un bot Discord.

Grâce à **Tauri**, la fenêtre est **transparente**, **au premier plan**, et surtout **les clics de souris passent à travers (click-through)** : tu ne perds jamais le focus en plein jeu !

---

## 🚀 Fonctionnalités actuelles

### 1. Commande `/media`
- **Envoi de média** : Fichier direct (glisser-déposer sur Discord : MP4, WebM, MP3, WAV, GIF, PNG, JPG) ou URL directe.
- **Légende optionnelle** : Ajoute un texte qui s'affiche sous le média dans une bulle stylisée.
- **Avatar & Pseudo** : Affiche qui a envoyé le média avec son badge Discord.
- **Durée dynamique** : Barre de progression animée et passage automatique au média suivant.

### 2. Commande `/texte`
- **Message pop-up** : Affiche une carte de discussion avec l'avatar de ton pote.
- **Synthèse Vocale (TTS)** : Lit le message à voix haute (activé par défaut, désactivable avec l'option `tts: False`).

### 3. Panneau de Contrôle & Test Intégré (`http://localhost:3000`)
- Teste immédiatement les commandes `/media` et `/texte` sans même avoir besoin d'ouvrir Discord !
- Réglage du volume en temps réel.
- Boutons d'urgence : **Passer (Skip)** et **Tout couper (Clear)**.

---

## 🛠️ Installation & Démarrage rapide

### 1. Installer les dépendances
Ouvre un terminal dans le dossier et lance :
```bash
npm install
```

### 2. Configurer le Bot Discord
1. Rends-toi sur le [Portail Développeur Discord](https://discord.com/developers/applications) et crée une **New Application**.
2. Dans l'onglet **Bot** :
   - Clique sur **Reset Token** et copie ton token.
   - Coche l'option **Message Content Intent** sous *Privileged Gateway Intents*.
3. Copie le fichier `.env.example` en `.env` :
   ```bash
   cp .env.example .env
   ```
4. Remplis tes identifiants dans `.env` :
   ```env
   DISCORD_TOKEN=ton_token_de_bot_ici
   DISCORD_CLIENT_ID=ton_client_id_ici
   DISCORD_GUILD_ID=ton_id_de_serveur_ici
   PORT=3000
   MAX_MEDIA_DURATION=20
   ```
   *(Renseigner `DISCORD_GUILD_ID` permet aux commandes `/media` et `/texte` d'apparaître instantanément sur ton serveur).*
5. Invite le bot sur ton serveur avec les permissions `bot` et `applications.commands`.

### 3. Démarrer BordelBoxEasy
```bash
npm start
```
- 🎛️ **Panneau de contrôle & Tests** : [http://localhost:3000](http://localhost:3000)
- 📺 **Overlay Web (Navigateur / OBS)** : [http://localhost:3000/overlay](http://localhost:3000/overlay)

---

## 🖥️ Mode Application Bureau (Tauri)

Pour lancer la fenêtre d'overlay native transparente avec clics traversants :
```bash
npm run tauri dev
```
*(Nécessite Rust et les build tools C++ sur votre machine).*

---

## 📁 Architecture du projet

```
BordelBoxEasy/
├── src/
│   ├── server/
│   │   ├── index.js      # Serveur Express, Socket.io et lancement du bot
│   │   ├── bot.js        # Bot Discord.js v14 (/media et /texte)
│   │   └── queue.js      # File d'attente intelligente des médias
│   └── overlay/
│       ├── index.html    # Page d'overlay transparente
│       ├── style.css     # Design glassmorphism, animations fluides
│       ├── app.js        # Moteur du lecteur vidéo/audio/image et TTS
│       └── test-panel.html # Dashboard de test et de réglages
├── src-tauri/            # Configuration de l'application de bureau native
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/main.rs
├── package.json
└── README.md
```
