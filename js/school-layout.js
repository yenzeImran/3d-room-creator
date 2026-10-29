/* ===================================================================
   SCHOOL TEMPLATES & PRESETS
   Depends on: creator.js factories, school-core.js
   =================================================================== */

window.SCHOOL_TEMPLATES = {
  classroom: {
    label: 'Classroom',
    size: { w: 10, h: 7, d: 12 },
    fill() {
      const cols = 4, rows = 4, sx = 2.0, sz = 2.2;
      const startX = -(cols - 1) * sx / 2;
      const startZ = -(rows - 1) * sz / 2 + 1;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const desk = createChair();
          desk.scale.set(0.8, 0.8, 0.8);
          desk.position.set(startX + c * sx, 0, startZ + r * sz);
          desk.userData = { isComponent: true, type: 'chair', id: uid('comp'), name: 'Desk ' + (r * cols + c + 1), layer: 'Furniture', locked: false };
          scene.add(desk); components.push(desk);
        }
      }
      const board = new THREE.Mesh(
        new THREE.BoxGeometry(5, 1.6, 0.05),
        new THREE.MeshLambertMaterial({ color: 0x1a3d1a })
      );
      board.position.set(0, 2.4, -6 - 0.2);
      board.userData = { isComponent: true, type: 'cube', id: uid('comp'), name: 'Whiteboard', layer: 'Decor', locked: false };
      scene.add(board); components.push(board);
    }
  },
  gym: {
    label: 'Gym',
    size: { w: 20, h: 10, d: 24 },
    fill() {
      for (const side of [-1, 1]) {
        const pole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.12, 0.12, 4.2, 12),
          new THREE.MeshLambertMaterial({ color: 0x333333 })
        );
        pole.position.set(side * 9, 2.1, 0);
        pole.userData = { isComponent: true, type: 'cylinder', id: uid('comp'), name: 'Hoop ' + (side > 0 ? 'Right' : 'Left'), layer: 'Other', locked: false };
        scene.add(pole); components.push(pole);
      }
    }
  },
  library: {
    label: 'Library',
    size: { w: 14, h: 8, d: 14 },
    fill() {
      for (let i = 0; i < 5; i++) {
        const s = createBookshelf();
        s.position.set(-5 + i * 2.5, 1.1, -6.5);
        s.scale.set(1, 1, 1);
        s.userData = { isComponent: true, type: 'bookshelf', id: uid('comp'), name: 'Shelf ' + (i + 1), layer: 'Decor', locked: false };
        scene.add(s); components.push(s);
      }
    }
  },
  cafeteria: {
    label: 'Cafeteria',
    size: { w: 16, h: 7, d: 16 },
    fill() {
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          const t = createTable();
          t.scale.set(0.7, 0.7, 0.7);
          t.position.set(-4 + c * 4, 0, -4 + r * 4);
          t.userData = { isComponent: true, type: 'table', id: uid('comp'), name: 'Table ' + (r * 3 + c + 1), layer: 'Furniture', locked: false };
          scene.add(t); components.push(t);
        }
      }
    }
  },
  hallway:  { label: 'Hallway',  size: { w: 4, h: 4, d: 20 }, fill() {} },
  office:   { label: 'Office',   size: { w: 5, h: 3, d: 5 },  fill() {} },
  bathroom: { label: 'Bathroom', size: { w: 4, h: 3, d: 4 },  fill() {} },
  entrance: { label: 'Entrance', size: { w: 8, h: 5, d: 6 },  fill() {} }
};

function applyTemplateToActiveRoom(key) {
  if (!key) return;
  const room = getActiveRoom();
  if (!room) { showStatus('Open a room first', 'error'); return; }
  const tpl = window.SCHOOL_TEMPLATES[key];
  if (!tpl) { showStatus('Unknown template', 'error'); return; }

  saveEditorStateToRoom();
  clearEditorScene();
  room.size = { ...tpl.size };
  room.kind = key;
  restoreEditorStateFromRoom(room);

  setTimeout(() => {
    try { tpl.fill(); } catch (e) { console.warn(e); }
    renderLayersPanel();
    updateSelectionPanels();
    if (window.renderSchoolUI) renderSchoolUI();
    showStatus('Template applied: ' + tpl.label, 'success');
  }, 220);
}

function applySchoolPreset(presetKey) {
  const presets = {
    small: {
      name: 'Small Primary School',
      cell: { w: 10, h: 6, d: 10 },
      grid: [
        ['entrance', 'hallway', 'classroom'],
        ['classroom', 'hallway', 'classroom']
      ]
    },
    medium: {
      name: 'Medium School',
      cell: { w: 12, h: 7, d: 12 },
      grid: [
        ['entrance', 'hallway', 'hallway', 'library'],
        ['classroom', 'classroom', 'classroom', 'hallway'],
        ['gym', 'cafeteria', 'hallway', 'classroom']
      ]
    },
    large: {
      name: 'Large High School',
      cell: { w: 14, h: 8, d: 14 },
      grid: [
        ['entrance', 'hallway', 'hallway', 'hallway', 'library'],
        ['classroom', 'classroom', 'classroom', 'hallway', 'classroom'],
        ['classroom', 'classroom', 'classroom', 'hallway', 'classroom'],
        ['gym', 'hallway', 'cafeteria', 'hallway', 'office'],
        ['office', 'bathroom', 'hallway', 'bathroom', 'classroom']
      ]
    }
  };
  const preset = presets[presetKey];
  if (!preset) return;
  buildSchoolFromLayout(preset);
  showStatus('School generated: ' + preset.name, 'success');
}