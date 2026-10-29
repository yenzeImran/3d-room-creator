/* ===================================================================
   SCHOOL MATERIALS
   Per-wall colour + palette, per-room floor & ceiling, live editing.
   Overrides createRoom / createEnvironment from creator.js so that
   every wall always exists as its own mesh with its own material.
   =================================================================== */

/* ---------- palettes ---------- */
const WALL_PALETTE = [
    '#FFFFFF','#F5F5F5','#E8E8E8','#C8C8C8','#808080','#404040',
    '#FFF8E7','#FFE4C4','#FFDAB9','#F5DEB3','#DEB887',
    '#FFE4E1','#FFC0CB','#E6B8C8','#D8A0B8',
    '#E0F0FF','#B0D8F0','#90C0E8','#6090C0',
    '#E0FFE0','#B8E8B8','#90D090','#68B068',
    '#F0E0FF','#D8C0F0','#C0A0E0',
    '#FFE8A0','#FFD060','#FFB020',
    '#A0C0A0','#6090A0','#3A5A7A','#6B4423','#4A2F18'
];
const FLOOR_PALETTE = [
    '#FFFFFF','#F0E8D8','#E0D0B0','#C8B090','#A88868','#806040','#503020',
    '#F5DEB3','#DEB887','#C8A878','#8B6B4A','#6B4B2A',
    '#E0E0E0','#C0C0C0','#909090','#606060','#303030',
    '#E8F0E8','#C8D8C8','#A8B8A8',
    '#FFE8D0','#FFD8A8','#E8B888','#D8A070'
];
const CEILING_PALETTE = [
    '#FFFFFF','#F8F8F8','#F0F0F0','#E8E8E8','#D8D8D8',
    '#FFF8F0','#FFF0E0','#F8E8D0',
    '#F0F8FF','#E8F0FF',
    '#F0FFF0','#E8F8E8',
    '#F8F0FF','#F0E8FF'
];

/* ---------- state helpers (read from active room) ---------- */
let activeWallIndex = 0;

function getWallLabelAtIndex(i) {
    return wallPositions[i]?.label || 'Back Wall';
}
function getWallMaterial(label) {
    const room = getActiveRoom();
    if (!room) return { color: '#ffffff', textureURL: null };
    if (!room.wallMaterials) room.wallMaterials = {};
    if (!room.wallMaterials[label]) {
        room.wallMaterials[label] = { color: '#ffffff', textureURL: null };
    }
    return room.wallMaterials[label];
}
function getFloorMaterial() {
    const room = getActiveRoom();
    if (!room) return { color: '#ffffff', textureURL: null };
    if (!room.floorMaterial) room.floorMaterial = { color: '#ffffff', textureURL: null };
    return room.floorMaterial;
}
function getCeilingMaterial() {
    const room = getActiveRoom();
    if (!room) return { color: '#ffffff', textureURL: null };
    if (!room.ceilingMaterial) room.ceilingMaterial = { color: '#ffffff', textureURL: null };
    return room.ceilingMaterial;
}


/* ---------- override environment build ---------- */
window.createEnvironment = function () {
    showLoading(false); // Force hide loading
    if (environment) { scene.remove(environment); environment = null; }
    
    const type = document.getElementById('envType').value;
    try {
        switch (type) {
            case 'room': createRoom(); break;
            case 'cube': createCubeEnv(); break;
            case 'sphere': createSphereEnv(); break;
            case 'cylinder': createCylinderEnv(); break;
        }
        if (window.setRoomViewMode) window.setRoomViewMode('inside'); // Force inside view
    } catch (err) {
        console.error(err);
        showStatus('Error: ' + err.message, 'error');
    }
};

window.createRoom = function () {
    environment = new THREE.Group();
    const room = getActiveRoom();
    const size = room?.size || { w: 10, h: 8, d: 10 };
    const H = size.h, W = size.w, D = size.d;

    if (room) environment.position.set(room.offset.x, room.offset.y, room.offset.z);

    /* FLOOR */
    const fm = getFloorMaterial();
    const floorTex = fm.textureURL === '__NONE__' ? null : (baseTexture || fm.texture || null);
    const floorMat = new THREE.MeshLambertMaterial({
        color: fm.color || 0xcccccc, // Default grey
        map: floorTex,
        side: THREE.FrontSide
    });
    const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(W, D), floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.receiveShadow = true;
    floorMesh.userData = { isFloor: true };
    environment.add(floorMesh);
    if (room) room.floorMesh = floorMesh;

    /* WALLS */
    if (room) room.wallMeshes = [];
    wallPositions.forEach((wall, i) => {
        const wm = getWallMaterial(wall.label);
        const isSide = wall.label === 'Left Wall' || wall.label === 'Right Wall';
        const wallW = isSide ? D : W;
        const tex = wm.textureURL === '__NONE__' ? null : (wm.texture || wallTextures[i] || null);

        const mat = new THREE.MeshLambertMaterial({
            color: wm.color || 0xeeeeee, // Default light grey
            map: tex,
            side: THREE.FrontSide
        });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(wallW, H), mat);
        mesh.position.set(wall.pos[0], wall.pos[1], wall.pos[2]);
        mesh.rotation.set(wall.rot[0], wall.rot[1], wall.rot[2]);
        mesh.receiveShadow = true;
        mesh.userData = { isWall: true, wallIndex: i, wallLabel: wall.label };
        if (room) room.wallMeshes.push(mesh);
        environment.add(mesh);
    });

    /* CEILING */
    const cm = getCeilingMaterial();
    const ceilTex = cm.textureURL === '__NONE__' ? null : (roofTexture || cm.texture || null);
    const ceilMat = new THREE.MeshLambertMaterial({
        color: cm.color || 0xdddddd,
        map: ceilTex,
        side: THREE.FrontSide
    });
    const ceilMesh = new THREE.Mesh(new THREE.PlaneGeometry(W, D), ceilMat);
    ceilMesh.rotation.x = Math.PI / 2;
    ceilMesh.position.y = H;
    ceilMesh.userData = { isCeiling: true };
    environment.add(ceilMesh);
    if (room) room.ceilingMesh = ceilMesh;

    scene.add(environment);
};

window.createRoom = function () {
    environment = new THREE.Group();
    const room = getActiveRoom();
    const size = room?.size || { w: 10, h: 8, d: 10 };
    const H = size.h, W = size.w, D = size.d;

    // NEW: Move the entire room group to its actual position in the school layout
    if (room) {
        environment.position.set(room.offset.x, room.offset.y, room.offset.z);
    }

    /* FLOOR */
    const fm = getFloorMaterial();
    const floorTex = fm.textureURL === '__NONE__' ? null : (baseTexture || fm.texture || null);
    const floorMat = new THREE.MeshLambertMaterial({
        color: fm.color || 0xffffff,
        map: floorTex,
        side: THREE.FrontSide
    });
    const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(W, D), floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.receiveShadow = true;
    floorMesh.userData = { isFloor: true };
    environment.add(floorMesh);
    if (room) room.floorMesh = floorMesh;

    /* WALLS — all four, always */
    if (room) room.wallMeshes = [];
    wallPositions.forEach((wall, i) => {
        const wm = getWallMaterial(wall.label);
        const isSide = wall.label === 'Left Wall' || wall.label === 'Right Wall';
        const wallW = isSide ? D : W;
        const tex = wm.textureURL === '__NONE__'
            ? null
            : (wm.texture || wallTextures[i] || null);

        const mat = new THREE.MeshLambertMaterial({
            color: wm.color || 0xffffff,
            map: tex,
            side: THREE.FrontSide
        });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(wallW, H), mat);
        mesh.position.set(wall.pos[0], wall.pos[1], wall.pos[2]);
        mesh.rotation.set(wall.rot[0], wall.rot[1], wall.rot[2]);
        mesh.receiveShadow = true;
        mesh.userData = { isWall: true, wallIndex: i, wallLabel: wall.label };
        if (room) room.wallMeshes.push(mesh);
        environment.add(mesh);
    });

    /* CEILING */
    const cm = getCeilingMaterial();
    const ceilTex = cm.textureURL === '__NONE__' ? null : (roofTexture || cm.texture || null);
    const ceilMat = new THREE.MeshLambertMaterial({
        color: cm.color || 0xffffff,
        map: ceilTex,
        side: THREE.FrontSide
    });
    const ceilMesh = new THREE.Mesh(new THREE.PlaneGeometry(W, D), ceilMat);
    ceilMesh.rotation.x = Math.PI / 2;
    ceilMesh.position.y = H;
    ceilMesh.userData = { isCeiling: true };
    environment.add(ceilMesh);
    if (room) room.ceilingMesh = ceilMesh;

    scene.add(environment);
};

/* ---------- live updates ---------- */
function setWallColor(wallIndex, color) {
    const label = getWallLabelAtIndex(wallIndex);
    getWallMaterial(label).color = color;
    const room = getActiveRoom();
    const mesh = room?.wallMeshes?.[wallIndex];
    if (mesh?.material) { mesh.material.color.set(color); mesh.material.needsUpdate = true; }
    const picker = document.getElementById('wallColorPicker');
    if (picker && activeWallIndex === wallIndex) picker.value = color;
    updateWallTabDots();
}
function setFloorColor(color) {
    getFloorMaterial().color = color;
    const room = getActiveRoom();
    if (room?.floorMesh?.material) {
        room.floorMesh.material.color.set(color);
        room.floorMesh.material.needsUpdate = true;
    }
    const picker = document.getElementById('floorColorPicker');
    if (picker) picker.value = color;
}
function setCeilingColor(color) {
    getCeilingMaterial().color = color;
    const room = getActiveRoom();
    if (room?.ceilingMesh?.material) {
        room.ceilingMesh.material.color.set(color);
        room.ceilingMesh.material.needsUpdate = true;
    }
    const picker = document.getElementById('ceilingColorPicker');
    if (picker) picker.value = color;
}

function applyWallColorToAll() {
    const label = getWallLabelAtIndex(activeWallIndex);
    const color = getWallMaterial(label).color || '#ffffff';
    wallPositions.forEach((w, i) => {
        getWallMaterial(w.label).color = color;
        const room = getActiveRoom();
        const mesh = room?.wallMeshes?.[i];
        if (mesh?.material) { mesh.material.color.set(color); mesh.material.needsUpdate = true; }
    });
    updateWallTabDots();
    showStatus('Applied to all four walls', 'success');
}

function clearWallTexture(wallIndex) {
    const label = getWallLabelAtIndex(wallIndex);
    getWallMaterial(label).textureURL = '__NONE__';
    const room = getActiveRoom();
    const mesh = room?.wallMeshes?.[wallIndex];
    if (mesh?.material) { mesh.material.map = null; mesh.material.needsUpdate = true; }
    showStatus('Wall texture removed (' + label + ')', 'info');
}

function selectWall(index) {
    activeWallIndex = index;
    document.querySelectorAll('.wall-tab').forEach(t => {
        t.classList.toggle('active', parseInt(t.dataset.wall) === index);
    });
    const label = getWallLabelAtIndex(index);
    const wm = getWallMaterial(label);
    const picker = document.getElementById('wallColorPicker');
    if (picker) picker.value = wm.color || '#ffffff';
    updateWallTabDots();
}

function updateWallTabDots() {
    document.querySelectorAll('.wall-tab').forEach(t => {
        const i = parseInt(t.dataset.wall);
        const label = getWallLabelAtIndex(i);
        const wm = getWallMaterial(label);
        const dot = t.querySelector('.wall-color-dot');
        if (dot) dot.style.background = wm.color || '#ffffff';
    });
}

/* ---------- sidebar UI ---------- */
function ensureMaterialsSidebar() {
    if (document.getElementById('materials-section')) return;
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;

    const wrap = document.createElement('div');
    wrap.id = 'materials-section';
    wrap.innerHTML = `
    <div class="section-header" onclick="toggleSection(this)">
        <span>🎨 Materials &amp; Colours</span><span class="arrow">▼</span>
    </div>
    <div class="section-body">
        <div class="block">
            <h4>🟦 Wall Materials (per wall)</h4>
            <div class="wall-tabs">
                <button class="wall-tab active" data-wall="0">Back<span class="wall-color-dot"></span></button>
                <button class="wall-tab" data-wall="1">Left<span class="wall-color-dot"></span></button>
                <button class="wall-tab" data-wall="2">Right<span class="wall-color-dot"></span></button>
                <button class="wall-tab" data-wall="3">Front<span class="wall-color-dot"></span></button>
            </div>
            <div class="property-control" style="margin-top:8px;">
                <label>Colour:</label>
                <input type="color" id="wallColorPicker" value="#ffffff">
            </div>
            <div class="palette" id="wallPalette"></div>
            <div style="display:flex;gap:5px;margin-top:8px;">
                <button class="btn btn-secondary" onclick="applyWallColorToAll()" style="flex:1;">Apply to all walls</button>
                <button class="btn btn-secondary" onclick="clearWallTexture(activeWallIndex)" style="flex:1;">Remove wall texture</button>
            </div>
        </div>

        <div class="block">
            <h4>🟫 Floor Material</h4>
            <input type="color" id="floorColorPicker" value="#ffffff" style="width:100%;padding:3px;">
            <div class="palette" id="floorPalette"></div>
            <button class="btn btn-secondary" onclick="clearFloorTexture()" style="width:100%;margin-top:8px;">Remove floor texture</button>
        </div>

        <div class="block">
            <h4>⬜ Ceiling Material</h4>
            <input type="color" id="ceilingColorPicker" value="#ffffff" style="width:100%;padding:3px;">
            <div class="palette" id="ceilingPalette"></div>
            <button class="btn btn-secondary" onclick="clearCeilingTexture()" style="width:100%;margin-top:8px;">Remove ceiling texture</button>
        </div>
    </div>
    `;
    sidebar.appendChild(wrap);

    buildPalette('wallPalette', WALL_PALETTE, c => setWallColor(activeWallIndex, c));
    buildPalette('floorPalette', FLOOR_PALETTE, c => setFloorColor(c));
    buildPalette('ceilingPalette', CEILING_PALETTE, c => setCeilingColor(c));

    document.querySelectorAll('.wall-tab').forEach(t => {
        t.onclick = () => selectWall(parseInt(t.dataset.wall));
    });
    document.getElementById('wallColorPicker').oninput = e => setWallColor(activeWallIndex, e.target.value);
    document.getElementById('floorColorPicker').oninput = e => setFloorColor(e.target.value);
    document.getElementById('ceilingColorPicker').oninput = e => setCeilingColor(e.target.value);

    selectWall(0);
}

function buildPalette(containerId, colors, onPick) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = '';
    colors.forEach(c => {
        const sw = document.createElement('div');
        sw.className = 'palette-swatch';
        sw.style.background = c;
        sw.title = c;
        sw.onclick = () => {
            el.querySelectorAll('.palette-swatch').forEach(s => s.classList.remove('active'));
            sw.classList.add('active');
            onPick(c);
        };
        el.appendChild(sw);
    });
}

function clearFloorTexture() {
    getFloorMaterial().textureURL = '__NONE__';
    const room = getActiveRoom();
    if (room?.floorMesh?.material) { room.floorMesh.material.map = null; room.floorMesh.material.needsUpdate = true; }
    showStatus('Floor texture removed', 'info');
}
function clearCeilingTexture() {
    getCeilingMaterial().textureURL = '__NONE__';
    const room = getActiveRoom();
    if (room?.ceilingMesh?.material) { room.ceilingMesh.material.map = null; room.ceilingMesh.material.needsUpdate = true; }
    showStatus('Ceiling texture removed', 'info');
}

/* ---------- sync when active room changes ---------- */
function refreshMaterialsUI() {
    ensureMaterialsSidebar();
    const room = getActiveRoom();
    if (!room) return;
    if (!room.wallMaterials) room.wallMaterials = {};
    selectWall(activeWallIndex);
    const fm = getFloorMaterial();
    const cm = getCeilingMaterial();
    const fp = document.getElementById('floorColorPicker');
    const cp = document.getElementById('ceilingColorPicker');
    if (fp) fp.value = fm.color || '#ffffff';
    if (cp) cp.value = cm.color || '#ffffff';
}

/* ---------- auto-init & rebind on room change ---------- */
(function () {
    function whenReady(fn) {
        if (typeof scene !== 'undefined' && scene && typeof getActiveRoom === 'function') fn();
        else setTimeout(() => whenReady(fn), 60);
    }
    whenReady(() => {
        ensureMaterialsSidebar();
        refreshMaterialsUI();

        const _origSetActiveRoom = window.setActiveRoom;
        window.setActiveRoom = function (id) {
            _origSetActiveRoom(id);
            setTimeout(refreshMaterialsUI, 120);
        };
    });
})();