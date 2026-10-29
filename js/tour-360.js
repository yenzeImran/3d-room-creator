/* ===================================================================
   TOUR 360 — Hotspots · gyroscope · scroll-orbit · auto-rotate
   --------------------------------------------------------------------
   Builds on school-tour.js but upgrades the navigation model:

     • HOTSPOTS — clickable 3D markers placed by the editor per room.
       Types: navigate, info, image, audio, link, video
     • GYROSCOPE (mobile) — DeviceOrientation API drives yaw/pitch
     • SCROLL-ORBIT (desktop) — wheel + drag rotate the view, no lock
     • AUTO-ROTATE — slow panorama-style camera drift
     • SMOOTH TRANSITIONS — fade + blur between rooms
     • HUD with hotspot list, room name, audio control

   The exported standalone tour (tour-export-pro.js) ships the same
   runtime so the .html file behaves identically on phone and desktop.
   =================================================================== */

const TOUR_360 = {
  version: '2.0',
  active: false,
  mode: 'auto',                  // 'auto' | 'gyro' | 'scroll' | 'drag'
  autoRotate: true,
  autoRotateSpeed: 0.18,         // rad/sec
  gyroscopeEnabled: false,
  sensitivity: 0.0025,
  yawOffset: 0,                  // calibration offset for gyro
  fadeDuration: 360,
  blurDuringTransition: true
};

/* ---------------- hotspot data model ---------------- */
/*
   Hotspot def stored on room:
   {
     id: 'hs_1',
     position: [x, y, z],             // in room-local coords
     type: 'navigate' | 'info' | 'image' | 'audio' | 'link' | 'video',
     target: { roomId, spawn },      // for 'navigate'
     payload: {                       // for other types
       title: 'Kitchen info',
       text: '...',
       url: '...',                    // image/audio/video/link
     },
     label: 'Go to Kitchen'
   }
*/

/* ---------------- 3D hotspot visual ---------------- */
function makeHotspotMesh(hs) {
  const g = new THREE.Group();
  g.position.set(...hs.position);

  // Outer ring (clickable target)
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.18, 0.025, 12, 24),
    new THREE.MeshBasicMaterial({ color: 0x5D5CDE, transparent: true, opacity: 0.9 })
  );
  ring.userData = { isHotspot: true, hsId: hs.id };
  g.add(ring);

  // Inner pulse dot
  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1 })
  );
  g.add(dot);

  // Always-billboard sprite label
  if (hs.label) {
    const tex = makeHotspotLabelTexture(hs.label, hs.type);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, depthTest: false, transparent: true
    }));
    sprite.scale.set(1.6, 0.4, 1);
    sprite.position.y = 0.32;
    g.add(sprite);
  }

  g.userData = { isHotspot: true, hsId: hs.id, ring, dot };
  return g;
}

function makeHotspotLabelTexture(label, type) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const ctx = c.getContext('2d');
  const icon = { navigate: '→', info: 'i', image: '⬚', audio: '♪', link: '↗', video: '▶' }[type] || '•';
  ctx.fillStyle = 'rgba(15,15,30,0.85)';
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = '#8f8eff';
  ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, 508, 124);

  ctx.fillStyle = '#8f8eff';
  ctx.font = 'bold 60px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(icon, 18, 64);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 36px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 280, 64);

  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter;
  return tex;
}

/* ---------------- hotspot CRUD on rooms ---------------- */
function addHotspot(roomId, def) {
  const room = window.getRoomById?.(roomId);
  if (!room) return null;
  if (!room.hotspots) room.hotspots = [];
  const hs = {
    id: 'hs_' + Date.now() + '_' + Math.floor(Math.random() * 1e4),
    position: def.position || [0, 1.5, 0],
    type: def.type || 'navigate',
    target: def.target || null,
    payload: def.payload || null,
    label: def.label || 'Hotspot'
  };
  room.hotspots.push(hs);
  return hs;
}

function removeHotspot(roomId, hsId) {
  const room = window.getRoomById?.(roomId);
  if (!room?.hotspots) return;
  room.hotspots = room.hotspots.filter(h => h.id !== hsId);
}

function buildHotspotsForRoom(room) {
  // Adds 3D hotspot meshes to room.group (tour scene)
  if (!room.group || !room.hotspots?.length) return;
  room.hotspots.forEach(hs => {
    if (room.group.children.find(c => c.userData?.hsId === hs.id)) return;
    const mesh = makeHotspotMesh(hs);
    room.group.add(mesh);
  });
}

/* ---------------- gyroscope support ---------------- */
function enableGyroscope() {
  if (!window.DeviceOrientationEvent) {
    showStatus('Gyroscope not supported on this device', 'error');
    return false;
  }
  // iOS 13+ needs permission
  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    DeviceOrientationEvent.requestPermission()
      .then(state => {
        if (state !== 'granted') {
          showStatus('Gyroscope permission denied', 'error');
          return;
        }
        attachGyroListener();
      })
      .catch(() => showStatus('Gyroscope unavailable', 'error'));
  } else {
    attachGyroListener();
  }
  return true;
}

function attachGyroListener() {
  TOUR_360.gyroscopeEnabled = true;
  TOUR_360.mode = 'gyro';
  window.addEventListener('deviceorientation', handleGyro, true);
  // Calibrate yaw on next tap
  const calibrate = () => {
    const cur = window.school?.tour?.yaw || 0;
    TOUR_360.yawOffset = cur;
    document.removeEventListener('click', calibrate);
    showStatus('Gyroscope calibrated — tap to set forward', 'success');
  };
  document.addEventListener('click', calibrate, { once: true });
  showStatus('Gyroscope on — tap to set forward direction', 'info');
}

function disableGyroscope() {
  TOUR_360.gyroscopeEnabled = false;
  if (TOUR_360.mode === 'gyro') TOUR_360.mode = 'auto';
  window.removeEventListener('deviceorientation', handleGyro, true);
}

function handleGyro(e) {
  if (!TOUR_360.gyroscopeEnabled || !window.school?.tour?.active) return;
  // alpha = compass (0–360), beta = front-back tilt, gamma = left-right
  if (e.alpha == null) return;
  const t = window.school.tour;
  // Yaw = compass heading, invert to match screen-space direction
  t.targetYaw = (-e.alpha * Math.PI / 180) + TOUR_360.yawOffset;
  // Pitch = beta (front-back tilt of phone). Clamp when phone is upright.
  let beta = e.beta;
  if (beta > 90) beta = 90;
  if (beta < -90) beta = -90;
  t.targetPitch = (beta / 90) * 1.0;
}

/* ---------------- scroll / drag orbit (desktop fallback) ---------------- */
function attachScrollOrbit() {
  if (!window.renderer) {
    setTimeout(attachScrollOrbit, 80);
    return;
  }
  const el = window.renderer.domElement;

  let dragging = false;
  let lastX = 0, lastY = 0;

  el.addEventListener('wheel', e => {
    if (!window.school?.tour?.active) return;
    if (!TOUR_360.autoRotate && TOUR_360.mode === 'scroll') return;
    // Wheel = horizontal scroll rotates yaw, shift+wheel = pitch
    const t = window.school.tour;
    if (e.shiftKey) t.targetPitch -= e.deltaY * 0.001;
    else            t.targetYaw   -= e.deltaX * 0.001 + e.deltaY * 0.0008;
    e.preventDefault();
  }, { passive: false });

  el.addEventListener('pointerdown', e => {
    if (!window.school?.tour?.active) return;
    if (e.button !== 0) return;
    // Don't hijack hotspot clicks
    if (e.target.closest('.hotspot-overlay')) return;
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    TOUR_360.mode = 'drag';
    TOUR_360.autoRotate = false;
  });

  el.addEventListener('pointermove', e => {
    if (!dragging || !window.school?.tour?.active) return;
    const t = window.school.tour;
    t.targetYaw   -= (e.clientX - lastX) * TOUR_360.sensitivity;
    t.targetPitch -= (e.clientY - lastY) * TOUR_360.sensitivity;
    t.targetPitch = Math.max(-1.2, Math.min(1.2, t.targetPitch));
    lastX = e.clientX;
    lastY = e.clientY;
  });

  el.addEventListener('pointerup', () => {
    if (dragging) {
      dragging = false;
      TOUR_360.mode = 'auto';
      // Resume auto-rotate after 3s of no input
      clearTimeout(resumeTimer);
      resumeTimer = setTimeout(() => { TOUR_360.autoRotate = true; }, 3000);
    }
  });
}

let resumeTimer = null;

/* ---------------- hook tour enter to enable hotspots + controls ---------------- */
(function () {
  function ready(fn) {
    if (typeof window.enterTourMode === 'function' && window.school) fn();
    else setTimeout(() => ready(fn), 80);
  }
  ready(() => {
    const _origEnter = window.enterTourMode;
    window.enterTourMode = function (id) {
      const r = _origEnter(id);
      // Build hotspot meshes for every visible room
      setTimeout(() => {
        window.school.rooms.forEach(room => buildHotspotsForRoom(room));
        attachScrollOrbit();
        ensureTour360HUD();
        ensureTour360Sidebar();
        if (TOUR_360.autoRotate) showStatus('Auto-rotating — move mouse / scroll to take control', 'info');
      }, 200);
      return r;
    };

    // Auto-rotate injection into the tour loop
    const _origExit = window.exitTourMode;
    window.exitTourMode = function () {
      disableGyroscope();
      return _origExit();
    };

    // Click → hotspot hit-test (before door teleport)
    if (window.renderer) {
      window.renderer.domElement.addEventListener('click', e => {
        if (!window.school?.tour?.active) return;
        const hotspots = collectVisibleHotspotMeshes();
        if (!hotspots.length) return;
        const m = new THREE.Vector2(
          (e.clientX / window.renderer.domElement.clientWidth) * 2 - 1,
          -(e.clientY / window.renderer.domElement.clientHeight) * 2 + 1
        );
        window.raycaster?.setFromCamera(m, window.camera);
        if (!window.raycaster) return;
        const hit = window.raycaster.intersectObjects(hotspots, true)[0];
        if (hit) {
          let obj = hit.object;
          while (obj && !obj.userData?.hsId) obj = obj.parent;
          if (obj) activateHotspot(obj.userData.hsId);
        }
      }, true);  // capture so we run before door-click handler
    }
  });
})();

function collectVisibleHotspotMeshes() {
  const out = [];
  window.school.rooms.forEach(r => {
    if (r.group?.visible) {
      r.group.traverse(o => { if (o.userData?.isHotspot) out.push(o); });
    }
  });
  return out;
}

function activateHotspot(hsId) {
  let found = null, ownerRoom = null;
  window.school.rooms.forEach(r => {
    r.hotspots?.forEach(h => { if (h.id === hsId) { found = h; ownerRoom = r; } });
  });
  if (!found) return;
  switch (found.type) {
    case 'navigate':
      if (found.target?.roomId) {
        window.travelToRoom?.(found.target.roomId, { spawn: found.target.spawn });
      }
      break;
    case 'info':
      showHotspotModal(found.payload?.title || 'Info', found.payload?.text || '');
      break;
    case 'image':
      showHotspotModal(found.payload?.title || 'Image',
        '<img src="' + found.payload.url + '" style="max-width:100%;border-radius:8px;">');
      break;
    case 'audio':
      playHotspotAudio(found.payload?.url);
      break;
    case 'link':
      if (found.payload?.url) window.open(found.payload.url, '_blank');
      break;
    case 'video':
      showHotspotModal(found.payload?.title || 'Video',
        '<video src="' + found.payload.url + '" controls style="max-width:100%;"></video>');
      break;
  }
}

function showHotspotModal(title, html) {
  let modal = document.getElementById('hs-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'hs-modal';
    modal.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,.7);display:flex;align-items:center;' +
      'justify-content:center;z-index:50;backdrop-filter:blur(6px);';
    modal.onclick = e => { if (e.target === modal) modal.style.display = 'none'; };
    document.body.appendChild(modal);
  }
  modal.innerHTML =
    '<div style="background:#1a1a2a;color:#fff;padding:24px;border-radius:12px;' +
    'max-width:560px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,.6);">' +
    '<h3 style="margin:0 0 12px;color:#8f8eff;">' + escapeHtml(title) + '</h3>' +
    '<div style="line-height:1.5;">' + html + '</div>' +
    '<button onclick="document.getElementById(\'hs-modal\').style.display=\'none\'" ' +
    'style="margin-top:16px;background:#5D5CDE;color:#fff;border:0;padding:8px 18px;' +
    'border-radius:6px;cursor:pointer;">Close</button>' +
    '</div>';
  modal.style.display = 'flex';
}

function playHotspotAudio(url) {
  if (!url) return;
  const a = new Audio(url);
  a.play().catch(() => showStatus('Tap once to enable audio', 'info'));
}

/* ---------------- HUD ---------------- */
function ensureTour360HUD() {
  if (document.getElementById('tour360-hud')) return;
  const hud = document.createElement('div');
  hud.id = 'tour360-hud';
  hud.style.cssText =
    'position:fixed;top:14px;left:14px;display:flex;gap:8px;z-index:25;' +
    'background:rgba(0,0,0,.55);padding:8px 10px;border-radius:10px;backdrop-filter:blur(6px);' +
    'font-family:-apple-system,\'Segoe UI\',sans-serif;color:#fff;';
  hud.innerHTML =
    '<button id="t360-gyro"  class="t360-btn">📱 Gyro</button>' +
    '<button id="t360-auto"  class="t360-btn">🔄 Auto</button>' +
    '<button id="t360-list"  class="t360-btn">📍 Hotspots</button>' +
    '<button id="t360-exit"  class="t360-btn">✕ Exit</button>';
  document.body.appendChild(hud);

  const style = document.createElement('style');
  style.textContent =
    '.t360-btn{background:rgba(255,255,255,.1);color:#fff;border:1px solid #5D5CDE;' +
    'padding:6px 10px;border-radius:6px;cursor:pointer;font-size:12px;}' +
    '.t360-btn:hover{background:#5D5CDE;} .t360-btn.active{background:#5D5CDE;}';
  document.head.appendChild(style);

  document.getElementById('t360-gyro').onclick = () => {
    if (TOUR_360.gyroscopeEnabled) {
      disableGyroscope();
      document.getElementById('t360-gyro').classList.remove('active');
    } else {
      enableGyroscope();
      document.getElementById('t360-gyro').classList.add('active');
    }
  };
  document.getElementById('t360-auto').onclick = () => {
    TOUR_360.autoRotate = !TOUR_360.autoRotate;
    document.getElementById('t360-auto').classList.toggle('active', TOUR_360.autoRotate);
  };
  document.getElementById('t360-list').onclick = showHotspotList;
  document.getElementById('t360-exit').onclick = () => window.exitTourMode?.();
  document.getElementById('t360-auto').classList.add('active');
}

function showHotspotList() {
  const room = window.getRoomById?.(window.school.tour.currentRoomId);
  if (!room?.hotspots?.length) {
    showStatus('No hotspots in this room', 'info');
    return;
  }
  showHotspotModal('Hotspots — ' + room.name,
    room.hotspots.map(h =>
      '<div style="padding:8px 0;border-bottom:1px solid #333;">' +
      '<strong>' + escapeHtml(h.label) + '</strong> (' + h.type + ')' +
      '<button onclick="activateHotspot(\'' + h.id + '\')" style="float:right;background:#5D5CDE;color:#fff;border:0;padding:4px 10px;border-radius:4px;cursor:pointer;">Go</button>' +
      '</div>'
    ).join(''));
}

/* ---------------- editor sidebar (place hotspots) ---------------- */
function ensureTour360Sidebar() {
  if (document.getElementById('tour360-section')) return;
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;

  const wrap = document.createElement('div');
  wrap.id = 'tour360-section';
  wrap.innerHTML = `
    <div class="section-header" onclick="toggleSection(this)">
      <span>📍 360 Tour &amp; Hotspots</span><span class="arrow">▼</span>
    </div>
    <div class="section-body">
      <div class="block">
        <h4>Add hotspot (active room)</h4>
        <select id="hsType">
          <option value="navigate">Navigate to room</option>
          <option value="info">Info popup</option>
          <option value="image">Image popup</option>
          <option value="audio">Audio</option>
          <option value="link">External link</option>
          <option value="video">Video popup</option>
        </select>
        <input type="text" id="hsLabel" placeholder="Label (e.g. Go to Kitchen)"
               style="width:100%;margin-top:4px;padding:4px;">
        <div id="hsNavRow">
          <select id="hsTargetRoom"><option value="">— target —</option></select>
        </div>
        <div id="hsPayloadRow" style="display:none;">
          <input type="text" id="hsTitle" placeholder="Popup title"
                 style="width:100%;margin-top:4px;padding:4px;">
          <textarea id="hsText" placeholder="Popup text / URL"
                    style="width:100%;margin-top:4px;padding:4px;height:50px;"></textarea>
        </div>
        <button class="btn btn-primary" onclick="placeHotspotInActiveRoom()" style="width:100%;margin-top:6px;">
          📍 Place at camera target
        </button>
        <p style="font-size:10px;color:#888;margin-top:4px;">
          Hotspot appears at the point your camera is currently looking at.
        </p>
      </div>

      <div class="block">
        <h4>Existing hotspots</h4>
        <div id="hsList" style="font-size:11px;max-height:160px;overflow:auto;"></div>
      </div>
    </div>
  `;
  sidebar.appendChild(wrap);

  // Toggle payload visibility
  document.getElementById('hsType').onchange = e => {
    const isNav = e.target.value === 'navigate';
    document.getElementById('hsNavRow').style.display = isNav ? 'block' : 'none';
    document.getElementById('hsPayloadRow').style.display = isNav ? 'none' : 'block';
  };
  refreshHotspotUI();
}

function refreshHotspotUI() {
  const targetSel = document.getElementById('hsTargetRoom');
  if (!targetSel) return;
  const rooms = window.school?.rooms || [];
  targetSel.innerHTML = '<option value="">— target —</option>' +
    rooms.filter(r => r.id !== window.school?.activeRoomId)
      .map(r => '<option value="' + r.id + '">' + escapeHtml(r.name) + '</option>')
      .join('');

  const list = document.getElementById('hsList');
  const room = window.getActiveRoom?.();
  if (!room?.hotspots?.length) {
    list.innerHTML = '<div style="color:#999;">No hotspots yet.</div>';
    return;
  }
  list.innerHTML = room.hotspots.map(h =>
    '<div style="padding:6px 0;border-bottom:1px solid #333;">' +
    '<strong>' + escapeHtml(h.label) + '</strong> <span style="opacity:.6;">(' + h.type + ')</span><br>' +
    '<button onclick="removeHotspotFromActive(\'' + h.id + '\')" style="font-size:10px;background:#444;color:#fff;border:0;padding:2px 6px;border-radius:3px;cursor:pointer;margin-top:4px;">✕ remove</button>' +
    '</div>'
  ).join('');
}

function placeHotspotInActiveRoom() {
  const room = window.getActiveRoom?.();
  if (!room) { showStatus('Open a room first', 'error'); return; }

  // Project a point 3m in front of the camera
  const dir = new THREE.Vector3();
  window.camera.getWorldDirection(dir);
  const world = window.camera.position.clone().add(dir.multiplyScalar(3));
  const local = world.sub(room.offset);

  const type = document.getElementById('hsType').value;
  const label = document.getElementById('hsLabel').value || 'Hotspot';
  let def = {
    position: [local.x, Math.max(1.0, local.y), local.z],
    type,
    label
  };
  if (type === 'navigate') {
    const targetRoomId = document.getElementById('hsTargetRoom').value;
    if (!targetRoomId) { showStatus('Pick a target room', 'error'); return; }
    def.target = { roomId: targetRoomId, spawn: { x: 0, y: 1.65, z: 0, lookX: 0, lookZ: -1 } };
  } else {
    def.payload = {
      title: document.getElementById('hsTitle').value || label,
      text: document.getElementById('hsText').value
    };
  }
  addHotspot(room.id, def);
  refreshHotspotUI();
  showStatus('Hotspot placed: ' + label, 'success');
}

function removeHotspotFromActive(hsId) {
  const room = window.getActiveRoom?.();
  if (!room) return;
  removeHotspot(room.id, hsId);
  refreshHotspotUI();
}

/* ---------------- auto-rotate injection into tour loop ---------------- */
(function () {
  // The school-tour.js loop reads targetYaw/targetPitch each frame.
  // Inject a small pre-step that nudges targetYaw forward when autoRotate is on
  // and the user isn't actively dragging/gyro.
  function ready(fn) {
    if (window.school?.tour && typeof window.requestAnimationFrame === 'function') fn();
    else setTimeout(() => ready(fn), 80);
  }
  ready(() => {
    const tick = () => {
      requestAnimationFrame(tick);
      if (!window.school?.tour?.active) return;
      if (!TOUR_360.autoRotate) return;
      if (TOUR_360.mode === 'drag' || TOUR_360.mode === 'gyro') return;
      window.school.tour.targetYaw += TOUR_360.autoRotateSpeed * 0.016;
    };
    tick();
  });
})();

/* ---------------- keep sidebar synced with active room ---------------- */
(function () {
  function ready(fn) {
    if (typeof window.setActiveRoom === 'function' && typeof TOUR_360 !== 'undefined') fn();
    else setTimeout(() => ready(fn), 80);
  }
  ready(() => {
    const _orig = window.setActiveRoom;
    window.setActiveRoom = function (id) {
      _orig(id);
      setTimeout(refreshHotspotUI, 120);
    };
  });
})();

/* ---------------- init ---------------- */
(function () {
  function whenReady(fn) {
    if (window.scene && typeof window.getActiveRoom === 'function') fn();
    else setTimeout(() => whenReady(fn), 80);
  }
  whenReady(() => {
    ensureTour360Sidebar();
    // expose for inline onclick handlers
    window.placeHotspotInActiveRoom = placeHotspotInActiveRoom;
    window.removeHotspotFromActive = removeHotspotFromActive;
    window.activateHotspot = activateHotspot;
  });
})();
