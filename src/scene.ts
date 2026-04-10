// ── Scene Object ───────────────────────────────────────────────────────────

import type { Mesh } from './mesh';
import type { Vec3, Vec4, Mat4 } from './math';
import { mat4, quat } from './math';

let _nextId = 1;

export interface Material {
  Ka: number; Kd: number; Ks: number; shininess: number;
  color: [number, number, number];
}

export class SceneObject {
  id: number;
  name: string;
  mesh: Mesh;
  translate: Vec3 = [0, 0, 0];
  rotation: Vec4 = quat.identity();
  scaleV: Vec3 = [1, 1, 1];
  material: Material = { Ka: 0.12, Kd: 0.75, Ks: 0.55, shininess: 48, color: [0.27, 0.53, 0.80] };

  // GPU buffers
  vertexBuffer!: GPUBuffer;
  indexBuffer!: GPUBuffer;
  uniformBuffer!: GPUBuffer;
  bindGroup!: GPUBindGroup;
  indexCount: number = 0;

  constructor(name: string, mesh: Mesh) {
    this.id = _nextId++;
    this.name = name;
    this.mesh = mesh;
  }

  modelMatrix(): Mat4 {
    const T = mat4.translation(...this.translate);
    const R = mat4.fromQuat(this.rotation);
    const S = mat4.scale(...this.scaleV);
    return mat4.multiply(mat4.multiply(T, R), S);
  }

  normalMatrix(model: Mat4): Mat4 {
    // Inverse transpose of model (upper 3x3)
    const inv = mat4.invert(model);
    return mat4.transpose3x3(inv);
  }
}
