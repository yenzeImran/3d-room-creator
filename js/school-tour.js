/* ===================================================================
   TOUR MODE — first-person walk + door teleport
   =================================================================== */

let _tourOrigRender = null;
let _tourOrigControlsUpdate = null;
let _tourPatched = false;

function patchForTourMode() {
  if (_tourPatched || !window.renderer || !window.controls) return;
  _tourOrigRender = renderer.render.bind(renderer);
  _tourOrigControlsUpdate = controls.update.bind(controls);

  renderer.render = function (s, c) {
    if (school.tour.active) return;
    return _tourOrigRender(s, c);
  };
  controls.update = function () {
    if (school.tour.active) return;
    return _tourOrigControlsUpdate();
  };
  _tourPatched = true;
}

function enterTourMode(startRoomId) {
  if (!school.rooms.length) { showStatus('Build a school first', 'error'); return; }
  if (school.tour.active) return;

  patchForTourMode();

  saveEditorStateToRoom();
  clearEditorScene();
  transformControls.detach();
  transformControls.visible = false;

  school.tour.active = true;
  buildTourScene();

  const start = startRoomId || school.tour.currentRoomId || school.startRoomId || school.rooms[0].id;
  travelToRoom(start, { fade: false });

  document.body.classList.add('tour-mode');
  if (window.renderSchoolUI) renderSchoolUI();
  showStatus('Tour mode — WASD to walk, drag or click to look, click a door to travel. ESC to exit.', 'info');
}

function exitTourMode() {
  if (!school.tour.active) return;
  school.tour.active = false;

  teardownTourScene();
  transformControls.visible = true;

  const room = getRoomById(school.activeRoomId) || school.rooms[0];
  if (room) restoreEditorStateFromRoom(room);

  document.body.classList.remove('tour-mode');
  if (document.exitPointerLock) document.exitPointerLock();
  if (window.renderSchoolUI) renderSchoolUI();
  showStatus('Exited tour mode', 'info');
}

function travelToRoom(roomId, opts = {}) {
  const room = getRoomById(roomId);
  if (!room) return;

  school.tour.currentRoomId = roomId;
  updateTourVisibility(roomId);

  const spawn = opts.spawn || room.spawn || { x: 0, y: 1.65, z: 0, lookX: 0, lookZ: -1 };
  const dest = new THREE.Vector3(
    room.offset.x + spawn.x,
    room.offset.y + (spawn.y || school.tour.eyeHeight),
    room.offset.z + spawn.z
  );

  const commit = () => {
    camera.position.copy(dest);
    const look = new THREE.Vector3(spawn.lookX ?? 0, 0, spawn.lookZ ?? -1).normalize();
    school.tour.yaw = Math.atan2(look.x, -look.z);
    school.tour.pitch = 0;
    school.tour.targetYaw = school.tour.yaw;
    school.tour.targetPitch = 0;
    updateTourHUD(room);
  };

  if (opts.fade === false) commit();
  else tourFade(commit);
}

function tourFade(mid) {
  let ov = document.getElementById('tour-fade');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'tour-fade';
    document.body.appendChild(ov);
  }
  ov.style.opacity = '1';
  setTimeout(() => {
    try { mid(); } catch (e) { console.error(e); }
    ov.style.opacity = '0';
  }, school.tour.fadeDuration);
}

function updateTourHUD(room) {
  let hud = document.getElementById('tour-hud');
  if (!hud) {
    hud = document.createElement('div');
    hud.id = 'tour-hud';
    document.body.appendChild(hud);
  }
  hud.innerHTML =
    '<div class="tour-room-name">📍 ' + escapeHtml(room.name) + '</div>' +
    '<div class="tour-hint">WASD walk · drag look · click doors · ESC exit</div>';
}

/* ---------- Input + frame loop ---------- */

(function () {
  function whenReady(fn) {
    if (typeof renderer !== 'undefined' && renderer && typeof scene !== 'undefined' && scene) fn();
    else setTimeout(() => whenReady(fn), 40);
  }

  whenReady(() => {
    patchForTourMode();
    const el = renderer.domElement;

    el.addEventListener('click', e => {
      if (!school.tour.active) return;

      const doorMeshes = [];
      school.rooms.forEach(r => r.doors.forEach(d => {
        if (d.mesh && d.mesh.parent && d.mesh.parent.visible) doorMeshes.push(d.mesh);
      }));

      if (doorMeshes.length) {
        const m = new THREE.Vector2(
          (e.clientX / el.clientWidth) * 2 - 1,
          -(e.clientY / el.clientHeight) * 2 + 1
        );
        raycaster.setFromCamera(m, camera);
        const hit = raycaster.intersectObjects(doorMeshes, false)[0];
        if (hit) {
          const fromRoom = getRoomById(hit.object.userData.roomId);
          const door = fromRoom?.doors.find(d => d.id === hit.object.userData.doorId);
          if (door) {
            travelToRoom(door.targetRoomId, { spawn: door.targetSpawn });
            return;
          }
        }
      }

      if (!school.tour.pointerLocked && el.requestPointerLock) {
        el.requestPointerLock();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      school.tour.pointerLocked = document.pointerLockElement === el;
    });

    document.addEventListener('mousemove', e => {
      if (!school.tour.active) return;
      if (!school.tour.pointerLocked && e.buttons !== 1) return;
      school.tour.targetYaw -= e.movementX * 0.0025;
      school.tour.targetPitch -= e.movementY * 0.0025;
      school.tour.targetPitch = Math.max(-1.2, Math.min(1.2, school.tour.targetPitch));
    });

    document.addEventListener('keydown', e => {
      if (!school.tour.active) return;
      const k = e.key.toLowerCase();
      if (k === 'w') school.tour.moving.w = true;
      else if (k === 'a') school.tour.moving.a = true;
      else if (k === 's') school.tour.moving.s = true;
      else if (k === 'd') school.tour.moving.d = true;
      else if (k === 'escape') {
        if (school.tour.pointerLocked && document.exitPointerLock) document.exitPointerLock();
        else exitTourMode();
      }
    });
    document.addEventListener('keyup', e => {
      if (!school.tour.active) return;
      const k = e.key.toLowerCase();
      if (k === 'w') school.tour.moving.w = false;
      else if (k === 'a') school.tour.moving.a = false;
      else if (k === 's') school.tour.moving.s = false;
      else if (k === 'd') school.tour.moving.d = false;
    });

    // Tour render loop
    let lastT = performance.now();
    function tourLoop() {
      requestAnimationFrame(tourLoop);
      if (!school.tour.active) { lastT = performance.now(); return; }
      const now = performance.now();
      const dt = Math.min((now - lastT) / 1000, 0.05);
      lastT = now;

      const t = school.tour;
      t.yaw += (t.targetYaw - t.yaw) * 0.18;
      t.pitch += (t.targetPitch - t.pitch) * 0.18;

      const dir = new THREE.Vector3(
        Math.sin(t.yaw) * Math.cos(t.pitch),
        Math.sin(t.pitch),
        -Math.cos(t.yaw) * Math.cos(t.pitch)
      );

      const fwd = new THREE.Vector3(dir.x, 0, dir.z).normalize();
      const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
      const delta = new THREE.Vector3();
      if (t.moving.w) delta.add(fwd);
      if (t.moving.s) delta.sub(fwd);
      if (t.moving.d) delta.add(right);
      if (t.moving.a) delta.sub(right);

      const room = getRoomById(t.currentRoomId);
      if (delta.lengthSq() > 0) {
        delta.normalize().multiplyScalar(t.walkSpeed * dt);
        camera.position.add(delta);
      }
      if (room) {
        camera.position.y = room.offset.y + t.eyeHeight;
        const hw = room.size.w / 2 - 0.5;
        const hd = room.size.d / 2 - 0.5;
        camera.position.x = Math.max(room.offset.x - hw, Math.min(room.offset.x + hw, camera.position.x));
        camera.position.z = Math.max(room.offset.z - hd, Math.min(room.offset.z + hd, camera.position.z));
      }

      camera.lookAt(camera.position.clone().add(dir));
      if (_tourOrigRender) _tourOrigRender(scene, camera);
    }
    tourLoop();
  });
})();