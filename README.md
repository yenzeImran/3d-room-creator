## ✨ Features

### 🛠️ Room Creator (`room creator.html`)
- **Multiple environment types** — room, cube, sphere, or cylinder shells
- **Full texture support** — upload floor, ceiling, and all four walls; configurable wall assignment order
- **13 built-in furniture & decor objects** — chair, table, sofa, bed, lamp, plant, bookshelf, TV, rug, plus cube, sphere, cylinder, cone, and torus
- **Import custom 3D models** — OBJ, GLTF, and GLB formats with automatic scaling
- **Precision transform gizmo** — drag along X, Y, or Z; switch between **Move**, **Rotate**, and **Scale** modes
- **Scene Layers panel** — group objects by type, collapse/expand groups, toggle visibility, lock objects from accidental selection, and delete individually
- **Per-object properties** — name, layer, position, rotation, scale, colour, visibility, and lock state
- **Full lighting system** — point, spot, directional, and ambient lights with live intensity, colour, and distance controls
- **Duplicate objects** with a single click
- **Focus camera** on any object instantly
- **Export everything** to a single self-contained JSON file with images embedded as base64

### 🎬 Hotel Viewer (`hotel view.html`)
- **Smooth 360° drag-to-look** with frame-rate-independent damping and inertia
- **Pinch / scroll zoom** — field-of-view ranges from 25° to 100°
- **Mobile gyroscope support** — tilt your phone to look around (with permission flow for iOS)
- **WebXR VR mode** — native "Enter VR" button on compatible headsets
- **Admin panel** — upload the exported JSON to instantly load a new room
- **Persistent room** — the last uploaded configuration is remembered in `localStorage`
- **Booking overlay** — built-in call-to-action card for your reservation page
- **Graceful fallbacks** — readable error messages if WebGL or the CDN fails

---

## 🧰 Tech Stack

| Layer | Technology |
|-------|-----------|
| 3D engine | [Three.js r128](https://threejs.org/) |
| Controls | `OrbitControls`, `TransformControls` |
| Loaders | `OBJLoader`, `GLTFLoader` |
| Motion | Native `DeviceOrientationEvent` |
| Immersive | Native WebXR (`navigator.xr`) |
| Storage | `localStorage` |
| Framework | None — pure HTML, CSS, and vanilla JavaScript |

---

## 📁 Project Structure


Both HTML files are fully self-contained. The only external dependency is Three.js, loaded from a CDN.

---

## 🚀 Getting Started

### 1. Clone or download the repository

```bash
git clone https://github.com/your-username/hotel-360-tour.git
cd hotel-360-tour

# Python 3
python -m http.server 8000

# or Node.js
npx serve .
