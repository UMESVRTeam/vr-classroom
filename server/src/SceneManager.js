import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

const _playerBox = { min: new THREE.Vector3(), max: new THREE.Vector3() };
const _collisionTestX = new THREE.Vector3();
const _collisionTestZ = new THREE.Vector3();
const _collisionDir = new THREE.Vector3();
const _collisionTestPos = new THREE.Vector3();
const _collisionNextPos = new THREE.Vector3();
const _collisionResult = new THREE.Vector3();

export function createSceneManager({ scene, renderer, onLoaded, onError }) {
  // ---------- Collision boxes (AABB — player movement only) ----------
  const collisionBoxes = [];
  function addCollisionBox(minX, minY, minZ, maxX, maxY, maxZ) {
    collisionBoxes.push({
      min: { x: minX, y: minY, z: minZ },
      max: { x: maxX, y: maxY, z: maxZ },
    });
  }

  function checkCollision(position, radius = 0.3) {
    _playerBox.min.set(
      position.x - radius,
      position.y - 0.9,
      position.z - radius,
    );
    _playerBox.max.set(
      position.x + radius,
      position.y + 0.9,
      position.z + radius,
    );
    for (const box of collisionBoxes) {
      const intersects =
        _playerBox.min.x <= box.max.x &&
        _playerBox.max.x >= box.min.x &&
        _playerBox.min.y <= box.max.y &&
        _playerBox.max.y >= box.min.y &&
        _playerBox.min.z <= box.max.z &&
        _playerBox.max.z >= box.min.z;
      if (intersects) return true;
    }
    return false;
  }

  function resolveCollision(oldPos, newPos, radius = 0.3) {
    if (!checkCollision(newPos, radius)) return _collisionResult.copy(newPos);

    // Try sliding on X
    const testX = _collisionTestX.set(newPos.x, newPos.y, oldPos.z);
    if (!checkCollision(testX, radius)) return testX;

    // Try sliding on Z
    const testZ = _collisionTestZ.set(oldPos.x, newPos.y, newPos.z);
    if (!checkCollision(testZ, radius)) return testZ;

    // Step incremental toward newPos
    const dir = _collisionDir.subVectors(newPos, oldPos);
    if (dir.lengthSq() === 0) return _collisionResult.copy(oldPos);
    dir.normalize();
    const stepSize = 0.02;
    const maxSteps = Math.ceil(oldPos.distanceTo(newPos) / stepSize);
    _collisionTestPos.copy(oldPos);
    for (let i = 0; i < maxSteps; i++) {
      _collisionNextPos.copy(_collisionTestPos).addScaledVector(dir, stepSize);
      if (!checkCollision(_collisionNextPos, radius)) _collisionTestPos.copy(_collisionNextPos);
      else break;
    }
    if (!_collisionTestPos.equals(oldPos)) return _collisionResult.copy(_collisionTestPos);
    return _collisionResult.copy(oldPos);
  }

  // ---------- Classroom geometry ----------
  const gltfLoader = new GLTFLoader();
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath('/draco/');
  gltfLoader.setDRACOLoader(dracoLoader);

  function loadGLTFAsync(url) {
    return new Promise((resolve, reject) => {
      gltfLoader.load(url, resolve, undefined, (err) => reject(new Error(`Failed to load ${url}: ${err?.message || err}`)));
    });
  }
  
  function loadRGBEAsync(url, path) {
    return new Promise((resolve, reject) => {
      new RGBELoader().setPath(path).load(url, resolve, undefined, (err) => reject(new Error(`Failed to load ${url}: ${err?.message || err}`)));
    });
  }

  async function initScene() {
    try {
      const [envTex, fullClassGltf] = await Promise.all([
        loadRGBEAsync('venice_sunset_1k.hdr', '/textures/'),
        loadGLTFAsync('/FullClassRoom.glb'),
      ]);

      // 1. Setup Environment
      envTex.mapping = THREE.EquirectangularReflectionMapping;
      scene.environment = envTex;
      scene.background = envTex;

      // 2. Setup Full Classroom (room + all furniture in one GLB)
      const room = fullClassGltf.scene;
      room.traverse((child) => {
        if (child.isMesh) {
          child.geometry.computeVertexNormals();
          if (child.material) child.material.side = THREE.DoubleSide;
        }
      });
      scene.add(room);

      const roomBox = new THREE.Box3().setFromObject(room);
      const roomSize = roomBox.getSize(new THREE.Vector3());
      const wallThick = 0.5;
      addCollisionBox(roomBox.min.x, 0, roomBox.min.z - wallThick, roomBox.max.x, roomSize.y, roomBox.min.z);
      addCollisionBox(roomBox.min.x, 0, roomBox.max.z, roomBox.max.x, roomSize.y, roomBox.max.z + wallThick);
      addCollisionBox(roomBox.min.x - wallThick, 0, roomBox.min.z, roomBox.min.x, roomSize.y, roomBox.max.z);
      addCollisionBox(roomBox.max.x, 0, roomBox.min.z, roomBox.max.x + wallThick, roomSize.y, roomBox.max.z);

      onLoaded();
    } catch (err) {
      const errMsg = `Scene failed to load:\n${err.message || err}`;
      onError(errMsg);
    }
  }

  return { resolveCollision, init: initScene };
}
