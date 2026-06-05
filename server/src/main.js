// client/main.js

import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { io } from 'socket.io-client';
import { createLocalPlayer, createRemotePlayer, updateRemoteTarget, interpolateRemotes } from './player.js';
import { createXRInput } from './XRInput.js';
import { createSceneManager } from './SceneManager.js';
import { createNetwork } from './Network.js';
import { createUI } from './UI.js';

// Module-scope reusables for per-frame operations
let _vignetteTargetOpacity = 0.0;

// ---------- Socket.IO ----------
const socket = io(); // ensure this connects to the same origin
let isSceneLoaded = false;
// ---------- Scene / Camera / Renderer ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  200,
);
// Camera rides on a rig. In desktop the rig follows the player mesh (third-person).
// In VR the headset overrides the camera pose inside the rig (first-person).
const cameraRig = new THREE.Group();
cameraRig.position.set(0, 0, 5);
scene.add(cameraRig);
cameraRig.add(camera);
camera.position.set(0, 1.6, 2.5); // desktop: behind + eye-height

const audioListener = new THREE.AudioListener();
camera.add(audioListener);

// FOV Vignette (VR only)
const vignetteGeo = new THREE.PlaneGeometry(2, 2);
const vignetteMat = new THREE.ShaderMaterial({
  transparent: true, depthTest: false, depthWrite: false,
  uniforms: { opacity: { value: 0.0 } },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: `uniform float opacity; varying vec2 vUv; void main() { float d = distance(vUv, vec2(0.5)); gl_FragColor = vec4(0.0, 0.0, 0.0, smoothstep(0.2, 0.6, d) * opacity); }`
});
const vignetteMesh = new THREE.Mesh(vignetteGeo, vignetteMat);
vignetteMesh.renderOrder = 999;
vignetteMesh.frustumCulled = false;
camera.add(vignetteMesh);

// Create renderer and enable XR BEFORE adding the VRButton
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

renderer.shadowMap.enabled = false; // disabled — too expensive on Quest mobile GPU
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.8;

renderer.xr.enabled = true; // MUST enable XR before VRButton
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

// ---------- Lights & Environment ----------
const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(5, 5, 5);
scene.add(dirLight);



// ---------- Scene Manager (Asset Loading & Collision) ----------
const sceneManager = createSceneManager({
  scene,
  renderer,
  onLoaded: () => { isSceneLoaded = true; },
  onError: (msg) => {
    console.error(msg);
    const errGeo = new THREE.PlaneGeometry(2, 1);
    const errMesh = new THREE.Mesh(errGeo, new THREE.MeshBasicMaterial({ color: 0xff0000 }));
    errMesh.position.set(0, 1.5, -2);
    scene.add(errMesh);
    if (!renderer.xr.isPresenting) alert(msg);
  }
});
const { resolveCollision } = sceneManager;
sceneManager.init();


// ---------- Players ----------
const local = createLocalPlayer(scene, 0x00aa00);
const remotes = {}; // id -> remote

// Hide own mesh in VR (first-person — camera is inside the body)
renderer.xr.addEventListener("sessionstart", () => {
  local.mesh.visible = false;
  camera.position.set(0, 0, 0); // XR system takes over from here
  cameraRig.position.y = -0.4;
  // Entering VR is a user gesture — start LiveKit audio and replay any attached elements
  if (network) {
    network.requestMicPermission();
    network.replayAudioElements();
  }

  // 72Hz frame rate lock (Quest 2 baseline)
  const session = renderer.xr.getSession();
  if (session && session.supportedFrameRates) {
    for (const rate of session.supportedFrameRates) {
      if (rate === 72) {
        session.updateTargetFrameRate(72).catch(e => console.warn('Could not set 72Hz:', e));
        break;
      }
    }
  }
});
renderer.xr.addEventListener("sessionend", () => {
  local.mesh.visible = true;
  cameraRig.position.y = 0; // restore rig Y to 0 for desktop
  camera.position.set(0, 1.6, 2.5); // restore desktop offset
});



// Camera follow local (desktop only — in VR the headset drives the camera inside the rig)
function updateCamera() {
  if (!renderer.xr.isPresenting) {
    cameraRig.position.x = local.mesh.position.x;
    cameraRig.position.z = local.mesh.position.z;
    cameraRig.position.y = 0;
    camera.lookAt(
      local.mesh.position.x,
      local.mesh.position.y,
      local.mesh.position.z,
    );
  }
}

// ---------- Keyboard input ----------
const keys = {};

let ui;
const network = createNetwork({
  socket, scene, local, remotes, audioListener,
  onPlayersChanged: () => { if (ui) ui.updatePlayerDropdown(); },
  onActiveCallsChanged: (str) => { if (ui) ui.setActiveCalls(str); },
  onChatMessage: ({ id, message }) => {
    const chatMessages = document.getElementById('chat-messages');
    const el = document.createElement('div');
    el.textContent = `${id.slice(0, 6)}: ${message}`;
    chatMessages?.appendChild(el);
    if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;
  },
});
ui = createUI({ scene, renderer, camera, socket, network, remotes });
window.addEventListener("keydown", (e) => (keys[e.key.toLowerCase()] = true));
window.addEventListener("keyup", (e) => (keys[e.key.toLowerCase()] = false));

const xrInput = createXRInput({ 
  renderer, 
  cameraRig, 
  local, 
  keys, 
  resolveCollision, 
  onVignetteTarget: (v) => { _vignetteTargetOpacity = v; } 
});

// ---------- Networking (Socket.IO handlers) ----------
socket.on("connect", () => {
  console.log("socket connected", socket.id);
});

// XR Input moved to XRInput.js

// ---------- Animation / render loop ----------
const clock = new THREE.Clock();

renderer.setAnimationLoop((time, xrFrame) => {
  if (!isSceneLoaded) {
    // Allow UI (like loading/error blocks) and background to render
    if (ui) ui.tick();
    renderer.render(scene, camera);
    return;
  }

  const dt = clock.getDelta();
  const now = performance.now();

  xrInput.applyLocalMovement(dt, xrFrame);

  if (renderer.xr.isPresenting) {
    const curOpac = vignetteMat.uniforms.opacity.value;
    if (curOpac < _vignetteTargetOpacity) {
      vignetteMat.uniforms.opacity.value = Math.min(curOpac + dt * 4.0, _vignetteTargetOpacity);
    } else if (curOpac > _vignetteTargetOpacity) {
      vignetteMat.uniforms.opacity.value = Math.max(curOpac - dt * 4.0, _vignetteTargetOpacity);
    }
  } else {
    vignetteMat.uniforms.opacity.value = 0.0;
  }

  updateCamera();
  network.trySendState(now);
  interpolateRemotes(remotes, dt);

  if (ui) ui.tick();

  renderer.render(scene, camera);
});

// ---------- Resize ----------
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
