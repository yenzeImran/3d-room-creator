/* ===================================================================
   SCHOOL EXPORT — JSON + standalone self-contained 360 HTML tour
   =================================================================== */

function exportSchoolJSON() {
  const data = serializeSchool();
  downloadText(JSON.stringify(data, null, 2), 'application/json', safeName(school.name) + '.json');
  showStatus('School saved as JSON', 'success');
}

function importSchoolJSON(file) {
  if (!file) return;
  const r = new FileReader();
  r.onload = e => {
    try {
      loadSchoolFromJSON(JSON.parse(e.target.result));
      showStatus('School imported', 'success');
    } catch (err) { showStatus('Import failed: ' + err.message, 'error'); }
  };
  r.readAsText(file);
}

function exportSchoolTour() {
  const data = serializeSchool();
  const html = buildSchoolTourHTML(data);
  downloadText(html, 'text/html', safeName(school.name) + '-tour.html');
  showStatus('Standalone 360 tour exported', 'success');
}

function safeName(s) {
  return String(s || 'school').replace(/[^a-z0-9]+/gi, '-').toLowerCase().replace(/^-|-$/g, '');
}

function downloadText(content, mime, filename) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ---------- Standalone tour HTML ---------- */

function buildSchoolTourHTML(data) {
  const json = JSON.stringify(data).replace(/<\/script>/g, '<\\/script>');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(data.name || 'School')} — 360 Tour</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"><\/script>
<style>
  html,body{margin:0;height:100%;overflow:hidden;background:#111;color:#fff;font-family:-apple-system,'Segoe UI',sans-serif}
  #hud{position:fixed;top:14px;left:14px;background:rgba(0,0,0,.55);padding:10px 16px;border-radius:10px;z-index:10;backdrop-filter:blur(6px);pointer-events:none}
  #hud .room{font-size:15px;font-weight:600;color:#8f8eff}
  #hud .hint{font-size:11px;opacity:.7;margin-top:3px}
  #fade{position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;transition:opacity .3s;z-index:20}
  #crosshair{position:fixed;top:50%;left:50%;width:6px;height:6px;margin:-3px 0 0 -3px;background:rgba(255,255,255,.7);border-radius:50%;pointer-events:none;z-index:5}
  #loading{position:fixed;inset:0;background:#111;color:#fff;display:flex;align-items:center;justify-content:center;font-size:18px;z-index:30;transition:opacity .5s}
</style>
</head>
<body>
<div id="hud"><div class="room">📍 Loading…</div><div class="hint">WASD walk · drag look · click doors to travel</div></div>
<div id="crosshair"></div>
<div id="fade"></div>
<div id="loading">Building school…</div>
<script>
const TOUR = ${json};
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0a);
const camera = new THREE.PerspectiveCamera(75, innerWidth/innerHeight, 0.05, 500);
const renderer = new THREE.WebGLRenderer({ antialias:true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 0.6));
scene.add(new THREE.HemisphereLight(0xffffbb, 0x080820, 0.5));

const roomsById = {}, doorMeshes = [];
const loader = new THREE.TextureLoader();
function tex(url) {
  if (!url) return null;
  const t = loader.load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/* =========================================================
   COMPONENT FACTORIES (mirror the editor's library + extras)
   ========================================================= */
function buildComponentMesh(c) {
  const t = c.type || 'cube';
  const M = (color) => new THREE.MeshLambertMaterial({ color });

  /* --- original library --- */
  if (t === 'chair') {
    const g = new THREE.Group();
    const lm = M(0x8B4513);
    for (let i = 0; i < 4; i++) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.8, 8), lm);
      leg.position.set(i % 2 === 0 ? -0.4 : 0.4, 0.9, i < 2 ? -0.4 : 0.4);
      g.add(leg);
    }
    const sm = M(0x654321);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1, 0.1, 1), sm); seat.position.y = 1.85; g.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(1, 1.5, 0.1), sm); back.position.set(0, 2.6, -0.45); g.add(back);
    return g;
  }
  if (t === 'table') {
    const g = new THREE.Group();
    const lm = M(0x8B4513);
    for (let i = 0; i < 4; i++) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.2, 8), lm);
      leg.position.set(i % 2 === 0 ? -0.8 : 0.8, 1.1, i < 2 ? -0.5 : 0.5);
      g.add(leg);
    }
    const top = new THREE.Mesh(new THREE.BoxGeometry(2, 0.1, 1.2), M(0xDEB887));
    top.position.y = 2.2; g.add(top);
    return g;
  }
  if (t === 'sofa') {
    const g = new THREE.Group();
    const m = M(0x8B0000);
    const b = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1, 0.8), m); b.position.y = 0.5; g.add(b);
    const bk = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.2, 0.1), m); bk.position.set(0, 1.1, -0.35); g.add(bk);
    const ag = new THREE.BoxGeometry(0.2, 0.8, 0.8);
    const l = new THREE.Mesh(ag, m); l.position.set(-1.15, 0.9, 0); g.add(l);
    const r = new THREE.Mesh(ag, m); r.position.set(1.15, 0.9, 0); g.add(r);
    return g;
  }
  if (t === 'bed') {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.4, 1.8), M(0xFFFFFF));
    m.position.y = 0.2; g.add(m);
    const pm = M(0x87CEEB);
    const p1 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.15, 0.4), pm); p1.position.set(0.5, 0.4, 0.6); g.add(p1);
    const p2 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.15, 0.4), pm); p2.position.set(-0.5, 0.4, 0.6); g.add(p2);
    return g;
  }
  if (t === 'lamp') {
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 0.1, 16), M(0x333333)); b.position.y = 0.05; g.add(b);
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.8, 8), M(0x666666)); p.position.y = 1; g.add(p);
    const s = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.6, 16), M(0xFFFFAA)); s.position.y = 1.9; s.rotation.x = Math.PI; g.add(s);
    return g;
  }
  if (t === 'plant') {
    const g = new THREE.Group();
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.2, 0.4, 16), M(0x8B4513)); p.position.y = 0.2; g.add(p);
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), M(0x228B22)); l.position.y = 0.8; l.scale.set(1, 1.5, 1); g.add(l);
    return g;
  }
  if (t === 'bookshelf') {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 0.4), M(0x8B4513)));
    const sm = M(0xA0522D);
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.05, 0.35), sm); s.position.y = -0.8 + i * 0.7; g.add(s);
    }
    return g;
  }
  if (t === 'tv') {
    const g = new THREE.Group();
    const s = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.9, 0.05), M(0x000000)); s.position.y = 0.9; g.add(s);
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.2), M(0x333333)); st.position.y = 0.45; g.add(st);
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 0.4), M(0x666666)));
    return g;
  }
  if (t === 'rug') {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 1.5), new THREE.MeshLambertMaterial({ color: 0x800000, side: THREE.DoubleSide }));
    r.rotation.x = -Math.PI / 2;
    return r;
  }

  /* --- primitive shapes --- */
  if (t === 'cube')     return new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), M(0x888888));
  if (t === 'sphere')   return new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), M(0x888888));
  if (t === 'cylinder') return new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 16), M(0x888888));
  if (t === 'cone')     return new THREE.Mesh(new THREE.ConeGeometry(0.5, 1, 16), M(0x888888));
  if (t === 'torus')    return new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.2, 12, 24), M(0x888888));

  /* --- doors --- */
  if (t === 'door_wood') {
    const g = new THREE.Group();
    const frame = M(0x6B4423), panel = M(0x8B5A2B);
    const jamb = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.4, 0.15), frame); jamb.position.set(0, 1.2, 0); g.add(jamb);
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.2, 0.08), panel); door.position.set(0, 1.15, 0.1); g.add(door);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), M(0xC8A050)); knob.position.set(0.35, 1.1, 0.18); g.add(knob);
    return g;
  }
  if (t === 'door_metal') {
    const g = new THREE.Group();
    const metal = M(0x6E7A85);
    const jamb = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.4, 0.15), metal); jamb.position.set(0, 1.2, 0); g.add(jamb);
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.2, 0.08), metal); door.position.set(0, 1.15, 0.1); g.add(door);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.05), M(0xC0C8D0)); bar.position.set(0, 1.0, 0.18); g.add(bar);
    return g;
  }
  if (t === 'door_glass') {
    const g = new THREE.Group();
    const frame = M(0x505050);
    const jamb = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.4, 0.12), frame); jamb.position.set(0, 1.2, 0); g.add(jamb);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.2, 0.04),
      new THREE.MeshLambertMaterial({ color: 0xB8D8E8, transparent: true, opacity: 0.4 }));
    glass.position.set(0, 1.15, 0.1); g.add(glass);
    return g;
  }

  /* --- windows --- */
  if (t === 'window_small') {
    const g = new THREE.Group();
    const frame = M(0xF0F0F0);
    const glass = new THREE.MeshLambertMaterial({ color: 0xB8D8E8, transparent: true, opacity: 0.35 });
    g.add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 0.1), frame));
    const pane = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 0.05), glass); pane.position.z = 0.06; g.add(pane);
    const v = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.0, 0.04), frame); v.position.z = 0.09; g.add(v);
    const h = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.06, 0.04), frame); h.position.z = 0.09; g.add(h);
    return g;
  }
  if (t === 'window_large') {
    const g = new THREE.Group();
    const frame = M(0xF0F0F0);
    const glass = new THREE.MeshLambertMaterial({ color: 0xB8D8E8, transparent: true, opacity: 0.35 });
    g.add(new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.8, 0.1), frame));
    const pane = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 0.05), glass); pane.position.z = 0.06; g.add(pane);
    for (let i = -1; i <= 1; i++) {
      const mull = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.6, 0.04), frame);
      mull.position.set(i * 0.7, 0, 0.09); g.add(mull);
    }
    return g;
  }

  /* --- school props --- */
  if (t === 'desk') {
    const g = new THREE.Group();
    const wood = M(0x8B6B4A);
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.8), wood); top.position.y = 1.5; g.add(top);
    const legMat = M(0x606060);
    for (let i = 0; i < 4; i++) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.5, 8), legMat);
      leg.position.set(i % 2 === 0 ? -0.7 : 0.7, 0.75, i < 2 ? -0.3 : 0.3); g.add(leg);
    }
    return g;
  }
  if (t === 'chalkboard') {
    const g = new THREE.Group();
    const board = new THREE.Mesh(new THREE.BoxGeometry(3.5, 1.4, 0.08), M(0x1A3D1A)); board.position.y = 2.2; g.add(board);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.5, 0.04), M(0x4A2F18)); frame.position.set(0, 2.2, -0.06); g.add(frame);
    return g;
  }
  if (t === 'locker') {
    const g = new THREE.Group();
    const metal = M(0x6E8AA0);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2.0, 0.5), metal); body.position.y = 1.0; g.add(body);
    for (let i = -1; i <= 1; i++) {
      const vent = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.02), M(0x405060));
      vent.position.set(0, 1.7 + i * 0.06, 0.26); g.add(vent);
    }
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 0.04), M(0xC0C8D0)); handle.position.set(0.2, 1.0, 0.26); g.add(handle);
    return g;
  }
  if (t === 'clock') {
    const g = new THREE.Group();
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.06, 24), M(0xFFFFFF));
    face.rotation.x = Math.PI / 2; face.position.y = 2.5; g.add(face);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.03, 8, 24), M(0x303030)); rim.position.y = 2.5; g.add(rim);
    return g;
  }
  if (t === 'globe') {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 0.15, 16), M(0x3A2410)); base.position.y = 0.075; g.add(base);
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 8), M(0x606060)); stand.position.y = 0.55; g.add(stand);
    const globe = new THREE.Mesh(new THREE.SphereGeometry(0.35, 20, 16), M(0x4A90C8)); globe.position.y = 1.2; g.add(globe);
    return g;
  }
  if (t === 'bench') {
    const g = new THREE.Group();
    const wood = M(0x8B6B4A);
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.1, 0.5), wood); top.position.y = 0.5; g.add(top);
    for (const x of [-0.8, 0.8]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.4), M(0x4A2F18));
      leg.position.set(x, 0.25, 0); g.add(leg);
    }
    return g;
  }

  /* --- fallback --- */
  return new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), M(0x888888));
}

/* Build a component and place it *relative to its room group*.
   Positions are saved in world space (components live under scene
   in the editor), so we subtract the room's world offset here. */
function makeComponent(c, roomOffset) {
  const obj = buildComponentMesh(c);
  obj.position.set(
    c.position[0] - roomOffset.x,
    c.position[1] - roomOffset.y,
    c.position[2] - roomOffset.z
  );
  obj.rotation.set(...c.rotation);
  obj.scale.set(...c.scale);
  if (c.color) {
    obj.traverse(x => { if (x.isMesh && x.material && x.material.color) x.material.color.set(c.color); });
  }
  if (c.visible === false) obj.visible = false;
  return obj;
}

function makeDoor(room, door) {
  const { w, h, d } = room.size;
  let pos, rot;
  switch (door.wall) {
    case 'back':  pos=[(door.offset-.5)*w,1.3,-d/2+.04]; rot=[0,0,0]; break;
    case 'front': pos=[(door.offset-.5)*w,1.3, d/2-.04]; rot=[0,Math.PI,0]; break;
    case 'left':  pos=[-w/2+.04,1.3,(door.offset-.5)*d]; rot=[0,Math.PI/2,0]; break;
    case 'right': pos=[ w/2-.04,1.3,(door.offset-.5)*d]; rot=[0,-Math.PI/2,0]; break;
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.4,2.6), new THREE.MeshBasicMaterial({color:0x5D5CDE,transparent:true,opacity:.55,side:THREE.DoubleSide,depthWrite:false}));
  m.position.set(...pos);
  m.rotation.set(...rot);
  m.userData = { roomId: room.id, door };
  return m;
}

/* =========================================================
   BUILD THE SCHOOL
   ========================================================= */
TOUR.rooms.forEach(room => {
  roomsById[room.id] = room;
  const g = new THREE.Group();
  g.position.set(room.offset.x, room.offset.y, room.offset.z);
  g.visible = false;
  const { w, h, d } = room.size;

  /* FLOOR — colour × texture (mul like the editor) */
  const fm = room.floorMaterial || {};
  const hasFloorTex = !!room.baseImage && fm.textureURL !== '__NONE__';
  const floorColor = fm.color || (hasFloorTex ? '#ffffff' : '#909090');
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshLambertMaterial({
      color: floorColor,
      map: hasFloorTex ? tex(room.baseImage) : null
    })
  );
  floor.rotation.x = -Math.PI/2; g.add(floor);

  /* CEILING — colour × texture */
  const cm = room.ceilingMaterial || {};
  const hasCeilTex = !!room.roofImage && cm.textureURL !== '__NONE__';
  const ceilColor = cm.color || (hasCeilTex ? '#ffffff' : '#bbbbbb');
  const ceil = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshLambertMaterial({
      color: ceilColor,
      map: hasCeilTex ? tex(room.roofImage) : null
    })
  );
  ceil.rotation.x = Math.PI/2; ceil.position.y = h; g.add(ceil);

  /* WALLS — per-label colour × texture */
  const order = ['Back Wall','Left Wall','Right Wall','Front Wall'];
  const walls = [
    { pos:[0,h/2,-d/2], rot:[0,0,0], w, h, label:'Back Wall' },
    { pos:[-w/2,h/2,0], rot:[0,Math.PI/2,0], w:d, h, label:'Left Wall' },
    { pos:[w/2,h/2,0], rot:[0,-Math.PI/2,0], w:d, h, label:'Right Wall' },
    { pos:[0,h/2,d/2], rot:[0,Math.PI,0], w, h, label:'Front Wall' }
  ];
  walls.forEach(def => {
    const wm = room.wallMaterials?.[def.label] || {};
    let u = null;
    if (wm.textureURL !== '__NONE__') {
      const i = room.wallPositions?.findIndex(p => p.label === def.label);
      if (i >= 0 && room.wallImages?.[i]) u = room.wallImages[i];
      else if (room.wallImages?.[order.indexOf(def.label)]) u = room.wallImages[order.indexOf(def.label)];
    }
    const wallColor = wm.color || (u ? '#ffffff' : '#9a9a9a');
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(def.w, def.h),
      new THREE.MeshLambertMaterial({
        color: wallColor,
        map: tex(u),
        side: THREE.DoubleSide
      })
    );
    mesh.position.set(...def.pos);
    mesh.rotation.set(...def.rot);
    g.add(mesh);
  });

  /* COMPONENTS — every type, positions corrected for room offset */
  (room.components || []).forEach(c => g.add(makeComponent(c, room.offset)));

  /* LIGHTS */
  (room.lights || []).forEach(l => {
    if (l.type === 'point' && l.position) {
      const pl = new THREE.PointLight(l.color, Math.min(l.intensity || 1, 2.5), 25);
      pl.position.set(...l.position);
      g.add(pl);
    }
  });

  /* PORTAL DOORS */
  (room.doors || []).forEach(door => {
    const m = makeDoor(room, door);
    g.add(m);
    doorMeshes.push(m);
  });

  scene.add(g);
  room._group = g;
});

/* =========================================================
   WALK AROUND
   ========================================================= */
let yaw = 0, pitch = 0, tYaw = 0, tPitch = 0;
let locked = false;
const moving = { w:false, a:false, s:false, d:false };
let currentRoomId = TOUR.startRoomId || TOUR.rooms[0]?.id;

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

function goTo(roomId, spawn) {
  const room = roomsById[roomId];
  if (!room) return;
  const sp = spawn || room.spawn || { x:0, y:1.65, z:0, lookX:0, lookZ:-1 };
  const fade = document.getElementById('fade');
  fade.style.opacity = '1';
  setTimeout(() => {
    camera.position.set(room.offset.x + sp.x, room.offset.y + (sp.y || 1.65), room.offset.z + sp.z);
    yaw = tYaw = Math.atan2(sp.lookX || 0, -(sp.lookZ ?? -1));
    pitch = tPitch = 0;
    currentRoomId = roomId;
    showRoom(roomId);
    fade.style.opacity = '0';
  }, 300);
}

renderer.domElement.addEventListener('click', e => {
  const m = new THREE.Vector2((e.clientX/innerWidth)*2-1, -(e.clientY/innerHeight)*2+1);
  const ray = new THREE.Raycaster();
  ray.setFromCamera(m, camera);
  const visible = doorMeshes.filter(d => d.parent && d.parent.visible);
  const hit = ray.intersectObjects(visible, false)[0];
  if (hit) { goTo(hit.object.userData.door.targetRoomId, hit.object.userData.door.targetSpawn); return; }
  if (!locked && renderer.domElement.requestPointerLock) renderer.domElement.requestPointerLock();
});

document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === renderer.domElement; });
document.addEventListener('mousemove', e => {
  if (!locked && e.buttons !== 1) return;
  tYaw -= e.movementX * 0.0025;
  tPitch -= e.movementY * 0.0025;
  tPitch = Math.max(-1.2, Math.min(1.2, tPitch));
});
document.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (k === 'w') moving.w = true;
  else if (k === 'a') moving.a = true;
  else if (k === 's') moving.s = true;
  else if (k === 'd') moving.d = true;
});
document.addEventListener('keyup', e => {
  const k = e.key.toLowerCase();
  if (k === 'w') moving.w = false;
  else if (k === 'a') moving.a = false;
  else if (k === 's') moving.s = false;
  else if (k === 'd') moving.d = false;
});

const clock = new THREE.Clock();
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  yaw += (tYaw - yaw) * 0.18;
  pitch += (tPitch - pitch) * 0.18;
  const dir = new THREE.Vector3(Math.sin(yaw)*Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw)*Math.cos(pitch));
  const fwd = new THREE.Vector3(dir.x, 0, dir.z).normalize();
  const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
  const delta = new THREE.Vector3();
  if (moving.w) delta.add(fwd);
  if (moving.s) delta.sub(fwd);
  if (moving.d) delta.add(right);
  if (moving.a) delta.sub(right);
  if (delta.lengthSq() > 0) {
    delta.normalize().multiplyScalar(4 * dt);
    camera.position.add(delta);
    const room = roomsById[currentRoomId];
    if (room) {
      camera.position.y = room.offset.y + 1.65;
      const hw = room.size.w/2 - 0.5, hd = room.size.d/2 - 0.5;
      camera.position.x = Math.max(room.offset.x - hw, Math.min(room.offset.x + hw, camera.position.x));
      camera.position.z = Math.max(room.offset.z - hd, Math.min(room.offset.z + hd, camera.position.z));
    }
  }
  camera.lookAt(camera.position.clone().add(dir));
  renderer.render(scene, camera);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

goTo(currentRoomId);
document.getElementById('loading').style.opacity = '0';
setTimeout(() => document.getElementById('loading').remove(), 600);
loop();
<\/script>
</body>
</html>`;
}