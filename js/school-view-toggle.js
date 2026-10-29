/* ===================================================================
   INSIDE / OUTSIDE VIEW TOGGLE
   FrontSide  = inside view  (matches original creator.js behaviour)
   BackSide   = outside view (shows the exterior shell)
   =================================================================== */

window.ROOM_VIEW = window.ROOM_VIEW || { mode: 'inside' };

const _savedCameras = { inside: null, outside: null };

/* ---------------------------------------------------------
   Toggle state
   --------------------------------------------------------- */
function setRoomViewMode(mode) {
    mode = (mode === 'outside') ? 'outside' : 'inside';
    const prev = window.ROOM_VIEW.mode;

    /* Save the camera of the mode we're leaving */
    if (typeof camera !== 'undefined' && typeof controls !== 'undefined' && prev !== mode) {
        _savedCameras[prev] = {
            pos: camera.position.clone(),
            target: controls.target.clone()
        };
    }

    window.ROOM_VIEW.mode = mode;

    /* Apply the correct side to every room surface */
    const side = (mode === 'inside') ? THREE.FrontSide : THREE.BackSide;
    if (typeof environment !== 'undefined' && environment) {
        environment.traverse(o => {
            if (o.isMesh && o.userData &&
                (o.userData.isWall || o.userData.isFloor || o.userData.isCeiling)) {
                if (o.material) {
                    o.material.side = side;
                    o.material.needsUpdate = true;
                }
            }
        });
    }

    /* Move the camera */
    if (typeof camera !== 'undefined' && typeof controls !== 'undefined') {
        const saved = _savedCameras[mode];
        if (saved) {
            camera.position.copy(saved.pos);
            controls.target.copy(saved.target);
        } else if (mode === 'inside') {
            /* Matches the original creator.js initial camera */
            camera.position.set(0, 3, 8);
            controls.target.set(0, 3, 0);
        } else {
            /* Bird's-eye view of the shell */
            camera.position.set(14, 10, 16);
            controls.target.set(0, 3, 0);
        }
        controls.update();
    }

    /* Button state */
    document.querySelectorAll('.room-view-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.view === mode);
    });

    if (typeof showStatus === 'function') {
        showStatus(mode === 'inside'
            ? '🏠 Inside view — looking into the room'
            : '🌐 Outside view — exterior shell',
            'info');
    }
}
window.setRoomViewMode = setRoomViewMode;

/* ---------------------------------------------------------
   Inject the toggle UI into the canvas
   --------------------------------------------------------- */
function ensureRoomViewToggle() {
    if (document.getElementById('room-view-toggle')) return;
    const main = document.querySelector('.main-content');
    if (!main) { setTimeout(ensureRoomViewToggle, 150); return; }

    const div = document.createElement('div');
    div.id = 'room-view-toggle';
    div.innerHTML = `
        <button class="room-view-btn active" data-view="inside"  title="Inside view (front wall transparent)">🏠 Inside</button>
        <button class="room-view-btn"        data-view="outside" title="Outside view (exterior shell)">🌐 Outside</button>
    `;
    main.appendChild(div);

    div.querySelectorAll('.room-view-btn').forEach(b => {
        b.onclick = () => setRoomViewMode(b.dataset.view);
    });

    updateRoomViewVisibility();
}

/* ---------------------------------------------------------
   Show / hide the toggle depending on context
   --------------------------------------------------------- */
function updateRoomViewVisibility() {
    const el = document.getElementById('room-view-toggle');
    if (!el) return;

    /* Hide in tour */
    if (document.body.classList.contains('tour-mode') ||
        document.body.classList.contains('mode-tour')) {
        el.style.display = 'none';
        return;
    }

    /* Hide in overview sub-view */
    const overviewActive = document.querySelector('.sub-btn[data-view="overview"].active');
    if (overviewActive) {
        el.style.display = 'none';
        return;
    }

    /* Hide when no environment exists yet */
    if (typeof environment === 'undefined' || !environment) {
        el.style.display = 'none';
        return;
    }

    el.style.display = 'flex';
}

/* ---------------------------------------------------------
   Re-apply the current side after createEnvironment runs
   (materials are rebuilt inside createRoom each time)
   --------------------------------------------------------- */
(function () {
    function whenReady(fn) {
        if (typeof window.createEnvironment === 'function' &&
            typeof window.setRoomViewMode === 'function') fn();
        else setTimeout(() => whenReady(fn), 120);
    }
    whenReady(() => {
        const _orig = window.createEnvironment;
        window.createEnvironment = function () {
            const firstBuild = (typeof environment === 'undefined' || !environment);
            const result = _orig.apply(this, arguments);
            /* new meshes use FrontSide by default (inside),
               so re-apply current view mode's side */
            setTimeout(() => {
                if (window.ROOM_VIEW.mode === 'outside') {
                    const side = THREE.BackSide;
                    if (typeof environment !== 'undefined' && environment) {
                        environment.traverse(o => {
                            if (o.isMesh && o.userData &&
                                (o.userData.isWall || o.userData.isFloor || o.userData.isCeiling)) {
                                if (o.material) {
                                    o.material.side = side;
                                    o.material.needsUpdate = true;
                                }
                            }
                        });
                    }
                }
                updateRoomViewVisibility();
            }, 200);
            return result;
        };
    });
})();

/* ---------------------------------------------------------
   Periodic visibility sync
   --------------------------------------------------------- */
(function () {
    function whenReady(fn) {
        if (document.querySelector('.main-content')) fn();
        else setTimeout(() => whenReady(fn), 120);
    }
    whenReady(() => {
        ensureRoomViewToggle();
        setInterval(updateRoomViewVisibility, 600);
    });
})();

/* ---------------------------------------------------------
   Reset to inside on first load (matches original behaviour)
   --------------------------------------------------------- */
(function () {
    function whenReady(fn) {
        if (typeof scene !== 'undefined' && scene &&
            typeof environment !== 'undefined' &&
            typeof getActiveRoom === 'function') fn();
        else setTimeout(() => whenReady(fn), 200);
    }
    whenReady(() => {
        /* Only fires after the user has built an environment at least once */
        setInterval(() => {
            if (typeof environment !== 'undefined' && environment &&
                !window.ROOM_VIEW.__initialApplied) {
                window.ROOM_VIEW.__initialApplied = true;
                setRoomViewMode('inside');
            }
        }, 400);
    });
})();