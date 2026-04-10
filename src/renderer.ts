// ── WebGPU Renderer ─────────────────────────────────────────────────────────

import { mat4, vec3, quat, type Vec3, type Vec4 } from './math';
import { SceneObject } from './scene';
import type { Mesh } from './mesh';

// Render modes matching shader
export const RenderMode = {
  Phong: 0, Gouraud: 1, Normals: 2, Wireframe: 3, Depth: 4, UVCoords: 5, Texture: 6,
} as const;
export type RenderModeVal = (typeof RenderMode)[keyof typeof RenderMode];

// Uniform buffer layout (must match shader.wgsl)
// mvp(64) + model(64) + normalMat(64) + lightPos(16) + eyePos(16) + objColor(16) + material(16) + mode(4) + pad(12) = 272
const UNIFORM_SIZE = 272;

export class Renderer {
  canvas: HTMLCanvasElement;
  device!: GPUDevice;
  context!: GPUCanvasContext;
  format!: GPUTextureFormat;
  pipeline!: GPURenderPipeline;
  wirePipeline!: GPURenderPipeline;
  depthTexture!: GPUTexture;
  defaultTexture!: GPUTexture;
  defaultSampler!: GPUSampler;
  bindGroupLayout!: GPUBindGroupLayout;

  renderMode: RenderModeVal = RenderMode.Phong;
  lightColor: [number, number, number] = [1, 1, 1];

  // Camera (arcball)
  camTarget: Vec3 = [0, 0, 0];
  camDistance: number = 3;
  camQuat: Vec4 = quat.identity();
  camFov = Math.PI / 4;

  objects: SceneObject[] = [];
  selected: SceneObject | null = null;

  // Per-object textures
  objectTextures = new Map<number, { tex: GPUTexture; view: GPUTextureView }>();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  async init() {
    const adapter = await navigator.gpu?.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new Error('WebGPU not supported');
    this.device = await adapter.requestDevice();

    this.context = this.canvas.getContext('webgpu')!;
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({ device: this.device, format: this.format, alphaMode: 'opaque' });

    await this.createPipelines();
    this.createDepthTexture();
    this.createDefaultTexture();
  }

  async createPipelines() {
    const shaderSrc = await fetch('/shader.wgsl').then(r => r.text());
    const shaderModule = this.device.createShaderModule({ code: shaderSrc });

    this.bindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float', viewDimension: '2d' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      ],
    });

    const pipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [this.bindGroupLayout],
    });

    const vertexBufferLayout: GPUVertexBufferLayout = {
      arrayStride: 8 * 4, // pos(3) + nor(3) + uv(2)
      attributes: [
        { shaderLocation: 0, offset: 0, format: 'float32x3' },
        { shaderLocation: 1, offset: 12, format: 'float32x3' },
        { shaderLocation: 2, offset: 24, format: 'float32x2' },
      ],
    };

    const commonDesc = {
      layout: pipelineLayout,
      vertex: { module: shaderModule, entryPoint: 'vs_main', buffers: [vertexBufferLayout] },
      depthStencil: { format: 'depth24plus' as GPUTextureFormat, depthWriteEnabled: true, depthCompare: 'less' as GPUCompareFunction },
      primitive: { topology: 'triangle-list' as GPUPrimitiveTopology, cullMode: 'back' as GPUCullMode },
    };

    this.pipeline = this.device.createRenderPipeline({
      ...commonDesc,
      fragment: {
        module: shaderModule, entryPoint: 'fs_main',
        targets: [{ format: this.format }],
      },
    });

    this.wirePipeline = this.device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: { module: shaderModule, entryPoint: 'vs_main', buffers: [vertexBufferLayout] },
      fragment: {
        module: shaderModule, entryPoint: 'fs_main',
        targets: [{ format: this.format, blend: { color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'zero', operation: 'add' } } }],
      },
      depthStencil: { format: 'depth24plus' as GPUTextureFormat, depthWriteEnabled: false, depthCompare: 'less-equal' as GPUCompareFunction },
      primitive: { topology: 'line-list' as GPUPrimitiveTopology },
    });
  }

  createDepthTexture() {
    if (this.depthTexture) this.depthTexture.destroy();
    this.depthTexture = this.device.createTexture({
      size: [this.canvas.width, this.canvas.height],
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
  }

  createDefaultTexture() {
    const data = new Uint8Array([255, 255, 255, 255]);
    this.defaultTexture = this.device.createTexture({
      size: [1, 1], format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    this.device.queue.writeTexture({ texture: this.defaultTexture }, data, { bytesPerRow: 4 }, [1, 1]);
    this.defaultSampler = this.device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'repeat', addressModeV: 'repeat' });
  }

  addObject(obj: SceneObject) {
    this.uploadMesh(obj);
    this.objects.push(obj);
  }

  uploadMesh(obj: SceneObject) {
    const { positions, normals, uvs, indices } = obj.mesh;
    const numVerts = positions.length / 3;

    // Interleave: pos(3) nor(3) uv(2)
    const interleaved = new Float32Array(numVerts * 8);
    for (let i = 0; i < numVerts; i++) {
      interleaved[i * 8 + 0] = positions[i * 3 + 0];
      interleaved[i * 8 + 1] = positions[i * 3 + 1];
      interleaved[i * 8 + 2] = positions[i * 3 + 2];
      interleaved[i * 8 + 3] = normals[i * 3 + 0];
      interleaved[i * 8 + 4] = normals[i * 3 + 1];
      interleaved[i * 8 + 5] = normals[i * 3 + 2];
      interleaved[i * 8 + 6] = uvs[i * 2 + 0];
      interleaved[i * 8 + 7] = uvs[i * 2 + 1];
    }

    obj.vertexBuffer = this.device.createBuffer({
      size: interleaved.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(obj.vertexBuffer, 0, interleaved);

    obj.indexBuffer = this.device.createBuffer({
      size: indices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(obj.indexBuffer, 0, indices);
    obj.indexCount = indices.length;

    obj.uniformBuffer = this.device.createBuffer({
      size: UNIFORM_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.rebuildBindGroup(obj);
  }

  rebuildBindGroup(obj: SceneObject) {
    const texEntry = this.objectTextures.get(obj.id);
    const texView = texEntry ? texEntry.view : this.defaultTexture.createView();
    obj.bindGroup = this.device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: obj.uniformBuffer } },
        { binding: 1, resource: texView },
        { binding: 2, resource: this.defaultSampler },
      ],
    });
  }

  setObjectTexture(obj: SceneObject, imageData: ImageBitmap) {
    const tex = this.device.createTexture({
      size: [imageData.width, imageData.height],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.device.queue.copyExternalImageToTexture({ source: imageData }, { texture: tex }, [imageData.width, imageData.height]);
    const view = tex.createView();
    this.objectTextures.set(obj.id, { tex, view });
    this.rebuildBindGroup(obj);
  }

  removeObject(obj: SceneObject) {
    this.objects = this.objects.filter(o => o !== obj);
    if (this.selected === obj) this.selected = null;
    obj.vertexBuffer?.destroy();
    obj.indexBuffer?.destroy();
    obj.uniformBuffer?.destroy();
  }

  resize(w: number, h: number) {
    this.canvas.width = w;
    this.canvas.height = h;
    this.createDepthTexture();
  }

  getEye(): Vec3 {
    const rotMat = mat4.fromQuat(this.camQuat);
    const dir: Vec3 = [
      rotMat[2] * this.camDistance,
      rotMat[6] * this.camDistance,
      rotMat[10] * this.camDistance,
    ];
    return vec3.add(this.camTarget, dir);
  }

  frame() {
    const w = this.canvas.width, h = this.canvas.height;
    const aspect = w / h;

    const eye = this.getEye();
    const view = mat4.lookAt(eye, this.camTarget, [0, 1, 0]);
    // Clip near/far to prevent harsh clipping
    const near = this.camDistance * 0.001;
    const far = this.camDistance * 100;
    const proj = mat4.perspective(this.camFov, aspect, near, far);

    // Light above camera
    const lightOffset: Vec3 = [1.5, 3, 2];
    const lightPos: Vec3 = vec3.add(eye, lightOffset);

    const encoder = this.device.createCommandEncoder();
    const colorView = this.context.getCurrentTexture().createView();

    const renderPass = encoder.beginRenderPass({
      colorAttachments: [{ view: colorView, clearValue: { r: 0.05, g: 0.067, b: 0.09, a: 1 }, loadOp: 'clear', storeOp: 'store' }],
      depthStencilAttachment: { view: this.depthTexture.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' },
    });

    for (const obj of this.objects) {
      const model = obj.modelMatrix();
      const mvp = mat4.multiply(mat4.multiply(proj, view), model);
      const normalMat = obj.normalMatrix(model);
      const [r, g, b] = obj.material.color;
      const [lr, lg, lb] = this.lightColor;

      // Write uniform buffer
      const uniforms = new Float32Array(UNIFORM_SIZE / 4);
      uniforms.set(mvp, 0);
      uniforms.set(model, 16);
      uniforms.set(normalMat, 32);
      uniforms.set([lightPos[0] * lr, lightPos[1] * lg, lightPos[2] * lb, 1], 48);
      uniforms.set([eye[0], eye[1], eye[2], 1], 52);
      uniforms.set([r, g, b, 1], 56);
      uniforms.set([obj.material.Ka, obj.material.Kd, obj.material.Ks, obj.material.shininess], 60);

      // Effective render mode (if texture mode but no texture assigned, fall back to Phong)
      let mode = this.renderMode;
      if (mode === RenderMode.Texture && !this.objectTextures.has(obj.id)) {
        mode = RenderMode.Phong;
      }
      uniforms[64] = mode === RenderMode.Wireframe ? 0 : mode; // solid pass always Phong for wireframe

      this.device.queue.writeBuffer(obj.uniformBuffer, 0, uniforms);

      if (this.renderMode === RenderMode.Wireframe) {
        // Draw solid base pass
        renderPass.setPipeline(this.pipeline);
        renderPass.setBindGroup(0, obj.bindGroup);
        renderPass.setVertexBuffer(0, obj.vertexBuffer);
        renderPass.setIndexBuffer(obj.indexBuffer, 'uint32');
        renderPass.drawIndexed(obj.indexCount);

        // Draw wireframe overlay using line-list from triangle edges
        // We use the same index buffer interpreted as triangle-list but draw lines
        // Actually rebuild wire indices on first use (cached on obj)
        if (!(obj as any)._wireBuffer) {
          this.buildWireBuffer(obj);
        }
        const wireUniforms = new Float32Array(uniforms);
        wireUniforms[56] = 0.0; wireUniforms[57] = 1.0; wireUniforms[58] = 0.5; wireUniforms[59] = 1.0;
        wireUniforms[60] = 1; wireUniforms[61] = 0; wireUniforms[62] = 0; wireUniforms[63] = 1;
        wireUniforms[64] = 0;
        const tmpBuf = this.device.createBuffer({ size: UNIFORM_SIZE, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, mappedAtCreation: true });
        new Float32Array(tmpBuf.getMappedRange()).set(wireUniforms);
        tmpBuf.unmap();
        const tmpBG = this.device.createBindGroup({ layout: this.bindGroupLayout, entries: [
          { binding: 0, resource: { buffer: tmpBuf } },
          { binding: 1, resource: this.defaultTexture.createView() },
          { binding: 2, resource: this.defaultSampler },
        ]});
        renderPass.setPipeline(this.wirePipeline);
        renderPass.setBindGroup(0, tmpBG);
        renderPass.setVertexBuffer(0, obj.vertexBuffer);
        renderPass.setIndexBuffer((obj as any)._wireBuffer, 'uint32');
        renderPass.drawIndexed((obj as any)._wireCount);
      } else {
        renderPass.setPipeline(this.pipeline);
        renderPass.setBindGroup(0, obj.bindGroup);
        renderPass.setVertexBuffer(0, obj.vertexBuffer);
        renderPass.setIndexBuffer(obj.indexBuffer, 'uint32');
        renderPass.drawIndexed(obj.indexCount);
      }
    }

    renderPass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  buildWireBuffer(obj: SceneObject) {
    const triIdx = obj.mesh.indices;
    const lineSet = new Set<string>();
    const lines: number[] = [];
    for (let i = 0; i < triIdx.length; i += 3) {
      const a = triIdx[i], b = triIdx[i+1], c = triIdx[i+2];
      for (const [x, y] of [[a,b],[b,c],[c,a]]) {
        const key = x < y ? `${x}_${y}` : `${y}_${x}`;
        if (!lineSet.has(key)) { lineSet.add(key); lines.push(x, y); }
      }
    }
    const buf = this.device.createBuffer({
      size: lines.length * 4,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(buf, 0, new Uint32Array(lines));
    (obj as any)._wireBuffer = buf;
    (obj as any)._wireCount = lines.length;
  }
}
