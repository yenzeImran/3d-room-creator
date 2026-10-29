/* ===================================================================
   SCHOOL EDITOR
   Environment-type-driven mode switching.
   • envType = 'room'        → original single-room editor
   • envType = 'multi-room'  → school editor (Room Editor | Overview | Tour)
   Reuses creator.js's room panels for the active school room.
   =================================================================== */

const MULTI = {
  active: false,
  view: 'editor',            // 'editor' | 'overview' | 'tour'
  preservedSingleRoom: null
};

const SCHOOL_OVERVIEW = {
  group: null,
  proxies: {},
  selectedId: null,
  dragPlane: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
};

/* =========================================================
   ENV TYPE HOOK
   ========================================================= */
function installEnvTypeHook() {
  const sel = document.getElementById('envType');
  if (!sel) { setTimeout(installEnvTypeHook, 120); return; }
  if (sel.dataset.hooked) return;
  sel.dataset.hooked = '1';

  if (!sel.querySelector('option[value="multi-room"]')) {
    const opt = document.createElement('option');
    opt.value = 'multi-room';
    opt.textContent = 'Multi-Room (School)';
    const first = sel.querySelector('option');
    if (first) sel.insertBefore(opt, first.nextSibling);
    else sel.appendChild(opt);
  }

  sel.addEventListener('change', () => {
    if (sel.value === 'multi-room') enterMultiRoom();
    else if (MULTI.active) exitMultiRoom();
  });
}

/* =========================================================
   ENTER MULTI-ROOM
   ========================================================= */
function enterMultiRoom() {
  if (MULTI.active) return;
  MULTI.active = true;
  document.body.classList.add('mode-multi-room');

  /* Preserve the current single-room state */
  MULTI.preservedSingleRoom = {
    baseImageDataURL, roofImageDataURL,
    wallImageDataURLs: wallImageDataURLs.slice(),
    baseTexture, roofTexture,
    wallTextures: wallTextures.slice(),
    components: components.slice(),
    lights: lights.slice(),
    wallOrder: document.getElementById('wallOrder')?.value || 'back-left-right-front',
    wallPositions: wallPositions.map(p => ({ pos: p.pos.slice(), rot: p.rot.slice(), label: p.label })),
    environment
  };

  /* Seed the school with the current room if empty */
  if (!school.rooms.length) {
    const r = createRoomDef({ name: 'Room 1', offset: { x: 0, y: 0, z: 0 } });
    const hasContent = baseTexture || wallTextures.length > 0 || roofTexture
                     || components.length > 0 || lights.length > 0;
    if (hasContent) {
      r.baseImageDataURL     = baseImageDataURL;
      r.roofImageDataURL     = roofImageDataURL;
      r.wallImageDataURLs    = wallImageDataURLs.slice();
      r.baseTexture          = baseTexture;
      r.roofTexture          = roofTexture;
      r.wallTextures         = wallTextures.slice();
      r.components           = components.slice();
      r.lights               = lights.slice();
      r.wallOrder            = MULTI.preservedSingleRoom.wallOrder;
      r.wallPositions        = MULTI.preservedSingleRoom.wallPositions;
    }
    school.rooms.push(r);
    school.startRoomId  = r.id;
    school.activeRoomId = r.id;
  }

  if (window.ensureSchoolSidebar)    ensureSchoolSidebar();
  if (window.ensureMaterialsSidebar) ensureMaterialsSidebar();
  if (window.renderSchoolUI)         renderSchoolUI();
  if (window.refreshMaterialsUI)     refreshMaterialsUI();

  ensureSubToolbar();
  setMultiView('editor');
  showStatus('Multi-Room — use the sub-toolbar to switch views', 'info');
}

/* =========================================================
   EXIT MULTI-ROOM
   ========================================================= */
function exitMultiRoom() {
  if (!MULTI.active) return;

  /* Save the currently active room before tearing down */
  if (MULTI.view === 'editor') {
    try { saveEditorStateToRoom(); } catch (e) { /* ignore */ }
  }

  /* Leave any sub-view cleanly */
  if (MULTI.view === 'overview') teardownOverview();
  if (MULTI.view === 'tour' && window.exitTourMode) window.exitTourMode();
  MULTI.view = 'editor';
  removeSubToolbar();

  MULTI.active = false;
  document.body.classList.remove('mode-multi-room');

  /* Restore the preserved single-room state */
  clearEditorScene();
  const p = MULTI.preservedSingleRoom;
  if (p) {
    baseImageDataURL  = p.baseImageDataURL;
    roofImageDataURL  = p.roofImageDataURL;
    wallImageDataURLs = p.wallImageDataURLs;
    baseTexture       = p.baseTexture;
    roofTexture       = p.roofTexture;
    wallTextures      = p.wallTextures;
    components        = p.components;
    lights            = p.lights;
    environment       = p.environment;

    if (document.getElementById('wallOrder')) {
      document.getElementById('wallOrder').value = p.wallOrder || 'back-left-right-front';
    }
    updateWallPositions();

    components.forEach(c => { if (!c.parent) scene.add(c); });
    lights.forEach(ld => {
      scene.add(ld.light);
      if (ld.sphere) scene.add(ld.sphere);
      if (ld.light.target) scene.add(ld.light.target);
    });
    if (environment && !environment.parent) scene.add(environment);
  }
  renderLayersPanel();
  updateSelectionPanels();
  showStatus('Back to Room mode', 'info');
}

/* =========================================================
   SUB-TOOLBAR
   ========================================================= */
function ensureSubToolbar() {
  if (document.getElementById('sub-toolbar')) return;
  const main = document.querySelector('.main-content');
  if (!main) return;
  const tb = document.createElement('div');
  tb.id = 'sub-toolbar';
  tb.innerHTML = `
    <button class="sub-btn" data-view="editor">✏️ Room Editor</button>
    <button class="sub-btn" data-view="overview">🏫 Overview</button>
    <button class="sub-btn" data-view="tour">🚶 Tour</button>
    <span class="sub-info" id="subToolbarInfo"></span>
  `;
  main.insertBefore(tb, main.firstChild);
  tb.querySelectorAll('.sub-btn').forEach(b => {
    b.onclick = () => setMultiView(b.dataset.view);
  });
  updateSubToolbarUI();
}

function removeSubToolbar() {
  const tb = document.getElementById('sub-toolbar');
  if (tb) tb.remove();
}

function updateSubToolbarUI() {
  document.querySelectorAll('.sub-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.view === MULTI.view);
  });
  const info = document.getElementById('subToolbarInfo');
  if (!info) return;
  if (MULTI.view === 'editor') {
    const room = getRoomById(school.activeRoomId);
    info.textContent = room ? 'Editing: ' + room.name : 'No room selected';
  } else if (MULTI.view === 'overview') {
    info.textContent = school.rooms.length + ' rooms · drag to move · double-click to edit';
  } else {
    info.textContent = 'WASD walk · click doors · ESC exit';
  }
}

/* =========================================================
   VIEW SWITCHING
   ========================================================= */
function setMultiView(view) {
  const prev = MULTI.view;
  if (prev === view) return;
  MULTI.view = view;

  if (view === 'overview') {
    if (prev === 'editor') saveEditorStateToRoom();
    clearEditorScene();
    enterOverview();
  } else if (view === 'editor') {
    if (prev === 'overview') teardownOverview();
    if (prev === 'tour' && window.exitTourMode) {
      window.exitTourMode();   /* restores the active room */
    } else {
      const room = getRoomById(school.activeRoomId) || school.rooms[0];
      if (room) {
        school.activeRoomId = room.id;
        clearEditorScene();
        restoreEditorStateFromRoom(room);
      }
    }
  } else if (view === 'tour') {
    if (prev === 'overview') {
      const room = getRoomById(school.activeRoomId) || school.rooms[0];
      if (room) {
        components = room.components.slice();
        lights = room.lights.slice();
      }
    }
    if (window.enterTourMode) window.enterTourMode();
  }

  updateSubToolbarUI();
  if (window.renderSchoolUI)    renderSchoolUI();
  if (window.refreshMaterialsUI) refreshMaterialsUI();
}

/* =========================================================
   OVERVIEW SCENE
   ========================================================= */
function enterOverview() {
  buildOverviewScene();
  const b = computeSchoolBounds();
  const cx = (b.min.x + b.max.x) / 2;
  const cz = (b.min.z + b.max.z) / 2;
  const span = Math.max(b.max.x - b.min.x, b.max.z - b.min.z, 20);
  camera.position.set(cx + span * 0.6, span * 1.1, cz + span * 0.9);
  controls.target.set(cx, 0, cz);
  controls.update();
  if (school.activeRoomId) highlightProxy(school.activeRoomId);
}

function teardownOverview() {
  if (SCHOOL_OVERVIEW.group) {
    scene.remove(SCHOOL_OVERVIEW.group);
    SCHOOL_OVERVIEW.group.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (o.material.map) o.material.map.dispose();
        o.material.dispose();
      }
    });
    SCHOOL_OVERVIEW.group = null;
  }
  SCHOOL_OVERVIEW.proxies = {};
  SCHOOL_OVERVIEW.selectedId = null;
  if (transformControls) transformControls.detach();
}

function computeSchoolBounds() {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  school.rooms.forEach(r => {
    const hw = r.size.w / 2, hd = r.size.d / 2;
    minX = Math.min(minX, r.offset.x - hw); maxX = Math.max(maxX, r.offset.x + hw);
    minZ = Math.min(minZ, r.offset.z - hd); maxZ = Math.max(maxZ, r.offset.z + hd);
  });
  if (!isFinite(minX)) return { min: { x: -10, z: -10 }, max: { x: 10, z: 10 } };
  return { min: { x: minX, z: minZ }, max: { x: maxX, z: maxZ } };
}

function buildOverviewScene() {
  const g = new THREE.Group();
  SCHOOL_OVERVIEW.group = g;
  SCHOOL_OVERVIEW.proxies = {};
  const b = computeSchoolBounds();
  const size = Math.max(b.max.x - b.min.x, b.max.z - b.min.z, 20) + 40;
  const grid = new THREE.GridHelper(Math.ceil(size), Math.ceil(size), 0x5D5CDE, 0x2a2a4a);
  grid.position.set((b.min.x + b.max.x) / 2, 0.01, (b.min.z + b.max.z) / 2);
  grid.material.opacity = 0.35;
  grid.material.transparent = true;
  g.add(grid);
  school.rooms.forEach(room => {
    const proxy = makeRoomProxy(room);
    g.add(proxy);
    SCHOOL_OVERVIEW.proxies[room.id] = proxy;
  });
  scene.add(g);
}

function makeRoomProxy(room) {
  const { w, h, d } = room.size;
  const proxy = new THREE.Group();
  proxy.position.set(room.offset.x, 0, room.offset.z);
  proxy.userData = { isRoomProxy: true, roomId: room.id };
  const isActive = room.id === school.activeRoomId;

  const floorMat = new THREE.MeshBasicMaterial({
    color: isActive ? 0x5D5CDE : 0x3a3a5a,
    transparent: true, opacity: 0.55,
    side: THREE.DoubleSide, depthWrite: false
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.2, d - 0.2), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.02;
  floor.userData = { isRoomProxy: true, roomId: room.id };
  proxy.add(floor);
  proxy.userData.floorMesh = floor;

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)),
    new THREE.LineBasicMaterial({
      color: isActive ? 0x8f8eff : 0x5a5a8a,
      transparent: true, opacity: 0.85
    })
  );
  edges.position.y = h / 2;
  proxy.add(edges);
  proxy.userData.edges = edges;

  (room.doors || []).forEach(door => proxy.add(makeOverviewDoor(room, door)));

  const label = makeRoomLabel(room.name);
  label.position.set(0, h + 1.5, 0);
  proxy.add(label);
  proxy.userData.label = label;

  return proxy;
}

function makeOverviewDoor(room, door) {
  const { w, h, d } = room.size;
  let pos, rot;
  switch (door.wall) {
    case 'back':  pos = [(door.offset - 0.5) * w, h/2, -d/2]; rot = [0, 0, 0]; break;
    case 'front': pos = [(door.offset - 0.5) * w, h/2,  d/2]; rot = [0, Math.PI, 0]; break;
    case 'left':  pos = [-w/2, h/2, (door.offset - 0.5) * d]; rot = [0, Math.PI/2, 0]; break;
    case 'right': pos = [ w/2, h/2, (door.offset - 0.5) * d]; rot = [0, -Math.PI/2, 0]; break;
  }
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(1.4, 2.6),
    new THREE.MeshBasicMaterial({
      color: 0x8f8eff, transparent: true, opacity: 0.6,
      side: THREE.DoubleSide, depthWrite: false
    })
  );
  m.position.set(...pos);
  m.rotation.set(...rot);
  return m;
}

function makeRoomLabel(text) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(15, 15, 30, 0.9)';
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = '#8f8eff';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, 508, 124);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 44px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.scale.set(8, 2, 1);
  return sprite;
}

function highlightProxy(roomId) {
  SCHOOL_OVERVIEW.selectedId = roomId;
  Object.entries(SCHOOL_OVERVIEW.proxies).forEach(([id, proxy]) => {
    const sel = id === roomId;
    if (proxy.userData.floorMesh) proxy.userData.floorMesh.material.color.setHex(sel ? 0x5D5CDE : 0x3a3a5a);
    if (proxy.userData.edges)     proxy.userData.edges.material.color.setHex(sel ? 0x8f8eff : 0x5a5a8a);
    if (proxy.userData.label) {
      const s = sel ? 10 : 8;
      proxy.userData.label.scale.set(s, s * 0.25, 1);
    }
  });
  if (window.renderSchoolUI) renderSchoolUI();
}

/* =========================================================
   OVERVIEW INTERACTIONS
   ========================================================= */
(function () {
  function ready(fn) {
    if (typeof renderer !== 'undefined' && renderer) fn();
    else setTimeout(() => ready(fn), 60);
  }
  ready(() => {
    const el = renderer.domElement;
    let dragStart = null, dragging = false, dragRoom = null;

    el.addEventListener('pointerdown', e => {
      if (!MULTI.active || MULTI.view !== 'overview') return;
      if (e.button !== 0) return;
      const m = new THREE.Vector2(
        (e.clientX / el.clientWidth) * 2 - 1,
        -(e.clientY / el.clientHeight) * 2 + 1
      );
      raycaster.setFromCamera(m, camera);
      const proxies = Object.values(SCHOOL_OVERVIEW.proxies);
      if (!proxies.length) return;
      const hits = raycaster.intersectObjects(proxies, true);
      if (!hits.length) return;
      let obj = hits[0].object;
      while (obj && !obj.userData.isRoomProxy) obj = obj.parent;
      if (!obj) return;
      dragStart = { x: e.clientX, y: e.clientY };
      dragRoom = obj;
      dragging = false;
      controls.enabled = false;
      school.activeRoomId = obj.userData.roomId;
      highlightProxy(obj.userData.roomId);
    });

    document.addEventListener('pointermove', e => {
      if (!MULTI.active || MULTI.view !== 'overview' || !dragRoom) return;
      if (!dragging) {
        if (Math.hypot(e.clientX - dragStart.x, e.clientY - dragStart.y) > 4) {
          dragging = true;
          el.style.cursor = 'grabbing';
        } else return;
      }
      const m = new THREE.Vector2(
        (e.clientX / el.clientWidth) * 2 - 1,
        -(e.clientY / el.clientHeight) * 2 + 1
      );
      raycaster.setFromCamera(m, camera);
      const pt = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(SCHOOL_OVERVIEW.dragPlane, pt)) {
        const snap = 0.5;
        const nx = Math.round(pt.x / snap) * snap;
        const nz = Math.round(pt.z / snap) * snap;
        dragRoom.position.x = nx;
        dragRoom.position.z = nz;
        const room = getRoomById(dragRoom.userData.roomId);
        if (room) { room.offset.x = nx; room.offset.z = nz; }
      }
    });

    document.addEventListener('pointerup', () => {
      if (!MULTI.active || MULTI.view !== 'overview' || !dragRoom) return;
      dragRoom = null; dragStart = null; dragging = false;
      el.style.cursor = '';
      controls.enabled = true;
    });

    el.addEventListener('dblclick', e => {
      if (!MULTI.active || MULTI.view !== 'overview') return;
      const m = new THREE.Vector2(
        (e.clientX / el.clientWidth) * 2 - 1,
        -(e.clientY / el.clientHeight) * 2 + 1
      );
      raycaster.setFromCamera(m, camera);
      const proxies = Object.values(SCHOOL_OVERVIEW.proxies);
      if (!proxies.length) return;
      const hits = raycaster.intersectObjects(proxies, true);
      if (!hits.length) return;
      let obj = hits[0].object;
      while (obj && !obj.userData.isRoomProxy) obj = obj.parent;
      if (!obj) return;
      school.activeRoomId = obj.userData.roomId;
      setMultiView('editor');
    });
  });
})();

/* =========================================================
   PATCHES
   ========================================================= */

/* Save guard — don't clobber room data from overview/tour */
(function () {
  function ready(fn) {
    if (typeof window.saveEditorStateToRoom === 'function' && typeof MULTI !== 'undefined') fn();
    else setTimeout(() => ready(fn), 80);
  }
  ready(() => {
    const _orig = window.saveEditorStateToRoom;
    window.saveEditorStateToRoom = function () {
      if (MULTI.active && MULTI.view !== 'editor') return;
      return _orig.apply(this, arguments);
    };
  });
})();

/* setActiveRoom — don't leave overview when picking from the sidebar list */
(function () {
  function ready(fn) {
    if (typeof window.setActiveRoom === 'function' && typeof MULTI !== 'undefined') fn();
    else setTimeout(() => ready(fn), 80);
  }
  ready(() => {
    const _orig = window.setActiveRoom;
    window.setActiveRoom = function (id) {
      if (MULTI.active && MULTI.view === 'overview') {
        school.activeRoomId = id;
        highlightProxy(id);
        updateSubToolbarUI();
        return;
      }
      if (MULTI.active && MULTI.view === 'tour' && window.exitTourMode) {
        window.exitTourMode();
      }
      _orig(id);
      updateSubToolbarUI();
    };
  });
})();

/* Tour hooks — keep sub-toolbar in sync */
(function () {
  function ready(fn) {
    if (typeof window.enterTourMode === 'function' && typeof MULTI !== 'undefined') fn();
    else setTimeout(() => ready(fn), 80);
  }
  ready(() => {
    const _origEnter = window.enterTourMode;
    const _origExit  = window.exitTourMode;
    window.enterTourMode = function (id) {
      if (MULTI.active && MULTI.view !== 'tour') {
        if (MULTI.view === 'overview') {
          const room = getRoomById(school.activeRoomId) || school.rooms[0];
          if (room) {
            components = room.components.slice();
            lights = room.lights.slice();
          }
        }
        MULTI.view = 'tour';
        updateSubToolbarUI();
      }
      return _origEnter(id);
    };
    window.exitTourMode = function () {
      _origExit.apply(this, arguments);
      if (MULTI.active) {
        MULTI.view = 'editor';
        const room = getRoomById(school.activeRoomId) || school.rooms[0];
        if (room) restoreEditorStateFromRoom(room);
        updateSubToolbarUI();
        if (window.renderSchoolUI) renderSchoolUI();
      }
    };
  });
})();

/* Rebuild overview when rooms are added / removed / regenerated */
(function () {
  function ready(fn) {
    if (typeof window.addRoom === 'function' && typeof MULTI !== 'undefined') fn();
    else setTimeout(() => ready(fn), 80);
  }
  ready(() => {
    ['addRoom', 'removeRoom', 'buildSchoolFromLayout'].forEach(name => {
      const _orig = window[name];
      if (typeof _orig !== 'function') return;
      window[name] = function () {
        const result = _orig.apply(this, arguments);
        if (MULTI.active && MULTI.view === 'overview') {
          teardownOverview();
          buildOverviewScene();
          if (school.activeRoomId) highlightProxy(school.activeRoomId);
        }
        updateSubToolbarUI();
        return result;
      };
    });
  });
})();

/* Init */
(function () {
  function ready(fn) {
    if (typeof scene !== 'undefined' && scene && document.getElementById('envType')) fn();
    else setTimeout(() => ready(fn), 120);
  }
  ready(() => {
    installEnvTypeHook();
  });
})();