this class room done by ahmedmohamedumes "Ahmed"
# NSF VR Educational Classroom

A multiplayer WebXR classroom where students join a virtual room on Meta Quest headsets.
Built with Three.js, Express, Socket.IO, and LiveKit for spatial voice. Developed as part of an NSF-funded education research project at UMES.

---

## Demo

Watch the classroom in action — multiple students joining a shared VR space with spatial voice and interactive objects.

[![NSF VR Classroom Demo](https://img.youtube.com/vi/bWmxBGcO-IY/maxresdefault.jpg)](https://www.youtube.com/watch?v=bWmxBGcO-IY)



## Project Presentation

For a full overview of the project — including research goals, system architecture, and design decisions — view the complete presentation:

📄 [View Full Project Presentation (Google Drive)](https://drive.google.com/file/d/1J1ee7DCjxJFBj9AHRgUQACZn8V6nvW4Q/view?usp=sharing)

---

## Requirements

- [Node.js](https://nodejs.org/) v18 or newer
- A Meta Quest 2 or Quest 3 headset (for VR testing)
- A [LiveKit Cloud](https://cloud.livekit.io/) account (free tier works)

---

## First-Time Setup

All commands below are run from the `server/` folder.

### 1. Install dependencies

```powershell
cd server
npm install
```

### 2. Generate a self-signed HTTPS certificate

WebXR requires HTTPS. Run this once to create `certs/key.pem` and `certs/cert.pem`:

```powershell
mkdir certs
openssl req -x509 -newkey rsa:2048 -keyout certs/key.pem -out certs/cert.pem -days 365 -nodes -subj "/CN=localhost"
```

If `openssl` is not installed, download it from [slproweb.com/products/Win32OpenSSL.html](https://slproweb.com/products/Win32OpenSSL.html) and add it to your PATH.

### 3. Set up environment variables

Copy the example file and fill in your LiveKit credentials:

```powershell
copy .env.example .env
```

Then open `server/.env` and replace the placeholder values:

```
LIVEKIT_API_KEY=your_api_key_here
LIVEKIT_SECRET=your_secret_here
LIVEKIT_URL=wss://your-room.livekit.cloud
```

Get these values from your project at [cloud.livekit.io](https://cloud.livekit.io/).

---

## Running the Dev Server

```powershell
cd server
npm run dev
```

This starts two processes at once:
- **Vite** (HTTPS front-end) at `https://localhost:5173`
- **Express** (Socket.IO + LiveKit token server) at `http://localhost:3000`

Open `https://localhost:5173` in Chrome. Accept the self-signed certificate warning.

---

## Testing on a Quest Headset (same machine)

1. Plug the Quest into the PC via USB and accept the "Allow USB debugging" prompt inside the headset.

2. Run this once to forward the port from the headset to this machine:

```powershell
adb reverse tcp:5173 tcp:5173
```

   If `adb` is not found, install Android Platform Tools:
   ```powershell
   winget install Google.PlatformTools
   ```
   Then restart PowerShell.

3. On the Quest browser, go to:
   ```
   https://localhost:5173
   ```
   Accept the certificate warning, then press **Enter VR**.

---

## Project Structure

```
server/
├── server.js          # Express + Socket.IO server
├── vite.config.js     # Vite dev server (HTTPS + proxy)
├── index.html         # App entry point
├── src/
│   ├── main.js        # Orchestrator
│   ├── SceneManager.js
│   ├── XRInput.js
│   ├── Network.js
│   ├── UI.js
│   ├── player.js
│   └── chat.js
├── public/
│   ├── FullClassRoom.glb
│   ├── textures/
│   ├── fonts/
│   └── draco/
└── certs/             # Generated locally — not in git
```

---

## Common Issues

**"Cannot find certs/key.pem"** — You skipped step 2. Run the `openssl` command above.

**".env variables are undefined"** — You skipped step 3. Make sure `server/.env` exists with real values.

**Quest shows "Your connection is not private"** — Tap **Advanced → Proceed to localhost** to accept the self-signed cert.

**`adb` not recognized** — Restart PowerShell after installing Platform Tools so the PATH refreshes.

**Multiplayer not connecting** — Make sure both players are on the same network and both have `adb reverse` set up if on Quest.
