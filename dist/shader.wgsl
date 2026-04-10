// ── Uniform buffer ────────────────────────────────────────────────────────────
struct Uniforms {
  mvp        : mat4x4<f32>,   // offset   0
  model      : mat4x4<f32>,   // offset  64
  normalMat  : mat4x4<f32>,   // offset 128
  lightPos   : vec4<f32>,     // offset 192
  eyePos     : vec4<f32>,     // offset 208
  objColor   : vec4<f32>,     // offset 224
  material   : vec4<f32>,     // offset 240  x=Ka y=Kd z=Ks w=shininess
  mode       : u32,           // offset 256
};

@group(0) @binding(0) var<uniform> u   : Uniforms;
@group(0) @binding(1) var uTex         : texture_2d<f32>;
@group(0) @binding(2) var uSampler     : sampler;

// ── Vertex ────────────────────────────────────────────────────────────────────
struct VOut {
  @builtin(position) clip     : vec4<f32>,
  @location(0)       worldPos : vec3<f32>,
  @location(1)       worldN   : vec3<f32>,
  @location(2)       uv       : vec2<f32>,
  @location(3)       gouraud  : vec3<f32>,
};

fn calcLight(worldPos: vec3<f32>, N: vec3<f32>) -> vec3<f32> {
  let Ka = u.material.x;
  let Kd = u.material.y;
  let Ks = u.material.z;
  let sh = u.material.w;
  let col = u.objColor.rgb;

  let L = normalize(u.lightPos.xyz - worldPos);
  let V = normalize(u.eyePos.xyz   - worldPos);
  let R = reflect(-L, N);

  let ambient  = Ka * col;
  let diff     = Kd * max(dot(N, L), 0.0) * col;
  let spec     = Ks * pow(max(dot(R, V), 0.0), sh) * vec3<f32>(1.0, 1.0, 1.0);
  return ambient + diff + spec;
}

@vertex
fn vs_main(
  @location(0) aPos  : vec3<f32>,
  @location(1) aNorm : vec3<f32>,
  @location(2) aUV   : vec2<f32>,
) -> VOut {
  var o: VOut;
  o.clip     = u.mvp * vec4<f32>(aPos, 1.0);
  o.worldPos = (u.model * vec4<f32>(aPos, 1.0)).xyz;
  o.worldN   = normalize((u.normalMat * vec4<f32>(aNorm, 0.0)).xyz);
  o.uv       = aUV;
  // Gouraud: lighting per vertex
  o.gouraud  = calcLight(o.worldPos, o.worldN);
  return o;
}

// ── Fragment ──────────────────────────────────────────────────────────────────
@fragment
fn fs_main(f: VOut) -> @location(0) vec4<f32> {
  let N = normalize(f.worldN);

  switch (u.mode) {
    // 0 = Phong
    case 0u: {
      return vec4<f32>(calcLight(f.worldPos, N), 1.0);
    }
    // 1 = Gouraud
    case 1u: {
      return vec4<f32>(f.gouraud, 1.0);
    }
    // 2 = Normals
    case 2u: {
      return vec4<f32>(N * 0.5 + 0.5, 1.0);
    }
    // 3 = Wireframe (solid pass in Phong, wire drawn separately)
    case 3u: {
      return vec4<f32>(calcLight(f.worldPos, N), 1.0);
    }
    // 4 = Depth
    case 4u: {
      let d = clamp(f.clip.z / f.clip.w, 0.0, 1.0);
      return vec4<f32>(d, d, d, 1.0);
    }
    // 5 = UV Coords
    case 5u: {
      return vec4<f32>(f.uv, 0.0, 1.0);
    }
    // 6 = Texture
    case 6u: {
      let texCol = textureSample(uTex, uSampler, f.uv).rgb;
      let L = normalize(u.lightPos.xyz - f.worldPos);
      let lit = u.material.x + u.material.y * max(dot(N, L), 0.0);
      return vec4<f32>(texCol * lit, 1.0);
    }
    default: {
      return vec4<f32>(1.0, 0.0, 1.0, 1.0);
    }
  }
}
