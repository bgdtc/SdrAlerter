# SDR Alerter

Application web complète pour contrôler un RTL-SDR, visualiser les signaux en temps réel, décoder les messages POCSAG et recevoir des alertes.

## Fonctionnalités

### Phase 1
- Interface web moderne pour sélectionner un RTL-SDR
- Contrôle des paramètres d'écoute (fréquence, gain, sample rate, mode)
- Visualisation temps réel (FFT, oscilloscope, audio)
- Streaming audio via WebSocket

### Phase 2
- Décodage automatique des signaux POCSAG
- Système d'alertes (notifications navigateur, popup visuel, alerte sonore)
- Filtrage par capcode (whitelist/blacklist)
- Export des messages (JSON/CSV)

## Prérequis

### Système
- Node.js 18+
- npm ou yarn
- rtl-sdr (rtl_fm, rtl_test)
- multimon-ng

### Installation des dépendances système (Linux/Raspberry Pi)

```bash
# Installer rtl-sdr
sudo apt-get update
sudo apt-get install rtl-sdr librtlsdr-dev

# Installer multimon-ng
sudo apt-get install multimon-ng

# Installer sox (pour le downsampling audio FM)
sudo apt-get install sox

# Si nécessaire, installer depuis les sources:
# git clone https://github.com/EliasOenal/multimon-ng.git
# cd multimon-ng
# mkdir build && cd build
# cmake ..
# make
# sudo make install
```

## Installation

### Backend

```bash
cd backend
npm install
```

### Frontend

```bash
cd frontend
npm install
```

## Utilisation

### Démarrer le backend

```bash
cd backend
npm start
# ou en mode développement avec rechargement automatique
npm run dev
```

Le serveur backend sera accessible sur `http://localhost:3000` (ou l'IP de votre Raspberry Pi).

### Démarrer le frontend

```bash
cd frontend
npm run dev
```

Le frontend sera accessible sur `http://localhost:5173` (ou l'IP de votre Raspberry Pi).

### Accès depuis le réseau local

Le serveur backend écoute sur `0.0.0.0:3000`, donc vous pouvez y accéder depuis n'importe quel appareil sur le réseau local en utilisant l'IP de votre Raspberry Pi.

Le frontend Vite est configuré pour écouter sur `0.0.0.0:5173` également.

## Configuration

### Backend

Créez un fichier `backend/.env`:

```
PORT=3000
NODE_ENV=development
```

### Frontend

Le frontend utilise le proxy Vite pour communiquer avec le backend. Si vous accédez au frontend depuis une autre machine, vous devrez modifier l'URL de l'API dans les composants React ou configurer le proxy différemment.

## Architecture

- **Backend**: Node.js + Express + Socket.io
- **Frontend**: React + TypeScript + Vite
- **Visualisation**: Chart.js pour les graphiques FFT
- **SDR**: rtl-sdr (rtl_fm) via processus système
- **Décodage**: multimon-ng via processus système

## Structure du projet

```
SdrAlerter/
├── backend/
│   ├── src/
│   │   ├── server.js
│   │   ├── routes/
│   │   │   ├── sdr.js
│   │   │   └── pocsag.js
│   │   ├── services/
│   │   │   ├── sdrService.js
│   │   │   └── pocsagService.js
│   │   └── websocket/
│   │       └── streamHandler.js
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── SdrSelector.tsx
│   │   │   ├── FrequencyControl.tsx
│   │   │   ├── AudioVisualizer.tsx
│   │   │   ├── PocsagDecoder.tsx
│   │   │   └── AlertManager.tsx
│   │   ├── hooks/
│   │   │   └── useWebSocket.ts
│   │   ├── App.tsx
│   │   └── main.tsx
│   └── package.json
└── README.md
```

## Dépannage

### Erreur "rtl_fm not found"
Assurez-vous que rtl-sdr est installé et dans le PATH.

### Erreur "multimon-ng not found"
Assurez-vous que multimon-ng est installé et dans le PATH.

### Pas de devices détectés
Vérifiez que votre RTL-SDR est bien connecté et reconnu par le système:
```bash
rtl_test -t
lsusb | grep RTL
```

### Les notifications ne fonctionnent pas
Les notifications navigateur nécessitent une permission explicite. Cliquez sur le bouton "Autoriser les notifications" dans les paramètres d'alerte.

## Licence

MIT

