// ── Main Application ─────────────────────────────────────────────────────────

import { Renderer, RenderMode, type RenderModeVal } from './renderer';
import { ArcballControls } from './arcball';
import { SceneObject } from './scene';
import { parseOBJ, generateSphere, generateCube } from './mesh';

const canvas = document.getElementById('gpuCanvas') as HTMLCanvasElement;
const status = document.getElementById('status')!;

const renderer = new Renderer(canvas);
let controls: ArcballControls;

// ── Mode descriptions ────────────────────────────────────────────────────────
const modeDescs: Record<number, string> = {
  0: 'Phong: normals interpolated per fragment, lighting per pixel.',
  1: 'Gouraud: lighting computed per vertex, interpolated across triangle.',
  2: 'Normals: RGB encodes XYZ of the surface normal vector.',
  3: 'Wireframe: solid Phong base with line overlay (hidden surface removal).',
  4: 'Depth: grayscale depth buffer visualization.',
  5: 'UV Coords: RG channels show spherical texture coordinates.',
  6: 'Texture: spherical UV texture mapping with diffuse lighting.',
};

// ── Resize handler ───────────────────────────────────────────────────────────
function resizeCanvas() {
  const container = canvas.parentElement!;
  const w = container.clientWidth * devicePixelRatio;
  const h = container.clientHeight * devicePixelRatio;
  if (Math.abs(canvas.width - w) > 1 || Math.abs(canvas.height - h) > 1) {
    renderer.resize(w, h);
  }
}

// ── UI helpers ───────────────────────────────────────────────────────────────
function setStatus(msg: string) { status.textContent = msg; }

function updateSceneList() {
  const list = document.getElementById('scene-list')!;
  list.innerHTML = '';
  renderer.objects.forEach((obj, i) => {
    const el = document.createElement('div');
    el.className = 'scene-item' + (renderer.selected === obj ? ' selected' : '');
    el.innerHTML = `<div class="dot"></div>${i + 1}. ${obj.name}`;
    el.addEventListener('click', () => selectObject(obj));
    list.appendChild(el);
  });
}

function selectObject(obj: SceneObject | null) {
  renderer.selected = obj;
  updateSceneList();
  updateSelectionPanel();
  // Focus camera on selected object
  if (obj) {
    renderer.camTarget = [...obj.translate] as [number, number, number];
  }
}

function updateSelectionPanel() {
  const sel = renderer.selected;
  const info = document.getElementById('selection-info')!;
  const transformSec = document.getElementById('transform-section')!;
  const materialSec = document.getElementById('material-section')!;
  const textureSec = document.getElementById('texture-section')!;

  if (!sel) {
    info.innerHTML = '<div class="no-sel">NO SELECTION -- CAMERA ORBIT MODE</div>';
    transformSec.style.display = 'none';
    materialSec.style.display = 'none';
    textureSec.style.display = 'none';
    return;
  }

  info.innerHTML = '';
  transformSec.style.display = '';
  materialSec.style.display = '';
  textureSec.style.display = '';

  // Transform controls
  const tGrid = document.getElementById('transform-grid')!;
  tGrid.innerHTML = '';

  const makeSlider = (label: string, min: number, max: number, step: number, value: number, onChange: (v: number) => void) => {
    const lbl = document.createElement('label');
    lbl.textContent = label;
    const inp = document.createElement('input');
    inp.type = 'range'; inp.min = String(min); inp.max = String(max); inp.step = String(step); inp.value = String(value);
    const span = document.createElement('span');
    span.textContent = value.toFixed(step < 1 ? 2 : 0);
    inp.addEventListener('input', () => {
      const v = +inp.value;
      span.textContent = v.toFixed(step < 1 ? 2 : 0);
      onChange(v);
    });
    return { lbl, inp, span };
  };

  const transforms: { label: string; get: () => number; set: (v: number) => void; min: number; max: number; step: number }[] = [
    { label: 'Translate X', min: -(Math.max(10, Math.abs(sel.translate[0]) * 3 + 10)), max: Math.max(10, Math.abs(sel.translate[0]) * 3 + 10), step: 0.1, get: () => sel.translate[0], set: v => { sel.translate[0] = v; renderer.camTarget[0] = v; } },
    { label: 'Translate Y', min: -(Math.max(10, Math.abs(sel.translate[1]) * 3 + 10)), max: Math.max(10, Math.abs(sel.translate[1]) * 3 + 10), step: 0.1, get: () => sel.translate[1], set: v => { sel.translate[1] = v; renderer.camTarget[1] = v; } },
    { label: 'Translate Z', min: -(Math.max(10, Math.abs(sel.translate[2]) * 3 + 10)), max: Math.max(10, Math.abs(sel.translate[2]) * 3 + 10), step: 0.1, get: () => sel.translate[2], set: v => { sel.translate[2] = v; renderer.camTarget[2] = v; } },
    { label: 'Scale X', min: 0.1, max: 5, step: 0.1, get: () => sel.scaleV[0], set: v => sel.scaleV[0] = v },
    { label: 'Scale Y', min: 0.1, max: 5, step: 0.1, get: () => sel.scaleV[1], set: v => sel.scaleV[1] = v },
    { label: 'Scale Z', min: 0.1, max: 5, step: 0.1, get: () => sel.scaleV[2], set: v => sel.scaleV[2] = v },
  ];

  for (const t of transforms) {
    const { lbl, inp, span } = makeSlider(t.label, t.min, t.max, t.step, t.get(), t.set);
    tGrid.appendChild(lbl); tGrid.appendChild(span);
    const row = document.createElement('div');
    row.style.cssText = 'grid-column: 1 / -1; width: 100%;';
    row.appendChild(inp);
    tGrid.appendChild(row);
  }

  // Material controls
  const mGrid = document.getElementById('material-grid')!;
  mGrid.innerHTML = '';
  const matSliders: { label: string; get: () => number; set: (v: number) => void }[] = [
    { label: 'Ambient (Ka)', get: () => sel.material.Ka, set: v => sel.material.Ka = v },
    { label: 'Diffuse (Kd)', get: () => sel.material.Kd, set: v => sel.material.Kd = v },
    { label: 'Specular (Ks)', get: () => sel.material.Ks, set: v => sel.material.Ks = v },
    { label: 'Shininess (n)', get: () => sel.material.shininess, set: v => sel.material.shininess = v },
  ];
  for (const [i, t] of matSliders.entries()) {
    const maxVal = i === 3 ? 256 : 1;
    const step = i === 3 ? 1 : 0.01;
    const { lbl, inp, span } = makeSlider(t.label, 0, maxVal, step, t.get(), t.set);
    mGrid.appendChild(lbl); mGrid.appendChild(span);
    const row = document.createElement('div');
    row.style.cssText = 'grid-column: 1 / -1; width: 100%;';
    row.appendChild(inp);
    mGrid.appendChild(row);
  }

  // Color picker
  const [r, g, b] = sel.material.color;
  const hex = '#' + [r, g, b].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
  const colorPicker = document.getElementById('obj-color') as HTMLInputElement;
  colorPicker.value = hex;
  // Re-register listener each time panel is shown to avoid display:none registration issues
  const newPicker = colorPicker.cloneNode(true) as HTMLInputElement;
  colorPicker.parentNode!.replaceChild(newPicker, colorPicker);
  newPicker.addEventListener('input', (e) => {
    const h = (e.target as HTMLInputElement).value;
    const rr = parseInt(h.slice(1, 3), 16) / 255;
    const gg = parseInt(h.slice(3, 5), 16) / 255;
    const bb = parseInt(h.slice(5, 7), 16) / 255;
    if (renderer.selected) renderer.selected.material.color = [rr, gg, bb];
  });
  newPicker.addEventListener('change', (e) => {
    const h = (e.target as HTMLInputElement).value;
    const rr = parseInt(h.slice(1, 3), 16) / 255;
    const gg = parseInt(h.slice(3, 5), 16) / 255;
    const bb = parseInt(h.slice(5, 7), 16) / 255;
    if (renderer.selected) renderer.selected.material.color = [rr, gg, bb];
  });
}

// ── Render mode buttons ──────────────────────────────────────────────────────
document.querySelectorAll('.render-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const mode = +(btn as HTMLElement).dataset.mode! as RenderModeVal;
    renderer.renderMode = mode;
    document.querySelectorAll('.render-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('mode-desc')!.textContent = modeDescs[mode] ?? '';
  });
});

// ── Light color ──────────────────────────────────────────────────────────────
document.getElementById('light-color')!.addEventListener('input', (e) => {
  const hex = (e.target as HTMLInputElement).value;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  renderer.lightColor = [r, g, b];
});

// ── Object color ─────────────────────────────────────────────────────────────
// Listener is registered inside updateSelectionPanel() to avoid display:none issues

// ── Add object buttons ───────────────────────────────────────────────────────
function addSphere() {
  const mesh = generateSphere(32, 32);
  const obj = new SceneObject('Sphere', mesh);
  renderer.addObject(obj);
  selectObject(obj);
  renderer.camDistance = 3;
  updateSceneList();
}

function addCube() {
  const mesh = generateCube();
  const obj = new SceneObject('Cube', mesh);
  obj.translate = [1.5, 0, 0];
  renderer.addObject(obj);
  selectObject(obj);
  renderer.camDistance = 4;
  updateSceneList();
}

async function addTeapot() {
  setStatus('Loading teapot...');
  try {
    const text = await fetch('/models/teapot.obj').then(r => r.text());
    const mesh = parseOBJ(text);
    const obj = new SceneObject('Teapot', mesh);
    // Teapot bounding box center: [0.217, 1.575, 0], fit in view
    obj.translate = [-mesh.center[0], -mesh.center[1], -mesh.center[2]];
    renderer.addObject(obj);
    renderer.camTarget = [0, 0, 0];
    renderer.camDistance = mesh.radius * 3;
    selectObject(obj);
    updateSceneList();
    setStatus('Teapot loaded');
  } catch (e) {
    setStatus('Failed to load teapot: ' + e);
  }
}

async function addBeacon() {
  setStatus('Loading beacon...');
  try {
    const text = await fetch('/models/beacon.obj').then(r => { if (!r.ok) throw new Error('not found'); return r.text(); });
    const mesh = parseOBJ(text);
    const obj = new SceneObject('Beacon', mesh);
    obj.translate = [-125, -125, -125];
    renderer.addObject(obj);
    renderer.camTarget = [0, 0, 0];
    renderer.camDistance = 400;
    selectObject(obj);
    updateSceneList();
    setStatus('Beacon loaded');
  } catch (e) {
    // No beacon.obj available — create a sphere with beacon bounding parameters
    // Beacon: center [125,125,125], radius=125
    const mesh = generateSphere(48, 48);
    const obj = new SceneObject('Beacon', mesh);
    // Sphere has radius 1, scale to 125
    obj.scaleV = [125, 125, 125];
    obj.translate = [0, 0, 0];
    renderer.addObject(obj);
    renderer.camTarget = [0, 0, 0];
    renderer.camDistance = 450;
    selectObject(obj);
    updateSceneList();
    setStatus('Beacon (sphere proxy, r=125). Load beacon.obj via OBJ input for the real mesh.');
  }
}

document.getElementById('btn-add-sphere')!.addEventListener('click', addSphere);
document.getElementById('btn-add-cube')!.addEventListener('click', addCube);
document.getElementById('btn-add-teapot')!.addEventListener('click', addTeapot);
document.getElementById('btn-add-beacon')!.addEventListener('click', addBeacon);

// ── OBJ file input ────────────────────────────────────────────────────────────
document.getElementById('obj-file-input')!.addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  setStatus('Loading ' + file.name + '...');
  const text = await file.text();
  const mesh = parseOBJ(text);
  const name = file.name.replace(/\.obj$/i, '');
  const obj = new SceneObject(name, mesh);
  obj.translate = [-mesh.center[0], -mesh.center[1], -mesh.center[2]];
  renderer.addObject(obj);
  renderer.camTarget = [0, 0, 0];
  renderer.camDistance = mesh.radius * 3;
  selectObject(obj);
  updateSceneList();
  setStatus(name + ' loaded (' + mesh.triangles.length + ' triangles)');
});

// ── Texture file input ────────────────────────────────────────────────────────
document.getElementById('tex-file-input')!.addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file || !renderer.selected) return;
  const bitmap = await createImageBitmap(file);
  renderer.setObjectTexture(renderer.selected, bitmap);
  (document.getElementById('use-texture') as HTMLInputElement).checked = true;
  renderer.renderMode = RenderMode.Texture;
  document.querySelectorAll('.render-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('[data-mode="6"]')?.classList.add('active');
  setStatus('Texture applied');
});

document.getElementById('use-texture')!.addEventListener('change', (e) => {
  const checked = (e.target as HTMLInputElement).checked;
  if (checked) {
    renderer.renderMode = RenderMode.Texture;
    document.querySelectorAll('.render-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('[data-mode="6"]')?.classList.add('active');
  } else {
    renderer.renderMode = RenderMode.Phong;
    document.querySelectorAll('.render-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('[data-mode="0"]')?.classList.add('active');
  }
});

// ── Deselect / Remove ─────────────────────────────────────────────────────────
document.getElementById('btn-deselect')!.addEventListener('click', () => selectObject(null));
document.getElementById('btn-remove')!.addEventListener('click', () => {
  if (!renderer.selected) return;
  renderer.removeObject(renderer.selected);
  selectObject(null);
  updateSceneList();
});

// ── Main loop ─────────────────────────────────────────────────────────────────
function loop() {
  resizeCanvas();
  renderer.frame();
  requestAnimationFrame(loop);
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function main() {
  try {
    setStatus('Initializing WebGPU...');
    await renderer.init();
    controls = new ArcballControls(renderer);
    setStatus('Ready');

    // Add default objects like in the reference image
    addSphere();
    renderer.selected!.translate = [-1.5, 0, 0];
    renderer.selected!.material.color = [0.2, 0.3, 0.35];

    addCube();
    renderer.selected!.translate = [1.5, 0, 0];
    renderer.selected!.material.color = [0.27, 0.53, 0.80];

    // Set camera
    renderer.camTarget = [0, 0, 0];
    renderer.camDistance = 6;
    selectObject(null);

    requestAnimationFrame(loop);
    setTimeout(() => setStatus(''), 2000);
  } catch (err: any) {
    setStatus('Error: ' + err.message);
    console.error(err);
  }
}

main();
