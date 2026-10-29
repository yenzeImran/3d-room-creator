/* ===================================================================
   SPLAT PIPELINE — scaffolding for Gaussian-splat rooms
   This is the API surface. Plug in gsplat.js / SuperSplat when you
   want to serve photoreal walkable rooms. The rest of the school
   system already knows how to consume these.
   =================================================================== */

const splatConfig = {
  compressionFormat: 'sog',   // 'sog' | 'spz' | 'ksplat'
  streamingEnabled: true,
  lodEnabled: true,
  maxConcurrentTiles: 3,
  maxRAMBudgetMB: 400
};

function attachSplatToRoom(roomId, url, opts = {}) {
  const room = getRoomById(roomId);
  if (!room) return;
  room.splat = {
    url,
    sizeMB: opts.sizeMB || 15,
    lod: opts.lod ?? 1,
    position: opts.position || { x: 0, y: 0, z: 0 },
    rotation: opts.rotation || { x: 0, y: 0, z: 0 },
    scale: opts.scale ?? 1,
    loaded: false,
    mesh: null
  };
}

async function loadRoomSplat(roomId) {
  const room = getRoomById(roomId);
  if (!room?.splat || room.splat.loaded) return;

  // Real integration — swap this out:
  //
  //   import { SplatMesh } from 'https://cdn.jsdelivr.net/npm/@mkkellogg/gaussian-splats-3d/build/gaussian-splats-3d.module.js';
  //   const mesh = new SplatMesh({ url: room.splat.url });
  //   mesh.position.set(room.splat.position.x, room.splat.position.y, room.splat.position.z);
  //   mesh.rotation.set(room.splat.rotation.x, room.splat.rotation.y, room.splat.rotation.z);
  //   mesh.scale.setScalar(room.splat.scale);
  //   (room.group || scene).add(mesh);
  //   room.splat.mesh = mesh;
  //   room.splat.loaded = true;

  console.log('[splat] ready to load:', room.splat.url);
}

async function unloadRoomSplat(roomId) {
  const room = getRoomById(roomId);
  if (!room?.splat?.mesh) return;
  room.splat.mesh.parent?.remove(room.splat.mesh);
  room.splat.mesh = null;
  room.splat.loaded = false;
}

function estimateSchoolSizeMB() {
  const perRoom = 12;   // compressed SOG estimate
  const total = school.rooms.length * perRoom;
  return {
    perRoomMB: perRoom,
    totalMB: total,
    underOneGB: total < 1024,
    roomCount: school.rooms.length
  };
}

function splatBudgetReport() {
  const e = estimateSchoolSizeMB();
  console.log(`School: ${e.roomCount} rooms @ ~${e.perRoomMB}MB → ${e.totalMB}MB (under 1GB: ${e.underOneGB})`);
  return e;
}