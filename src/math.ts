// ── Math Utilities ────────────────────────────────────────────────────────────

export type Vec3 = [number, number, number];
export type Vec4 = [number, number, number, number];
export type Mat4 = Float32Array; // column-major 4x4

export const mat4 = {
  identity(): Mat4 {
    const m = new Float32Array(16);
    m[0] = m[5] = m[10] = m[15] = 1;
    return m;
  },
  multiply(a: Mat4, b: Mat4): Mat4 {
    const m = new Float32Array(16);
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        let s = 0;
        for (let k = 0; k < 4; k++) s += a[k * 4 + i] * b[j * 4 + k];
        m[j * 4 + i] = s;
      }
    }
    return m;
  },
  perspective(fovY: number, aspect: number, near: number, far: number): Mat4 {
    const f = 1 / Math.tan(fovY / 2);
    const m = new Float32Array(16);
    m[0] = f / aspect; m[5] = f;
    m[10] = (far + near) / (near - far);
    m[11] = -1;
    m[14] = (2 * far * near) / (near - far);
    return m;
  },
  lookAt(eye: Vec3, target: Vec3, up: Vec3): Mat4 {
    const f = vec3.normalize(vec3.sub(target, eye));
    const s = vec3.normalize(vec3.cross(f, up));
    const u = vec3.cross(s, f);
    const m = new Float32Array(16);
    m[0] = s[0]; m[4] = s[1]; m[8] = s[2];
    m[1] = u[0]; m[5] = u[1]; m[9] = u[2];
    m[2] = -f[0]; m[6] = -f[1]; m[10] = -f[2];
    m[12] = -vec3.dot(s, eye); m[13] = -vec3.dot(u, eye); m[14] = vec3.dot(f, eye);
    m[15] = 1;
    return m;
  },
  translation(x: number, y: number, z: number): Mat4 {
    const m = mat4.identity();
    m[12] = x; m[13] = y; m[14] = z;
    return m;
  },
  scale(x: number, y: number, z: number): Mat4 {
    const m = mat4.identity();
    m[0] = x; m[5] = y; m[10] = z;
    return m;
  },
  rotationX(a: number): Mat4 {
    const m = mat4.identity();
    const c = Math.cos(a), s = Math.sin(a);
    m[5] = c; m[9] = -s; m[6] = s; m[10] = c;
    return m;
  },
  rotationY(a: number): Mat4 {
    const m = mat4.identity();
    const c = Math.cos(a), s = Math.sin(a);
    m[0] = c; m[8] = s; m[2] = -s; m[10] = c;
    return m;
  },
  rotationZ(a: number): Mat4 {
    const m = mat4.identity();
    const c = Math.cos(a), s = Math.sin(a);
    m[0] = c; m[4] = -s; m[1] = s; m[5] = c;
    return m;
  },
  fromQuat(q: Vec4): Mat4 {
    const [x, y, z, w] = q;
    const m = new Float32Array(16);
    m[0] = 1 - 2*(y*y+z*z); m[1] = 2*(x*y+z*w); m[2] = 2*(x*z-y*w);
    m[4] = 2*(x*y-z*w); m[5] = 1-2*(x*x+z*z); m[6] = 2*(y*z+x*w);
    m[8] = 2*(x*z+y*w); m[9] = 2*(y*z-x*w); m[10] = 1-2*(x*x+y*y);
    m[15] = 1;
    return m;
  },
  transpose3x3(m: Mat4): Mat4 {
    const out = mat4.identity();
    // Transpose the upper-left 3x3
    out[0]=m[0]; out[1]=m[4]; out[2]=m[8];
    out[4]=m[1]; out[5]=m[5]; out[6]=m[9];
    out[8]=m[2]; out[9]=m[6]; out[10]=m[10];
    out[15]=1;
    return out;
  },
  invert(m: Mat4): Mat4 {
    const inv = new Float32Array(16);
    const m00=m[0],m01=m[1],m02=m[2],m03=m[3];
    const m10=m[4],m11=m[5],m12=m[6],m13=m[7];
    const m20=m[8],m21=m[9],m22=m[10],m23=m[11];
    const m30=m[12],m31=m[13],m32=m[14],m33=m[15];
    const b00=m00*m11-m01*m10,b01=m00*m12-m02*m10,b02=m00*m13-m03*m10;
    const b03=m01*m12-m02*m11,b04=m01*m13-m03*m11,b05=m02*m13-m03*m12;
    const b06=m20*m31-m21*m30,b07=m20*m32-m22*m30,b08=m20*m33-m23*m30;
    const b09=m21*m32-m22*m31,b10=m21*m33-m23*m31,b11=m22*m33-m23*m32;
    let det=b00*b11-b01*b10+b02*b09+b03*b08-b04*b07+b05*b06;
    if (!det) return mat4.identity();
    det = 1/det;
    inv[0]=(m11*b11-m12*b10+m13*b09)*det;
    inv[1]=(-m01*b11+m02*b10-m03*b09)*det;
    inv[2]=(m31*b05-m32*b04+m33*b03)*det;
    inv[3]=(-m21*b05+m22*b04-m23*b03)*det;
    inv[4]=(-m10*b11+m12*b08-m13*b07)*det;
    inv[5]=(m00*b11-m02*b08+m03*b07)*det;
    inv[6]=(-m30*b05+m32*b02-m33*b01)*det;
    inv[7]=(m20*b05-m22*b02+m23*b01)*det;
    inv[8]=(m10*b10-m11*b08+m13*b06)*det;
    inv[9]=(-m00*b10+m01*b08-m03*b06)*det;
    inv[10]=(m30*b04-m31*b02+m33*b00)*det;
    inv[11]=(-m20*b04+m21*b02-m23*b00)*det;
    inv[12]=(-m10*b09+m11*b07-m12*b06)*det;
    inv[13]=(m00*b09-m01*b07+m02*b06)*det;
    inv[14]=(-m30*b03+m31*b01-m32*b00)*det;
    inv[15]=(m20*b03-m21*b01+m22*b00)*det;
    return inv;
  },
};

export const vec3 = {
  add(a: Vec3, b: Vec3): Vec3 { return [a[0]+b[0], a[1]+b[1], a[2]+b[2]]; },
  sub(a: Vec3, b: Vec3): Vec3 { return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; },
  scale(a: Vec3, s: number): Vec3 { return [a[0]*s, a[1]*s, a[2]*s]; },
  dot(a: Vec3, b: Vec3): number { return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]; },
  cross(a: Vec3, b: Vec3): Vec3 {
    return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  },
  length(a: Vec3): number { return Math.sqrt(a[0]*a[0]+a[1]*a[1]+a[2]*a[2]); },
  normalize(a: Vec3): Vec3 {
    const l = vec3.length(a) || 1;
    return [a[0]/l, a[1]/l, a[2]/l];
  },
};

export const quat = {
  identity(): Vec4 { return [0, 0, 0, 1]; },
  multiply(a: Vec4, b: Vec4): Vec4 {
    const [ax,ay,az,aw] = a, [bx,by,bz,bw] = b;
    return [
      aw*bx + ax*bw + ay*bz - az*by,
      aw*by - ax*bz + ay*bw + az*bx,
      aw*bz + ax*by - ay*bx + az*bw,
      aw*bw - ax*bx - ay*by - az*bz,
    ];
  },
  fromAxisAngle(axis: Vec3, angle: number): Vec4 {
    const s = Math.sin(angle / 2);
    return [axis[0]*s, axis[1]*s, axis[2]*s, Math.cos(angle/2)];
  },
  normalize(q: Vec4): Vec4 {
    const l = Math.sqrt(q[0]*q[0]+q[1]*q[1]+q[2]*q[2]+q[3]*q[3]) || 1;
    return [q[0]/l, q[1]/l, q[2]/l, q[3]/l];
  },
};
