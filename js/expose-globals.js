/* ===================================================================
   EXPOSE GLOBALS
   Bridges `let scene, renderer...` from creator.js to `window.scene`
   so extension modules can initialize.
   =================================================================== */
(function () {
  setInterval(() => {
    try {
      if (typeof scene !== 'undefined' && window.scene !== scene) window.scene = scene;
      if (typeof renderer !== 'undefined' && window.renderer !== renderer) window.renderer = renderer;
      if (typeof camera !== 'undefined' && window.camera !== camera) window.camera = camera;
      if (typeof controls !== 'undefined' && window.controls !== controls) window.controls = controls;
      if (typeof transformControls !== 'undefined' && window.transformControls !== transformControls) window.transformControls = transformControls;
      if (typeof environment !== 'undefined' && window.environment !== environment) window.environment = environment;
      if (typeof components !== 'undefined' && window.components !== components) window.components = components;
      if (typeof lights !== 'undefined' && window.lights !== lights) window.lights = lights;
      if (typeof raycaster !== 'undefined' && window.raycaster !== raycaster) window.raycaster = raycaster;
    } catch (e) {
      // Ignore TDZ (Temporal Dead Zone) errors during initial load
    }
  }, 200);
})();