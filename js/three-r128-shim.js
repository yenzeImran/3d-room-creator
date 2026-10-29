/* ===================================================================
   THREE r128 SHIM — forward-compatible colorSpace API
   renderer-upgrade.js and materials-library.js use r152+ APIs
   (colorSpace, outputColorSpace, scene.environmentIntensity). r128
   uses (encoding, outputEncoding, per-material envMapIntensity).
   This shim aliases them so all modules work unmodified on r128.
   =================================================================== */
(function () {
  if (typeof THREE === 'undefined') { setTimeout(arguments.callee, 80); return; }

  /* ---------- colorSpace constants ---------- */
  if (!THREE.SRGBColorSpace)        THREE.SRGBColorSpace        = THREE.sRGBEncoding;
  if (!THREE.LinearSRGBColorSpace)  THREE.LinearSRGBColorSpace  = THREE.LinearEncoding;
  if (!THREE.NoColorSpace)          THREE.NoColorSpace          = THREE.LinearEncoding;

  /* ---------- Texture.colorSpace ↔ Texture.encoding ---------- */
  if (!Object.getOwnPropertyDescriptor(THREE.Texture.prototype, 'colorSpace')) {
    Object.defineProperty(THREE.Texture.prototype, 'colorSpace', {
      configurable: true,
      get() { return this.encoding === THREE.sRGBEncoding ? 'srgb' : 'linear'; },
      set(v) {
        this.encoding = (v === 'srgb' || v === THREE.SRGBColorSpace)
          ? THREE.sRGBEncoding
          : THREE.LinearEncoding;
        this.needsUpdate = true;
      }
    });
  }

  /* ---------- WebGLRenderer.outputColorSpace ↔ outputEncoding ---------- */
  if (!Object.getOwnPropertyDescriptor(THREE.WebGLRenderer.prototype, 'outputColorSpace')) {
    Object.defineProperty(THREE.WebGLRenderer.prototype, 'outputColorSpace', {
      configurable: true,
      get() { return this.outputEncoding === THREE.sRGBEncoding ? 'srgb' : 'linear'; },
      set(v) {
        this.outputEncoding = (v === 'srgb' || v === THREE.SRGBColorSpace)
          ? THREE.sRGBEncoding
          : THREE.LinearEncoding;
      }
    });
  }

  /* ---------- Scene.environmentIntensity → per-material envMapIntensity ---------- */
  if (!Object.getOwnPropertyDescriptor(THREE.Scene.prototype, 'environmentIntensity')) {
    Object.defineProperty(THREE.Scene.prototype, 'environmentIntensity', {
      configurable: true,
      get() { return this.userData._envIntensity ?? 1; },
      set(v) {
        if (!this.userData) this.userData = {};
        this.userData._envIntensity = v;
        this.traverse(o => {
          if (o.isMesh && o.material && o.material.isMeshStandardMaterial) {
            o.material.envMapIntensity = v;
            o.material.needsUpdate = true;
          }
        });
      }
    });
  }

  console.log('[three-r128-shim] colorSpace + environmentIntensity compatibility active');
})();