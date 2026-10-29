/* ===================================================================
   AI BUILDER — LLM-powered automated environment generation
   --------------------------------------------------------------------
   Upgrades school-ai.js from keyword matching to true LLM-driven
   generation. Three layers:

     1. PROMPT → LAYOUT  (natural language → JSON grid of rooms)
     2. STYLE → MATERIALS  (style keyword → per-room material presets)
     3. AUTO-FURNISH  (room type → AI-placed furniture grid)

   The LLM call uses a thin fetch() wrapper so it works from the static
   page; configure AI_BUILDER_CONFIG.endpoint to point at your backend
   proxy (recommended — keeps the API key off the client). If no
   endpoint is configured, we fall back to deterministic keyword matching
   (the existing promptToLayout) so the editor always works offline.

   Style presets ship with the page and apply consistent PBR material
   assignments across all rooms — pairs naturally with materials-library.js.
   =================================================================== */

const AI_BUILDER = {
  version: '1.0',
  config: {
    endpoint: localStorage.getItem('ai-builder-endpoint') || '',  // e.g. https://your-host/api/ai-builder
    apiKey:   localStorage.getItem('ai-builder-key')      || '',
    model: 'glm-4.6',
    temperature: 0.6,
    timeoutMs: 25000
  },
  stylePresets: {},   // populated below
  busy: false
};

/* ------------------- style presets ------------------- */
/* Each preset defines the look + base furniture + material assignments. */
AI_BUILDER.stylePresets = {
  modern: {
    name: 'Modern',
    description: 'Polished concrete floors, white walls, oak accents, brushed-steel hardware',
    palette: { wall: 'white_paint', floor: 'concrete', ceiling: 'white_paint' },
    accent: 'brushed_steel',
    lighting: { ambient: 0.55, hemi: 0.4, point: 1.0 }
  },
  scandinavian: {
    name: 'Scandinavian',
    description: 'White-oak floors, white walls, linen fabrics, soft warm lighting',
    palette: { wall: 'white_paint', floor: 'white_oak', ceiling: 'white_paint' },
    accent: 'fabric_linen',
    lighting: { ambient: 0.65, hemo: 0.5, point: 0.85 }
  },
  industrial: {
    name: 'Industrial',
    description: 'Concrete floors, brick walls, exposed metal, slate ceilings',
    palette: { wall: 'brick', floor: 'concrete', ceiling: 'slate_tile' },
    accent: 'brushed_steel',
    lighting: { ambient: 0.4, hemi: 0.35, point: 1.2 }
  },
  luxury: {
    name: 'Luxury',
    description: 'Marble floors, charcoal walls, brass hardware, dramatic point lighting',
    palette: { wall: 'charcoal', floor: 'marble', ceiling: 'charcoal' },
    accent: 'brass',
    lighting: { ambient: 0.35, hemi: 0.3, point: 1.4 }
  },
  rustic: {
    name: 'Rustic',
    description: 'Walnut plank floors, brick walls, oak furniture, warm amber lighting',
    palette: { wall: 'brick', floor: 'walnut', ceiling: 'white_oak' },
    accent: 'walnut',
    lighting: { ambient: 0.5, hemi: 0.4, point: 1.0 }
  },
  mediterranean: {
    name: 'Mediterranean',
    description: 'Travertine floors, white walls, brass accents, warm sky lighting',
    palette: { wall: 'white_paint', floor: 'travertine', ceiling: 'white_paint' },
    accent: 'brass',
    lighting: { ambient: 0.6, hemi: 0.55, point: 0.9 }
  }
};

/* ------------------- prompt → layout (LLM) ------------------- */
async function aiPromptToLayout(prompt) {
  if (AI_BUILDER.busy) return null;
  AI_BUILDER.busy = true;
  try {
    // Try the LLM endpoint first
    if (AI_BUILDER.config.endpoint) {
      try {
        const layout = await callLLMForLayout(prompt);
        if (layout && Array.isArray(layout.grid)) return layout;
      } catch (e) {
        console.warn('[ai-builder] LLM failed, falling back:', e.message);
      }
    }
    // Fallback: deterministic keyword matching (existing promptToLayout)
    return window.promptToLayout?.(prompt) || deterministicFallback(prompt);
  } finally {
    AI_BUILDER.busy = false;
  }
}

async function callLLMForLayout(prompt) {
  const sys = `You are an architectural layout planner. Given a free-text brief, return a JSON object describing a building layout.

Schema (strict, no commentary):
{
  "name": string,
  "cell": { "w": number, "h": number, "d": number },
  "spacing": { "x": number, "z": number },
  "style": "modern" | "scandinavian" | "industrial" | "luxury" | "rustic" | "mediterranean",
  "grid": string[][]   // grid[row][col]; each cell is one of:
                       // "entrance" | "hallway" | "classroom" | "office" | "library"
                       // "gym" | "cafeteria" | "bathroom" | "lab" | "meeting" | "storage"
                       // or "." for empty
}

Rules:
- Cell size ~10-14 units. Hallways should run through the middle row(s).
- Aim for compact, walkable layouts. Avoid >6 cols or >6 rows.
- Adjacent rooms are auto-connected by doors in the layout engine.`;

  const user = `Brief: ${prompt}\nReturn JSON only, no markdown fences.`;

  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), AI_BUILDER.config.timeoutMs);

  const res = await fetch(AI_BUILDER.config.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(AI_BUILDER.config.apiKey ? { 'Authorization': 'Bearer ' + AI_BUILDER.config.apiKey } : {})
    },
    body: JSON.stringify({
      model: AI_BUILDER.config.model,
      temperature: AI_BUILDER.config.temperature,
      messages: [
        { role: 'system', content: sys },
        { role: 'user',   content: user }
      ]
    }),
    signal: ctrl.signal
  });
  clearTimeout(tid);

  if (!res.ok) throw new Error('LLM HTTP ' + res.status);
  const data = await res.json();
  // Tolerate OpenAI / Z.ai shapes
  const content = data.choices?.[0]?.message?.content || data.choices?.[0]?.delta?.content || data.content || '';
  return extractJSON(content);
}

function extractJSON(s) {
  if (!s) return null;
  // Strip markdown code fences if present
  let txt = s.replace(/```json/gi, '').replace(/```/g, '').trim();
  // Find the outermost { ... }
  const start = txt.indexOf('{');
  const end = txt.lastIndexOf('}');
  if (start < 0 || end < 0) return null;
  txt = txt.slice(start, end + 1);
  try { return JSON.parse(txt); }
  catch { return null; }
}

/* ------------------- deterministic fallback (offline) ------------------- */
function deterministicFallback(prompt) {
  const p = (prompt || '').toLowerCase();
  const counts = {
    classroom: matchCount(p, /(\d+)\s*(?:classroom|class|room)s?/, 3),
    gym: /gym/.test(p) ? 1 : 0,
    library: /library/.test(p) ? 1 : 0,
    cafeteria: /cafeteria|dining|lunch/.test(p) ? 1 : 0,
    office: /office|admin/.test(p) ? 1 : 0,
    bathroom: /bathroom|restroom|toilet/.test(p) ? 1 : 0,
    lab: /lab/.test(p) ? 1 : 0,
    meeting: /meeting|conference/.test(p) ? 1 : 0,
    entrance: 1
  };
  const pool = ['entrance'];
  for (let i = 0; i < counts.classroom; i++) pool.push('classroom');
  ['library','gym','cafeteria','office','bathroom','lab','meeting'].forEach(k => {
    if (counts[k]) pool.push(k);
  });
  // Pick a style from the prompt
  let style = 'modern';
  for (const k of Object.keys(AI_BUILDER.stylePresets)) {
    if (p.includes(k)) { style = k; break; }
  }
  const cols = Math.max(3, Math.ceil(Math.sqrt(pool.length + 3)));
  const rows = Math.max(3, Math.ceil((pool.length + cols) / cols));
  const grid = [];
  for (let r = 0; r < rows; r++) grid.push(new Array(cols).fill('.'));
  const midRow = Math.floor(rows / 2);
  for (let c = 0; c < cols; c++) grid[midRow][c] = 'hallway';
  let idx = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c] === '.') {
        if (idx < pool.length) grid[r][c] = pool[idx++];
        else if (Math.random() > 0.25) grid[r][c] = 'classroom';
      }
    }
  }
  const nameMatch = p.match(/([a-z]+\s+(?:primary|secondary|middle|high|elementary|academy|school))/i);
  const name = nameMatch
    ? nameMatch[1].split(/\s+/).map(w => w[0].toUpperCase() + w.slice(1)).join(' ')
    : 'AI-Generated Building';
  return { name, cell: { w: 12, h: 7, d: 12 }, grid, style };
}

function matchCount(s, re, def) {
  const m = s.match(re);
  return m ? parseInt(m[1]) : def;
}

/* ------------------- apply style to all rooms ------------------- */
function applyStyleToSchool(styleKey) {
  const style = AI_BUILDER.stylePresets[styleKey];
  if (!style) { showStatus('Unknown style: ' + styleKey, 'error'); return; }

  if (!window.school?.rooms?.length) {
    showStatus('Build or generate a school first', 'error');
    return;
  }

  showLoading?.(true, '🎨 Applying ' + style.name + ' style…');

  setTimeout(() => {
    window.school.rooms.forEach(room => {
      // Floor + ceiling + walls: assign material presets
      const ml = window.MATERIAL_LIBRARY;
      if (ml?.presets) {
        if (style.palette.floor && ml.presets[style.palette.floor]) {
          applyPresetSilently(room, 'floor', style.palette.floor);
        }
        if (style.palette.ceiling && ml.presets[style.palette.ceiling]) {
          applyPresetSilently(room, 'ceiling', style.palette.ceiling);
        }
        if (style.palette.wall && ml.presets[style.palette.wall]) {
          ['Back Wall','Left Wall','Right Wall','Front Wall'].forEach(label => {
            applyPresetSilently(room, 'wall', style.palette.wall, label);
          });
        }
      }
      // Lighting adjustments
      applyLightingPreset(room, style.lighting);
    });

    // Rebuild the environment for the active room so changes show
    if (typeof window.createEnvironment === 'function') window.createEnvironment();
    showLoading?.(false);
    showStatus(style.name + ' style applied to ' + window.school.rooms.length + ' rooms', 'success');
  }, 100);
}

function applyPresetSilently(room, surface, presetId, wallLabel) {
  // Same as applyMaterialTo* but without toast spam — used by style presets
  const preset = window.MATERIAL_LIBRARY?.presets?.[presetId];
  if (!preset) return;
  if (surface === 'floor') {
    if (!room.floorMaterial) room.floorMaterial = {};
    room.floorMaterial.materialId = presetId;
    room.floorMaterial.color = preset.previewColor;
  } else if (surface === 'ceiling') {
    if (!room.ceilingMaterial) room.ceilingMaterial = {};
    room.ceilingMaterial.materialId = presetId;
    room.ceilingMaterial.color = preset.previewColor;
  } else if (surface === 'wall' && wallLabel) {
    if (!room.wallMaterials) room.wallMaterials = {};
    if (!room.wallMaterials[wallLabel]) room.wallMaterials[wallLabel] = {};
    room.wallMaterials[wallLabel].materialId = presetId;
    room.wallMaterials[wallLabel].color = preset.previewColor;
  }
}

function applyLightingPreset(room, cfg) {
  if (!cfg || !room.lights) return;
  room.lights.forEach(ld => {
    if (ld.light && typeof ld.light.intensity === 'number') {
      ld.light.intensity = cfg.point ?? 1.0;
    }
  });
}

/* ------------------- auto-furnish from room type ------------------- */
function autoFurnishRoom(room) {
  if (!room?.kind) return;
  const tpl = window.SCHOOL_TEMPLATES?.[room.kind];
  if (!tpl?.fill) return;
  // school-layout.js fill() adds to global `components` — switch active room first
  const prev = window.school?.activeRoomId;
  if (prev !== room.id) {
    window.setActiveRoom?.(room.id);
  }
  setTimeout(() => {
    try {
      // Clear existing components first
      window.clearEditorScene?.();
      tpl.fill();
      // Move them into room.components so they persist
      if (window.components) {
        room.components = window.components.slice();
      }
      if (window.renderSchoolUI) window.renderSchoolUI();
    } catch (e) { console.warn('[ai-builder] autofurnish failed for', room.kind, e); }
  }, 200);
}

/* ------------------- main entry point ------------------- */
async function generateFromAIPrompt() {
  const prompt = document.getElementById('aiPrompt')?.value?.trim();
  if (!prompt) { showStatus('Enter a prompt first', 'error'); return; }
  if (AI_BUILDER.busy) { showStatus('Still working…', 'info'); return; }

  showLoading?.(true, '🤖 Generating with AI…');
  const layout = await aiPromptToLayout(prompt);
  if (!layout) {
    showLoading?.(false);
    showStatus('Generation failed — check endpoint config', 'error');
    return;
  }

  // Build the school from the layout
  window.buildSchoolFromLayout?.(layout);

  // Apply style if specified
  if (layout.style) {
    setTimeout(() => applyStyleToSchool(layout.style), 300);
  }
  // Auto-furnish each room (so the user lands in a populated school)
  setTimeout(() => {
    window.school.rooms.forEach(r => autoFurnishRoom(r));
    showLoading?.(false);
    showStatus('AI build complete: ' + layout.name + ' (' + layout.style + ')', 'success');
  }, 600);
}

/* ------------------- config UI ------------------- */
function ensureAISettingsUI() {
  if (document.getElementById('ai-config-section')) return;
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) { setTimeout(ensureAISettingsUI, 100); return; }

  const wrap = document.createElement('div');
  wrap.id = 'ai-config-section';
  wrap.innerHTML = `
    <div class="section-header" onclick="toggleSection(this)">
      <span>🤖 AI Builder Settings</span><span class="arrow">▼</span>
    </div>
    <div class="section-body">
      <div class="block">
        <h4>LLM endpoint</h4>
        <input type="text" id="aiEndpoint" placeholder="https://your-host/api/ai-builder"
               style="width:100%;padding:4px;margin-bottom:4px;">
        <input type="password" id="aiKey" placeholder="API key (optional)"
               style="width:100%;padding:4px;margin-bottom:4px;">
        <button class="btn btn-secondary" onclick="saveAIConfig()" style="width:100%;">
          💾 Save config
        </button>
        <p style="font-size:10px;color:#888;margin-top:6px;">
          Without an endpoint, the builder uses the offline keyword planner.
          With one, prompts go through your LLM proxy.
        </p>
      </div>

      <div class="block">
        <h4>Style presets</h4>
        <div id="aiStyleGrid" style="display:grid;grid-template-columns:1fr 1fr;gap:4px;"></div>
        <button class="btn btn-primary" onclick="generateFromAIPrompt()" style="width:100%;margin-top:6px;">
          ✨ Generate from prompt
        </button>
      </div>

      <div class="block">
        <h4>Auto-furnish active room</h4>
        <button class="btn btn-secondary" onclick="autoFurnishActiveRoom()" style="width:100%;">
          🪑 Fill with template props
        </button>
      </div>
    </div>
  `;
  sidebar.appendChild(wrap);

  document.getElementById('aiEndpoint').value = AI_BUILDER.config.endpoint;
  document.getElementById('aiKey').value = AI_BUILDER.config.apiKey;

  const grid = document.getElementById('aiStyleGrid');
  Object.entries(AI_BUILDER.stylePresets).forEach(([k, s]) => {
    const b = document.createElement('button');
    b.className = 'btn btn-secondary';
    b.style.cssText = 'font-size:11px;padding:6px;text-align:left;';
    b.innerHTML = '<strong>' + s.name + '</strong>';
    b.title = s.description;
    b.onclick = () => applyStyleToSchool(k);
    grid.appendChild(b);
  });
}

function saveAIConfig() {
  AI_BUILDER.config.endpoint = document.getElementById('aiEndpoint').value.trim();
  AI_BUILDER.config.apiKey = document.getElementById('aiKey').value.trim();
  localStorage.setItem('ai-builder-endpoint', AI_BUILDER.config.endpoint);
  localStorage.setItem('ai-builder-key', AI_BUILDER.config.apiKey);
  showStatus('AI config saved', 'success');
}

function autoFurnishActiveRoom() {
  const room = window.getActiveRoom?.();
  if (!room) { showStatus('No active room', 'error'); return; }
  autoFurnishRoom(room);
}

/* ------------------- hook existing generate button ------------------- */
(function () {
  function ready(fn) {
    if (typeof window.generateSchoolFromPrompt === 'function') fn();
    else setTimeout(() => ready(fn), 80);
  }
  ready(() => {
    // Override the existing button handler so it uses the AI pipeline
    window.generateSchoolFromPrompt = generateFromAIPrompt;
  });
})();

/* ------------------- init ------------------- */
(function () {
  function whenReady(fn) {
    if (window.scene && typeof window.getActiveRoom === 'function') fn();
    else setTimeout(() => whenReady(fn), 80);
  }
  whenReady(() => {
    ensureAISettingsUI();
    window.generateFromAIPrompt = generateFromAIPrompt;
    window.applyStyleToSchool = applyStyleToSchool;
    window.autoFurnishRoom = autoFurnishRoom;
  });
})();