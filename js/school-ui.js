/* ===================================================================
   SCHOOL UI — injects its own sidebar section, keeps it in sync
   =================================================================== */

function ensureSchoolSidebar() {
  if (document.getElementById('school-sections')) return;
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;

  const wrap = document.createElement('div');
  wrap.id = 'school-sections';
  wrap.innerHTML = `
    <div class="section-header collapsed" onclick="toggleSection(this)">
      <span>🏫 School Layout</span><span class="arrow">▼</span>
    </div>
    <div class="section-body collapsed">
      <div class="block">
        <h4>School Name</h4>
        <input type="text" id="schoolName" onchange="renameSchool(this.value)">
      </div>

      <div class="block">
        <h4>Quick Presets</h4>
        <select id="schoolPresetSelect">
          <option value="small">Small — 5 rooms</option>
          <option value="medium">Medium — 11 rooms</option>
          <option value="large">Large — 22 rooms</option>
        </select>
        <button class="btn btn-primary" onclick="applySchoolPreset(document.getElementById('schoolPresetSelect').value)" style="width:100%;margin-top:6px;">🏗️ Generate School</button>
      </div>

      <div class="block">
        <h4>🤖 AI Prompt</h4>
        <textarea id="aiPrompt" placeholder="e.g. Small primary school with 4 classrooms, a library, gym and cafeteria"></textarea>
        <button class="btn btn-primary" onclick="generateSchoolFromPrompt()" style="width:100%;margin-top:6px;">✨ Generate from Prompt</button>
      </div>

      <div class="block">
        <h4>Rooms</h4>
        <div id="schoolRoomList" class="layers-list" style="max-height:220px;"></div>
        <div style="display:flex;gap:5px;margin-top:8px;">
          <button class="btn btn-secondary" onclick="addEmptyRoom()" style="flex:1;">+ Add Room</button>
          <button class="btn btn-secondary" onclick="deleteActiveRoom()" style="flex:1;">✕ Delete Room</button>
        </div>
      </div>

      <div class="block">
        <h4>Active Room Template</h4>
        <select id="roomTemplateSelect" onchange="applyTemplateToActiveRoom(this.value)">
          <option value="">— choose —</option>
          <option value="classroom">Classroom</option>
          <option value="gym">Gym</option>
          <option value="library">Library</option>
          <option value="cafeteria">Cafeteria</option>
          <option value="hallway">Hallway</option>
          <option value="office">Office</option>
          <option value="entrance">Entrance</option>
          <option value="bathroom">Bathroom</option>
        </select>
      </div>

      <div class="block">
        <h4>Doors From This Room</h4>
        <div id="doorList" style="font-size:11px;"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:8px;">
          <select id="doorFromWall">
            <option value="back">Back wall</option>
            <option value="front">Front wall</option>
            <option value="left">Left wall</option>
            <option value="right">Right wall</option>
          </select>
          <select id="doorTargetRoom"><option value="">— target —</option></select>
        </div>
        <button class="btn btn-primary" onclick="createDoorFromUI()" style="width:100%;margin-top:4px;">Add Door</button>
      </div>

      <div class="block">
        <button class="btn btn-primary" onclick="enterTourMode()" style="width:100%;">🚶 Enter Tour Mode</button>
        <button class="btn btn-success" onclick="exportSchoolTour()" style="width:100%;margin-top:6px;">📦 Export 360 Tour (HTML)</button>
        <button class="btn btn-success" onclick="exportSchoolTourPro()" style="width:100%;margin-top:6px;">📦 Export 360 Tour Pro</button>
        <button class="btn btn-secondary" onclick="exportSchoolJSON()" style="width:100%;margin-top:6px;">💾 Export JSON</button>
        <label style="display:block;font-size:11px;margin-top:8px;font-weight:600;">Import JSON</label>
        <input type="file" class="file-input" accept=".json" onchange="importSchoolJSON(this.files[0])">
      </div>
    </div>
  `;
  sidebar.appendChild(wrap);
}

function renderSchoolUI() {
  ensureSchoolSidebar();
  const nameInput = document.getElementById('schoolName');
  if (nameInput && nameInput.value !== school.name) nameInput.value = school.name;

  const roomList = document.getElementById('schoolRoomList');
  if (roomList) {
    if (!school.rooms.length) {
      roomList.innerHTML = '<div class="layer-empty">No rooms. Generate a preset or add one.</div>';
    } else {
      roomList.innerHTML = school.rooms.map(r => {
        const active = r.id === school.activeRoomId;
        const cls = 'layer-item' + (active ? ' selected' : '');
        return '<div class="' + cls + '" onclick="setActiveRoom(\'' + r.id + '\')">' +
          '<span class="name">' + escapeHtml(r.name) +
          ' <span class="layer-group-count">' + (r.components.length + r.lights.length) + ' obj · ' + r.doors.length + ' doors</span></span></div>';
      }).join('');
    }
  }

  const targetSelect = document.getElementById('doorTargetRoom');
  if (targetSelect) {
    const prev = targetSelect.value;
    targetSelect.innerHTML = '<option value="">— target —</option>' +
      school.rooms.filter(r => r.id !== school.activeRoomId).map(r =>
        '<option value="' + r.id + '">' + escapeHtml(r.name) + '</option>'
      ).join('');
    if (prev) targetSelect.value = prev;
  }

  const doorList = document.getElementById('doorList');
  if (doorList && school.activeRoomId) {
    const room = getRoomById(school.activeRoomId);
    if (room?.doors.length) {
      doorList.innerHTML = room.doors.map(d => {
        const t = getRoomById(d.targetRoomId);
        return '<div class="wall-assignment-item"><span>→ ' + escapeHtml(t?.name || '?') + ' (' + d.wall + ')</span></div>';
      }).join('');
    } else {
      doorList.innerHTML = '<div style="color:#999;">No doors from this room yet.</div>';
    }
  }
}

function renameSchool(v) { school.name = v || 'My School'; renderSchoolUI(); }

function addEmptyRoom() {
  const room = addRoom({
    name: 'Room ' + (school.rooms.length + 1),
    offset: { x: school.rooms.length * 12, y: 0, z: 0 }
  });
  setActiveRoom(room.id);
}

function deleteActiveRoom() {
  if (!school.activeRoomId) return;
  if (!confirm('Delete the active room?')) return;
  removeRoom(school.activeRoomId);
}

function createDoorFromUI() {
  if (!school.activeRoomId) { showStatus('No active room', 'error'); return; }
  const wall = document.getElementById('doorFromWall').value;
  const target = document.getElementById('doorTargetRoom').value;
  if (!target) { showStatus('Choose a target room', 'error'); return; }
  addDoor(school.activeRoomId, wall, 0.5, target);
  showStatus('Door added', 'success');
  renderSchoolUI();
}

(function () {
  function whenReady(fn) {
    if (typeof scene !== 'undefined' && scene) fn();
    else setTimeout(() => whenReady(fn), 40);
  }
  whenReady(() => { ensureSchoolSidebar(); renderSchoolUI(); });
})();