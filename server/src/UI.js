import * as THREE from 'three';
import * as ThreeMeshUI from 'three-mesh-ui';

export function createUI({ scene, renderer, camera, socket, network, remotes }) {
  const _uiTempMatrix = new THREE.Matrix4();
  let availableTargets = [];
  let activeCallsText = null;
  const targetSlotButtons = [];

  let callMenuContainer = null;
  let chatMenuContainer = null;

  function updatePlayerDropdown() {
    availableTargets = Object.keys(remotes).filter(id => id !== socket.id);

    // Update 3D Menu slot buttons to match available peers exactly like a select list
    if (targetSlotButtons.length > 0) {
      for (let i = 0; i < targetSlotButtons.length; i++) {
        const btn = targetSlotButtons[i];
        if (i < availableTargets.length) {
          const peerId = availableTargets[i];
          btn.targetId = peerId;
          btn.visible = true;
          // update its text child
          btn.children.forEach(c => {
            if (c.isText) c.set({ content: "Call " + peerId.slice(0, 6) });
          });
        } else {
          btn.targetId = null;
          btn.visible = false;
        }
      }
    }

    // Update original DOM HTML UI
    const sel = document.getElementById("player-select");
    if (!sel) return;
    const previous = sel.value;
    sel.innerHTML = '<option value="">Select player</option>';
    availableTargets.forEach((id) => {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = `${id.slice(0, 6)}`;
      sel.appendChild(opt);
    });
    if (previous) {
      const exists = Array.from(sel.options).some((o) => o.value === previous);
      if (exists) sel.value = previous;
    }
  }

  function setActiveCalls(str) {
    if (activeCallsText) activeCallsText.set({ content: str });
    const dom = document.getElementById('active-calls');
    if (dom) dom.textContent = str;
  }

  // chat DOM listener
  const chatInput = document.getElementById("chat-input");
  if (chatInput) {
    chatInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && chatInput.value.trim()) {
        socket.emit("chatMessage", chatInput.value.trim());
        chatInput.value = "";
      }
    });
  }

  // UI hooks for original desktop DOM buttons
  const callBtn = document.getElementById("call-peer");
  const broadcastBtn = document.getElementById("broadcast-voice");
  const hangupBtn = document.getElementById("hangup-peer");
  const hangupAllBtn = document.getElementById("hangup-all");
  if (callBtn) {
    callBtn.addEventListener("click", async () => {
      const sel = document.getElementById("player-select");
      if (!sel || !sel.value) return;
      await network.startCallToPeer(sel.value);
    });
  }
  if (broadcastBtn) broadcastBtn.addEventListener("click", async () => { await network.broadcastVoiceToAll(); });
  if (hangupBtn) {
    hangupBtn.addEventListener("click", () => {
      const sel = document.getElementById("player-select");
      if (!sel || !sel.value) return;
      network.hangupPeer(sel.value);
    });
  }
  if (hangupAllBtn) hangupAllBtn.addEventListener("click", () => network.hangupAll());

  // ---------- 3D Spatial Menus ----------
  const fontJson = '/fonts/Roboto-msdf.json';
  const fontPng = '/fonts/Roboto-msdf.png';

  callMenuContainer = new ThreeMeshUI.Block({
    justifyContent: 'center', alignContent: 'center', contentDirection: 'column',
    fontFamily: fontJson, fontTexture: fontPng, fontSize: 0.07, padding: 0.05,
    borderRadius: 0.1, backgroundOpacity: 0.8, backgroundColor: new THREE.Color(0x333333)
  });
  callMenuContainer.position.set(-1.5, 1.5, -2.5); // Left side of teach desk
  callMenuContainer.rotation.y = Math.PI / 8; // Angled slightly inwards

  chatMenuContainer = new ThreeMeshUI.Block({
    justifyContent: 'start', alignContent: 'center', contentDirection: 'column',
    fontFamily: fontJson, fontTexture: fontPng, fontSize: 0.07, padding: 0.05,
    borderRadius: 0.1, backgroundOpacity: 0.8, backgroundColor: new THREE.Color(0x333333)
  });
  chatMenuContainer.position.set(1.5, 1.5, -2.5); // Right side of teach desk
  chatMenuContainer.rotation.y = -Math.PI / 8; // Angled slightly inwards

  if (!renderer.xr.isPresenting) {
    callMenuContainer.visible = false;
    chatMenuContainer.visible = false;
  }

  const hoverState = { state: 'hovered', attributes: { offset: 0.02, backgroundColor: new THREE.Color(0x555555), fontColor: new THREE.Color(0xffffff) } };
  const idleState = { state: 'idle', attributes: { offset: 0, backgroundColor: new THREE.Color(0x222222), fontColor: new THREE.Color(0xdddddd) } };

  const objsToTest = [];

  function createButton(textStr, onClick, width = 1.2, height = 0.15) {
    const btn = new ThreeMeshUI.Block({ width, height, justifyContent: 'center', alignContent: 'center', offset: 0, margin: 0.02, borderRadius: 0.05, backgroundColor: new THREE.Color(0x222222) });
    const text = new ThreeMeshUI.Text({ content: textStr });
    btn.add(text);
    btn.setupState(hoverState);
    btn.setupState(idleState);
    btn.onClick = onClick;
    objsToTest.push(btn);
    return btn;
  }

  // ------ Left Call Menu Population ------
  callMenuContainer.add(createButton("Broadcast Voice (All)", async () => { await network.broadcastVoiceToAll(); }));
  callMenuContainer.add(createButton("Hang Up All", () => { network.hangupAll(); }));

  // Pre-allocate 5 slots for remote peers
  const peersHeaderBlock = new ThreeMeshUI.Block({ width: 1.2, height: 0.1, justifyContent: 'center', alignContent: 'center', backgroundOpacity: 0 });
  peersHeaderBlock.add(new ThreeMeshUI.Text({ content: "Available Peers:", fontColor: new THREE.Color(0xffff00) }));
  callMenuContainer.add(peersHeaderBlock);

  for (let i = 0; i < 5; i++) {
    const btn = createButton("Empty Slot", async () => {
      if (btn.targetId) await network.startCallToPeer(btn.targetId);
    });
    btn.targetId = null;
    btn.visible = false;
    targetSlotButtons.push(btn);
    callMenuContainer.add(btn);
  }

  const activeCallsBlock = new ThreeMeshUI.Block({ width: 1.2, height: 0.1, justifyContent: 'center', alignContent: 'center', backgroundOpacity: 0 });
  activeCallsText = new ThreeMeshUI.Text({ content: "No active calls", fontColor: new THREE.Color(0x00ff00) });
  activeCallsBlock.add(activeCallsText);
  callMenuContainer.add(activeCallsBlock);

  // ------ Right Chat Menu Population ------
  const chatTitleBlock = new ThreeMeshUI.Block({ width: 1.2, height: 0.1, justifyContent: 'center', alignContent: 'center', backgroundOpacity: 0 });
  chatTitleBlock.add(new ThreeMeshUI.Text({ content: "Quick Chat", fontColor: new THREE.Color(0xffff00) }));
  chatMenuContainer.add(chatTitleBlock);

  const chatGrid = new ThreeMeshUI.Block({ width: 1.2, height: 0.6, contentDirection: 'row', justifyContent: 'center', alignContent: 'center', backgroundOpacity: 0 });

  function addChatButton(msg) {
    const b = createButton(msg, () => {
      socket.emit("chatMessage", msg);
    }, 0.35, 0.15);
    chatGrid.add(b);
  }

  // Ensure row layout wraps nicely by grouping
  const row1 = new ThreeMeshUI.Block({ width: 1.2, height: 0.2, contentDirection: 'row', justifyContent: 'space-around', backgroundOpacity: 0 });
  const row2 = new ThreeMeshUI.Block({ width: 1.2, height: 0.2, contentDirection: 'row', justifyContent: 'space-around', backgroundOpacity: 0 });
  const row3 = new ThreeMeshUI.Block({ width: 1.2, height: 0.2, contentDirection: 'row', justifyContent: 'space-around', backgroundOpacity: 0 });

  row1.add(createButton("Hello!", () => socket.emit("chatMessage", "Hello!"), 0.35, 0.15));
  row1.add(createButton("Yes", () => socket.emit("chatMessage", "Yes"), 0.35, 0.15));
  row1.add(createButton("No", () => socket.emit("chatMessage", "No"), 0.35, 0.15));

  row2.add(createButton("Thanks", () => socket.emit("chatMessage", "Thanks"), 0.35, 0.15));
  row2.add(createButton("Wait", () => socket.emit("chatMessage", "Wait"), 0.35, 0.15));
  row2.add(createButton("Haha", () => socket.emit("chatMessage", "Haha"), 0.35, 0.15));

  row3.add(createButton("Help", () => socket.emit("chatMessage", "Help"), 0.35, 0.15));
  row3.add(createButton("Let's go", () => socket.emit("chatMessage", "Let's go"), 0.35, 0.15));
  row3.add(createButton("Bye", () => socket.emit("chatMessage", "Bye"), 0.35, 0.15));

  chatMenuContainer.add(row1, row2, row3);

  scene.add(callMenuContainer);
  scene.add(chatMenuContainer);

  // WebXR Controller & Raycaster
  const rightController = renderer.xr.getController(0);
  scene.add(rightController);

  const pointerGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -5)]);
  const pointerMat = new THREE.LineBasicMaterial({ color: 0xff0000 });
  const pointerLine = new THREE.Line(pointerGeo, pointerMat);
  rightController.add(pointerLine);

  const uiRaycaster = new THREE.Raycaster();
  let hoveredBtn = null;

  rightController.addEventListener('selectstart', () => {
    if (hoveredBtn && hoveredBtn.onClick && hoveredBtn.visible !== false) hoveredBtn.onClick();
  });

  // Prompt for microphone access proactively as soon as user clicks anywhere
  // This explicitly bypasses WebXR immersive mode strict permissions blocks
  window.addEventListener('click', () => {
    network.requestMicPermission();
  }, { once: true });

  // Desktop Mouse Interaction for 3D Menu
  const mouse = new THREE.Vector2();
  window.addEventListener('mousemove', (event) => {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  });
  window.addEventListener('click', () => {
    if (!renderer.xr.isPresenting && hoveredBtn && hoveredBtn.onClick) {
      hoveredBtn.onClick();
    }
  });

  // Session listeners for UI toggles
  renderer.xr.addEventListener("sessionstart", () => {
    const chatDOM = document.getElementById('chat-container');
    if (chatDOM) chatDOM.style.display = 'none';
    const audioDOM = document.getElementById('audio-controls');
    if (audioDOM) audioDOM.style.display = 'none';
    if (callMenuContainer) callMenuContainer.visible = true;
    if (chatMenuContainer) chatMenuContainer.visible = true;
  });

  renderer.xr.addEventListener("sessionend", () => {
    const chatDOM = document.getElementById('chat-container');
    if (chatDOM) chatDOM.style.display = 'block';
    const audioDOM = document.getElementById('audio-controls');
    if (audioDOM) audioDOM.style.display = 'block';
    if (callMenuContainer) callMenuContainer.visible = false;
    if (chatMenuContainer) chatMenuContainer.visible = false;
  });

  function tick() {
    ThreeMeshUI.update();

    // Raycaster logic for Interaction
    if (renderer.xr.isPresenting) {
      _uiTempMatrix.identity().extractRotation(rightController.matrixWorld);
      uiRaycaster.ray.origin.setFromMatrixPosition(rightController.matrixWorld);
      uiRaycaster.ray.direction.set(0, 0, -1).applyMatrix4(_uiTempMatrix);
    } else {
      uiRaycaster.setFromCamera(mouse, camera);
    }

    const intersects = uiRaycaster.intersectObjects(objsToTest, true);
    if (intersects.length > 0) {
      const hitObj = intersects[0].object;
      let rBtn = null;
      let current = hitObj;
      while (current) {
        if (objsToTest.includes(current)) {
          rBtn = current;
          break;
        }
        current = current.parent;
      }

      if (hoveredBtn && hoveredBtn !== rBtn) hoveredBtn.setState('idle');
      if (rBtn) {
        hoveredBtn = rBtn;
        hoveredBtn.setState('hovered');
      } else {
        if (hoveredBtn) { hoveredBtn.setState('idle'); hoveredBtn = null; }
      }
    } else {
      if (hoveredBtn) {
        hoveredBtn.setState('idle');
        hoveredBtn = null;
      }
    }
  }

  return { updatePlayerDropdown, setActiveCalls, tick };
}
