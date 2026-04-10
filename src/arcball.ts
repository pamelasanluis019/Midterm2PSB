// ── Arcball Controls ──────────────────────────────────────────────────────────
// Reference: http://courses.cms.caltech.edu/cs171/assignments/hw3/hw3-notes/notes-hw3.html

import { quat, vec3, mat4, type Vec3, type Vec4 } from './math';
import type { Renderer } from './renderer';

function screenToSphere(x: number, y: number, w: number, h: number): Vec3 {
  const nx = (2 * x / w - 1);
  const ny = (1 - 2 * y / h);
  const r2 = nx * nx + ny * ny;
  const nz = r2 <= 1 ? Math.sqrt(1 - r2) : 0;
  return vec3.normalize([nx, ny, nz]);
}

export class ArcballControls {
  renderer: Renderer;
  canvas: HTMLCanvasElement;
  isDragging = false;
  lastX = 0; lastY = 0;
  startV: Vec3 = [0, 0, 1];

  constructor(renderer: Renderer) {
    this.renderer = renderer;
    this.canvas = renderer.canvas;
    this.attach();
  }

  attach() {
    this.canvas.addEventListener('mousedown', this.onMouseDown);
    this.canvas.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mouseup', this.onMouseUp);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.canvas.addEventListener('contextmenu', e => e.preventDefault());
  }

  onMouseDown = (e: MouseEvent) => {
    this.isDragging = true;
    this.lastX = e.clientX; this.lastY = e.clientY;
    const rect = this.canvas.getBoundingClientRect();
    this.startV = screenToSphere(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height);
  };

  onMouseMove = (e: MouseEvent) => {
    if (!this.isDragging) return;
    const rect = this.canvas.getBoundingClientRect();
    const cur = screenToSphere(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height);
    const prev = screenToSphere(this.lastX - rect.left, this.lastY - rect.top, rect.width, rect.height);

    const r = this.renderer;

    if (r.selected) {
      // Rotate selected object
      const dot = Math.min(1, Math.max(-1, vec3.dot(prev, cur)));
      const angle = Math.acos(dot);
      if (Math.abs(angle) > 0.0001) {
        const axis = vec3.normalize(vec3.cross(prev, cur));
        // Transform axis to object local space via camera rotation inverse
        const camRot = mat4.fromQuat(r.camQuat);
        // rotate axis by camera orientation (world axis)
        const worldAxis: Vec3 = [
          camRot[0]*axis[0] + camRot[4]*axis[1] + camRot[8]*axis[2],
          camRot[1]*axis[0] + camRot[5]*axis[1] + camRot[9]*axis[2],
          camRot[2]*axis[0] + camRot[6]*axis[1] + camRot[10]*axis[2],
        ];
        const dq = quat.fromAxisAngle(worldAxis, angle);
        r.selected.rotation = quat.normalize(quat.multiply(dq, r.selected.rotation));
      }
    } else {
      // Orbit camera
      const dot = Math.min(1, Math.max(-1, vec3.dot(prev, cur)));
      const angle = Math.acos(dot);
      if (Math.abs(angle) > 0.0001) {
        const axis = vec3.normalize(vec3.cross(prev, cur));
        const dq = quat.fromAxisAngle(axis, angle);
        r.camQuat = quat.normalize(quat.multiply(dq, r.camQuat));
      }
    }

    this.lastX = e.clientX; this.lastY = e.clientY;
  };

  onMouseUp = () => { this.isDragging = false; };

  onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.1 : 0.9;
    this.renderer.camDistance = Math.max(0.5, Math.min(2000, this.renderer.camDistance * factor));
  };
}
