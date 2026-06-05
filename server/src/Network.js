import { Room, RoomEvent, Track } from 'livekit-client';
import { createRemotePlayer, updateRemoteTarget } from './player.js';

export function createNetwork({
  socket, scene, local, remotes,
  audioListener,
  onPlayersChanged, onActiveCallsChanged, onChatMessage,
}) {
  const livekitRoom = new Room();

  // Connect to LiveKit using socket.id as identity
  async function connectToLiveKit() {
    if (livekitRoom.state === 'connected' || livekitRoom.state === 'connecting') return;
    try {
      const resp = await fetch(`/livekit-token?identity=${encodeURIComponent(socket.id)}`);
      const { token, url } = await resp.json();
      await livekitRoom.connect(url, token);
      await livekitRoom.localParticipant.setMicrophoneEnabled(true);
      updateActiveCallsDisplay();
    } catch (e) {
      console.warn('LiveKit connect failed', e);
    }
  }

  function attachAudioTrack(track, participant) {
    const remote = remotes[participant.identity];
    if (!remote) return;
    if (remote.audioElement) return; // already attached
    const el = document.createElement('audio');
    el.autoplay = true;
    el.playsInline = true;
    el.style.display = 'none';
    el.srcObject = new MediaStream([track.mediaStreamTrack]);
    document.body.appendChild(el);
    el.play().catch(e => console.warn('audio play failed:', e));
    remote.audioElement = el;
    updateActiveCallsDisplay();
  }

  // Attach PositionalAudio to remote mesh when track arrives
  livekitRoom.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
    if (track.kind !== Track.Kind.Audio) return;
    if (!audioListener) return;
    function tryAttach(attemptsLeft) {
      if (remotes[participant.identity]) {
        attachAudioTrack(track, participant);
      } else if (attemptsLeft > 0) {
        setTimeout(() => tryAttach(attemptsLeft - 1), 200);
      } else {
        console.warn('LiveKit: no remote mesh for', participant.identity);
      }
    }
    tryAttach(10);
  });

  livekitRoom.on(RoomEvent.TrackUnsubscribed, (track, _publication, participant) => {
    if (track.kind !== Track.Kind.Audio) return;
    const remote = remotes[participant.identity];
    if (remote?.audioElement) {
      remote.audioElement.srcObject = null;
      remote.audioElement.remove();
      delete remote.audioElement;
    }
    updateActiveCallsDisplay();
  });

  function updateActiveCallsDisplay() {
    const count = livekitRoom.remoteParticipants.size;
    const str = count > 0 ? `${count} participant(s) in room` : 'No active calls';
    onActiveCallsChanged(str);
  }

  // Keep same API surface — UI.js buttons are repurposed
  async function broadcastVoiceToAll() {
    await livekitRoom.localParticipant.setMicrophoneEnabled(true);
    updateActiveCallsDisplay();
  }
  function hangupAll() {
    livekitRoom.localParticipant.setMicrophoneEnabled(false);
    updateActiveCallsDisplay();
  }

  async function requestMicPermission() {
    await livekitRoom.startAudio();
    connectToLiveKit();
    // Attach any already-subscribed tracks that fired before AudioContext was running
    livekitRoom.remoteParticipants.forEach((participant) => {
      participant.audioTrackPublications.forEach((pub) => {
        if (pub.track && pub.isSubscribed) {
          attachAudioTrack(pub.track, participant);
        }
      });
    });
  }

  // Connect when socket is ready
  socket.on("connect", () => {
    console.log("socket connected", socket.id);
    connectToLiveKit();
  });

  // ---------- Socket.IO Player Sync Handlers ----------
  socket.on("currentPlayers", (players) => {
    Object.entries(players).forEach(([id, p]) => {
      if (id === socket.id) {
        local.mesh.position.set(p.position.x, p.position.y || 1.0, p.position.z);
      } else {
        if (!remotes[id])
          remotes[id] = createRemotePlayer(scene, id, 0xff0000, p.position);
      }
    });
    onPlayersChanged();
  });

  socket.on("newPlayer", (p) => {
    if (p.id === socket.id) return;
    if (!remotes[p.id])
      remotes[p.id] = createRemotePlayer(scene, p.id, 0xff0000, p.position);
    onPlayersChanged();
  });

  socket.on("playerMoved", ({ id, data }) => {
    if (id === socket.id) return;
    const v = new DataView(data);
    const state = {
      position: { x: v.getFloat32(0, true), y: v.getFloat32(4, true), z: v.getFloat32(8, true) },
      rotation: { x: v.getFloat32(12, true), y: v.getFloat32(16, true), z: v.getFloat32(20, true), w: v.getFloat32(24, true) },
    };
    if (!remotes[id]) remotes[id] = createRemotePlayer(scene, id, 0xff0000, state.position);
    updateRemoteTarget(remotes[id], state);
  });

  socket.on("playerDisconnected", (id) => {
    if (remotes[id]) {
      const remote = remotes[id];
      if (remote?.audioElement) {
        remote.audioElement.srcObject = null;
        remote.audioElement.remove();
        delete remote.audioElement;
      }
      remote.mesh.traverse((child) => {
        if (child.isMesh) {
          child.geometry.dispose();
          child.material.dispose();
        }
      });
      scene.remove(remote.mesh);
      delete remotes[id];
      onPlayersChanged();
      updateActiveCallsDisplay();
    }
  });

  socket.on("chatMessage", ({ id, message }) => {
    onChatMessage({ id, message });
  });

  // ---------- Send movement updates at 20Hz ----------
  let lastSent = 0;
  const sendInterval = 1000 / 20;
  const _sendBuf = new ArrayBuffer(28);
  const _sendView = new DataView(_sendBuf);
  function trySendState(now) {
    if (now - lastSent < sendInterval) return;
    lastSent = now;
    _sendView.setFloat32(0,  local.mesh.position.x,    true);
    _sendView.setFloat32(4,  local.mesh.position.y,    true);
    _sendView.setFloat32(8,  local.mesh.position.z,    true);
    _sendView.setFloat32(12, local.mesh.quaternion.x,  true);
    _sendView.setFloat32(16, local.mesh.quaternion.y,  true);
    _sendView.setFloat32(20, local.mesh.quaternion.z,  true);
    _sendView.setFloat32(24, local.mesh.quaternion.w,  true);
    socket.emit("playerMoved", _sendBuf);
  }

  function replayAudioElements() {
    for (const id in remotes) {
      const el = remotes[id].audioElement;
      if (el) el.play().catch(e => console.warn('replay failed:', e));
    }
  }

  return {
    trySendState,
    startCallToPeer: () => {},
    broadcastVoiceToAll,
    hangupPeer: () => {},
    hangupAll,
    requestMicPermission,
    replayAudioElements,
  };
}
