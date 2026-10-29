
/* ===================================================================
   GLOBAL STATE
   =================================================================== */
let scene, camera, renderer, controls, transformControls;
let environment = null;

let baseTexture = null, roofTexture = null;
let wallTextures = [];

let components = [];
let selectedComponent = null;
let transformMode = 'translate';

let lights = [];
let selectedLightData = null;

let wallOrder = 'back-left-right-front';
let wallPositions = [];

let baseImageDataURL = null, roofImageDataURL = null;
let wallImageDataURLs = [];

let objLoader = new THREE.OBJLoader();
let gltfLoader = new THREE.GLTFLoader();

let raycaster = new THREE.Raycaster();
let mouse = new THREE.Vector2();

/* Track collapsed state of layer groups so re-renders don't reset it */
const collapsedLayers = {};

/* Canonical layer names for objects */
const LAYER_FOR_TYPE = {
    chair: 'Furniture', table: 'Furniture', sofa: 'Furniture', bed: 'Furniture',
    lamp: 'Decor', plant: 'Decor', bookshelf: 'Decor', tv: 'Decor', rug: 'Decor',
    cube: 'Shapes', sphere: 'Shapes', cylinder: 'Shapes', cone: 'Shapes', torus: 'Shapes',
    custom: 'Imported'
};
const LAYER_ICONS = {
    Furniture: '🪑', Decor: '💡', Shapes: '🎨', Imported: '📦',
    Other: '📌', Lights: '💡'
};
const LAYER_ORDER = ['Furniture', 'Decor', 'Shapes', 'Imported', 'Other', 'Lights'];


/* ===================================================================
   AI IMAGE REFINEMENT ENGINE
   Pure client-side computer vision:
     • document-style quad detection (Sobel + extreme points)
     • homography (perspective) unwarp
     • per-channel auto levels + grey-world white balance
     • Reinhard colour transfer so all walls share one palette
     • edge softening + seamless-wrap blending
   =================================================================== */
var AI = {
    enabled: true,
    perspective: true,
    enhance: true,
    colorMatch: true,
    edgeBlend: true,
    seamless: false,
    maxSize: 1600
};

let baseImageOriginal = null;
let roofImageOriginal = null;
let wallImagesOriginal = [];

function setAIOption(key, value) { AI[key] = value; }

/* ---------- basic helpers ---------- */
function loadImage(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Could not load image'));
        img.src = url;
    });
}

function imageToCanvas(img, maxSize) {
    let w = img.naturalWidth || img.width;
    let h = img.naturalHeight || img.height;
    const s = Math.min(1, (maxSize || 1600) / Math.max(w, h));
    w = Math.max(1, Math.round(w * s));
    h = Math.max(1, Math.round(h * s));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    return c;
}

function canvasToDataURL(canvas, quality) {
    return canvas.toDataURL('image/jpeg', quality === undefined ? 0.92 : quality);
}

function cropCanvas(canvas, frac) {
    const W = canvas.width, H = canvas.height;
    const dx = Math.round(W * frac), dy = Math.round(H * frac);
    const w = W - dx * 2, h = H - dy * 2;
    if (w < 16 || h < 16) return canvas;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(canvas, dx, dy, w, h, 0, 0, w, h);
    return c;
}

function loadTextureAsync(url) {
    return new Promise(resolve => {
        new THREE.TextureLoader().load(
            url,
            tex => {
                tex.wrapS = THREE.RepeatWrapping;
                tex.wrapT = THREE.RepeatWrapping;
                resolve(tex);
            },
            undefined,
            () => resolve(null)
        );
    });
}

/* ---------- 1. quad detection (Sobel + extreme points) ---------- */
function polyArea(pts) {
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
        const j = (i + 1) % pts.length;
        a += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1];
    }
    return a / 2;
}

function isConvex(pts) {
    let sign = 0;
    for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length], c = pts[(i + 2) % pts.length];
        const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
        if (Math.abs(cr) < 1e-6) continue;
        const s = Math.sign(cr);
        if (sign === 0) sign = s;
        else if (s !== sign) return false;
    }
    return true;
}

function detectQuad(canvas) {
    const AW = 240;
    const s = AW / canvas.width;
    const aw = AW;
    const ah = Math.max(1, Math.round(canvas.height * s));

    const c = document.createElement('canvas');
    c.width = aw; c.height = ah;
    const cx = c.getContext('2d');
    cx.drawImage(canvas, 0, 0, aw, ah);
    const d = cx.getImageData(0, 0, aw, ah).data;
    const N = aw * ah;

    const gray = new Float32Array(N);
    for (let i = 0; i < N; i++) {
        gray[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    }

    const mag = new Float32Array(N);
    let maxM = 0;
    for (let y = 1; y < ah - 1; y++) {
        for (let x = 1; x < aw - 1; x++) {
            const i = y * aw + x;
            const gx = (gray[i - aw + 1] + 2 * gray[i + 1] + gray[i + aw + 1])
                     - (gray[i - aw - 1] + 2 * gray[i - 1] + gray[i + aw - 1]);
            const gy = (gray[i + aw - 1] + 2 * gray[i + aw] + gray[i + aw + 1])
                     - (gray[i - aw - 1] + 2 * gray[i - aw] + gray[i - aw + 1]);
            const m = Math.sqrt(gx * gx + gy * gy);
            mag[i] = m;
            if (m > maxM) maxM = m;
        }
    }
    if (maxM < 12) return null;

    const thr = maxM * 0.35;
    let tl = null, tr = null, br = null, bl = null;
    let minSum = Infinity, maxSum = -Infinity, minDiff = Infinity, maxDiff = -Infinity;

    for (let y = 1; y < ah - 1; y++) {
        for (let x = 1; x < aw - 1; x++) {
            if (mag[y * aw + x] < thr) continue;
            const sum = x + y, diff = x - y;
            if (sum < minSum) { minSum = sum; tl = [x, y]; }
            if (sum > maxSum) { maxSum = sum; br = [x, y]; }
            if (diff > maxDiff) { maxDiff = diff; tr = [x, y]; }
            if (diff < minDiff) { minDiff = diff; bl = [x, y]; }
        }
    }
    if (!tl || !tr || !br || !bl) return null;

    const quad = [tl, tr, br, bl];
    if (Math.abs(polyArea(quad)) < aw * ah * 0.18) return null;
    if (!isConvex(quad)) return null;

    const minSide = Math.min(
        Math.hypot(tr[0] - tl[0], tr[1] - tl[1]),
        Math.hypot(br[0] - tr[0], br[1] - tr[1]),
        Math.hypot(bl[0] - br[0], bl[1] - br[1]),
        Math.hypot(tl[0] - bl[0], tl[1] - bl[1])
    );
    if (minSide < Math.min(aw, ah) * 0.15) return null;

    const k = canvas.width / aw;
    const full = quad.map(p => [p[0] * k, p[1] * k]);

    /* shrink 1.5 % toward the centroid to avoid the edge stroke itself */
    const cxq = full.reduce((a, p) => a + p[0], 0) / 4;
    const cyq = full.reduce((a, p) => a + p[1], 0) / 4;
    return full.map(p => [cxq + (p[0] - cxq) * 0.985, cyq + (p[1] - cyq) * 0.985]);
}

/* ---------- 2. homography + perspective unwarp ---------- */
function solveLinear(A, b) {
    const n = b.length;
    for (let i = 0; i < n; i++) {
        let p = i;
        for (let r = i + 1; r < n; r++) {
            if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
        }
        if (Math.abs(A[p][i]) < 1e-10) return null;
        [A[i], A[p]] = [A[p], A[i]];
        [b[i], b[p]] = [b[p], b[i]];

        const piv = A[i][i];
        for (let c = i; c < n; c++) A[i][c] /= piv;
        b[i] /= piv;

        for (let r = 0; r < n; r++) {
            if (r === i) continue;
            const f = A[r][i];
            if (!f) continue;
            for (let c = i; c < n; c++) A[r][c] -= f * A[i][c];
            b[r] -= f * b[i];
        }
    }
    return b;
}

function computeHomography(dst, src) {
    const A = [], b = [];
    for (let i = 0; i < 4; i++) {
        const X = dst[i][0], Y = dst[i][1];
        const x = src[i][0], y = src[i][1];
        A.push([X, Y, 1, 0, 0, 0, -x * X, -x * Y]); b.push(x);
        A.push([0, 0, 0, X, Y, 1, -y * X, -y * Y]); b.push(y);
    }
    return solveLinear(A, b);
}

function warpPerspective(srcCanvas, quad, outW, outH) {
    const sw = srcCanvas.width, sh = srcCanvas.height;
    const srcData = srcCanvas.getContext('2d').getImageData(0, 0, sw, sh).data;

    const dstPts = [[0, 0], [outW, 0], [outW, outH], [0, outH]];
    const H = computeHomography(dstPts, quad);
    if (!H) return null;

    const out = document.createElement('canvas');
    out.width = outW; out.height = outH;
    const octx = out.getContext('2d');
    const outImg = octx.createImageData(outW, outH);
    const od = outImg.data;

    for (let y = 0; y < outH; y++) {
        for (let x = 0; x < outW; x++) {
            const den = H[6] * x + H[7] * y + 1;
            const u = (H[0] * x + H[1] * y + H[2]) / den;
            const v = (H[3] * x + H[4] * y + H[5]) / den;
            const o = (y * outW + x) * 4;

            if (u < 0 || v < 0 || u >= sw - 1 || v >= sh - 1) {
                od[o] = 0; od[o + 1] = 0; od[o + 2] = 0; od[o + 3] = 255;
                continue;
            }

            const x0 = u | 0, y0 = v | 0;
            const fx = u - x0, fy = v - y0;
            const i00 = (y0 * sw + x0) * 4;
            const i10 = i00 + 4;
            const i01 = i00 + sw * 4;
            const i11 = i01 + 4;

            for (let ch = 0; ch < 3; ch++) {
                od[o + ch] =
                    srcData[i00 + ch] * (1 - fx) * (1 - fy) +
                    srcData[i10 + ch] * fx * (1 - fy) +
                    srcData[i01 + ch] * (1 - fx) * fy +
                    srcData[i11 + ch] * fx * fy;
            }
            od[o + 3] = 255;
        }
    }
    octx.putImageData(outImg, 0, 0);
    return out;
}

/* ---------- 3. auto levels + grey-world white balance ---------- */
function autoEnhance(canvas) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const img = ctx.getImageData(0, 0, W, H);
    const d = img.data;
    const n = W * H;

    const hist = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
    for (let i = 0; i < d.length; i += 4) {
        hist[0][d[i]]++; hist[1][d[i + 1]]++; hist[2][d[i + 2]]++;
    }

    const cut = Math.max(1, Math.floor(n * 0.004));
    const lut = [];
    for (let c = 0; c < 3; c++) {
        let acc = 0, lo = 0, hi = 255;
        for (let v = 0; v < 256; v++) { acc += hist[c][v]; if (acc >= cut) { lo = v; break; } }
        acc = 0;
        for (let v = 255; v >= 0; v--) { acc += hist[c][v]; if (acc >= cut) { hi = v; break; } }
        if (hi - lo < 12) { lo = 0; hi = 255; }

        const t = new Uint8ClampedArray(256);
        for (let v = 0; v < 256; v++) t[v] = ((v - lo) / (hi - lo)) * 255;
        lut.push(t);
    }

    let sr = 0, sg = 0, sb = 0;
    for (let i = 0; i < d.length; i += 4) {
        sr += lut[0][d[i]]; sg += lut[1][d[i + 1]]; sb += lut[2][d[i + 2]];
    }
    sr /= n; sg /= n; sb /= n;
    const grey = (sr + sg + sb) / 3 || 1;
    const gain = [
        1 + ((grey / (sr || 1)) - 1) * 0.5,
        1 + ((grey / (sg || 1)) - 1) * 0.5,
        1 + ((grey / (sb || 1)) - 1) * 0.5
    ];

    for (let i = 0; i < d.length; i += 4) {
        d[i]     = lut[0][d[i]]     * gain[0];
        d[i + 1] = lut[1][d[i + 1]] * gain[1];
        d[i + 2] = lut[2][d[i + 2]] * gain[2];
    }
    ctx.putImageData(img, 0, 0);
}

/* ---------- 4. colour matching (Reinhard transfer) ---------- */
function imageStats(canvas) {
    const d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const n = d.length / 4;
    let mr = 0, mg = 0, mb = 0;
    for (let i = 0; i < d.length; i += 4) { mr += d[i]; mg += d[i + 1]; mb += d[i + 2]; }
    mr /= n; mg /= n; mb /= n;

    let vr = 0, vg = 0, vb = 0;
    for (let i = 0; i < d.length; i += 4) {
        vr += (d[i] - mr) * (d[i] - mr);
        vg += (d[i + 1] - mg) * (d[i + 1] - mg);
        vb += (d[i + 2] - mb) * (d[i + 2] - mb);
    }
    return {
        mean: [mr, mg, mb],
        std: [Math.sqrt(vr / n) || 1, Math.sqrt(vg / n) || 1, Math.sqrt(vb / n) || 1]
    };
}

function applyColorMatch(canvas, src, target, strength) {
    strength = strength === undefined ? 1 : strength;
    const ctx = canvas.getContext('2d');
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = img.data;

    const luts = [];
    for (let c = 0; c < 3; c++) {
        const ratio = target.std[c] / src.std[c];
        const t = new Uint8ClampedArray(256);
        for (let v = 0; v < 256; v++) {
            const mapped = (v - src.mean[c]) * ratio + target.mean[c];
            t[v] = v + (mapped - v) * strength;
        }
        luts.push(t);
    }
    for (let i = 0; i < d.length; i += 4) {
        d[i]     = luts[0][d[i]];
        d[i + 1] = luts[1][d[i + 1]];
        d[i + 2] = luts[2][d[i + 2]];
    }
    ctx.putImageData(img, 0, 0);
}

/* ---------- 5. edge softening so corners meet cleanly ---------- */
function softenEdges(canvas, bandFrac) {
    bandFrac = bandFrac || 0.05;
    const W = canvas.width, H = canvas.height;
    const ctx = canvas.getContext('2d');
    const img = ctx.getImageData(0, 0, W, H);
    const d = img.data;

    let er = 0, eg = 0, eb = 0, cnt = 0;
    const push = (x, y) => { const i = (y * W + x) * 4; er += d[i]; eg += d[i + 1]; eb += d[i + 2]; cnt++; };
    for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); }
    for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y); }
    er /= cnt; eg /= cnt; eb /= cnt;

    const bx = Math.max(2, Math.round(W * bandFrac));
    const by = Math.max(2, Math.round(H * bandFrac));

    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const dx = Math.min(x, W - 1 - x);
            const dy = Math.min(y, H - 1 - y);
            const t = Math.max(1 - dx / bx, 1 - dy / by);
            if (t <= 0) continue;
            const w = t * t * 0.7;
            const i = (y * W + x) * 4;
            d[i]     += (er - d[i])     * w;
            d[i + 1] += (eg - d[i + 1]) * w;
            d[i + 2] += (eb - d[i + 2]) * w;
        }
    }
    ctx.putImageData(img, 0, 0);
}

/* ---------- 6. seamless wrap (edges are forced to match) ---------- */
function makeSeamless(canvas, bandFrac) {
    bandFrac = bandFrac || 0.12;
    const W = canvas.width, H = canvas.height;
    const ctx = canvas.getContext('2d');
    const img = ctx.getImageData(0, 0, W, H);
    const d = img.data;
    const src = new Uint8ClampedArray(d);

    const bx = Math.max(1, Math.round(W * bandFrac));
    const by = Math.max(1, Math.round(H * bandFrac));
    const at = (x, y, c) => src[(y * W + x) * 4 + c];

    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            let wx = 0, wy = 0;
            if (x < bx) wx = 1 - x / bx;
            else if (x >= W - bx) wx = 1 - (W - 1 - x) / bx;
            if (y < by) wy = 1 - y / by;
            else if (y >= H - by) wy = 1 - (H - 1 - y) / by;
            if (wx === 0 && wy === 0) continue;

            const mx = W - 1 - x, my = H - 1 - y;
            const i = (y * W + x) * 4;

            for (let c = 0; c < 3; c++) {
                if (wx > 0) {
                    const avg = (at(x, y, c) + at(mx, y, c)) / 2;
                    d[i + c] += (avg - at(x, y, c)) * wx;
                }
                if (wy > 0) {
                    const avg = (at(x, y, c) + at(x, my, c)) / 2;
                    d[i + c] += (avg - at(x, y, c)) * wy;
                }
            }
        }
    }
    ctx.putImageData(img, 0, 0);
}

/* ---------- 7. full per-image pipeline ---------- */
async function refineToCanvas(dataURL) {
    const img = await loadImage(dataURL);
    let canvas = imageToCanvas(img, AI.maxSize);

    if (AI.perspective) {
        const quad = detectQuad(canvas);
        if (quad) {
            const wTop  = Math.hypot(quad[1][0] - quad[0][0], quad[1][1] - quad[0][1]);
            const wBot  = Math.hypot(quad[2][0] - quad[3][0], quad[2][1] - quad[3][1]);
            const hLeft = Math.hypot(quad[3][0] - quad[0][0], quad[3][1] - quad[0][1]);
            const hRight= Math.hypot(quad[2][0] - quad[1][0], quad[2][1] - quad[1][1]);

            let outW = Math.round((wTop + wBot) / 2);
            let outH = Math.round((hLeft + hRight) / 2);
            const k = Math.min(1, 1400 / Math.max(outW, outH, 1));
            outW = Math.max(32, Math.round(outW * k));
            outH = Math.max(32, Math.round(outH * k));

            const warped = warpPerspective(canvas, quad, outW, outH);
            if (warped) canvas = warped;
        }
    }

    canvas = cropCanvas(canvas, 0.008);
    if (AI.enhance) autoEnhance(canvas);
    if (AI.edgeBlend) softenEdges(canvas, 0.05);
    if (AI.seamless) makeSeamless(canvas, 0.12);

    return canvas;
}

async function refineGroup(dataURLs, matchColors) {
    if (!AI.enabled) return dataURLs.slice();

    const canvases = [];
    for (const url of dataURLs) {
        try { canvases.push(await refineToCanvas(url)); }
        catch (e) { console.warn('AI refine failed:', e); }
    }
    if (canvases.length !== dataURLs.length) return dataURLs.slice();

    if (matchColors && AI.colorMatch && canvases.length > 1) {
        const stats = canvases.map(imageStats);
        const target = {
            mean: [0, 1, 2].map(c => stats.reduce((a, s) => a + s.mean[c], 0) / stats.length),
            std:  [0, 1, 2].map(c => stats.reduce((a, s) => a + s.std[c], 0) / stats.length)
        };
        canvases.forEach((c, i) => applyColorMatch(c, stats[i], target, 0.85));
    }

    return canvases.map(c => canvasToDataURL(c));
}
/* ===================================================================
   SECTION TOGGLING
   =================================================================== */
function toggleSection(header) {
    header.classList.toggle('collapsed');
    const body = header.nextElementSibling;
    if (body && body.classList.contains('section-body')) {
        body.classList.toggle('collapsed');
    }
}

/* ===================================================================
   INIT SCENE
   =================================================================== */
function initScene() {
    const container = document.getElementById('canvas-container');

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x222222);

    camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(0, 3, 8);

    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enableZoom = true;
    controls.enablePan = true;

    /* Transform gizmo */
    transformControls = new THREE.TransformControls(camera, renderer.domElement);
    transformControls.setSpace('world');
    transformControls.setSize(0.9);
    transformControls.addEventListener('dragging-changed', function (e) {
        controls.enabled = !e.value;
    });
    transformControls.addEventListener('objectChange', function () {
        if (selectedLightData && selectedLightData.sphere && transformControls.object === selectedLightData.sphere) {
            selectedLightData.light.position.copy(selectedLightData.sphere.position);
        }
        if (selectedComponent) updateComponentProperties();
    });
    scene.add(transformControls);

    scene.add(new THREE.AmbientLight(0xffffff, 0.45));
    scene.add(new THREE.HemisphereLight(0xffffbb, 0x080820, 0.45));

    window.addEventListener('resize', onWindowResize);
    setupMouseEvents();
    setupKeyboardEvents();

    handleFileSelect(document.getElementById('baseImageInput'), document.getElementById('basePreview'), null, true);
    handleFileSelect(document.getElementById('wallImagesInput'), document.getElementById('wallPreview'), wallTextures, false);
    handleFileSelect(document.getElementById('roofImageInput'), document.getElementById('roofPreview'), null, true);

    document.getElementById('wallOrder').addEventListener('change', updateWallPositions);
    updateWallPositions();

    document.querySelectorAll('.model-item').forEach(item => {
        item.addEventListener('click', function () {
            addComponentFromLibrary(this.getAttribute('data-model'));
        });
    });

    document.getElementById('componentImport').addEventListener('change', function (e) {
        Array.from(e.target.files).forEach(importCustomModel);
    });

    renderLayersPanel();
    updateSelectionPanels();
    animate();
}

function onWindowResize() {
    const c = document.getElementById('canvas-container');
    camera.aspect = c.clientWidth / c.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(c.clientWidth, c.clientHeight);
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

/* ===================================================================
   FILE READING
   =================================================================== */
function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = e => resolve(e.target.result);
        r.onerror = reject;
        r.readAsDataURL(file);
    });
}

function handleFileSelect(input, previewContainer, textureArray, isSingle) {
    input.addEventListener('change', async function (e) {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;

        const kind = previewContainer.id === 'basePreview' ? 'base'
                   : previewContainer.id === 'roofPreview' ? 'roof'
                   : 'wall';

        /* reset state for this slot */
        previewContainer.innerHTML = '';
        if (kind === 'wall') {
            wallImagesOriginal = [];
            wallImageDataURLs = [];
            wallTextures.length = 0;
        } else if (kind === 'base') {
            baseImageOriginal = null; baseImageDataURL = null; baseTexture = null;
        } else {
            roofImageOriginal = null; roofImageDataURL = null; roofTexture = null;
        }

        /* read raw files */
        const originals = [];
        for (const file of files) {
            try { originals.push(await readFileAsDataURL(file)); }
            catch (err) { console.warn('Skipping unreadable file:', file.name); }
        }
        if (!originals.length) return;

        /* ---- AI refinement ---- */
        showLoading(true, AI.enabled
            ? '🤖 AI is straightening edges and matching colours…'
            : 'Loading images…');

        let refined;
        try {
            refined = await refineGroup(originals, kind === 'wall');
        } catch (err) {
            console.error('Refinement failed, using originals:', err);
            refined = originals.slice();
        }
        showLoading(false);

        /* remember originals so the user can re-run the AI */
        if (kind === 'base') baseImageOriginal = originals[0];
        else if (kind === 'roof') roofImageOriginal = originals[0];
        else wallImagesOriginal = originals;

        /* build previews */
        refined.forEach(dataURL => {
            const img = document.createElement('img');
            img.src = dataURL;
            img.className = 'preview-image' + (AI.enabled ? ' ai' : '');
            img.title = AI.enabled ? 'AI-refined — click to select' : 'Click to select';
            img.onclick = () => selectImage(img);
            previewContainer.appendChild(img);
        });

        /* build textures (in order, awaiting all of them) */
        const texs = await Promise.all(refined.map(loadTextureAsync));

        if (kind === 'base') {
            baseImageDataURL = refined[0];
            baseTexture = texs[0];
        } else if (kind === 'roof') {
            roofImageDataURL = refined[0];
            roofTexture = texs[0];
        } else {
            refined.forEach(u => wallImageDataURLs.push(u));
            if (textureArray) texs.forEach(t => { if (t) textureArray.push(t); });
            updateWallAssignmentInfo();
        }
    });
}

function selectImage(img) {
    img.parentElement.querySelectorAll('.preview-image').forEach(s => s.classList.remove('selected'));
    img.classList.add('selected');
}

/* ===================================================================
   WALL ORDER
   =================================================================== */
function updateWallPositions() {
    wallOrder = document.getElementById('wallOrder').value;
    wallPositions = [];

    switch (wallOrder) {
        case 'back-left-right-front':
            wallPositions = [
                { pos: [0, 4, -5], rot: [0, 0, 0], label: 'Back Wall' },
                { pos: [-5, 4, 0], rot: [0, Math.PI / 2, 0], label: 'Left Wall' },
                { pos: [5, 4, 0], rot: [0, -Math.PI / 2, 0], label: 'Right Wall' },
                { pos: [0, 4, 5], rot: [0, Math.PI, 0], label: 'Front Wall' }
            ];
            break;
        case 'left-front-right-back':
            wallPositions = [
                { pos: [-5, 4, 0], rot: [0, Math.PI / 2, 0], label: 'Left Wall' },
                { pos: [0, 4, 5], rot: [0, Math.PI, 0], label: 'Front Wall' },
                { pos: [5, 4, 0], rot: [0, -Math.PI / 2, 0], label: 'Right Wall' },
                { pos: [0, 4, -5], rot: [0, 0, 0], label: 'Back Wall' }
            ];
            break;
        case 'clockwise':
            wallPositions = [
                { pos: [0, 4, -5], rot: [0, 0, 0], label: 'Back Wall' },
                { pos: [5, 4, 0], rot: [0, -Math.PI / 2, 0], label: 'Right Wall' },
                { pos: [0, 4, 5], rot: [0, Math.PI, 0], label: 'Front Wall' },
                { pos: [-5, 4, 0], rot: [0, Math.PI / 2, 0], label: 'Left Wall' }
            ];
            break;
        case 'counterclockwise':
            wallPositions = [
                { pos: [0, 4, -5], rot: [0, 0, 0], label: 'Back Wall' },
                { pos: [-5, 4, 0], rot: [0, Math.PI / 2, 0], label: 'Left Wall' },
                { pos: [0, 4, 5], rot: [0, Math.PI, 0], label: 'Front Wall' },
                { pos: [5, 4, 0], rot: [0, -Math.PI / 2, 0], label: 'Right Wall' }
            ];
            break;
    }
    updateWallAssignmentInfo();
}

function updateWallAssignmentInfo() {
    const infoDiv = document.getElementById('wallAssignmentInfo');
    const imgs = document.querySelectorAll('#wallPreview .preview-image');

    if (imgs.length === 0) { infoDiv.style.display = 'none'; return; }

    let html = '<strong>Wall Assignment:</strong><br>';
    imgs.forEach((img, i) => {
        if (i < wallPositions.length) {
            html += '<div class="wall-assignment-item">' + (i + 1) + '. ' + wallPositions[i].label + '</div>';
        } else {
            html += '<div class="wall-assignment-item" style="color:#ff9800;">' + (i + 1) + '. Extra</div>';
        }
    });
    infoDiv.innerHTML = html;
    infoDiv.style.display = 'block';
}

/* ===================================================================
   ENVIRONMENT BUILD
   =================================================================== */
function createEnvironment() {
    if (!baseTexture && wallTextures.length === 0) {
        showStatus('Please upload at least a base image or wall images.', 'error');
        return;
    }
    showLoading(true);

    if (environment) { scene.remove(environment); environment = null; }
    const type = document.getElementById('envType').value;

    setTimeout(() => {
        try {
            switch (type) {
                case 'room': createRoom(); break;
                case 'cube': createCubeEnv(); break;
                case 'sphere': createSphereEnv(); break;
                case 'cylinder': createCylinderEnv(); break;
            }
            showLoading(false);
            showStatus('3D Environment created successfully!', 'success');
        } catch (err) {
            console.error(err);
            showLoading(false);
            showStatus('Error: ' + err.message, 'error');
        }
    }, 100);
}

function createRoom() {
    environment = new THREE.Group();
    const H = 8, W = 10, D = 10;

    if (baseTexture) {
        const f = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshLambertMaterial({ map: baseTexture }));
        f.rotation.x = -Math.PI / 2;
        f.receiveShadow = true;
        environment.add(f);
    }

    wallPositions.forEach((wall, i) => {
        if (wallTextures[i]) {
            const m = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshLambertMaterial({ map: wallTextures[i] }));
            m.position.set(wall.pos[0], wall.pos[1], wall.pos[2]);
            m.rotation.set(wall.rot[0], wall.rot[1], wall.rot[2]);
            m.receiveShadow = true;
            environment.add(m);
        }
    });

    if (roofTexture) {
        const c = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshLambertMaterial({ map: roofTexture }));
        c.rotation.x = Math.PI / 2;
        c.position.y = H;
        environment.add(c);
    }

    scene.add(environment);
}

function createCubeEnv() {
    environment = new THREE.Group();
    const mats = [];
    for (let i = 0; i < 6; i++) {
        let tex = null;
        if (i === 4) tex = baseTexture;
        else if (i === 5) tex = roofTexture;
        else tex = wallTextures[i - (i > 4 ? 2 : 0)] || wallTextures[0];
        mats.push(new THREE.MeshLambertMaterial({ map: tex, color: tex ? 0xffffff : 0x888888 }));
    }
    environment.add(new THREE.Mesh(new THREE.BoxGeometry(8, 8, 8), mats));
    scene.add(environment);
}

function createSphereEnv() {
    environment = new THREE.Group();
    environment.add(new THREE.Mesh(
        new THREE.SphereGeometry(5, 32, 16),
        new THREE.MeshLambertMaterial({ map: wallTextures[0] || baseTexture, side: THREE.DoubleSide })
    ));
    scene.add(environment);
}

function createCylinderEnv() {
    environment = new THREE.Group();
    environment.add(new THREE.Mesh(
        new THREE.CylinderGeometry(5, 5, 8, 32),
        new THREE.MeshLambertMaterial({ map: wallTextures[0] || baseTexture })
    ));
    if (baseTexture) {
        const b = new THREE.Mesh(new THREE.CircleGeometry(5, 32), new THREE.MeshLambertMaterial({ map: baseTexture }));
        b.rotation.x = -Math.PI / 2;
        b.position.y = -4;
        environment.add(b);
    }
    if (roofTexture) {
        const t = new THREE.Mesh(new THREE.CircleGeometry(5, 32), new THREE.MeshLambertMaterial({ map: roofTexture }));
        t.rotation.x = Math.PI / 2;
        t.position.y = 4;
        environment.add(t);
    }
    scene.add(environment);
}

/* ===================================================================
   COMPONENT FACTORIES
   =================================================================== */
function createChair() {
    const g = new THREE.Group();
    const lm = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
    for (let i = 0; i < 4; i++) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.8, 8), lm);
        leg.position.set(i % 2 === 0 ? -0.4 : 0.4, 0.9, i < 2 ? -0.4 : 0.4);
        g.add(leg);
    }
    const sm = new THREE.MeshLambertMaterial({ color: 0x654321 });
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1, 0.1, 1), sm); seat.position.y = 1.85; g.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(1, 1.5, 0.1), sm); back.position.set(0, 2.6, -0.45); g.add(back);
    return g;
}
function createTable() {
    const g = new THREE.Group();
    const lm = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
    for (let i = 0; i < 4; i++) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.2, 8), lm);
        leg.position.set(i % 2 === 0 ? -0.8 : 0.8, 1.1, i < 2 ? -0.5 : 0.5);
        g.add(leg);
    }
    const top = new THREE.Mesh(new THREE.BoxGeometry(2, 0.1, 1.2), new THREE.MeshLambertMaterial({ color: 0xDEB887 }));
    top.position.y = 2.2; g.add(top);
    return g;
}
function createSofa() {
    const g = new THREE.Group();
    const m = new THREE.MeshLambertMaterial({ color: 0x8B0000 });
    const b = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1, 0.8), m); b.position.y = 0.5; g.add(b);
    const bk = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.2, 0.1), m); bk.position.set(0, 1.1, -0.35); g.add(bk);
    const ag = new THREE.BoxGeometry(0.2, 0.8, 0.8);
    const l = new THREE.Mesh(ag, m); l.position.set(-1.15, 0.9, 0); g.add(l);
    const r = new THREE.Mesh(ag, m); r.position.set(1.15, 0.9, 0); g.add(r);
    return g;
}
function createBed() {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.4, 1.8), new THREE.MeshLambertMaterial({ color: 0xFFFFFF }));
    m.position.y = 0.2; g.add(m);
    const pm = new THREE.MeshLambertMaterial({ color: 0x87CEEB });
    const p1 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.15, 0.4), pm); p1.position.set(0.5, 0.4, 0.6); g.add(p1);
    const p2 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.15, 0.4), pm); p2.position.set(-0.5, 0.4, 0.6); g.add(p2);
    return g;
}
function createLamp() {
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 0.1, 16), new THREE.MeshLambertMaterial({ color: 0x333333 })); b.position.y = 0.05; g.add(b);
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.8, 8), new THREE.MeshLambertMaterial({ color: 0x666666 })); p.position.y = 1; g.add(p);
    const s = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.6, 16), new THREE.MeshLambertMaterial({ color: 0xFFFFAA })); s.position.y = 1.9; s.rotation.x = Math.PI; g.add(s);
    return g;
}
function createPlant() {
    const g = new THREE.Group();
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.2, 0.4, 16), new THREE.MeshLambertMaterial({ color: 0x8B4513 })); p.position.y = 0.2; g.add(p);
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshLambertMaterial({ color: 0x228B22 })); l.position.y = 0.8; l.scale.set(1, 1.5, 1); g.add(l);
    return g;
}
function createBookshelf() {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 0.4), new THREE.MeshLambertMaterial({ color: 0x8B4513 })));
    const sm = new THREE.MeshLambertMaterial({ color: 0xA0522D });
    for (let i = 0; i < 4; i++) {
        const s = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.05, 0.35), sm); s.position.y = -0.8 + i * 0.7; g.add(s);
    }
    return g;
}
function createTV() {
    const g = new THREE.Group();
    const s = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.9, 0.05), new THREE.MeshLambertMaterial({ color: 0x000000 })); s.position.y = 0.9; g.add(s);
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.2), new THREE.MeshLambertMaterial({ color: 0x333333 })); st.position.y = 0.45; g.add(st);
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 0.4), new THREE.MeshLambertMaterial({ color: 0x666666 })));
    return g;
}
function createRug() {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 1.5), new THREE.MeshLambertMaterial({ color: 0x800000, side: THREE.DoubleSide }));
    r.rotation.x = -Math.PI / 2;
    return r;
}
function createCube()     { return new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1),            new THREE.MeshLambertMaterial({ color: 0x888888 })); }
function createSphere()   { return new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12),     new THREE.MeshLambertMaterial({ color: 0x888888 })); }
function createCylinder() { return new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 16), new THREE.MeshLambertMaterial({ color: 0x888888 })); }
function createCone()     { return new THREE.Mesh(new THREE.ConeGeometry(0.5, 1, 16),          new THREE.MeshLambertMaterial({ color: 0x888888 })); }
function createTorus()    { return new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.2, 12, 24),   new THREE.MeshLambertMaterial({ color: 0x888888 })); }

/* ===================================================================
   NAMING HELPERS
   =================================================================== */
function generateObjectName(type) {
    const names = {
        chair: 'Chair', table: 'Table', sofa: 'Sofa', bed: 'Bed',
        lamp: 'Lamp', plant: 'Plant', bookshelf: 'Bookshelf', tv: 'TV', rug: 'Rug',
        cube: 'Cube', sphere: 'Sphere', cylinder: 'Cylinder', cone: 'Cone', torus: 'Torus',
        custom: 'Model'
    };
    const base = names[type] || 'Object';
    const existing = components.map(c => c.userData.name).filter(Boolean);
    let n = 1;
    let name = base + ' ' + n;
    while (existing.includes(name)) { n++; name = base + ' ' + n; }
    return name;
}

/* ===================================================================
   ADD COMPONENTS
   =================================================================== */
function addComponentFromLibrary(type) {
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const pos = new THREE.Vector3().copy(camera.position).add(dir.multiplyScalar(5));
    pos.y = 0;

    let mesh;
    let scale = 1;
    switch (type) {
        case 'chair':     mesh = createChair();     scale = 0.8; break;
        case 'table':     mesh = createTable();     scale = 0.7; break;
        case 'sofa':      mesh = createSofa();      scale = 0.7; break;
        case 'bed':       mesh = createBed();       scale = 0.8; break;
        case 'lamp':      mesh = createLamp();      scale = 0.6; break;
        case 'plant':     mesh = createPlant();     scale = 0.8; break;
        case 'bookshelf': mesh = createBookshelf(); scale = 0.7; break;
        case 'tv':        mesh = createTV();        scale = 0.8; break;
        case 'rug':       mesh = createRug();       scale = 0.8; break;
        case 'sphere':    mesh = createSphere();    scale = 0.5; break;
        case 'cylinder':  mesh = createCylinder();  scale = 0.5; break;
        case 'cone':      mesh = createCone();      scale = 0.5; break;
        case 'torus':     mesh = createTorus();     scale = 0.5; break;
        default:          mesh = createCube();      scale = 0.5;
    }

    mesh.position.copy(pos);
    mesh.scale.set(scale, scale, scale);
    mesh.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
    mesh.userData = {
        isComponent: true,
        type: type,
        id: Date.now() + Math.random(),
        name: generateObjectName(type),
        layer: LAYER_FOR_TYPE[type] || 'Other',
        locked: false
    };

    scene.add(mesh);
    components.push(mesh);
    selectComponent(mesh);
    renderLayersPanel();
    showStatus(mesh.userData.name + ' added!', 'success');
}

function importCustomModel(file) {
    const n = file.name.toLowerCase();
    const reader = new FileReader();
    showStatus('Loading ' + file.name + '...', 'info');

    if (n.endsWith('.obj')) {
        reader.onload = e => {
            try {
                const obj = objLoader.parse(e.target.result);
                finishImport(obj, file);
            } catch (err) { showStatus('Error: ' + err.message, 'error'); }
        };
        reader.readAsText(file);
    } else if (n.endsWith('.gltf') || n.endsWith('.glb')) {
        reader.onload = e => {
            try {
                gltfLoader.parse(e.target.result, '', g => finishImport(g.scene, file));
            } catch (err) { showStatus('Error: ' + err.message, 'error'); }
        };
        if (n.endsWith('.glb')) reader.readAsArrayBuffer(file);
        else reader.readAsText(file);
    } else {
        showStatus('Unsupported: ' + file.name, 'error');
    }
}

function finishImport(obj, file) {
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const pos = new THREE.Vector3().copy(camera.position).add(dir.multiplyScalar(5));
    pos.y = 0;
    obj.position.copy(pos);

    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const maxD = Math.max(size.x, size.y, size.z) || 1;
    const scale = 2 / maxD;
    obj.scale.set(scale, scale, scale);

    obj.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
    obj.userData = {
        isComponent: true,
        type: 'custom',
        fileName: file.name,
        id: Date.now() + Math.random(),
        name: generateObjectName('custom'),
        layer: 'Imported',
        locked: false
    };

    scene.add(obj);
    components.push(obj);
    selectComponent(obj);
    renderLayersPanel();
    showStatus('Imported ' + file.name, 'success');
}

/* ===================================================================
   SELECTION
   =================================================================== */
function findRoot(obj) {
    let c = obj;
    while (c.parent && c.parent !== scene && (c.parent.userData.isComponent || components.includes(c.parent))) {
        c = c.parent;
    }
    return c;
}

function deselectComponent() {
    if (selectedComponent) {
        selectedComponent.traverse(c => {
            if (c.isMesh && c.userData.originalEmissive !== undefined) {
                c.material.emissive.setHex(c.userData.originalEmissive);
            }
        });
    }
    selectedComponent = null;
}

function selectComponent(comp) {
    if (!comp) return;
    const root = findRoot(comp);
    if (!root || root.userData.locked) return;

    deselectComponent();
    deselectLight();

    selectedComponent = root;
    selectedComponent.traverse(c => {
        if (c.isMesh) {
            c.userData.originalEmissive = c.material.emissive.getHex();
            c.material.emissive.setHex(0x333333);
        }
    });

    transformControls.attach(selectedComponent);
    transformControls.setMode(transformMode);

    updateComponentProperties();
    updateSelectionPanels();
    renderLayersPanel();
}

function updateComponentProperties() {
    if (!selectedComponent) return;
    const ud = selectedComponent.userData;
    document.getElementById('componentName').value = ud.name || '';
    document.getElementById('componentLayer').value = ud.layer || 'Other';
    document.getElementById('componentPositionX').value = selectedComponent.position.x.toFixed(2);
    document.getElementById('componentPositionY').value = selectedComponent.position.y.toFixed(2);
    document.getElementById('componentPositionZ').value = selectedComponent.position.z.toFixed(2);
    document.getElementById('componentRotation').value = THREE.MathUtils.radToDeg(selectedComponent.rotation.y).toFixed(0);
    document.getElementById('componentScale').value = selectedComponent.scale.x.toFixed(2);
    document.getElementById('componentVisible').checked = selectedComponent.visible;
    document.getElementById('componentLocked').checked = !!ud.locked;

    let color = '#888888';
    selectedComponent.traverse(c => {
        if (c.isMesh && c.material && c.material.color && color === '#888888') {
            color = '#' + c.material.color.getHexString();
        }
    });
    document.getElementById('componentColor').value = color;
}

function onNameChange(v) {
    if (!selectedComponent) return;
    selectedComponent.userData.name = v || 'Object';
    renderLayersPanel();
}

function onLayerChange(v) {
    if (!selectedComponent) return;
    selectedComponent.userData.layer = v;
    renderLayersPanel();
}

function onVisibilityChange(v) {
    if (!selectedComponent) return;
    selectedComponent.visible = v;
    if (!v && selectedComponent === transformControls.object) {
        transformControls.detach();
    }
    renderLayersPanel();
}

function onLockChange(v) {
    if (!selectedComponent) return;
    selectedComponent.userData.locked = v;
    if (v && selectedComponent === transformControls.object) {
        transformControls.detach();
        deselectComponent();
        updateSelectionPanels();
    }
    renderLayersPanel();
}

function updateSelectedComponent() {
    if (!selectedComponent) return;

    selectedComponent.position.set(
        parseFloat(document.getElementById('componentPositionX').value) || 0,
        parseFloat(document.getElementById('componentPositionY').value) || 0,
        parseFloat(document.getElementById('componentPositionZ').value) || 0
    );

    selectedComponent.rotation.y = THREE.MathUtils.degToRad(
        parseFloat(document.getElementById('componentRotation').value) || 0
    );

    const s = Math.max(0.05, parseFloat(document.getElementById('componentScale').value) || 1);
    selectedComponent.scale.set(s, s, s);

    const color = document.getElementById('componentColor').value;
    const hex = parseInt(color.replace('#', '0x'));
    selectedComponent.traverse(c => {
        if (c.isMesh && c.material && c.material.color) {
            c.material.color.setHex(hex);
            c.material.needsUpdate = true;
        }
    });

    showStatus('Component updated!', 'success');
}

function focusSelectedComponent() {
    if (!selectedComponent) return;
    const box = new THREE.Box3().setFromObject(selectedComponent);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxD = Math.max(size.x, size.y, size.z, 1);
    const dist = maxD * 2.5;

    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    camera.position.copy(center).sub(dir.multiplyScalar(dist));
    controls.target.copy(center);
    controls.update();
}

function duplicateSelectedComponent() {
    if (!selectedComponent) return;
    const clone = selectedComponent.clone(true);
    clone.position.x += 1.5;
    clone.userData = Object.assign({}, selectedComponent.userData, {
        id: Date.now() + Math.random(),
        name: generateObjectName(selectedComponent.userData.type || 'custom')
    });
    clone.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
    scene.add(clone);
    components.push(clone);
    selectComponent(clone);
    renderLayersPanel();
    showStatus('Duplicated!', 'success');
}

function deleteSelectedComponent() {
    if (!selectedComponent) { showStatus('Select an object first.', 'error'); return; }
    scene.remove(selectedComponent);
    components = components.filter(c => c !== selectedComponent);
    transformControls.detach();
    selectedComponent = null;
    updateSelectionPanels();
    renderLayersPanel();
    showStatus('Object deleted!', 'success');
}

function clearAllComponents() {
    if (!confirm('Delete every object in the scene?')) return;
    components.forEach(c => scene.remove(c));
    components = [];
    transformControls.detach();
    selectedComponent = null;
    updateSelectionPanels();
    renderLayersPanel();
    showStatus('All objects cleared!', 'success');
}

function setTransformMode(mode) {
    transformMode = mode;
    ['translate', 'rotate', 'scale'].forEach(m => {
        const btn = document.getElementById(m + 'Mode');
        if (btn) btn.className = (m === mode)
            ? 'btn btn-primary transform-btn'
            : 'btn btn-secondary transform-btn';
    });
    if (transformControls.object && !selectedLightData) {
        transformControls.setMode(mode);
    }
}

/* ===================================================================
   LIGHTS
   =================================================================== */
function addLight() {
    const type = document.getElementById('newLightType').value;
    const intensity = parseFloat(document.getElementById('newLightIntensity').value) || 1;
    const color = document.getElementById('newLightColor').value;

    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const pos = new THREE.Vector3().copy(camera.position).add(dir.multiplyScalar(4));
    pos.y = Math.max(pos.y, 4);

    let light;
    if (type === 'point') {
        light = new THREE.PointLight(color, intensity, 0, 2);
        light.position.copy(pos);
    } else if (type === 'spot') {
        light = new THREE.SpotLight(color, intensity, 0, Math.PI / 6, 0.4, 2);
        light.position.copy(pos);
        light.target.position.set(0, 0, 0);
        scene.add(light.target);
    } else if (type === 'directional') {
        light = new THREE.DirectionalLight(color, intensity);
        light.position.copy(pos);
        light.target.position.set(0, 0, 0);
        scene.add(light.target);
    } else {
        light = new THREE.AmbientLight(color, intensity);
    }

    scene.add(light);

    let sphere = null;
    if (type !== 'ambient') {
        const sphereMat = new THREE.MeshBasicMaterial({ color: color });
        sphere = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), sphereMat);
        sphere.position.copy(pos);
        sphere.userData = { isLightSphere: true };
        scene.add(sphere);

        const wire = new THREE.Mesh(
            new THREE.SphereGeometry(0.4, 14, 10),
            new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.35 })
        );
        sphere.add(wire);
    }

    const lightData = {
        id: Date.now() + Math.random(),
        type: type,
        light: light,
        sphere: sphere,
        color: color,
        intensity: intensity,
        name: type.charAt(0).toUpperCase() + type.slice(1) + ' Light'
    };

    lights.push(lightData);
    renderLayersPanel();

    if (sphere) {
        selectLight(lightData);
        showStatus(lightData.name + ' added — drag the gizmo to reposition.', 'success');
    } else {
        showStatus('Ambient light added.', 'success');
    }
}

function selectLight(lightData) {
    deselectComponent();
    deselectLight();
    selectedLightData = lightData;

    if (lightData.sphere) {
        transformControls.attach(lightData.sphere);
        transformControls.setMode('translate');
        setTransformMode('translate');
    }

    document.getElementById('selLightIntensity').value = lightData.light.intensity;
    document.getElementById('selLightIntensityLabel').textContent = lightData.light.intensity.toFixed(1);
    document.getElementById('selLightColor').value = '#' + lightData.light.color.getHexString();

    const distWrap = document.getElementById('selLightDistanceWrap');
    if (lightData.type === 'point' || lightData.type === 'spot') {
        distWrap.style.display = 'block';
        document.getElementById('selLightDistance').value = lightData.light.distance || 0;
    } else {
        distWrap.style.display = 'none';
    }

    updateSelectionPanels();
    renderLayersPanel();
}

function deselectLight() {
    selectedLightData = null;
}

function onSelLightIntensityChange(v) {
    if (!selectedLightData) return;
    const intensity = parseFloat(v) || 1;
    selectedLightData.light.intensity = intensity;
    selectedLightData.intensity = intensity;
    document.getElementById('selLightIntensityLabel').textContent = intensity.toFixed(1);
}

function onSelLightColorChange(v) {
    if (!selectedLightData) return;
    const hex = parseInt(v.replace('#', '0x'));
    selectedLightData.light.color.setHex(hex);
    selectedLightData.color = v;
    if (selectedLightData.sphere && selectedLightData.sphere.material) {
        selectedLightData.sphere.material.color.setHex(hex);
    }
    renderLayersPanel();
}

function onSelLightDistanceChange(v) {
    if (!selectedLightData) return;
    const d = Math.max(0, parseFloat(v) || 0);
    if (selectedLightData.type === 'point' || selectedLightData.type === 'spot') {
        selectedLightData.light.distance = d;
    }
}

function removeSelectedLight() {
    if (!selectedLightData) { showStatus('Select a light first.', 'error'); return; }
    const id = selectedLightData.id;
    const idx = lights.findIndex(l => l.id === id);
    if (idx < 0) return;

    const ld = lights[idx];
    if (ld.sphere) scene.remove(ld.sphere);
    scene.remove(ld.light);
    if (ld.light.target) scene.remove(ld.light.target);

    lights.splice(idx, 1);
    selectedLightData = null;
    transformControls.detach();
    updateSelectionPanels();
    renderLayersPanel();
    showStatus('Light removed.', 'success');
}

function clearAllLights() {
    if (lights.length === 0) return;
    if (!confirm('Remove all custom lights?')) return;
    lights.forEach(ld => {
        if (ld.sphere) scene.remove(ld.sphere);
        scene.remove(ld.light);
        if (ld.light.target) scene.remove(ld.light.target);
    });
    lights = [];
    selectedLightData = null;
    transformControls.detach();
    updateSelectionPanels();
    renderLayersPanel();
    showStatus('All custom lights cleared.', 'success');
}

/* ===================================================================
   LAYERS PANEL
   =================================================================== */
function renderLayersPanel() {
    const listEl = document.getElementById('layersList');
    if (!listEl) return;

    /* Group components by layer */
    const groups = {};
    LAYER_ORDER.forEach(l => groups[l] = []);
    components.forEach(c => {
        const l = c.userData.layer || 'Other';
        if (!groups[l]) groups[l] = [];
        groups[l].push(c);
    });

    /* Build HTML */
    let html = '';
    let totalItems = 0;

    LAYER_ORDER.forEach(layerName => {
        const items = groups[layerName] || [];
        if (items.length === 0 && layerName !== 'Lights' && lights.length === 0) return;
        if (items.length === 0 && layerName !== 'Lights') return;
        if (layerName === 'Lights' && lights.length === 0) return;

        /* Determine items for this row (components or lights) */
        const isLightLayer = layerName === 'Lights';
        const count = isLightLayer ? lights.length : items.length;
        if (count === 0) return;

        totalItems += count;

        const isCollapsed = collapsedLayers[layerName];
        const icon = LAYER_ICONS[layerName] || '📁';

        html += '<div class="layer-group">';
        html += '<div class="layer-group-header' + (isCollapsed ? ' collapsed' : '') + '" onclick="toggleLayerGroup(\'' + layerName + '\')">';
        html += '<span>' + icon + ' ' + layerName + ' <span class="layer-group-count">(' + count + ')</span></span>';
        html += '<span class="arrow">▼</span>';
        html += '</div>';
        html += '<div class="layer-items' + (isCollapsed ? ' collapsed' : '') + '">';

        if (isLightLayer) {
            lights.forEach(ld => {
                const sel = selectedLightData && selectedLightData.id === ld.id;
                html += '<div class="layer-item' + (sel ? ' selected' : '') + '" onclick="onLayerItemClick(event, \'light\', \'' + ld.id + '\')">';
                html += '<span class="name">💡 ' + escapeHtml(ld.name) + '</span>';
                html += '<button class="icon-btn danger" onclick="onLayerItemDelete(event, \'light\', \'' + ld.id + '\')" title="Delete">✕</button>';
                html += '</div>';
            });
        } else {
            items.forEach(c => {
                const sel = selectedComponent === c;
                const hidden = !c.visible;
                const locked = c.userData.locked;
                const cls = 'layer-item' + (sel ? ' selected' : '') + (hidden ? ' hidden' : '');
                html += '<div class="' + cls + '" onclick="onLayerItemClick(event, \'comp\', \'' + c.userData.id + '\')">';
                html += '<span class="name">' + (locked ? '🔒 ' : '') + escapeHtml(c.userData.name) + '</span>';
                html += '<button class="icon-btn" onclick="onLayerItemToggleVisible(event, \'' + c.userData.id + '\')" title="Toggle visibility">' + (hidden ? '🚫' : '👁') + '</button>';
                html += '<button class="icon-btn" onclick="onLayerItemToggleLock(event, \'' + c.userData.id + '\')" title="Toggle lock">' + (locked ? '🔒' : '🔓') + '</button>';
                html += '<button class="icon-btn danger" onclick="onLayerItemDelete(event, \'comp\', \'' + c.userData.id + '\')" title="Delete">✕</button>';
                html += '</div>';
            });
        }

        html += '</div></div>';
    });

    if (totalItems === 0) {
        html = '<div class="layer-empty">No objects yet. Add furniture, decor or lights to get started.</div>';
    }

    listEl.innerHTML = html;
}

function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, m => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[m]);
}

function toggleLayerGroup(layerName) {
    collapsedLayers[layerName] = !collapsedLayers[layerName];
    renderLayersPanel();
}

function onLayerItemClick(evt, kind, id) {
    evt.stopPropagation();
    if (kind === 'comp') {
        const c = components.find(x => String(x.userData.id) === String(id));
        if (c) selectComponent(c);
    } else {
        const ld = lights.find(x => String(x.id) === String(id));
        if (ld) selectLight(ld);
    }
}

function onLayerItemToggleVisible(evt, id) {
    evt.stopPropagation();
    const c = components.find(x => String(x.userData.id) === String(id));
    if (!c) return;
    c.visible = !c.visible;
    if (!c.visible && c === selectedComponent) {
        transformControls.detach();
    }
    if (c === selectedComponent) updateComponentProperties();
    renderLayersPanel();
}

function onLayerItemToggleLock(evt, id) {
    evt.stopPropagation();
    const c = components.find(x => String(x.userData.id) === String(id));
    if (!c) return;
    c.userData.locked = !c.userData.locked;
    if (c.userData.locked && c === selectedComponent) {
        transformControls.detach();
        deselectComponent();
        updateSelectionPanels();
    }
    renderLayersPanel();
}

function onLayerItemDelete(evt, kind, id) {
    evt.stopPropagation();
    if (kind === 'comp') {
        const c = components.find(x => String(x.userData.id) === String(id));
        if (!c) return;
        scene.remove(c);
        components = components.filter(x => x !== c);
        if (c === selectedComponent) {
            transformControls.detach();
            selectedComponent = null;
            updateSelectionPanels();
        }
    } else {
        const ld = lights.find(x => String(x.id) === String(id));
        if (!ld) return;
        if (ld.sphere) scene.remove(ld.sphere);
        scene.remove(ld.light);
        if (ld.light.target) scene.remove(ld.light.target);
        lights = lights.filter(x => x !== ld);
        if (ld === selectedLightData) {
            selectedLightData = null;
            transformControls.detach();
            updateSelectionPanels();
        }
    }
    renderLayersPanel();
}

/* ===================================================================
   SELECTION PANEL VISIBILITY
   =================================================================== */
function updateSelectionPanels() {
    const compPanel = document.getElementById('componentProperties');
    const lightPanel = document.getElementById('selectedLightProps');
    const notice = document.getElementById('noSelectionNotice');

    if (selectedComponent) {
        compPanel.style.display = 'block';
        lightPanel.style.display = 'none';
        notice.style.display = 'none';
    } else if (selectedLightData) {
        compPanel.style.display = 'none';
        lightPanel.style.display = 'block';
        notice.style.display = 'none';
    } else {
        compPanel.style.display = 'none';
        lightPanel.style.display = 'none';
        notice.style.display = 'block';
    }
}

/* ===================================================================
   MOUSE — robust selection fix
   =================================================================== */
function isPointerOverGizmo(event) {
    if (!transformControls.object || !transformControls.visible) return false;
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    try {
        const hits = raycaster.intersectObject(transformControls, true);
        return hits.length > 0;
    } catch (e) {
        return false;
    }
}

function setupMouseEvents() {
    const el = renderer.domElement;

    el.addEventListener('pointerdown', e => {
        /* Only left-click / touch */
        if (typeof e.button === 'number' && e.button !== 0) return;

        /* If the gizmo is under the pointer, let TransformControls handle it */
        if (isPointerOverGizmo(e)) return;
        if (transformControls.dragging) return;

        const rect = el.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);

        /* Build lists of selectable objects (respect visibility + lock) */
        const lightSpheres = lights.map(l => l.sphere).filter(s => s && s.visible);
        const selectableComponents = components.filter(c => c.visible && !c.userData.locked);

        /* Try light spheres first (smaller targets) */
        if (lightSpheres.length > 0) {
            const lhits = raycaster.intersectObjects(lightSpheres, true);
            if (lhits.length > 0) {
                let obj = lhits[0].object;
                while (obj && !obj.userData.isLightSphere) obj = obj.parent;
                if (obj) {
                    const ld = lights.find(l => l.sphere === obj);
                    if (ld) {
                        selectLight(ld);
                        e.stopPropagation();
                        return;
                    }
                }
            }
        }

        /* Then components */
        if (selectableComponents.length > 0) {
            const chits = raycaster.intersectObjects(selectableComponents, true);
            if (chits.length > 0) {
                selectComponent(chits[0].object);
                e.stopPropagation();
                return;
            }
        }

        /* Empty space → deselect everything */
        deselectComponent();
        deselectLight();
        transformControls.detach();
        updateSelectionPanels();
        renderLayersPanel();
    });
}

/* ===================================================================
   KEYBOARD
   =================================================================== */
function setupKeyboardEvents() {
    document.addEventListener('keydown', e => {
        const tag = (e.target.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'select' || tag === 'textarea') return;

        const k = e.key.toLowerCase();
        if (k === 'm') setTransformMode('translate');
        else if (k === 'r') setTransformMode('rotate');
        else if (k === 's') setTransformMode('scale');
        else if (k === 'escape') {
            deselectComponent();
            deselectLight();
            transformControls.detach();
            updateSelectionPanels();
            renderLayersPanel();
        } else if (k === 'delete' || k === 'backspace') {
            if (selectedComponent) deleteSelectedComponent();
            else if (selectedLightData) removeSelectedLight();
        }
    });
}

/* ===================================================================
   UTIL
   =================================================================== */
function resetCamera() {
    camera.position.set(0, 3, 8);
    controls.target.set(0, 2, 0);
    controls.update();
}
function zoomIn()  { camera.position.multiplyScalar(0.9); }
function zoomOut() { camera.position.multiplyScalar(1.1); }

function downloadImage() {
    const gizmoWasVisible = transformControls.visible;
    transformControls.visible = false;
    renderer.render(scene, camera);

    const a = document.createElement('a');
    a.download = '3d-environment.png';
    a.href = renderer.domElement.toDataURL('image/png');
    a.click();

    transformControls.visible = gizmoWasVisible;
}

function showStatus(msg, type) {
    const s = document.getElementById('status');
    s.className = 'status ' + type;
    s.textContent = msg;
    setTimeout(() => { s.className = 'status'; s.textContent = ''; }, 4500);
}

function showLoading(b, msg) {
    const el = document.getElementById('loading');
    el.style.display = b ? 'block' : 'none';
    if (msg) {
        const p = el.querySelector('p');
        if (p) p.textContent = msg;
    }
}
function serializeTree(node) {
    if (!node) return null;
    const out = {
        position:   [node.position.x, node.position.y, node.position.z],
        quaternion: [node.quaternion.x, node.quaternion.y, node.quaternion.z, node.quaternion.w],
        scale:      [node.scale.x, node.scale.y, node.scale.z],
        visible:    node.visible !== false,
        children:   []
    };

    if (node.isMesh && node.geometry) {
        const g    = node.geometry;
        const posA = g.getAttribute('position');
        const nrmA = g.getAttribute('normal');
        const uvA  = g.getAttribute('uv');
        const idxA = g.getIndex();

        const geometry = {
            positions: posA ? Array.from(posA.array) : [],
            normals:   nrmA ? Array.from(nrmA.array) : null,
            uvs:       uvA  ? Array.from(uvA.array)  : null,
            index:     idxA ? Array.from(idxA.array) : null
        };

        // Guarantee normals so the model is lit when reloaded
        if ((!geometry.normals || !geometry.normals.length) && geometry.positions.length) {
            const tmp = new THREE.BufferGeometry();
            tmp.setAttribute('position',
                new THREE.Float32BufferAttribute(geometry.positions, 3));
            if (geometry.index && geometry.index.length) {
                tmp.setIndex(geometry.index.length > 65535
                    ? new THREE.Uint32BufferAttribute(geometry.index, 1)
                    : new THREE.Uint16BufferAttribute(geometry.index, 1));
            }
            tmp.computeVertexNormals();
            geometry.normals = Array.from(tmp.attributes.normal.array);
        }

        out.isMesh = true;
        out.geometry = geometry;
        out.material = {
            color: (node.material && node.material.color)
                ? '#' + node.material.color.getHexString()
                : '#cccccc'
        };
    }

    if (Array.isArray(node.children)) {
        for (const ch of node.children) {
            const s = serializeTree(ch);
            if (s) out.children.push(s);
        }
    }
    return out;
}
/* ===================================================================
   RE-RUN AI ON EVERYTHING ALREADY UPLOADED
   =================================================================== */
async function reprocessAllImages() {
    if (!AI.enabled) {
        showStatus('Enable AI refinement first.', 'error');
        return;
    }
    const hasAny = baseImageOriginal || roofImageOriginal || wallImagesOriginal.length;
    if (!hasAny) {
        showStatus('Upload some images first.', 'error');
        return;
    }

    showLoading(true, '🤖 Re-refining all images…');
    try {
        if (baseImageOriginal) {
            const r = await refineGroup([baseImageOriginal], false);
            baseImageDataURL = r[0];
            baseTexture = await loadTextureAsync(r[0]);
            refreshPreview('basePreview', [r[0]]);
        }

        if (roofImageOriginal) {
            const r = await refineGroup([roofImageOriginal], false);
            roofImageDataURL = r[0];
            roofTexture = await loadTextureAsync(r[0]);
            refreshPreview('roofPreview', [r[0]]);
        }

        if (wallImagesOriginal.length) {
            const r = await refineGroup(wallImagesOriginal, true);
            wallImageDataURLs = r.slice();
            wallTextures.length = 0;
            const texs = await Promise.all(r.map(loadTextureAsync));
            texs.forEach(t => { if (t) wallTextures.push(t); });
            refreshPreview('wallPreview', r);
            updateWallAssignmentInfo();
        }

        if (environment) createEnvironment();   /* rebuild with new textures */
        showStatus('AI refinement re-applied.', 'success');
    } catch (err) {
        console.error(err);
        showStatus('Refinement error: ' + err.message, 'error');
    }
    showLoading(false);
}

function refreshPreview(containerId, urls) {
    const box = document.getElementById(containerId);
    if (!box) return;
    box.innerHTML = '';
    urls.forEach(u => {
        const img = document.createElement('img');
        img.src = u;
        img.className = 'preview-image ai';
        img.onclick = () => selectImage(img);
        box.appendChild(img);
    });
}

/* ===================================================================
   EXPORT
   =================================================================== */
function exportRoomPackage() {
    function serializeTree(node, fallbackColor) {
        if (!node) return null;
        const out = {
            position:   [node.position.x, node.position.y, node.position.z],
            quaternion: [node.quaternion.x, node.quaternion.y, node.quaternion.z, node.quaternion.w],
            scale:      [node.scale.x, node.scale.y, node.scale.z],
            visible:    node.visible !== false,
            children:   []
        };

        if (node.isMesh && node.geometry) {
            const g    = node.geometry;
            const posA = g.getAttribute('position');
            const nrmA = g.getAttribute('normal');
            const uvA  = g.getAttribute('uv');
            const idxA = g.getIndex();

            const geometry = {
                positions: posA ? Array.from(posA.array) : [],
                normals:   nrmA ? Array.from(nrmA.array) : null,
                uvs:       uvA  ? Array.from(uvA.array)  : null,
                index:     idxA ? Array.from(idxA.array) : null
            };

            if ((!geometry.normals || !geometry.normals.length) && geometry.positions.length) {
                const tmp = new THREE.BufferGeometry();
                tmp.setAttribute('position', new THREE.Float32BufferAttribute(geometry.positions, 3));
                if (geometry.index && geometry.index.length) {
                    tmp.setIndex(geometry.index.length > 65535
                        ? new THREE.Uint32BufferAttribute(geometry.index, 1)
                        : new THREE.Uint16BufferAttribute(geometry.index, 1));
                }
                tmp.computeVertexNormals();
                geometry.normals = Array.from(tmp.attributes.normal.array);
            }

            let colorHex = fallbackColor || '#666666';
            let mapDataUrl = null;

            if (node.material) {
                const mat = Array.isArray(node.material) ? node.material[0] : node.material;
                if (mat && mat.color && typeof mat.color.getHexString === 'function') {
                    const hex = '#' + mat.color.getHexString();
                    if (hex !== '#ffffff' || !fallbackColor) colorHex = hex;
                }
                // Extract Texture Map if it exists
                if (mat && mat.map && mat.map.image) {
                    try {
                        const img = mat.map.image;
                        const canvas = document.createElement('canvas');
                        canvas.width = img.width || img.videoWidth;
                        canvas.height = img.height || img.videoHeight;
                        if (canvas.width > 0 && canvas.height > 0) {
                            canvas.getContext('2d').drawImage(img, 0, 0);
                            mapDataUrl = canvas.toDataURL('image/jpeg', 0.85);
                        }
                    } catch (e) { console.warn('Could not serialize texture', e); }
                }
            }

            out.isMesh   = true;
            out.geometry = geometry;
            out.material = { color: colorHex, map: mapDataUrl };
        }

        if (Array.isArray(node.children)) {
            for (const ch of node.children) {
                const s = serializeTree(ch, fallbackColor);
                if (s) out.children.push(s);
            }
        }
        return out;
    }

    const serializedComponents = components.map(comp => {
        let color = null;
        comp.traverse(child => {
            if (color) return;
            if (!child.isMesh || !child.material) return;
            const mat = Array.isArray(child.material) ? child.material[0] : child.material;
            if (mat && mat.color && typeof mat.color.getHexString === 'function') {
                color = '#' + mat.color.getHexString();
            }
        });

        const entry = {
            type:     comp.userData.type || 'custom',
            name:     comp.userData.name || 'Object',
            layer:    comp.userData.layer || 'Other',
            position: [comp.position.x, comp.position.y, comp.position.z],
            rotation: [comp.rotation.x, comp.rotation.y, comp.rotation.z],
            scale:    [comp.scale.x, comp.scale.y, comp.scale.z],
            color:    color,
            visible:  comp.visible
        };

        if (comp.userData.type === 'custom') {
            entry.tree = serializeTree(comp, color);
        }
        return entry;
    });

    const serializedLights = lights.map(ld => ({
        type:      ld.type,
        intensity: ld.light.intensity,
        color:     '#' + ld.light.color.getHexString(),
        distance:  ld.light.distance || 0,
        position:  ld.light.position ? [ld.light.position.x, ld.light.position.y, ld.light.position.z] : null
    }));

    const canonical    = ['Back Wall', 'Left Wall', 'Right Wall', 'Front Wall'];
    const orderedWalls = canonical.map(label => {
        const idx = wallPositions.findIndex(p => p.label === label);
        return (idx >= 0 && wallImageDataURLs[idx]) ? wallImageDataURLs[idx] : null;
    });

    const pkg = {
        roomName:           'Deluxe Executive Suite',
        price:              '$180 / Night',
        environmentCreated: !!environment,
        roomSize:           { width: 10, height: 8, depth: 10 },
        baseImage:          baseImageDataURL,
        roofImage:          roofImageDataURL,
        wallImages:         orderedWalls,
        components:         serializedComponents,
        lights:             serializedLights,
        timestamp:          new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'hotel-room-config.json';
    a.click();
    URL.revokeObjectURL(url);
    showStatus('Complete room package exported!', 'success');
}
/* ===================================================================
   BOOT
   =================================================================== */
document.addEventListener('DOMContentLoaded', initScene);
