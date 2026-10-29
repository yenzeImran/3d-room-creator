/* auto-collapse heavy sections on first load */
setTimeout(() => {
  [
    'materials-library-section',
    'renderer-section',
    'ai-config-section'
  ].forEach(id => {
    const el = document.getElementById(id);
    const header = el?.querySelector('.section-header');
    const body = el?.querySelector('.section-body');
    if (header && body && !header.classList.contains('collapsed')) {
      header.classList.add('collapsed');
      body.classList.add('collapsed');
    }
  });
}, 1500);
/* ===================================================================
   APP SHELL — toolbar wiring, status bar, panel helpers
   Load AFTER every other script.
   =================================================================== */

/* =========================================================
   TOOLBAR — sync active state with transform mode
   ========================================================= */
function syncToolbarMode(mode) {
  document.querySelectorAll('.tool-btn').forEach(b => {
    const tool = b.dataset.tool;
    if (tool === 'select' || tool === 'move' || tool === 'rotate' || tool === 'scale') {
      const active = (tool === 'move' && mode === 'translate')
                  || (tool === 'rotate' && mode === 'rotate')
                  || (tool === 'scale' && mode === 'scale');
      b.classList.toggle('active', active);
    }
  });
}

(function () {
  function whenReady(fn) {
    if (typeof window.setTransformMode === 'function') fn();
    else setTimeout(() => whenReady(fn), 80);
  }
  whenReady(() => {
    const _orig = window.setTransformMode;
    window.setTransformMode = function (mode) {
      _orig(mode);
      syncToolbarMode(mode);
    };
    syncToolbarMode('translate');
  });
})();

/* =========================================================
   SCROLL TO PANEL — used by tool-rail buttons
   ========================================================= */
window.scrollToPanel = function (id) {
  const el = document.getElementById(id);
  if (!el) return;
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;

  /* If a section header is collapsed, expand it */
  const body = el.nextElementSibling;
  if (el.classList.contains('section-header') && el.classList.contains('collapsed')) {
    el.classList.remove('collapsed');
    if (body) body.classList.remove('collapsed');
  }

  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

/* =========================================================
   COLLAPSE ALL
   ========================================================= */
window.collapseAllSections = function () {
  document.querySelectorAll('.sidebar .section-header').forEach(h => {
    h.classList.add('collapsed');
    const body = h.nextElementSibling;
    if (body && body.classList.contains('section-body')) body.classList.add('collapsed');
  });
};

/* =========================================================
   STATUS BAR
   ========================================================= */
function setStatusBarMode(text) {
  const el = document.getElementById('statusBarMode');
  if (el) el.textContent = text || 'Ready';
}
function setStatusBarObjects(count) {
  const el = document.getElementById('statusBarObjects');
  if (el) el.textContent = count + ' object' + (count === 1 ? '' : 's');
}
function setStatusBarFps(fps) {
  const el = document.getElementById('statusBarFps');
  if (el) el.textContent = fps + ' fps';
}
function setStatusBarCamera() {
  if (typeof camera === 'undefined' || !camera) return;
  const el = document.getElementById('statusBarCamera');
  if (!el) return;
  const p = camera.position;
  el.textContent = p.x.toFixed(1) + ', ' + p.y.toFixed(1) + ', ' + p.z.toFixed(1);
}

/* ---------- observers ---------- */
(function () {
  function whenReady(fn) {
    if (typeof window.components !== 'undefined' && typeof window.scene !== 'undefined') fn();
    else setTimeout(() => whenReady(fn), 100);
  }
  whenReady(() => {
    /* mode text */
    const _origEnter = window.enterTourMode;
    if (typeof _origEnter === 'function') {
      window.enterTourMode = function () {
        const r = _origEnter.apply(this, arguments);
        setStatusBarMode('Tour Mode');
        return r;
      };
    }
    const _origExit = window.exitTourMode;
    if (typeof _origExit === 'function') {
      window.exitTourMode = function () {
        const r = _origExit.apply(this, arguments);
        setStatusBarMode('Room Editor');
        return r;
      };
    }

    /* env type label */
    const _origMulti = window.enterMultiRoom;
    if (typeof _origMulti === 'function') {
      window.enterMultiRoom = function () {
        const r = _origMulti.apply(this, arguments);
        setStatusBarMode('Multi-Room');
        return r;
      };
    }
    const _origExitMulti = window.exitMultiRoom;
    if (typeof _origExitMulti === 'function') {
      window.exitMultiRoom = function () {
        const r = _origExitMulti.apply(this, arguments);
        setStatusBarMode('Room Editor');
        return r;
      };
    }

    /* object count — refresh periodically */
    setInterval(() => {
      setStatusBarObjects((window.components || []).length);
      setStatusBarCamera();
    }, 500);
  });
})();

/* =========================================================
   FPS COUNTER
   ========================================================= */
(function () {
  function whenReady(fn) {
    if (typeof window.renderer !== 'undefined' && window.renderer) fn();
    else setTimeout(() => whenReady(fn), 100);
  }
  whenReady(() => {
    let frames = 0;
    let last = performance.now();
    function tick() {
      frames++;
      const now = performance.now();
      if (now - last >= 1000) {
        setStatusBarFps(frames);
        frames = 0;
        last = now;
      }
      requestAnimationFrame(tick);
    }
    tick();
  });
})();

/* =========================================================
   KEYBOARD — V / M / R / S shortcuts + shift+R reset
   ========================================================= */
(function () {
  document.addEventListener('keydown', e => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const k = e.key.toLowerCase();
    if (k === 'v') {
      document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
      const sel = document.querySelector('.tool-btn[data-tool="select"]');
      if (sel) sel.classList.add('active');
      if (typeof deselectComponent === 'function') deselectComponent();
      if (typeof deselectLight === 'function') deselectLight();
      if (typeof transformControls !== 'undefined' && transformControls) transformControls.detach();
      if (typeof updateSelectionPanels === 'function') updateSelectionPanels();
      if (typeof renderLayersPanel === 'function') renderLayersPanel();
    } else if (k === 'm') {
      syncToolbarMode('translate');
    } else if (k === 'r') {
      if (e.shiftKey) {
        if (typeof resetCamera === 'function') resetCamera();
      } else {
        syncToolbarMode('rotate');
      }
    } else if (k === 's') {
      syncToolbarMode('scale');
    }
  });
})();

/* =========================================================
   HIDE THE ORIGINAL SIDEBAR h1 (defensive)
   ========================================================= */
(function () {
  function whenReady(fn) {
    if (document.querySelector('.sidebar')) fn();
    else setTimeout(() => whenReady(fn), 100);
  }
  whenReady(() => {
    const h1 = document.querySelector('.sidebar h1');
    if (h1) h1.style.display = 'none';
  });
})();

/* =========================================================
   RE-APPLY SUB-TOOLBAR STYLE WHEN IT GETS ADDED
   (school-editor.js appends it to .main-content)
   ========================================================= */
(function () {
  function whenReady() {
    if (!document.body) { setTimeout(whenReady, 60); return; }
    const obs = new MutationObserver(muts => {
      muts.forEach(m => {
        m.addedNodes.forEach(node => {
          if (node.id === 'sub-toolbar') {
            /* style already applies via CSS — nothing else needed */
          }
        });
      });
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }
  whenReady();
})();

/* =========================================================
   UPDATE STATUS ON ENV CHANGE
   ========================================================= */
(function () {
  function whenReady(fn) {
    if (document.getElementById('envType')) fn();
    else setTimeout(() => whenReady(fn), 100);
  }
  whenReady(() => {
    const sel = document.getElementById('envType');
    sel.addEventListener('change', () => {
      if (sel.value === 'multi-room') setStatusBarMode('Multi-Room');
      else if (sel.value === 'room') setStatusBarMode('Room Editor');
      else setStatusBarMode(sel.options[sel.selectedIndex].textContent);
    });
    /* initial */
    setStatusBarMode(sel.value === 'multi-room' ? 'Multi-Room' : 'Room Editor');
  });
})();