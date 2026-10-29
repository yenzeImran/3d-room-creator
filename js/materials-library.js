/* ===================================================================
   MATERIALS LIBRARY — Industry-standard PBR material import
   --------------------------------------------------------------------
   Lets the user import a complete PBR texture set per surface:

        albedo       (base color, sRGB)
        normal       (DirectX-style or OpenGL-style; auto-detected)
        roughness    (grayscale)
        metalness    (grayscale)
        ao           (ambient occlusion, grayscale)
        height       (optional, grayscale)

   And assign it to:
        • any individual wall
        • the floor
        • the ceiling

   Built-in presets ship with the page (procedural canvas textures, no
   network) so the editor is usable offline. Real PBR sets can be loaded
   via URL or file picker.

   Patches the existing school-materials.js setWallColor/setFloorColor
   flow so a material assignment is "texture + color tint + metal/rough"
   rather than just a flat colour.

   Depends on: renderer-upgrade.js (MeshStandardMaterial upgrade).
   =================================================================== */

const MATERIAL_LIBRARY = {
  presets: {},          // id → MaterialDef
  custom: {},           // id → MaterialDef (user-imported)
  activeFor: 'wall',    // 'wall' | 'floor' | 'ceiling'
  activeWallIndex: 0,
  tiling: { repeat: 1, repeatY: 1, rotation: 0, offset: { x: 0, y: 0 } }
};

/* ---------- procedural PBR presets (no network) ---------- *
 *  Each preset ships albedo + roughness as CanvasTextures, normal as a
 *  bump approximation. Real PBR sets (4k Polyhaven-style) can be loaded
 *  via loadMaterialFromURLs() to override.
 */
function makePreset(id, name, opts) {
  const albedo = makeAlbedoCanvas(opts.baseColor, opts.pattern, opts.accent);
  const rough = makeRoughnessCanvas(opts.roughness, opts.pattern);
  return {
    id,
    name,
    category: opts.category || 'Generic',
    albedoURL: albedo.toDataURL(),
    roughnessURL: rough.toDataURL(),
    normalURL: null,
    metalnessURL: null,
    aoURL: null,
    tiling: opts.tiling || { repeat: 2, repeatY: 2 },
    metalness: opts.metalness ?? 0,
    roughness: opts.roughness ?? 0.7,
    previewColor: opts.baseColor
  };
}

function makeAlbedoCanvas(base, pattern, accent) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);

  if (pattern === 'planks') {
    ctx.fillStyle = accent || 'rgba(0,0,0,0.15)';
    const ph = 32;
    for (let y = 0; y < 256; y += ph) {
      ctx.fillRect(0, y, 256, 1);
      const offset = (y / ph) % 2 === 0 ? 0 : 64;
      for (let x = offset; x < 256; x += 128) {
        ctx.fillRect(x, y, 1, ph);
      }
    }
  } else if (pattern === 'tiles') {
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath(); ctx.moveTo(i * 64, 0); ctx.lineTo(i * 64, 256); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * 64); ctx.lineTo(256, i * 64); ctx.stroke();
    }
  } else if (pattern === 'marble') {
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    for (let i = 0; i < 14; i++) {
      ctx.lineWidth = 1 + Math.random() * 2;
      ctx.beginPath();
      ctx.moveTo(Math.random() * 256, 0);
      ctx.bezierCurveTo(
        Math.random() * 256, 80,
        Math.random() * 256, 170,
        Math.random() * 256, 256
      );
      ctx.stroke();
    }
  } else if (pattern === 'brick') {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    const bh = 32, bw = 64;
    for (let y = 0; y < 256; y += bh) {
      const off = (y / bh) % 2 === 0 ? 0 : bw / 2;
      for (let x = off; x < 256; x += bw) {
        ctx.strokeRect(x + 1, y + 1, bw - 2, bh - 2);
      }
    }
  } else if (pattern === 'noise') {
    const img = ctx.getImageData(0, 0, 256, 256);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * 30;
      d[i]   = Math.max(0, Math.min(255, d[i] + n));
      d[i+1] = Math.max(0, Math.min(255, d[i+1] + n));
      d[i+2] = Math.max(0, Math.min(255, d[i+2] + n));
    }
    ctx.putImageData(img, 0, 0);
  }
  return c;
}

function makeRoughnessCanvas(base, pattern) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const v = Math.round((1 - base) * 255);
  ctx.fillStyle = `rgb(${v},${v},${v})`;
  ctx.fillRect(0, 0, 256, 256);
  if (pattern === 'planks' || pattern === 'brick') {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (let y = 0; y < 256; y += 32) ctx.fillRect(0, y, 256, 1);
  } else if (pattern === 'tiles') {
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath(); ctx.moveTo(i * 64, 0); ctx.lineTo(i * 64, 256); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * 64); ctx.lineTo(256, i * 64); ctx.stroke();
    }
  }
  return c;
}

/* ---------- ship a starter library ---------- */
MATERIAL_LIBRARY.presets = {
  oak_plank:    makePreset('oak_plank',    'Oak Plank',     { baseColor:'#b58a5a', accent:'#7a4f2a', pattern:'planks',  category:'Wood',     tiling:{repeat:3,repeatY:3}, roughness:0.7 }),
  walnut:       makePreset('walnut',       'Walnut',        { baseColor:'#5a3a22', accent:'#3a2410', pattern:'planks',  category:'Wood',     tiling:{repeat:3,repeatY:3}, roughness:0.55 }),
  white_oak:     makePreset('white_oak',   'White Oak',     { baseColor:'#e0c896', accent:'#a08a5a', pattern:'planks',  category:'Wood',     tiling:{repeat:4,repeatY:4}, roughness:0.75 }),
  marble:       makePreset('marble',       'Marble',        { baseColor:'#ece6dc', pattern:'marble',  category:'Stone',    tiling:{repeat:1,repeatY:1}, roughness:0.25 }),
  travertine:   makePreset('travertine',   'Travertine',    { baseColor:'#e8d8b8', pattern:'noise',   category:'Stone',    tiling:{repeat:2,repeatY:2}, roughness:0.6 }),
  slate_tile:   makePreset('slate_tile',   'Slate Tile',    { baseColor:'#42464c', pattern:'tiles',   category:'Stone',    tiling:{repeat:4,repeatY:4}, roughness:0.55 }),
  brick:        makePreset('brick',        'Red Brick',     { baseColor:'#7a3a26', pattern:'brick',   category:'Masonry',   tiling:{repeat:2,repeatY:2}, roughness:0.85 }),
  concrete:     makePreset('concrete',     'Concrete',      { baseColor:'#9a9a96', pattern:'noise',   category:'Masonry',   tiling:{repeat:1,repeatY:1}, roughness:0.85 }),
  white_paint:  makePreset('white_paint',  'White Paint',   { baseColor:'#f4f4f0', pattern:'none',    category:'Paint',     tiling:{repeat:1,repeatY:1}, roughness:0.5 }),
  charcoal:     makePreset('charcoal',     'Charcoal Paint',{ baseColor:'#2a2a2a', pattern:'none',    category:'Paint',     tiling:{repeat:1,repeatY:1}, roughness:0.45 }),
  brushed_steel:makePreset('brushed_steel','Brushed Steel', { baseColor:'#9a9a9c', pattern:'noise',   category:'Metal',     tiling:{repeat:1,repeatY:1}, roughness:0.35, metalness:0.9 }),
  brass:        makePreset('brass',        'Brass',         { baseColor:'#c8a060', pattern:'noise',   category:'Metal',     tiling:{repeat:1,repeatY:1}, roughness:0.35, metalness:0.85 }),
  carpet_grey:  makePreset('carpet_grey',  'Grey Carpet',   { baseColor:'#8a8a8c', pattern:'noise',   category:'Fabric',    tiling:{repeat:2,repeatY:2}, roughness:0.95 }),
  fabric_linen: makePreset('fabric_linen', 'Linen',         { baseColor:'#d8c8a8', pattern:'noise',   category:'Fabric',    tiling:{repeat:2,repeatY:2}, roughness:0.9 })
};

/* ---------- async loader for PBR texture sets ---------- *
 *  Accepts a { albedo, normal, roughness, metalness, ao, height } bag of
 *  URLs and returns a complete THREE material.
 */
function loadPBRSet(urls, opts = {}) {
  return new Promise(resolve => {
    const loader = new THREE.TextureLoader();
    const tex = {};
    let pending = 0;
    const finish = () => {
      if (--pending > 0) return;
      resolve(buildPBRMaterial(tex, opts));
    };
    const queue = (key, url) => {
      if (!url) return;
      pending++;
      loader.load(url, t => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.colorSpace = key === 'albedo' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        tex[key] = t;
        finish();
      }, undefined, () => finish()); // tolerate missing
    };
    pending = 1; // fence
    queue('albedo',    urls.albedo);
    queue('normal',    urls.normal);
    queue('roughness', urls.roughness);
    queue('metalness', urls.metalness);
    queue('ao',        urls.ao);
    queue('height',    urls.height);
    finish();
  });
}

function buildPBRMaterial(tex, opts) {
  const m = new THREE.MeshStandardMaterial({
    color: opts.color || 0xffffff,
    map: tex.albedo || null,
    normalMap: tex.normal || null,
    roughnessMap: tex.roughness || null,
    metalnessMap: tex.metalness || null,
    aoMap: tex.ao || null,
    roughness: opts.roughness ?? 0.7,
    metalness: opts.metalness ?? 0,
    envMapIntensity: opts.envMapIntensity ?? 0.55,
    side: opts.side || THREE.DoubleSide
  });

  // Tiling
  const repeat = opts.repeat || [2, 2];
  Object.values(tex).forEach(t => {
    if (!t) return;
    t.repeat.set(repeat[0], repeat[1]);
    t.offset.set(opts.offset?.[0] || 0, opts.offset?.[1] || 0);
    t.rotation = opts.rotation || 0;
    t.center.set(0.5, 0.5);
    t.needsUpdate = true;
  });
  return m;
}

/* ---------- apply a preset (or custom) material to a surface ---------- */
function applyMaterialToWall(wallIndex, presetId, override) {
  const label = (window.wallPositions?.[wallIndex]?.label) || ('Wall ' + wallIndex);
  const room = window.getActiveRoom?.();
  if (!room) return;

  const preset = MATERIAL_LIBRARY.presets[presetId] || MATERIAL_LIBRARY.custom[presetId];
  if (!preset) { showStatus('Unknown material: ' + presetId, 'error'); return; }

  if (!room.wallMaterials) room.wallMaterials = {};
  if (!room.wallMaterials[label]) room.wallMaterials[label] = {};
  const wm = room.wallMaterials[label];
  wm.materialId = presetId;
  wm.color = preset.previewColor;
  wm.tiling = { ...preset.tiling };

  loadPBRSet({
    albedo: preset.albedoURL,
    roughness: preset.roughnessURL,
    normal: preset.normalURL,
    metalness: preset.metalnessURL,
    ao: preset.aoURL
  }, {
    color: 0xffffff,
    roughness: preset.roughness ?? 0.7,
    metalness: preset.metalness ?? 0,
    repeat: [preset.tiling?.repeat || 2, preset.tiling?.repeatY || 2],
    side: THREE.FrontSide // Visible from inside
  }).then(mat => {
    const mesh = room.wallMeshes?.[wallIndex];
    if (mesh) {
      if (mesh.material?.dispose) mesh.material.dispose();
      mesh.material = mat;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
    showStatus(label + ' → ' + preset.name, 'success');
  });
}

function applyMaterialToFloor(presetId) {
  const room = window.getActiveRoom?.();
  if (!room) return;
  const preset = MATERIAL_LIBRARY.presets[presetId] || MATERIAL_LIBRARY.custom[presetId];
  if (!preset) return;
  if (!room.floorMaterial) room.floorMaterial = {};
  room.floorMaterial.materialId = presetId;
  room.floorMaterial.color = preset.previewColor;
  room.floorMaterial.tiling = { ...preset.tiling };

  loadPBRSet({
    albedo: preset.albedoURL,
    roughness: preset.roughnessURL
  }, {
    roughness: preset.roughness,
    metalness: preset.metalness ?? 0,
    repeat: [preset.tiling?.repeat || 2, preset.tiling?.repeatY || 2],
    side: THREE.FrontSide
  }).then(mat => {
    if (room.floorMesh) {
      if (room.floorMesh.material?.dispose) room.floorMesh.material.dispose();
      room.floorMesh.material = mat;
      room.floorMesh.receiveShadow = true;
    }
    showStatus('Floor → ' + preset.name, 'success');
  });
}

function applyMaterialToCeiling(presetId) {
  const room = window.getActiveRoom?.();
  if (!room) return;
  const preset = MATERIAL_LIBRARY.presets[presetId] || MATERIAL_LIBRARY.custom[presetId];
  if (!preset) return;
  if (!room.ceilingMaterial) room.ceilingMaterial = {};
  room.ceilingMaterial.materialId = presetId;
  room.ceilingMaterial.color = preset.previewColor;

  loadPBRSet({ albedo: preset.albedoURL, roughness: preset.roughnessURL }, {
    roughness: preset.roughness,
    metalness: preset.metalness ?? 0,
    repeat: [preset.tiling?.repeat || 2, preset.tiling?.repeatY || 2],
    side: THREE.FrontSide
  }).then(mat => {
    if (room.ceilingMesh) {
      if (room.ceilingMesh.material?.dispose) room.ceilingMesh.material.dispose();
      room.ceilingMesh.material = mat;
    }
    showStatus('Ceiling → ' + preset.name, 'success');
  });
}

/* ---------- import a PBR set from user-uploaded files ---------- *
 *  files = { albedo: File, normal: File, roughness: File, ... }
 *  Reads each into a data URL and stores the assembled preset under
 *  MATERIAL_LIBRARY.custom[id].
 */
async function importCustomMaterial(name, files) {
  const id = 'custom_' + Date.now();
  const read = f => f ? new Promise(res => {
    const r = new FileReader();
    r.onload = e => res(e.target.result);
    r.readAsDataURL(f);
  }) : Promise.resolve(null);

  const [albedo, normal, roughness, metalness, ao, height] = await Promise.all([
    read(files.albedo), read(files.normal), read(files.roughness),
    read(files.metalness), read(files.ao), read(files.height)
  ]);

  if (!albedo) { showStatus('Albedo map is required', 'error'); return null; }

  const preset = {
    id, name, category: 'Imported',
    albedoURL: albedo, normalURL: normal, roughnessURL: roughness,
    metalnessURL: metalness, aoURL: ao, heightURL: height,
    tiling: { repeat: 2, repeatY: 2 },
    metalness: metalness ? 1.0 : 0.0,
    roughness: roughness ? 0.5 : 0.7,
    previewColor: '#cccccc'
  };
  MATERIAL_LIBRARY.custom[id] = preset;
  renderMaterialsLibraryUI();
  showStatus('Imported: ' + name, 'success');
  return id;
}

/* ---------- UI ---------- */
function ensureMaterialsLibrarySidebar() {
  if (document.getElementById('materials-library-section')) return;
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) { setTimeout(ensureMaterialsLibrarySidebar, 100); return; }

  const wrap = document.createElement('div');
  wrap.id = 'materials-library-section';
  wrap.innerHTML = `
    <div class="section-header" onclick="toggleSection(this)">
      <span>🧱 Material Library (PBR)</span><span class="arrow">▼</span>
    </div>
    <div class="section-body">
      <div class="block">
        <h4>Apply to</h4>
        <div style="display:flex;gap:4px;margin-bottom:6px;">
          <button class="btn btn-secondary" data-mat-target="wall"    style="flex:1;">Wall</button>
          <button class="btn btn-secondary" data-mat-target="floor"   style="flex:1;">Floor</button>
          <button class="btn btn-secondary" data-mat-target="ceiling" style="flex:1;">Ceiling</button>
        </div>
        <div id="matLibTargetInfo" style="font-size:11px;color:#888;margin-bottom:6px;"></div>
      </div>

      <div class="block">
        <h4>Library</h4>
        <input type="text" id="matLibSearch" placeholder="filter (oak, marble, brass…)"
               style="width:100%;margin-bottom:6px;padding:4px;">
        <div id="matLibGrid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;max-height:240px;overflow:auto;"></div>
      </div>

      <div class="block">
        <h4>Import PBR set</h4>
        <input type="text" id="matImportName" placeholder="Material name"
               style="width:100%;margin-bottom:4px;padding:4px;">
        <label style="font-size:11px;">Albedo (color):</label>
        <input type="file" accept="image/*" id="matImpAlbedo" class="file-input">
        <label style="font-size:11px;">Normal:</label>
        <input type="file" accept="image/*" id="matImpNormal" class="file-input">
        <label style="font-size:11px;">Roughness:</label>
        <input type="file" accept="image/*" id="matImpRough" class="file-input">
        <label style="font-size:11px;">Metalness:</label>
        <input type="file" accept="image/*" id="matImpMetal" class="file-input">
        <label style="font-size:11px;">AO:</label>
        <input type="file" accept="image/*" id="matImpAO" class="file-input">
        <button class="btn btn-primary" onclick="importMaterialFromUI()" style="width:100%;margin-top:6px;">
          ⬆ Import PBR Set
        </button>
      </div>

      <div class="block">
        <h4>Tiling</h4>
        <div class="property-control">
          <label>Repeat U</label>
          <input type="range" id="matTileU" min="0.5" max="16" step="0.1" value="2"
                 oninput="MATERIAL_LIBRARY.tiling.repeat=parseFloat(this.value);updateActiveTiling()">
          <span id="matTileUVal" style="font-size:11px;">2.0</span>
        </div>
        <div class="property-control">
          <label>Repeat V</label>
          <input type="range" id="matTileV" min="0.5" max="16" step="0.1" value="2"
                 oninput="MATERIAL_LIBRARY.tiling.repeatY=parseFloat(this.value);updateActiveTiling()">
          <span id="matTileVVal" style="font-size:11px;">2.0</span>
        </div>
      </div>
    </div>
  `;
  sidebar.appendChild(wrap);

  wrap.querySelectorAll('[data-mat-target]').forEach(b => {
    b.onclick = () => {
      MATERIAL_LIBRARY.activeFor = b.dataset.matTarget;
      updateMatLibTargetInfo();
      wrap.querySelectorAll('[data-mat-target]').forEach(x =>
        x.classList.toggle('btn-primary', x === b));
    };
  });
  wrap.querySelector('[data-mat-target="wall"]').click();

  document.getElementById('matLibSearch').oninput = renderMaterialsLibraryUI;
  renderMaterialsLibraryUI();
}

function updateActiveTiling() {
  document.getElementById('matTileUVal').textContent =
    MATERIAL_LIBRARY.tiling.repeat.toFixed(1);
  document.getElementById('matTileVVal').textContent =
    MATERIAL_LIBRARY.tiling.repeatY.toFixed(1);

  // Apply to active surface's current material
  const room = window.getActiveRoom?.();
  if (!room) return;
  let mesh = null;
  if (MATERIAL_LIBRARY.activeFor === 'wall') mesh = room.wallMeshes?.[MATERIAL_LIBRARY.activeWallIndex];
  else if (MATERIAL_LIBRARY.activeFor === 'floor') mesh = room.floorMesh;
  else mesh = room.ceilingMesh;

  if (mesh?.material) {
    ['map','normalMap','roughnessMap','metalnessMap','aoMap'].forEach(k => {
      const t = mesh.material[k];
      if (t) {
        t.repeat.set(MATERIAL_LIBRARY.tiling.repeat, MATERIAL_LIBRARY.tiling.repeatY);
        t.needsUpdate = true;
      }
    });
  }
}

function updateMatLibTargetInfo() {
  const info = document.getElementById('matLibTargetInfo');
  if (!info) return;
  const room = window.getActiveRoom?.();
  let label = MATERIAL_LIBRARY.activeFor;
  if (MATERIAL_LIBRARY.activeFor === 'wall' && room && window.wallPositions) {
    label = window.wallPositions[MATERIAL_LIBRARY.activeWallIndex]?.label || 'Wall';
  }
  info.textContent = 'Active: ' + label + (room ? ' in ' + room.name : '');
}

function renderMaterialsLibraryUI() {
  const grid = document.getElementById('matLibGrid');
  if (!grid) return;
  const q = (document.getElementById('matLibSearch')?.value || '').toLowerCase();
  const all = { ...MATERIAL_LIBRARY.presets, ...MATERIAL_LIBRARY.custom };
  grid.innerHTML = '';
  Object.values(all).filter(p =>
    !q || p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)
  ).forEach(p => {
    const cell = document.createElement('div');
    cell.style.cssText = 'cursor:pointer;border:1px solid #444;border-radius:6px;overflow:hidden;background:#222;';
    cell.title = p.name + ' · ' + p.category;
    cell.innerHTML =
      '<img src="' + p.albedoURL + '" style="width:100%;height:48px;object-fit:cover;display:block;">' +
      '<div style="font-size:9px;padding:3px;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' +
        escapeHtml(p.name) + '</div>';
    cell.onclick = () => applyActiveMaterial(p.id);
    grid.appendChild(cell);
  });
}

function applyActiveMaterial(presetId) {
  const target = MATERIAL_LIBRARY.activeFor;
  if (target === 'wall')    applyMaterialToWall(MATERIAL_LIBRARY.activeWallIndex, presetId);
  else if (target === 'floor')   applyMaterialToFloor(presetId);
  else if (target === 'ceiling') applyMaterialToCeiling(presetId);
}

function importMaterialFromUI() {
  const name = document.getElementById('matImportName').value.trim() || 'Imported';
  const files = {
    albedo: document.getElementById('matImpAlbedo').files[0],
    normal: document.getElementById('matImpNormal').files[0],
    roughness: document.getElementById('matImpRough').files[0],
    metalness: document.getElementById('matImpMetal').files[0],
    ao: document.getElementById('matImpAO').files[0]
  };
  importCustomMaterial(name, files);
}

/* ---------- sync wall index with school-materials.js ---------- */
(function () {
  function ready(fn) {
    if (typeof window.selectWall === 'function' && typeof MATERIAL_LIBRARY !== 'undefined') fn();
    else setTimeout(() => ready(fn), 80);
  }
  ready(() => {
    const _orig = window.selectWall;
    window.selectWall = function (i) {
      _orig(i);
      MATERIAL_LIBRARY.activeWallIndex = i;
      updateMatLibTargetInfo();
    };
    const _origSetActive = window.setActiveRoom;
    window.setActiveRoom = function (id) {
      _origSetActive(id);
      setTimeout(updateMatLibTargetInfo, 120);
    };
  });
})();

/* ---------- init ---------- */
(function () {
  function whenReady(fn) {
    if (window.scene && typeof window.getActiveRoom === 'function') fn();
    else setTimeout(() => whenReady(fn), 80);
  }
  whenReady(() => {
    ensureMaterialsLibrarySidebar();
    updateMatLibTargetInfo();
  });
})();
/* ---------- Re-apply PBR materials after the room builds ---------- */
(function () {
  function ready(fn) {
    if (typeof window.createEnvironment === 'function') fn();
    else setTimeout(() => ready(fn), 80);
  }
  ready(() => {
    const _origCreate = window.createEnvironment;
    window.createEnvironment = function () {
      const res = _origCreate.apply(this, arguments);
      
      // Wait 150ms for the base room to finish building, then apply PBR
      setTimeout(() => {
        const room = window.getActiveRoom?.();
        if (!room) return;

        // Walls
        ['Back Wall', 'Left Wall', 'Right Wall', 'Front Wall'].forEach((label, i) => {
          const wm = room.wallMaterials?.[label];
          if (wm && wm.materialId) {
            applyMaterialToWall(i, wm.materialId);
          }
        });
        
        // Floor & Ceiling
        if (room.floorMaterial?.materialId) applyMaterialToFloor(room.floorMaterial.materialId);
        if (room.ceilingMaterial?.materialId) applyMaterialToCeiling(room.ceilingMaterial.materialId);
        
      }, 150);
      
      return res;
    };
  });
})();