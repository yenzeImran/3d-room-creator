/* ===================================================================
   SCHOOL CORE — rooms, doors, layout graph, editor-state save/restore
   Load AFTER creator.js (uses its globals: scene, camera, controls,
   components, lights, environment, baseTexture, wallTextures, etc.)
   =================================================================== */

const school = {
  name: 'My School',
  rooms: [],            // RoomDef[]
  startRoomId: null,
  activeRoomId: null,   // room currently open in the editor
  tour: {
    active: false,
    currentRoomId: null,
    walkSpeed: 4,
    eyeHeight: 1.65,
    fadeDuration: 300,
    yaw: 0, pitch: 0,
    targetYaw: 0, targetPitch: 0,
    moving: { w: false, a: false, s: false, d: false },
    pointerLocked: false,
    streamRadius: 1
  }
};

function uid(p) { return (p || 'id') + '_' + Date.now() + '_' + Math.floor(Math.random() * 1e4); }
function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

function createRoomDef(opts = {}) {
  return {
    id: opts.id || uid('room'),
    name: opts.name || 'New Room',
    kind: opts.kind || 'room',
    offset: opts.offset || { x: 0, y: 0, z: 0 },
    size: opts.size || { w: 10, h: 8, d: 10 },
    spawn: opts.spawn || { x: 0, y: 1.65, z: 0, lookX: 0, lookZ: -1 },
    baseTexture: null, wallTextures: [], roofTexture: null,
    baseImageDataURL: null, roofImageDataURL: null, wallImageDataURLs: [],
    wallOrder: 'back-left-right-front',
    wallPositions: [],
    /* ---- new material state ---- */
    wallMaterials: {
      'Back Wall':  { color: '#ffffff', textureURL: null },
      'Left Wall':  { color: '#ffffff', textureURL: null },
      'Right Wall': { color: '#ffffff', textureURL: null },
      'Front Wall': { color: '#ffffff', textureURL: null }
    },
    floorMaterial:   { color: '#ffffff', textureURL: null },
    ceilingMaterial: { color: '#ffffff', textureURL: null },
    wallMeshes: [], floorMesh: null, ceilingMesh: null,
    /* ---- contents ---- */
    components: [], lights: [], doors: [], group: null
  };
}

function getRoomById(id) { return school.rooms.find(r => r.id === id); }
function getActiveRoom() { return getRoomById(school.activeRoomId); }

/* ---------- Save / restore between editor globals and rooms ---------- */

function saveEditorStateToRoom() {
  const room = getActiveRoom();
  if (!room) return;
  room.components = components.filter(c => c.parent === scene || !c.parent);
  room.lights = lights.slice();
  room.baseImageDataURL = baseImageDataURL;
  room.roofImageDataURL = roofImageDataURL;
  room.wallImageDataURLs = wallImageDataURLs.slice();
  room.wallOrder = document.getElementById('wallOrder')?.value || room.wallOrder;
  room.wallPositions = wallPositions.map(p => ({ pos: p.pos.slice(), rot: p.rot.slice(), label: p.label }));
  room.baseTexture = baseTexture;
  room.roofTexture = roofTexture;
  room.wallTextures = wallTextures.slice();
}

function clearEditorScene() {
  components.forEach(c => { if (c.parent) c.parent.remove(c); });
  lights.forEach(ld => {
    if (ld.sphere?.parent) ld.sphere.parent.remove(ld.sphere);
    if (ld.light?.parent) ld.light.parent.remove(ld.light);
    if (ld.light?.target?.parent) ld.light.target.parent.remove(ld.light.target);
  });
  if (environment) { scene.remove(environment); environment = null; }
  if (window.transformControls) transformControls.detach();
  components.length = 0;
  lights.length = 0;
  if (window.selectedComponent !== undefined) selectedComponent = null;
  if (window.selectedLightData !== undefined) selectedLightData = null;
  baseTexture = null; roofTexture = null;
  wallTextures.length = 0;
  baseImageDataURL = null; roofImageDataURL = null;
  wallImageDataURLs.length = 0;
}

function reloadTexture(url) {
  return new Promise(resolve => {
    if (!url) return resolve(null);
    new THREE.TextureLoader().load(url, tex => {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      resolve(tex);
    }, undefined, () => resolve(null));
  });
}

function restoreEditorStateFromRoom(room) {
  if (!room) return;

  // Sync restore: components, lights
  room.components.forEach(c => scene.add(c));
  components = room.components.slice();
  room.lights.forEach(ld => {
    scene.add(ld.light);
    if (ld.sphere) scene.add(ld.sphere);
    if (ld.light.target) scene.add(ld.light.target);
  });
  lights = room.lights.slice();

  // Camera setup: look at the center of the room from inside
  if (camera && controls) {
    const cx = room.offset.x;
    const cy = room.offset.y + 2.5; // Eye level
    const cz = room.offset.z;
    // Place camera inside the room, looking towards the back wall
    camera.position.set(cx, cy, cz + (room.size.d / 2) - 1.5);
    controls.target.set(cx, cy, cz - 5);
    controls.update();
  }

  // Async restore
  (async () => {
    baseImageDataURL = room.baseImageDataURL;
    roofImageDataURL = room.roofImageDataURL;
    wallImageDataURLs = room.wallImageDataURLs.slice();

    baseTexture = room.baseTexture || await reloadTexture(room.baseImageDataURL);
    roofTexture = room.roofTexture || await reloadTexture(room.roofImageDataURL);

    wallTextures.length = 0;
    if (room.wallTextures.length === room.wallImageDataURLs.length && room.wallTextures.length) {
      room.wallTextures.forEach(t => wallTextures.push(t));
    } else {
      const texs = await Promise.all(room.wallImageDataURLs.map(reloadTexture));
      texs.forEach(t => { if (t) wallTextures.push(t); });
    }

    if (room.wallOrder && document.getElementById('wallOrder')) {
      document.getElementById('wallOrder').value = room.wallOrder;
    }
    updateWallPositions();

    // ALWAYS create the environment
    createEnvironment();

    renderLayersPanel();
    updateSelectionPanels();
    refreshPreviewFromRoom(room);
    if (window.renderSchoolUI) renderSchoolUI();
  })();
}

function refreshPreviewFromRoom(room) {
  const fill = (box, urls) => {
    if (!box) return;
    box.innerHTML = '';
    urls.forEach(u => {
      const img = document.createElement('img');
      img.src = u;
      img.className = 'preview-image' + (AI.enabled ? ' ai' : '');
      img.onclick = () => selectImage(img);
      box.appendChild(img);
    });
  };
  fill(document.getElementById('basePreview'), room.baseImageDataURL ? [room.baseImageDataURL] : []);
  fill(document.getElementById('roofPreview'), room.roofImageDataURL ? [room.roofImageDataURL] : []);
  fill(document.getElementById('wallPreview'), room.wallImageDataURLs);
  updateWallAssignmentInfo();
}

function setActiveRoom(id) {
  if (school.tour.active && window.exitTourMode) exitTourMode();
  saveEditorStateToRoom();
  clearEditorScene();
  school.activeRoomId = id;
  restoreEditorStateFromRoom(getRoomById(id));
  if (window.renderSchoolUI) renderSchoolUI();
}

/* ---------- Room CRUD ---------- */

function addRoom(opts = {}) {
  const room = createRoomDef(opts);
  school.rooms.push(room);
  if (!school.startRoomId) school.startRoomId = room.id;
  if (window.renderSchoolUI) renderSchoolUI();
  return room;
}

function removeRoom(id) {
  const idx = school.rooms.findIndex(r => r.id === id);
  if (idx < 0) return;
  const room = school.rooms[idx];
  if (room.group && room.group.parent) room.group.parent.remove(room.group);
  school.rooms.forEach(r => { r.doors = r.doors.filter(d => d.targetRoomId !== id); });
  school.rooms.splice(idx, 1);
  if (school.startRoomId === id) school.startRoomId = school.rooms[0]?.id || null;
  if (school.activeRoomId === id) {
    clearEditorScene();
    school.activeRoomId = school.rooms[0]?.id || null;
    if (school.activeRoomId) restoreEditorStateFromRoom(getRoomById(school.activeRoomId));
  }
  if (window.renderSchoolUI) renderSchoolUI();
}

/* ---------- Doors ---------- */

function addDoor(fromRoomId, wall, offset, toRoomId, targetSpawn) {
  const room = getRoomById(fromRoomId);
  if (!room || !toRoomId || fromRoomId === toRoomId) return null;
  const door = {
    id: uid('door'),
    wall, offset,
    targetRoomId: toRoomId,
    targetSpawn: targetSpawn || { x: 0, y: 1.65, z: 0, lookX: 0, lookZ: -1 },
    mesh: null
  };
  room.doors.push(door);
  if (room.group) {
    const m = makeDoorMesh(room, door);
    room.group.add(m);
  }
  return door;
}

function removeDoor(fromRoomId, doorId) {
  const room = getRoomById(fromRoomId);
  if (!room) return;
  const door = room.doors.find(d => d.id === doorId);
  if (!door) return;
  if (door.mesh?.parent) door.mesh.parent.remove(door.mesh);
  room.doors = room.doors.filter(d => d.id !== doorId);
}

function makeDoorMesh(room, door) {
  const { w, h, d } = room.size;
  let pos, rot;
  switch (door.wall) {
    case 'back':  pos = [(door.offset - 0.5) * w, 1.3, -d/2 + 0.04]; rot = [0, 0, 0]; break;
    case 'front': pos = [(door.offset - 0.5) * w, 1.3,  d/2 - 0.04]; rot = [0, Math.PI, 0]; break;
    case 'left':  pos = [-w/2 + 0.04, 1.3, (door.offset - 0.5) * d]; rot = [0, Math.PI/2, 0]; break;
    case 'right': pos = [ w/2 - 0.04, 1.3, (door.offset - 0.5) * d]; rot = [0, -Math.PI/2, 0]; break;
  }
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.4, 2.6),
    new THREE.MeshBasicMaterial({
      color: 0x5D5CDE, transparent: true, opacity: 0.55,
      side: THREE.DoubleSide, depthWrite: false
    })
  );
  mesh.position.set(...pos);
  mesh.rotation.set(...rot);
  mesh.userData = { isDoor: true, roomId: room.id, doorId: door.id };
  door.mesh = mesh;
  return mesh;
}

/* ---------- Layout generator ---------- */

function buildSchoolFromLayout(layout) {
  school.name = layout.name || 'My School';
  school.rooms.length = 0;
  school.startRoomId = null;
  school.activeRoomId = null;

  const cw = layout.cell?.w || 12;
  const cd = layout.cell?.d || 12;
  const ch = layout.cell?.h || 8;
  const sp = layout.spacing || { x: cw + 0.4, z: cd + 0.4 };
  const ids = {};

  (layout.grid || []).forEach((row, r) => row.forEach((type, c) => {
    if (!type || type === '.' || type === ' ') return;
    const room = createRoomDef({
      name: (window.SCHOOL_TEMPLATES?.[type]?.label || capitalize(type)) + ' ' + (r + 1) + '-' + (c + 1),
      kind: type,
      offset: { x: c * sp.x, y: 0, z: r * sp.z },
      size: { w: cw, h: ch, d: cd }
    });
    school.rooms.push(room);
    ids[r + ',' + c] = room.id;
  }));

  (layout.grid || []).forEach((row, r) => row.forEach((type, c) => {
    if (!type || type === '.' || type === ' ') return;
    const here = ids[r + ',' + c];
    if (ids[r + ',' + (c + 1)]) {
      const other = ids[r + ',' + (c + 1)];
      addDoor(here, 'right', 0.5, other, { x: -cw/2 + 2, y: 1.65, z: 0, lookX: -1, lookZ: 0 });
      addDoor(other, 'left', 0.5, here, { x: cw/2 - 2, y: 1.65, z: 0, lookX: 1, lookZ: 0 });
    }
    if (ids[(r + 1) + ',' + c]) {
      const other = ids[(r + 1) + ',' + c];
      addDoor(here, 'front', 0.5, other, { x: 0, y: 1.65, z: -cd/2 + 2, lookX: 0, lookZ: -1 });
      addDoor(other, 'back', 0.5, here, { x: 0, y: 1.65, z: cd/2 - 2, lookX: 0, lookZ: 1 });
    }
  }));

  school.startRoomId = school.rooms[0]?.id || null;
  school.activeRoomId = school.startRoomId;
  if (window.renderSchoolUI) renderSchoolUI();
  if (school.startRoomId) restoreEditorStateFromRoom(getRoomById(school.startRoomId));
  return school;
}

/* ---------- Tour-mode geometry ---------- */

function buildRoomTourGroup(room) {
  const g = new THREE.Group();
  g.position.set(room.offset.x, room.offset.y, room.offset.z);
  g.visible = false;
  const { w, h, d } = room.size;

   /* FLOOR — colour + texture */
  const fm = room.floorMaterial || {};
  const floorMat = new THREE.MeshLambertMaterial({
    color: fm.color || (room.baseImageDataURL ? 0xffffff : 0x8a8a8a)
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  g.add(floor);
  if (room.baseImageDataURL && fm.textureURL !== '__NONE__') {
    new THREE.TextureLoader().load(room.baseImageDataURL, t => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      floorMat.map = t;
      floorMat.color.set(fm.color || '#ffffff');
      floorMat.needsUpdate = true;
    });
  }

  /* CEILING — colour + texture */
  const cm = room.ceilingMaterial || {};
  const ceilMat = new THREE.MeshLambertMaterial({
    color: cm.color || (room.roofImageDataURL ? 0xffffff : 0xb0b0b0)
  });
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, d), ceilMat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = h;
  g.add(ceil);
  if (room.roofImageDataURL && cm.textureURL !== '__NONE__') {
    new THREE.TextureLoader().load(room.roofImageDataURL, t => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      ceilMat.map = t;
      ceilMat.color.set(cm.color || '#ffffff');
      ceilMat.needsUpdate = true;
    });
  }

  /* WALLS — colour + texture per label */
  const wallOrderCanon = ['Back Wall', 'Left Wall', 'Right Wall', 'Front Wall'];
  const wallDefs = [
    { pos: [0, h/2, -d/2], rot: [0, 0, 0],          w: w, h: h, label: 'Back Wall' },
    { pos: [-w/2, h/2, 0], rot: [0, Math.PI/2, 0],  w: d, h: h, label: 'Left Wall' },
    { pos: [w/2, h/2, 0],  rot: [0, -Math.PI/2, 0], w: d, h: h, label: 'Right Wall' },
    { pos: [0, h/2, d/2],  rot: [0, Math.PI, 0],    w: w, h: h, label: 'Front Wall' }
  ];
  wallDefs.forEach(def => {
    const wm = room.wallMaterials?.[def.label] || {};
    let texURL = null;
    if (wm.textureURL !== '__NONE__') {
      const idx = room.wallPositions?.findIndex(p => p.label === def.label);
      if (idx >= 0 && room.wallImageDataURLs[idx]) texURL = room.wallImageDataURLs[idx];
      else {
        const i = wallOrderCanon.indexOf(def.label);
        if (room.wallImageDataURLs[i]) texURL = room.wallImageDataURLs[i];
      }
    }
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(def.w, def.h),
      new THREE.MeshLambertMaterial({
        color: wm.color || (texURL ? 0xffffff : 0xb5b5b5),
        map: texURL ? new THREE.TextureLoader().load(texURL) : null,
        side: THREE.DoubleSide
      })
    );
    m.position.set(...def.pos);
    m.rotation.set(...def.rot);
    m.receiveShadow = true;
    g.add(m);
  });

  // Async texture fill
  if (room.baseImageDataURL) {
    new THREE.TextureLoader().load(room.baseImageDataURL, t => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      floorMat.map = t; floorMat.color.setHex(0xffffff); floorMat.needsUpdate = true;
    });
  }
  if (room.roofImageDataURL) {
    new THREE.TextureLoader().load(room.roofImageDataURL, t => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      ceilMat.map = t; ceilMat.color.setHex(0xffffff); ceilMat.needsUpdate = true;
    });
  }

  // Components (clone so tour view doesn't steal the editor's objects)
  room.components.forEach(c => {
    if (c.parent) return;
    const clone = c.clone(true);
    clone.traverse(x => { if (x.isMesh) { x.castShadow = true; x.receiveShadow = true; } });
    g.add(clone);
  });

  // Lights
  room.lights.forEach(ld => {
    const pos = ld.sphere?.position || ld.light?.position;
    if (pos) {
      const pl = new THREE.PointLight(ld.light.color.getHex(), Math.min(ld.light.intensity || 1, 2.5), 25);
      pl.position.copy(pos);
      g.add(pl);
    }
  });

  // Doors
  room.doors.forEach(door => {
    if (door.mesh?.parent) door.mesh.parent.remove(door.mesh);
    const m = makeDoorMesh(room, door);
    g.add(m);
  });

  return g;
}

function buildTourScene() {
  school.rooms.forEach(r => {
    if (r.group) { scene.remove(r.group); r.group = null; }
  });
  school.rooms.forEach(room => {
    room.group = buildRoomTourGroup(room);
    scene.add(room.group);
  });
}

function teardownTourScene() {
  school.rooms.forEach(r => {
    if (r.group) { scene.remove(r.group); r.group = null; }
  });
}

function updateTourVisibility(currentRoomId) {
  if (!school.tour.active) return;
  const keep = new Set([currentRoomId]);
  const cur = getRoomById(currentRoomId);
  if (cur) cur.doors.forEach(d => keep.add(d.targetRoomId));
  school.rooms.forEach(r => { if (r.group) r.group.visible = keep.has(r.id); });
}

/* ---------- Serialize ---------- */

function serializeSchool() {
  saveEditorStateToRoom();
  return {
    name: school.name,
    startRoomId: school.startRoomId,
    rooms: school.rooms.map(room => ({
      id: room.id, name: room.name, kind: room.kind,
      offset: room.offset, size: room.size, spawn: room.spawn,
      baseImage: room.baseImageDataURL,
      roofImage: room.roofImageDataURL,
      wallImages: room.wallImageDataURLs,
      wallOrder: room.wallOrder,
      wallPositions: room.wallPositions,
              wallMaterials: room.wallMaterials || {},
        floorMaterial: room.floorMaterial || {},
        ceilingMaterial: room.ceilingMaterial || {},
      components: room.components.map(serializeComponentForExport),
      lights: room.lights.map(serializeLightForExport),
      doors: room.doors.map(d => ({
        id: d.id, wall: d.wall, offset: d.offset,
        targetRoomId: d.targetRoomId, targetSpawn: d.targetSpawn
      }))
    })),
    timestamp: new Date().toISOString()
  };
}

function serializeComponentForExport(comp) {
  let color = null;
  comp.traverse(child => {
    if (!color && child.isMesh && child.material?.color?.getHexString) {
      color = '#' + child.material.color.getHexString();
    }
  });
  return {
    type: comp.userData.type || 'custom',
    name: comp.userData.name || 'Object',
    layer: comp.userData.layer || 'Other',
    position: [comp.position.x, comp.position.y, comp.position.z],
    rotation: [comp.rotation.x, comp.rotation.y, comp.rotation.z],
    scale: [comp.scale.x, comp.scale.y, comp.scale.z],
    color,
    visible: comp.visible !== false
  };
}

function serializeLightForExport(ld) {
  return {
    type: ld.type,
    intensity: ld.light.intensity,
    color: '#' + ld.light.color.getHexString(),
    distance: ld.light.distance || 0,
    position: ld.sphere ? [ld.sphere.position.x, ld.sphere.position.y, ld.sphere.position.z] : null
  };
}

function loadSchoolFromJSON(data) {
  school.name = data.name || 'My School';
  school.rooms.length = 0;
  school.startRoomId = data.startRoomId || null;
  school.activeRoomId = null;

  (data.rooms || []).forEach(r => {
    const room = createRoomDef({
      id: r.id, name: r.name, kind: r.kind,
      offset: r.offset, size: r.size, spawn: r.spawn
    });
    room.baseImageDataURL = r.baseImage || null;
    room.roofImageDataURL = r.roofImage || null;
    room.wallImageDataURLs = r.wallImages || [];
    room.wallOrder = r.wallOrder || 'back-left-right-front';
    room.wallPositions = r.wallPositions || [];
    room.wallMaterials = r.wallMaterials || {
      'Back Wall':  { color: '#ffffff', textureURL: null },
      'Left Wall':  { color: '#ffffff', textureURL: null },
      'Right Wall': { color: '#ffffff', textureURL: null },
      'Front Wall': { color: '#ffffff', textureURL: null }
    };
    room.floorMaterial   = r.floorMaterial   || { color: '#ffffff', textureURL: null };
    room.ceilingMaterial = r.ceilingMaterial || { color: '#ffffff', textureURL: null };
    room.doors = (r.doors || []).map(d => ({ ...d, mesh: null }));
    room.components = (r.components || []).map(buildComponentFromSerialized).filter(Boolean);
    room.lights = (r.lights || []).map(buildLightFromSerialized).filter(Boolean);
    school.rooms.push(room);
  });

  if (school.rooms.length) {
    school.activeRoomId = school.startRoomId || school.rooms[0].id;
    clearEditorScene();
    restoreEditorStateFromRoom(getRoomById(school.activeRoomId));
  }
  if (window.renderSchoolUI) renderSchoolUI();
}

function buildComponentFromSerialized(sc) {
  const factories = {
    chair: window.createChair, table: window.createTable, sofa: window.createSofa, bed: window.createBed,
    lamp: window.createLamp, plant: window.createPlant, bookshelf: window.createBookshelf,
    tv: window.createTV, rug: window.createRug,
    cube: window.createCube, sphere: window.createSphere, cylinder: window.createCylinder,
    cone: window.createCone, torus: window.createTorus
  };
  const fn = factories[sc.type] || window.createCube;
  const mesh = fn();
  mesh.position.set(...(sc.position || [0, 0, 0]));
  mesh.rotation.set(...(sc.rotation || [0, 0, 0]));
  mesh.scale.set(...(sc.scale || [1, 1, 1]));
  mesh.userData = {
    isComponent: true, type: sc.type || 'custom', id: uid('comp'),
    name: sc.name || 'Object', layer: sc.layer || 'Other', locked: false
  };
  if (sc.color) {
    mesh.traverse(c => {
      if (c.isMesh && c.material?.color) c.material.color.set(sc.color);
    });
  }
  mesh.visible = sc.visible !== false;
  return mesh;
}

function buildLightFromSerialized(sl) {
  let light;
  if (sl.type === 'point') light = new THREE.PointLight(sl.color, sl.intensity, sl.distance || 0, 2);
  else if (sl.type === 'spot') { light = new THREE.SpotLight(sl.color, sl.intensity, sl.distance || 0, Math.PI / 6, 0.4, 2); light.target.position.set(0, 0, 0); }
  else if (sl.type === 'directional') { light = new THREE.DirectionalLight(sl.color, sl.intensity); light.target.position.set(0, 0, 0); }
  else light = new THREE.AmbientLight(sl.color, sl.intensity);
  if (sl.position) light.position.set(...sl.position);
  return {
    id: uid('light'), type: sl.type, light,
    sphere: null, color: sl.color, intensity: sl.intensity,
    name: capitalize(sl.type) + ' Light'
  };
}