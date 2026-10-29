/* ===================================================================
   SCHOOL OBJECTS — doors, windows, extra school props
   Registers new factories and overrides addComponentFromLibrary so
   the new items behave exactly like the existing library items.
   =================================================================== */

/* ---------- door factories ---------- */
function createDoorWood() {
    const g = new THREE.Group();
    const frame = new THREE.MeshLambertMaterial({ color: 0x6B4423 });
    const panel = new THREE.MeshLambertMaterial({ color: 0x8B5A2B });

    const jamb = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.4, 0.15), frame);
    jamb.position.set(0, 1.2, 0);
    g.add(jamb);
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.2, 0.08), panel);
    door.position.set(0, 1.15, 0.1);
    g.add(door);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8),
        new THREE.MeshLambertMaterial({ color: 0xC8A050 }));
    knob.position.set(0.35, 1.1, 0.18);
    g.add(knob);
    return g;
}

function createDoorMetal() {
    const g = new THREE.Group();
    const metal = new THREE.MeshLambertMaterial({ color: 0x6E7A85 });
    const jamb = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.4, 0.15), metal);
    jamb.position.set(0, 1.2, 0);
    g.add(jamb);
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.2, 0.08), metal);
    door.position.set(0, 1.15, 0.1);
    g.add(door);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.05),
        new THREE.MeshLambertMaterial({ color: 0xC0C8D0 }));
    bar.position.set(0, 1.0, 0.18);
    g.add(bar);
    return g;
}

function createDoorGlass() {
    const g = new THREE.Group();
    const frame = new THREE.MeshLambertMaterial({ color: 0x505050 });
    const jamb = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.4, 0.12), frame);
    jamb.position.set(0, 1.2, 0);
    g.add(jamb);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.2, 0.04),
        new THREE.MeshLambertMaterial({
            color: 0xB8D8E8, transparent: true, opacity: 0.4
        }));
    glass.position.set(0, 1.15, 0.1);
    g.add(glass);
    return g;
}

/* ---------- window factories ---------- */
function createWindowSmall() {
    const g = new THREE.Group();
    const frame = new THREE.MeshLambertMaterial({ color: 0xF0F0F0 });
    const glass = new THREE.MeshLambertMaterial({
        color: 0xB8D8E8, transparent: true, opacity: 0.35
    });

    const outer = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 0.1), frame);
    g.add(outer);
    const pane = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 0.05), glass);
    pane.position.z = 0.06;
    g.add(pane);
    const mullionV = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.0, 0.04), frame);
    mullionV.position.z = 0.09; g.add(mullionV);
    const mullionH = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.06, 0.04), frame);
    mullionH.position.z = 0.09; g.add(mullionH);
    return g;
}

function createWindowLarge() {
    const g = new THREE.Group();
    const frame = new THREE.MeshLambertMaterial({ color: 0xF0F0F0 });
    const glass = new THREE.MeshLambertMaterial({
        color: 0xB8D8E8, transparent: true, opacity: 0.35
    });
    const outer = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.8, 0.1), frame);
    g.add(outer);
    const pane = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 0.05), glass);
    pane.position.z = 0.06;
    g.add(pane);
    for (let i = -1; i <= 1; i++) {
        const v = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.6, 0.04), frame);
        v.position.set(i * 0.7, 0, 0.09);
        g.add(v);
    }
    return g;
}

/* ---------- extra school props ---------- */
function createDesk() {
    const g = new THREE.Group();
    const wood = new THREE.MeshLambertMaterial({ color: 0x8B6B4A });
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.8), wood);
    top.position.y = 1.5;
    g.add(top);
    const legMat = new THREE.MeshLambertMaterial({ color: 0x606060 });
    for (let i = 0; i < 4; i++) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.5, 8), legMat);
        leg.position.set(i % 2 === 0 ? -0.7 : 0.7, 0.75, i < 2 ? -0.3 : 0.3);
        g.add(leg);
    }
    return g;
}
function createChalkboard() {
    const g = new THREE.Group();
    const board = new THREE.Mesh(
        new THREE.BoxGeometry(3.5, 1.4, 0.08),
        new THREE.MeshLambertMaterial({ color: 0x1A3D1A })
    );
    board.position.y = 2.2;
    g.add(board);
    const frameMat = new THREE.MeshLambertMaterial({ color: 0x4A2F18 });
    const frame = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.5, 0.04), frameMat);
    frame.position.set(0, 2.2, -0.06);
    g.add(frame);
    return g;
}
function createLocker() {
    const g = new THREE.Group();
    const metal = new THREE.MeshLambertMaterial({ color: 0x6E8AA0 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2.0, 0.5), metal);
    body.position.y = 1.0;
    g.add(body);
    for (let i = -1; i <= 1; i++) {
        const vent = new THREE.Mesh(
            new THREE.BoxGeometry(0.4, 0.04, 0.02),
            new THREE.MeshLambertMaterial({ color: 0x405060 })
        );
        vent.position.set(0, 1.7 + i * 0.06, 0.26);
        g.add(vent);
    }
    const handle = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.2, 0.04),
        new THREE.MeshLambertMaterial({ color: 0xC0C8D0 })
    );
    handle.position.set(0.2, 1.0, 0.26);
    g.add(handle);
    return g;
}
function createClock() {
    const g = new THREE.Group();
    const face = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.4, 0.06, 24),
        new THREE.MeshLambertMaterial({ color: 0xFFFFFF })
    );
    face.rotation.x = Math.PI / 2;
    face.position.y = 2.5;
    g.add(face);
    const rim = new THREE.Mesh(
        new THREE.TorusGeometry(0.4, 0.03, 8, 24),
        new THREE.MeshLambertMaterial({ color: 0x303030 })
    );
    rim.position.y = 2.5;
    g.add(rim);
    return g;
}
function createGlobe() {
    const g = new THREE.Group();
    const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.3, 0.15, 16),
        new THREE.MeshLambertMaterial({ color: 0x3A2410 })
    );
    base.position.y = 0.075;
    g.add(base);
    const stand = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, 0.9, 8),
        new THREE.MeshLambertMaterial({ color: 0x606060 })
    );
    stand.position.y = 0.55;
    g.add(stand);
    const globe = new THREE.Mesh(
        new THREE.SphereGeometry(0.35, 20, 16),
        new THREE.MeshLambertMaterial({ color: 0x4A90C8 })
    );
    globe.position.y = 1.2;
    g.add(globe);
    return g;
}
function createBench() {
    const g = new THREE.Group();
    const wood = new THREE.MeshLambertMaterial({ color: 0x8B6B4A });
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.1, 0.5), wood);
    top.position.y = 0.5;
    g.add(top);
    for (const x of [-0.8, 0.8]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.4),
            new THREE.MeshLambertMaterial({ color: 0x4A2F18 }));
        leg.position.set(x, 0.25, 0);
        g.add(leg);
    }
    return g;
}

/* ---------- register factories ---------- */
window.EXTRA_FACTORIES = {
    door_wood:   { create: createDoorWood,   layer: 'Doors',    name: 'Wood Door',    scale: 1 },
    door_metal:  { create: createDoorMetal,  layer: 'Doors',    name: 'Metal Door',   scale: 1 },
    door_glass:  { create: createDoorGlass,  layer: 'Doors',    name: 'Glass Door',   scale: 1 },
    window_small:{ create: createWindowSmall, layer: 'Windows', name: 'Small Window', scale: 1 },
    window_large:{ create: createWindowLarge, layer: 'Windows', name: 'Large Window', scale: 1 },
    desk:        { create: createDesk,       layer: 'Furniture', name: 'Desk',         scale: 0.8 },
    chalkboard:  { create: createChalkboard, layer: 'Decor',     name: 'Chalkboard',   scale: 1 },
    locker:      { create: createLocker,     layer: 'Furniture', name: 'Locker',       scale: 1 },
    clock:       { create: createClock,      layer: 'Decor',     name: 'Clock',        scale: 1 },
    globe:       { create: createGlobe,      layer: 'Decor',     name: 'Globe',        scale: 1 },
    bench:       { create: createBench,      layer: 'Furniture', name: 'Bench',        scale: 1 }
};

/* ---------- layer registration ---------- */
if (window.LAYER_FOR_TYPE) {
    Object.keys(window.EXTRA_FACTORIES).forEach(k => { LAYER_FOR_TYPE[k] = window.EXTRA_FACTORIES[k].layer; });
}
if (window.LAYER_ICONS) {
    LAYER_ICONS.Doors = '🚪';
    LAYER_ICONS.Windows = '🪟';
}
if (window.LAYER_ORDER && !LAYER_ORDER.includes('Doors')) {
    LAYER_ORDER.splice(LAYER_ORDER.indexOf('Shapes') + 1, 0, 'Doors', 'Windows');
}

/* ---------- override addComponentFromLibrary ---------- */
(function () {
    const _orig = window.addComponentFromLibrary;
    window.addComponentFromLibrary = function (type) {
        const extra = window.EXTRA_FACTORIES?.[type];
        if (!extra) return _orig(type);

        const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        const pos = new THREE.Vector3().copy(camera.position).add(dir.multiplyScalar(5));
        pos.y = 0;

        const mesh = extra.create();
        mesh.position.copy(pos);
        mesh.scale.set(extra.scale, extra.scale, extra.scale);
        mesh.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
        mesh.userData = {
            isComponent: true,
            type: type,
            id: Date.now() + Math.random(),
            name: generateObjectName(type, extra.name),
            layer: extra.layer,
            locked: false
        };

        scene.add(mesh);
        components.push(mesh);
        selectComponent(mesh);
        renderLayersPanel();
        showStatus(mesh.userData.name + ' added!', 'success');
    };
})();

/* ---------- patch generateObjectName to support new types ---------- */
(function () {
    const _orig = window.generateObjectName;
    window.generateObjectName = function (type, overrideName) {
        if (window.EXTRA_FACTORIES?.[type] || overrideName) {
            const base = overrideName || window.EXTRA_FACTORIES[type].name;
            const existing = components.map(c => c.userData.name).filter(Boolean);
            let n = 1;
            let name = base + ' ' + n;
            while (existing.includes(name)) { n++; name = base + ' ' + n; }
            return name;
        }
        return _orig(type);
    };
})();

/* ---------- inject new objects into the library UI ---------- */
(function () {
    function inject() {
        const lib = document.querySelector('.model-library');
        if (!lib || document.getElementById('extra-library-category')) return;

        const cat = document.createElement('div');
        cat.className = 'model-category';
        cat.id = 'extra-library-category';
        cat.innerHTML = `
            <h5>🚪 Doors</h5>
            <div class="model-list">
                <div class="model-item" data-model="door_wood">Wood</div>
                <div class="model-item" data-model="door_metal">Metal</div>
                <div class="model-item" data-model="door_glass">Glass</div>
            </div>
            <h5>🪟 Windows</h5>
            <div class="model-list">
                <div class="model-item" data-model="window_small">Small</div>
                <div class="model-item" data-model="window_large">Large</div>
            </div>
            <h5>📚 School Props</h5>
            <div class="model-list">
                <div class="model-item" data-model="desk">Desk</div>
                <div class="model-item" data-model="chalkboard">Board</div>
                <div class="model-item" data-model="locker">Locker</div>
                <div class="model-item" data-model="clock">Clock</div>
                <div class="model-item" data-model="globe">Globe</div>
                <div class="model-item" data-model="bench">Bench</div>
            </div>
        `;
        lib.appendChild(cat);

        cat.querySelectorAll('.model-item').forEach(item => {
            item.addEventListener('click', function () {
                addComponentFromLibrary(this.getAttribute('data-model'));
            });
        });
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(inject, 80));
    } else {
        setTimeout(inject, 80);
    }
})();