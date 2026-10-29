/* ===================================================================
   RENDERER UPGRADE — Industry-standard PBR pipeline
   --------------------------------------------------------------------
   Patches the existing renderer in-place so every downstream module
   (materials, tour, export) automatically benefits from:

     • ACES Filmic tone mapping
     • sRGB output color space
     • PCFSoft shadow maps
     • Image-based lighting via PMREM (procedural studio HDRI)
     • Per-material PBR (MeshStandardMaterial) upgrade helper
     • Exposure / env-intensity runtime controls

   Load AFTER three.js + creator.js. No external HDRI download — we
   synthesize a neutral studio environment with a CanvasTexture so the
   page stays light and works offline.
   =================================================================== */

const RENDERER_UPGRADE = {
  version: '1.0',
  patched: false,
  pmrem: null,
  envTexture: null,
  envMap: null,
  exposure: 1.05,
  envIntensity: 0.55,
  shadowQuality: 'medium'  // 'low' | 'medium' | 'high'
};

/* ---------- neutral studio HDRI (procedural, no network) ---------- */
function buildStudioEnvironment() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const ctx = c.getContext('2d');

  // Vertical gradient: cool ceiling → neutral → warm floor bounce
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0.00, '#ffffff');   // top key light
  g.addColorStop(0.35, '#e8eef5');   // upper sky
  g.addColorStop(0.50, '#c0c4cc');   // horizon
  g.addColorStop(0.55, '#a8a098');   // warm bounce
  g.addColorStop(1.00, '#3a3530');   // floor
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 128);

  // Two key-light "windows" for specular highlights
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(20, 8, 60, 30);
  ctx.fillRect(170, 8, 60, 30);

  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ---------- patch the renderer once it exists ---------- */
function patchRenderer() {
  if (RENDERER_UPGRADE.patched || !window.renderer) {
    setTimeout(patchRenderer, 80);
    return;
  }
  RENDERER_UPGRADE.patched = true;

  const r = window.renderer;

  /* tone mapping + color space */
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = RENDERER_UPGRADE.exposure;
  r.outputColorSpace = THREE.SRGBColorSpace;

  /* shadow quality */
  const q = RENDERER_UPGRADE.shadowQuality;
  r.shadowMap.enabled = true;
  r.shadowMap.type =
    q === 'high'   ? THREE.PCFSoftShadowMap :
    q === 'medium' ? THREE.PCFSoftShadowMap :
                    THREE.BasicShadowMap;
  r.physicallyCorrectLights = true;  // r128 flag
  if ('useLegacyLights' in r) r.useLegacyLights = false;

  /* environment map via PMREM */
  if (!RENDERER_UPGRADE.pmrem) {
    RENDERER_UPGRADE.pmrem = new THREE.PMREMGenerator(r);
    RENDERER_UPGRADE.pmrem.compileEquirectangularShader();
  }
  if (!RENDERER_UPGRADE.envTexture) {
    RENDERER_UPGRADE.envTexture = buildStudioEnvironment();
  }
  if (!RENDERER_UPGRADE.envMap) {
    RENDERER_UPGRADE.envMap = RENDERER_UPGRADE.pmrem.fromEquirectangular(
      RENDERER_UPGRADE.envTexture
    ).texture;
  }
  window.scene.environment = RENDERER_UPGRADE.envMap;
  window.scene.environmentIntensity = RENDERER_UPGRADE.envIntensity;

  console.log('[renderer-upgrade] PBR pipeline active',
    '\n  tone mapping: ACES Filmic',
    '\n  exposure:', RENDERER_UPGRADE.exposure,
    '\n  env intensity:', RENDERER_UPGRADE.envIntensity,
    '\n  shadow quality:', q);
}

/* ---------- upgrade an existing material to PBR ---------- *
 *  Walks a mesh / group, swaps MeshLambertMaterial / MeshBasicMaterial
 *  for MeshStandardMaterial, preserving color, map, opacity, side.
 *  Call this after createEnvironment() or whenever a new component is added.
 */
function upgradeToPBR(object3D, opts = {}) {
  const envIntensity = opts.envIntensity ?? RENDERER_UPGRADE.envIntensity;
  object3D.traverse(o => {
    if (!o.isMesh) return;
    const m = o.material;
    if (!m) return;
    if (m.isMeshStandardMaterial) {
      m.envMapIntensity = envIntensity;
      m.needsUpdate = true;
      return;
    }
    if (m.isMeshLambertMaterial || m.isMeshBasicMaterial || m.isMeshPhongMaterial) {
      o.material = new THREE.MeshStandardMaterial({
        color: m.color?.clone() || new THREE.Color(0xffffff),
        map: m.map || null,
        alphaMap: m.alphaMap || null,
        transparent: m.transparent || false,
        opacity: m.opacity ?? 1,
        side: m.side || THREE.FrontSide,
        metalness: opts.metalness ?? 0.0,
        roughness: opts.roughness ?? 0.75,
        envMapIntensity: envIntensity
      });
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
}

/* ---------- runtime exposure / env controls ---------- */
function setExposure(v) {
  RENDERER_UPGRADE.exposure = v;
  if (window.renderer) window.renderer.toneMappingExposure = v;
}
function setEnvIntensity(v) {
  RENDERER_UPGRADE.envIntensity = v;
  if (window.scene) window.scene.environmentIntensity = v;
  window.scene?.traverse(o => {
    if (o.isMesh && o.material?.isMeshStandardMaterial) {
      o.material.envMapIntensity = v;
      o.material.needsUpdate = true;
    }
  });
}

/* ---------- hook createEnvironment so PBR is applied automatically ---------- */
(function () {
  function ready(fn) {
    if (typeof window.createEnvironment === 'function' && window.scene) fn();
    else setTimeout(() => ready(fn), 80);
  }
  ready(() => {
    patchRenderer();
    const _orig = window.createEnvironment;
    window.createEnvironment = function () {
      const result = _orig.apply(this, arguments);
      // Defer so the environment group is fully built first
      setTimeout(() => {
        if (window.environment) upgradeToPBR(window.environment, { roughness: 0.65 });
        // Also upgrade any components already in scene
        if (window.components) {
          window.components.forEach(c => upgradeToPBR(c, { roughness: 0.55 }));
        }
      }, 60);
      return result;
    };
  });
})();

/* ---------- UI: rendering controls sidebar ---------- */
function ensureRendererSidebar() {
  if (document.getElementById('renderer-section')) return;
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) { setTimeout(ensureRendererSidebar, 100); return; }

  const wrap = document.createElement('div');
  wrap.id = 'renderer-section';
  wrap.innerHTML = `
    <div class="section-header" onclick="toggleSection(this)">
      <span>🎬 Rendering (PBR)</span><span class="arrow">▼</span>
    </div>
    <div class="section-body">
      <div class="block">
        <h4>Quality</h4>
        <div class="property-control">
          <label>Exposure</label>
          <input type="range" id="pbrExposure" min="0.4" max="2.0" step="0.05" value="1.05">
          <span id="pbrExposureVal" style="font-size:11px;opacity:.7;">1.05</span>
        </div>
        <div class="property-control">
          <label>Env intensity</label>
          <input type="range" id="pbrEnv" min="0" max="2.0" step="0.05" value="0.55">
          <span id="pbrEnvVal" style="font-size:11px;opacity:.7;">0.55</span>
        </div>
        <div class="property-control">
          <label>Shadow quality</label>
          <select id="pbrShadow" onchange="RENDERER_UPGRADE.shadowQuality=this.value">
            <option value="low">Low (basic)</option>
            <option value="medium" selected>Medium (PCF soft)</option>
            <option value="high">High (PCF soft)</option>
          </select>
        </div>
        <button class="btn btn-secondary" onclick="upgradeScenePBR()" style="width:100%;margin-top:6px;">
          ⚡ Re-apply PBR to all
        </button>
      </div>
    </div>
  `;
  sidebar.appendChild(wrap);

  document.getElementById('pbrExposure').oninput = e => {
    setExposure(parseFloat(e.target.value));
    document.getElementById('pbrExposureVal').textContent = e.target.value;
  };
  document.getElementById('pbrEnv').oninput = e => {
    setEnvIntensity(parseFloat(e.target.value));
    document.getElementById('pbrEnvVal').textContent = e.target.value;
  };
}

function upgradeScenePBR() {
  if (!window.scene) return;
  upgradeToPBR(window.scene, { roughness: 0.6 });
  showStatus('PBR materials re-applied', 'success');
}

/* ---------- init ---------- */
(function () {
  function whenReady(fn) {
    if (window.scene && window.renderer) fn();
    else setTimeout(() => whenReady(fn), 60);
  }
  whenReady(() => {
    patchRenderer();
    ensureRendererSidebar();
  });
})();