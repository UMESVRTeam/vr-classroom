// client/player.js
import * as THREE from "three";

// Helper: create a simple capsule mesh for the player
function createPlayerMesh(color = 0x00ff00) {
  const group = new THREE.Group();

  // body capsule
  const bodyGeo = new THREE.CapsuleGeometry(0.18, 0.4, 6, 12);
  const bodyMat = new THREE.MeshStandardMaterial({ color });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // head sphere
  const headGeo = new THREE.SphereGeometry(0.12, 12, 12);
  const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.set(0, 0.45, 0);
  head.castShadow = true;
  group.add(head);

  return group;
}

export function createLocalPlayer(scene, color = 0x00ff00) {
  const mesh = createPlayerMesh(color);
  mesh.position.set(1.8, 0, -2.5);
  scene.add(mesh);
  return { mesh };
}

// Remote player — replicated from server
export function createRemotePlayer(scene, id, color = 0xff0000, position = { x: 0, y: 0.55, z: 0 }) {
  const mesh = createPlayerMesh(color);
  mesh.position.set(position.x, position.y, position.z);
  scene.add(mesh);

  return {
    id,
    mesh,
    targetPosition: new THREE.Vector3(position.x, position.y, position.z),
    targetQuaternion: new THREE.Quaternion(),
  };
}

// Called when a socket update is received
export function updateRemoteTarget(remote, state) {
  if (!remote || !state || !state.position) return;
  remote.targetPosition.set(state.position.x, state.position.y, state.position.z);
  if (state.rotation) {
    remote.targetQuaternion.set(
      state.rotation.x, state.rotation.y,
      state.rotation.z, state.rotation.w
    );
  }
}

// Smooth interpolation of remote players
export function interpolateRemotes(remotes, dt) {
  const smoothing = Math.min(10 * dt, 1.0); // adapt to frame rate
  for (const id in remotes) {
    const r = remotes[id];
    if (!r.mesh || !r.targetPosition) continue;

    // Smooth position
    r.mesh.position.lerp(r.targetPosition, smoothing);

    // Smooth rotation
    if (r.targetQuaternion) {
      r.mesh.quaternion.slerp(r.targetQuaternion, smoothing);
    }
  }
}
