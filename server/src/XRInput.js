import * as THREE from 'three';

const _locomotionMove = new THREE.Vector3();
const _locomotionHeadBefore = new THREE.Vector3();
const _locomotionHeadAfter = new THREE.Vector3();
const _locomotionDir = new THREE.Vector3();
const _locomotionHeadForward = new THREE.Vector3();
const _locomotionHeadRight = new THREE.Vector3();
const _locomotionMeshRef = new THREE.Vector3();
const _locomotionProposedPos = new THREE.Vector3();
const _locomotionWorldQuat = new THREE.Quaternion();
const _locomotionControllerQuat = new THREE.Quaternion();

let _snapTurnReady = true;

const SNAP_TURN_ANGLE = Math.PI / 6;   // 30 degrees
const THUMBSTICK_DEADZONE = 0.15;      // ignore sub-threshold drift

export function createXRInput({ renderer, cameraRig, local, keys, resolveCollision, onVignetteTarget }) {

  function readGamepadAxes(gp) {
    if (!gp || !gp.axes) return { x: 0, y: 0 };
    if (gp.axes.length >= 4) {
      return { x: gp.axes[2] || 0, y: gp.axes[3] || 0 };
    }
    return { x: gp.axes[0] || 0, y: gp.axes[1] || 0 };
  }

  function getXRMovementFromFrame(frame) {
    const session = renderer.xr.getSession();
    const move = _locomotionMove.set(0, 0, 0);
    if (!session || !frame) return move;
    for (const inputSource of session.inputSources) {
      if (!inputSource.gamepad) continue;
      if (inputSource.handedness === "right") continue;
      const axes = readGamepadAxes(inputSource.gamepad);
      move.x += axes.x;
      move.z += axes.y;
    }
    if (move.length() > 1) move.normalize();
    return move;
  }

  function getXRTurnFromFrame(frame) {
    const session = renderer.xr.getSession();
    if (!session || !frame) return 0;
    for (const inputSource of session.inputSources) {
      if (!inputSource.gamepad) continue;
      if (inputSource.handedness !== "right") continue;
      const { x } = readGamepadAxes(inputSource.gamepad);
      return Math.abs(x) > THUMBSTICK_DEADZONE ? x : 0;
    }
    return 0;
  }

  /**
   * Rotate cameraRig around the Y axis by angleDelta while keeping the
   * headset's world-space position fixed ("pivot around head").
   */
  function rotateCameraRigAroundHead(angleDelta) {
    const xrCamera = renderer.xr.getCamera();
    const headBefore = _locomotionHeadBefore;
    xrCamera.getWorldPosition(headBefore);
    cameraRig.rotation.y += angleDelta;
    cameraRig.updateMatrixWorld(true);
    const headAfter = _locomotionHeadAfter;
    xrCamera.getWorldPosition(headAfter);
    cameraRig.position.x += headBefore.x - headAfter.x;
    cameraRig.position.z += headBefore.z - headAfter.z;
    cameraRig.position.y = 0;
  }

  // ---------- Movement (keyboard + XR thumbstick) ----------
  function applyLocalMovement(dt, xrFrame = null) {
    const speed = 2.5; // m/s
    const dir = _locomotionDir.set(0, 0, 0);

    // Keyboard (desktop)
    if (keys["w"]) dir.z -= 1;
    if (keys["s"]) dir.z += 1;
    if (keys["a"]) dir.x -= 1;
    if (keys["d"]) dir.x += 1;

    // XR thumbstick
    if (xrFrame) {
      const xrMove = getXRMovementFromFrame(xrFrame);
      dir.add(xrMove);
    } else if (renderer.xr.isPresenting) {
      const session = renderer.xr.getSession();
      if (session) {
        for (const inputSource of session.inputSources) {
          if (!inputSource.gamepad) continue;
          if (inputSource.handedness === "right") continue;
          const axes = readGamepadAxes(inputSource.gamepad);
          dir.x += axes.x;
          dir.z += axes.y;
        }
      }
    }

    if (dir.lengthSq() > 0) dir.normalize();

    if (renderer.xr.isPresenting) {
      // Snap turning from right thumbstick
      if (xrFrame) {
        const turnInput = getXRTurnFromFrame(xrFrame);
        if (Math.abs(turnInput) > 0.7) {
          if (_snapTurnReady) {
            rotateCameraRigAroundHead(Math.sign(-turnInput) * SNAP_TURN_ANGLE);
            _snapTurnReady = false;
          }
        } else if (Math.abs(turnInput) < 0.3) {
          _snapTurnReady = true;
        }
      }

      // Movement relative to left controller direction (fallback to headset if not tracked).
      // The WebXR runtime sets the XR camera's matrixWorld directly, so
      // getWorldQuaternion() is unreliable. Manually compose the rig's Y rotation
      // with the local quaternion to get the true world heading.
      const xrCamera = renderer.xr.getCamera();
      let refQuat = xrCamera.quaternion;
      
      if (xrFrame) {
        const session = renderer.xr.getSession();
        if (session) {
          for (const source of session.inputSources) {
            if (source.handedness === "left") {
              const space = source.gripSpace || source.targetRaySpace;
              if (space) {
                const pose = xrFrame.getPose(space, renderer.xr.getReferenceSpace());
                if (pose) {
                  const orient = pose.transform.orientation;
                  refQuat = _locomotionControllerQuat.set(orient.x, orient.y, orient.z, orient.w);
                }
              }
            }
          }
        }
      }

      const worldQuat = _locomotionWorldQuat.multiplyQuaternions(
        cameraRig.quaternion,
        refQuat
      );
      const headForward = _locomotionHeadForward.set(0, 0, -1).applyQuaternion(worldQuat);
      headForward.y = 0;
      if (headForward.lengthSq() > 0) headForward.normalize();
      const headRight = _locomotionHeadRight.set(1, 0, 0).applyQuaternion(worldQuat);
      headRight.y = 0;
      if (headRight.lengthSq() > 0) headRight.normalize();

      const move = _locomotionMove.set(0, 0, 0)
        .addScaledVector(headForward, -dir.z)
        .addScaledVector(headRight, dir.x);

      onVignetteTarget(move.lengthSq() > 0.01 ? 0.95 : 0.0);

      const rigPos = cameraRig.position;
      const meshRef = _locomotionMeshRef.set(rigPos.x, 1.0, rigPos.z);
      const proposedPos = _locomotionProposedPos.set(
        rigPos.x + move.x * speed * dt,
        1.0,
        rigPos.z + move.z * speed * dt,
      );
      const resolved = resolveCollision(meshRef, proposedPos);
      cameraRig.position.x = resolved.x;
      cameraRig.position.z = resolved.z;
      cameraRig.position.y = 0;

      // Sync local.mesh for networking
      local.mesh.position.set(resolved.x, 1.0, resolved.z);
      local.mesh.rotation.y = cameraRig.rotation.y;
    } else {
      onVignetteTarget(0.0);
      // Desktop: move local.mesh, rig follows in updateCamera()
      const proposed = _locomotionProposedPos.copy(local.mesh.position).addScaledVector(dir, speed * dt);
      const resolved = resolveCollision(local.mesh.position, proposed);
      local.mesh.position.copy(resolved);
      local.mesh.position.y = 1.0;
    }
  }

  return { applyLocalMovement };
}
