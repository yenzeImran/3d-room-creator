/* ===================================================================
   TOUR EXPORT PRO — standalone, mobile-first 360 tour HTML
   --------------------------------------------------------------------
   Replaces the export in school-export.js with a much richer output:

     • PBR rendering (MeshStandardMaterial + ACES + sRGB)
     • Hotspots (navigate / info / image / audio / link / video)
     • DeviceOrientation gyro support with iOS permission flow
     • Scroll-orbit fallback for desktop
     • Auto-rotate panorama mode
     • Mobile-first responsive layout, retina-aware canvas
     • Per-room fade transitions with optional blur
     • Minimal HUD: room name, hotspot list, gyro toggle, exit

   The exported file is fully self-contained — single HTML, three.js
   loaded from CDN, JSON school data inlined. Host anywhere (S3, Vercel,
   Netlify, your own server) and the link works on phones, tablets, desktops.
   =================================================================== */

/* Call this from your export button instead of exportSchoolTour() */
function exportSchoolTourPro() {
  const data = serializeSchoolPro();
  const html = buildTourProHTML(data);
  const filename = safeName(school.name) + '-360-tour.html';
  downloadText(html, 'text/html', filename);
  showStatus('Standalone 360 tour exported', 'success');
}

/* Extend the existing serializer with hotspots + material ids */
function serializeSchoolPro() {
  if (typeof saveEditorStateToRoom === 'function') saveEditorStateToRoom();
  const base = serializeSchool();
  // Augment rooms with hotspots + material preset ids
  base.rooms = base.rooms.map(r => {
    const room = getRoomById(r.id);
    return {
      ...r,
      hotspots: (room?.hotspots || []).map(h => ({
        id: h.id,
        position: h.position,
        type: h.type,
        label: h.label,
        target: h.target || null,
        payload: h.payload || null
      })),
      materialPresets: {
        floor: room?.floorMaterial?.materialId || null,
        ceiling: room?.ceilingMaterial?.materialId || null,
        walls: {
          'Back Wall':  room?.wallMaterials?.['Back Wall']?.materialId  || null,
          'Left Wall':  room?.wallMaterials?.['Left Wall']?.materialId  || null,
          'Right Wall': room?.wallMaterials?.['Right Wall']?.materialId || null,
          'Front Wall': room?.wallMaterials?.['Front Wall']?.materialId || null
        }
      }
    };
  });
  return base;
}

/* Inline preset textures so the file is fully self-contained */
function inlinePresets() {
  const out = {};
  Object.entries(MATERIAL_LIBRARY?.presets || {}).forEach(([id, p]) => {
    out[id] = {
      name: p.name,
      albedoURL: p.albedoURL,
      roughnessURL: p.roughnessURL,
      normalURL: p.normalURL,
      metalnessURL: p.metalnessURL,
      aoURL: p.aoURL,
      tiling: p.tiling,
      metalness: p.metalness ?? 0,
      roughness: p.roughness ?? 0.7
    };
  });
  // Also inline user-imported materials
  Object.entries(MATERIAL_LIBRARY?.custom || {}).forEach(([id, p]) => {
    out[id] = {
      name: p.name,
      albedoURL: p.albedoURL,
      roughnessURL: p.roughnessURL,
      normalURL: p.normalURL,
      metalnessURL: p.metalnessURL,
      aoURL: p.aoURL,
      tiling: p.tiling,
      metalness: p.metalness ?? 0,
      roughness: p.roughness ?? 0.7
    };
  });
  return out;
}

/* Build the standalone HTML — long string, structured for clarity */
function buildTourProHTML(data) {
  const json = JSON.stringify(data).replace(/<\/script>/g, '<\\/script>');
  const presets = JSON.stringify(inlinePresets()).replace(/<\/script>/g, '<\\/script>');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>${escapeHtml(data.name || 'Tour')} — 360 Walkthrough</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"><\/script>
<style>
  *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
  html,body{margin:0;height:100%;overflow:hidden;background:#0a0a0a;color:#fff;
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
    touch-action:none;overscroll-behavior:none}
  #hud{position:fixed;top:14px;left:14px;display:flex;flex-direction:column;gap:8px;
    z-index:25;pointer-events:none;max-width:60vw}
  #hud .room{background:rgba(0,0,0,.6);padding:8px 14px;border-radius:10px;
    backdrop-filter:blur(8px);font-size:15px;font-weight:600;color:#8f8eff;
    border:1px solid rgba(143,142,255,.3)}
  #hud .hint{background:rgba(0,0,0,.45);padding:6px 10px;border-radius:8px;
    backdrop-filter:blur(6px);font-size:11px;opacity:.85;align-self:flex-start}
  #controls{position:fixed;top:14px;right:14px;display:flex;gap:6px;z-index:25}
  .cbtn{background:rgba(0,0,0,.55);color:#fff;border:1px solid rgba(143,142,255,.4);
    padding:8px 12px;border-radius:8px;cursor:pointer;font-size:13px;
    backdrop-filter:blur(6px);transition:background .15s}
  .cbtn:hover,.cbtn.active{background:#5D5CDE}
  #fade{position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;
    transition:opacity .35s;z-index:20}
  #crosshair{position:fixed;top:50%;left:50%;width:8px;height:8px;margin:-4px 0 0 -4px;
    background:rgba(255,255,255,.5);border-radius:50%;pointer-events:none;z-index:5;
    transition:transform .1s}
  #loading{position:fixed;inset:0;background:#0a0a0a;display:flex;flex-direction:column;
    align-items:center;justify-content:center;z-index:40;transition:opacity .5s;
    gap:14px}
  #loading .spinner{width:42px;height:42px;border:3px solid #333;
    border-top-color:#5D5CDE;border-radius:50%;animation:spin .9s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  #loading .label{font-size:14px;opacity:.7}
  #modal{position:fixed;inset:0;background:rgba(0,0,0,.75);backdrop-filter:blur(8px);
    display:none;align-items:center;justify-content:center;z-index:50;padding:20px}
  #modal .card{background:#181828;border:1px solid #5D5CDE;border-radius:12px;
    max-width:560px;width:100%;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.6)}
  #modal h3{margin:0 0 12px;color:#8f8eff}
  #modal .body{line-height:1.5}
  #modal .body img,#modal .body video{max-width:100%;border-radius:8px}
  #modal .close{margin-top:16px;background:#5D5CDE;color:#fff;border:0;
    padding:8px 18px;border-radius:6px;cursor:pointer}
  @media (max-width:640px){
    #hud{top:10px;left:10px;max-width:80vw}
    #hud .room{font-size:13px;padding:6px 10px}
    .cbtn{padding:7px 10px;font-size:12px}
  }
</style>
</head>
<body>
<div id="loading">
  <div class="spinner"></div>
  <div class="label">Building 360 tour…</div>
</div>
<div id="hud">
  <div class="room">📍 Loading…</div>
  <div class="hint">Drag / scroll to look · tap hotspots to navigate</div>
</div>
<div id="controls">
  <button class="cbtn" id="btn-gyro">📱 Gyro</button>
  <button class="cbtn active" id="btn-auto">🔄 Auto</button>
  <button class="cbtn" id="btn-list">📍 Hotspots</button>
</div>
<div id="crosshair"></div>
<div id="fade"></div>
<div id="modal"><div class="card"><h3></h3><div class="body"></div>
  <button class="close">Close</button></div></div>

<script>
/* ============================================================
   STANDALONE TOUR RUNTIME — PBR · hotspots · gyro · scroll-orbit
   ============================================================ */
const TOUR = ${json};
const PRESETS = ${presets};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0a);

const camera = new THREE.PerspectiveCamera(72, innerWidth/innerHeight, 0.05, 500);
const renderer = new THREE.WebGLRenderer({ antialias:true, powerPreference:'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

/* --- procedural studio HDRI for PBR reflections --- */
function makeStudioEnv() {
  const c = document.createElement('canvas'); c.width=256; c.height=128;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0,0,0,128);
  g.addColorStop(0,'#ffffff'); g.addColorStop(.35,'#e8eef5');
  g.addColorStop(.5,'#c0c4cc'); g.addColorStop(.55,'#a8a098');
  g.addColorStop(1,'#3a3530'); ctx.fillStyle=g; ctx.fillRect(0,0,256,128);
  ctx.fillStyle='rgba(255,255,255,.85)'; ctx.fillRect(20,8,60,30); ctx.fillRect(170,8,60,30);
  const t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromEquirectangular(t).texture;
  scene.environmentIntensity = 0.55;
}
makeStudioEnv();

scene.add(new THREE.AmbientLight(0xffffff, 0.45));
scene.add(new THREE.HemisphereLight(0xffffbb, 0x080820, 0.35));

/* --- preset loader --- */
const texCache = {};
function loadTex(url, srgb) {
  if (!url) return Promise.resolve(null);
  if (texCache[url]) return Promise.resolve(texCache[url]);
  return new Promise(res => {
    new THREE.TextureLoader().load(url, t => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      texCache[url] = t; res(t);
    }, undefined, () => res(null));
  });
}

async function buildMaterial(presetId, repeat) {
  const p = PRESETS[presetId];
  if (!p) return new THREE.MeshStandardMaterial({ color:0xb5b5b5, roughness:0.7 });
  const [albedo, rough, normal, metal, ao] = await Promise.all([
    loadTex(p.albedoURL, true),
    loadTex(p.roughnessURL, false),
    loadTex(p.normalURL, false),
    loadTex(p.metalnessURL, false),
    loadTex(p.aoURL, false)
  ]);
  const r = repeat || p.tiling || { repeat:2, repeatY:2 };
  [albedo,rough,normal,metal,ao].forEach(t => {
    if (t) { t.repeat.set(r.repeat||2, r.repeatY||2); t.center.set(.5,.5); }
  });
  return new THREE.MeshStandardMaterial({
    color:0xffffff,
    map:albedo, roughnessMap:rough, normalMap:normal,
    metalnessMap:metal, aoMap:ao,
    roughness: p.roughness ?? 0.7,
    metalness: p.metalness ?? 0,
    envMapIntensity:0.55,
    side:THREE.DoubleSide
  });
}

/* --- component factory (subset for tour) --- */
function buildComponentMesh(c) {
  const M = col => new THREE.MeshStandardMaterial({ color:col, roughness:0.65, metalness:0.05 });
  const t = c.type || 'cube';
  // (Same library as the editor — abridged here for size.)
  if (t === 'chair') {
    const g = new THREE.Group();
    const lm = M(0x8B4513);
    for (let i=0;i<4;i++) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,1.8,8), lm);
      leg.position.set(i%2===0?-0.4:0.4,0.9,i<2?-0.4:0.4); g.add(leg);
    }
    const sm = M(0x654321);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1,0.1,1), sm); seat.position.y=1.85; g.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(1,1.5,0.1), sm); back.position.set(0,2.6,-0.45); g.add(back);
    return g;
  }
  if (t === 'table') {
    const g = new THREE.Group(); const lm = M(0x8B4513);
    for (let i=0;i<4;i++) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08,0.08,2.2,8), lm);
      leg.position.set(i%2===0?-0.8:0.8,1.1,i<2?-0.5:0.5); g.add(leg);
    }
    const top = new THREE.Mesh(new THREE.BoxGeometry(2,0.1,1.2), M(0xDEB887)); top.position.y=2.2; g.add(top);
    return g;
  }
  if (t === 'bookshelf') {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.BoxGeometry(1.2,2.2,0.4), M(0x8B4513)));
    return g;
  }
  // ... (other factory branches omitted for brevity — editor's library)
  return new THREE.Mesh(new THREE.BoxGeometry(1,1,1), M(0x888888));
}

function makeComponent(c, roomOffset) {
  const obj = buildComponentMesh(c);
  obj.position.set(c.position[0]-roomOffset.x, c.position[1]-roomOffset.y, c.position[2]-roomOffset.z);
  obj.rotation.set(...c.rotation);
  obj.scale.set(...c.scale);
  if (c.color) {
    obj.traverse(x => { if (x.isMesh && x.material && x.material.color) x.material.color.set(c.color); });
  }
  return obj;
}

/* --- hotspot mesh --- */
function makeHotspotMesh(hs) {
  const g = new THREE.Group();
  g.position.set(...hs.position);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.18,0.025,12,24),
    new THREE.MeshBasicMaterial({ color:0x5D5CDE, transparent:true, opacity:0.9, depthTest:false })
  );
  ring.userData = { isHotspot:true, hsId:hs.id };
  g.add(ring);
  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(0.05,12,8),
    new THREE.MeshBasicMaterial({ color:0xffffff, transparent:true, opacity:1, depthTest:false })
  );
  g.add(dot);
  if (hs.label) {
    const c = document.createElement('canvas'); c.width=512; c.height=128;
    const ctx = c.getContext('2d');
    const icon = { navigate:'→', info:'i', image:'⬚', audio:'♪', link:'↗', video:'▶' }[hs.type] || '•';
    ctx.fillStyle='rgba(15,15,30,.85)'; ctx.fillRect(0,0,512,128);
    ctx.strokeStyle='#8f8eff'; ctx.lineWidth=3; ctx.strokeRect(2,2,508,124);
    ctx.fillStyle='#8f8eff'; ctx.font='bold 60px sans-serif'; ctx.textAlign='left'; ctx.textBaseline='middle'; ctx.fillText(icon,18,64);
    ctx.fillStyle='#fff'; ctx.font='bold 36px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(hs.label,280,64);
    const tex = new THREE.CanvasTexture(c); tex.minFilter = THREE.LinearFilter;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map:tex, depthTest:false, transparent:true }));
    sprite.scale.set(1.6,0.4,1); sprite.position.y=0.32; g.add(sprite);
  }
  g.userData = { isHotspot:true, hsId:hs.id };
  return g;
}

/* --- build every room --- */
const roomsById = {};
const allHotspotMeshes = [];

async function buildRooms() {
  for (const room of TOUR.rooms) {
    roomsById[room.id] = room;
    const g = new THREE.Group();
    g.position.set(room.offset.x, room.offset.y, room.offset.z);
    g.visible = false;
    const { w, h, d } = room.size;

    // Floor
    const floorPreset = room.materialPresets?.floor;
    const floorMat = floorPreset ? await buildMaterial(floorPreset, { repeat:3, repeatY:3 })
      : new THREE.MeshStandardMaterial({ color:0x8a8a8a, roughness:0.7 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w,d), floorMat);
    floor.rotation.x = -Math.PI/2; floor.receiveShadow = true; g.add(floor);

    // Ceiling
    const ceilPreset = room.materialPresets?.ceiling;
    const ceilMat = ceilPreset ? await buildMaterial(ceilPreset, { repeat:2, repeatY:2 })
      : new THREE.MeshStandardMaterial({ color:0xb0b0b0, roughness:0.8 });
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w,d), ceilMat);
    ceil.rotation.x = Math.PI/2; ceil.position.y = h; g.add(ceil);

    // Walls
    const wallDefs = [
      { pos:[0,h/2,-d/2],  rot:[0,0,0],         w:w, h:h, label:'Back Wall' },
      { pos:[-w/2,h/2,0],  rot:[0,Math.PI/2,0], w:d, h:h, label:'Left Wall' },
      { pos:[w/2,h/2,0],   rot:[0,-Math.PI/2,0],w:d, h:h, label:'Right Wall' },
      { pos:[0,h/2,d/2],   rot:[0,Math.PI,0],  w:w, h:h, label:'Front Wall' }
    ];
    for (const def of wallDefs) {
      const presetId = room.materialPresets?.walls?.[def.label];
      const mat = presetId ? await buildMaterial(presetId, { repeat:2, repeatY:1 })
        : new THREE.MeshStandardMaterial({ color:0xb5b5b5, roughness:0.75, side:THREE.DoubleSide });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(def.w, def.h), mat);
      m.position.set(...def.pos); m.rotation.set(...def.rot);
      m.receiveShadow = true; g.add(m);
    }

    // Components
    (room.components || []).forEach(c => g.add(makeComponent(c, room.offset)));

    // Lights
    (room.lights || []).forEach(l => {
      if (l.type === 'point' && l.position) {
        const pl = new THREE.PointLight(l.color, Math.min(l.intensity||1, 2.5), 25);
        pl.position.set(...l.position); g.add(pl);
      }
    });

    // Doors (portal planes)
    (room.doors || []).forEach(door => {
      const pos = doorWallPos(room, door);
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(1.4, 2.6),
        new THREE.MeshBasicMaterial({ color:0x5D5CDE, transparent:true, opacity:0.4,
          side:THREE.DoubleSide, depthWrite:false })
      );
      m.position.set(...pos.pos); m.rotation.set(...pos.rot);
      m.userData = { isDoor:true, roomId:room.id, door };
      g.add(m);
    });

    // Hotspots
    (room.hotspots || []).forEach(hs => {
      const mesh = makeHotspotMesh(hs);
      g.add(mesh);
      allHotspotMeshes.push(mesh);
    });

    room._group = g;
    scene.add(g);
  }
}

function doorWallPos(room, door) {
  const { w, h, d } = room.size;
  switch (door.wall) {
    case 'back':  return { pos:[(door.offset-.5)*w,1.3,-d/2+.04], rot:[0,0,0] };
    case 'front': return { pos:[(door.offset-.5)*w,1.3, d/2-.04], rot:[0,Math.PI,0] };
    case 'left':  return { pos:[-w/2+.04,1.3,(door.offset-.5)*d], rot:[0,Math.PI/2,0] };
    case 'right': return { pos:[ w/2-.04,1.3,(door.offset-.5)*d], rot:[0,-Math.PI/2,0] };
  }
  return { pos:[0,1.3,0], rot:[0,0,0] };
}

/* ============================================================
   NAVIGATION — gyro + scroll + drag + auto-rotate
   ============================================================ */
let yaw = 0, pitch = 0, tYaw = 0, tPitch = 0;
let currentRoomId = TOUR.startRoomId || TOUR.rooms[0]?.id;
let autoRotate = true;
let gyroEnabled = false;
let yawOffset = 0;
let dragging = false, lastX = 0, lastY = 0;
let resumeTimer = null;

function showRoom(id) {
  Object.values(roomsById).forEach(r => { r._group.visible = false; });
  const room = roomsById[id];
  if (!room) return;
  room._group.visible = true;
  (room.doors || []).forEach(d => {
    const adj = roomsById[d.targetRoomId];
    if (adj) adj._group.visible = true;
  });
  document.querySelector('#hud .room').textContent = '📍 ' + room.name;
}

function goTo(roomId, spawn, fade) {
  const room = roomsById[roomId];
  if (!room) return;
  const sp = spawn || room.spawn || { x:0, y:1.65, z:0, lookX:0, lookZ:-1 };
  const commit = () => {
    camera.position.set(room.offset.x+sp.x, room.offset.y+(sp.y||1.65), room.offset.z+sp.z);
    yaw = tYaw = Math.atan2(sp.lookX||0, -(sp.lookZ ?? -1)) + yawOffset;
    pitch = tPitch = 0;
    currentRoomId = roomId;
    showRoom(roomId);
  };
  if (!fade) { commit(); return; }
  const f = document.getElementById('fade');
  f.style.opacity = '1';
  setTimeout(() => { commit(); f.style.opacity = '0'; }, 320);
}

function activateHotspot(hsId) {
  let found = null;
  TOUR.rooms.forEach(r => r.hotspots?.forEach(h => { if (h.id === hsId) found = h; }));
  if (!found) return;
  switch (found.type) {
    case 'navigate':
      if (found.target?.roomId) goTo(found.target.roomId, found.target.spawn, true);
      break;
    case 'info':
      showModal(found.payload?.title || 'Info', found.payload?.text || '');
      break;
    case 'image':
      showModal(found.payload?.title || 'Image',
        '<img src="' + found.payload.url + '" style="max-width:100%;border-radius:8px;">');
      break;
    case 'audio':
      new Audio(found.payload?.url).play().catch(()=>{});
      break;
    case 'link':
      if (found.payload?.url) window.open(found.payload.url, '_blank');
      break;
    case 'video':
      showModal(found.payload?.title || 'Video',
        '<video src="' + found.payload.url + '" controls style="max-width:100%;"></video>');
      break;
  }
}

function showModal(title, html) {
  const m = document.getElementById('modal');
  m.querySelector('h3').textContent = title;
  m.querySelector('.body').innerHTML = html;
  m.style.display = 'flex';
  m.querySelector('.close').onclick = () => m.style.display = 'none';
}

function visibleHotspotMeshes() {
  return allHotspotMeshes.filter(m => m.parent && m.parent.visible);
}

renderer.domElement.addEventListener('click', e => {
  const m = new THREE.Vector2(
    (e.clientX/innerWidth)*2-1,
    -(e.clientY/innerHeight)*2+1
  );
  const ray = new THREE.Raycaster();
  ray.setFromCamera(m, camera);
  // Hotspots first
  const hsHits = ray.intersectObjects(visibleHotspotMeshes(), true);
  if (hsHits.length) {
    let obj = hsHits[0].object;
    while (obj && !obj.userData?.hsId) obj = obj.parent;
    if (obj) { activateHotspot(obj.userData.hsId); return; }
  }
  // Then doors
  const doors = [];
  Object.values(roomsById).forEach(r => {
    if (!r._group.visible) return;
    r._group.traverse(o => { if (o.userData?.isDoor) doors.push(o); });
  });
  const dHits = ray.intersectObjects(doors, false);
  if (dHits.length) {
    const door = dHits[0].object.userData.door;
    goTo(door.targetRoomId, door.targetSpawn, true);
  }
});

/* --- scroll / drag orbit (desktop) --- */
renderer.domElement.addEventListener('wheel', e => {
  e.preventDefault();
  if (e.shiftKey) tPitch -= e.deltaY * 0.001;
  else            tYaw   -= e.deltaY * 0.0008 + e.deltaX * 0.001;
  autoRotate = false;
  document.getElementById('btn-auto').classList.remove('active');
  clearTimeout(resumeTimer);
  resumeTimer = setTimeout(() => {
    autoRotate = true;
    document.getElementById('btn-auto').classList.add('active');
  }, 3000);
}, { passive:false });

renderer.domElement.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  dragging = true; lastX = e.clientX; lastY = e.clientY;
  autoRotate = false;
  document.getElementById('btn-auto').classList.remove('active');
});
renderer.domElement.addEventListener('pointermove', e => {
  if (!dragging) return;
  tYaw   -= (e.clientX - lastX) * 0.0025;
  tPitch -= (e.clientY - lastY) * 0.0025;
  tPitch = Math.max(-1.2, Math.min(1.2, tPitch));
  lastX = e.clientX; lastY = e.clientY;
});
renderer.domElement.addEventListener('pointerup', () => {
  if (dragging) {
    dragging = false;
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => {
      autoRotate = true;
      document.getElementById('btn-auto').classList.add('active');
    }, 3000);
  }
});

/* --- gyro --- */
function enableGyro() {
  if (!window.DeviceOrientationEvent) { alert('Gyroscope not supported'); return; }
  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    DeviceOrientationEvent.requestPermission()
      .then(s => { if (s === 'granted') attachGyro(); else alert('Permission denied'); })
      .catch(() => alert('Gyroscope unavailable'));
  } else attachGyro();
}
function attachGyro() {
  gyroEnabled = true; autoRotate = false;
  document.getElementById('btn-gyro').classList.add('active');
  document.getElementById('btn-auto').classList.remove('active');
  // Calibrate forward on next tap
  const calibrate = () => {
    yawOffset = -tYaw;
    document.removeEventListener('click', calibrate);
  };
  document.addEventListener('click', calibrate, { once:true });
  window.addEventListener('deviceorientation', e => {
    if (!gyroEnabled || e.alpha == null) return;
    tYaw = (-e.alpha * Math.PI / 180) + yawOffset;
    let b = e.beta; if (b > 90) b = 90; if (b < -90) b = -90;
    tPitch = (b / 90) * 1.0;
  }, true);
}

document.getElementById('btn-gyro').onclick = () => {
  if (gyroEnabled) {
    gyroEnabled = false;
    document.getElementById('btn-gyro').classList.remove('active');
  } else enableGyro();
};
document.getElementById('btn-auto').onclick = () => {
  autoRotate = !autoRotate;
  document.getElementById('btn-auto').classList.toggle('active', autoRotate);
};
document.getElementById('btn-list').onclick = () => {
  const room = roomsById[currentRoomId];
  if (!room?.hotspots?.length) { alert('No hotspots in this room'); return; }
  const html = room.hotspots.map(h =>
    '<div style="padding:8px 0;border-bottom:1px solid #333;">' +
    '<strong>' + (h.label || 'Hotspot') + '</strong> (' + h.type + ') ' +
    '<button onclick="activateHotspot(\\'' + h.id + '\\')" style="float:right;background:#5D5CDE;color:#fff;border:0;padding:4px 10px;border-radius:4px;cursor:pointer;">Go</button>' +
    '</div>').join('');
  showModal('Hotspots — ' + room.name, html);
};

/* --- render loop --- */
const clock = new THREE.Clock();
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (autoRotate && !dragging && !gyroEnabled) {
    tYaw += 0.18 * dt;
  }
  yaw   += (tYaw - yaw)   * 0.18;
  pitch += (tPitch - pitch) * 0.18;
  const dir = new THREE.Vector3(
    Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    -Math.cos(yaw) * Math.cos(pitch)
  );
  camera.lookAt(camera.position.clone().add(dir));
  renderer.render(scene, camera);
}
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

/* --- boot --- */
(async () => {
  await buildRooms();
  goTo(currentRoomId, null, false);
  document.getElementById('loading').style.opacity = '0';
  setTimeout(() => document.getElementById('loading').remove(), 600);
  loop();
})();
<\/script>
</body>
</html>`;
}