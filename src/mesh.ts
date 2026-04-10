// ── OBJ Mesh Loader & Indexed Mesh Data Structure ───────────────────────────

export interface Triangle {
  i0: number; i1: number; i2: number;
  faceNormal: [number, number, number];
}

export interface Mesh {
  positions: Float32Array;  // Nx3
  normals: Float32Array;    // Nx3 (vertex normals)
  uvs: Float32Array;        // Nx2 (spherical UV)
  indices: Uint32Array;
  triangles: Triangle[];
  center: [number, number, number];
  radius: number;
}

function cross(a: number[], b: number[]): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function normalize(v: [number, number, number]): [number, number, number] {
  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

function sphericalUV(nx: number, ny: number, nz: number): [number, number] {
  const u = 0.5 + Math.atan2(nz, nx) / (2 * Math.PI);
  const v = 0.5 - Math.asin(Math.max(-1, Math.min(1, ny))) / Math.PI;
  return [u, v];
}

export function parseOBJ(text: string): Mesh {
  const rawPositions: number[][] = [];
  const rawNormals: number[][] = [];
  const rawUVs: number[][] = [];
  const faceGroups: [number, number | null, number | null][][] = [];

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(/\s+/);
    switch (parts[0]) {
      case 'v':
        rawPositions.push([+parts[1], +parts[2], +parts[3]]);
        break;
      case 'vn':
        rawNormals.push([+parts[1], +parts[2], +parts[3]]);
        break;
      case 'vt':
        rawUVs.push([+parts[1], +parts[2]]);
        break;
      case 'f': {
        const verts: [number, number | null, number | null][] = [];
        for (let i = 1; i < parts.length; i++) {
          const tok = parts[i].split('/');
          const pi = parseInt(tok[0]) - 1;
          const ti = tok[1] && tok[1] !== '' ? parseInt(tok[1]) - 1 : null;
          const ni = tok[2] && tok[2] !== '' ? parseInt(tok[2]) - 1 : null;
          verts.push([pi, ti, ni]);
        }
        // Triangulate polygon fan
        for (let i = 1; i < verts.length - 1; i++) {
          faceGroups.push([verts[0], verts[i], verts[i + 1]]);
        }
        break;
      }
    }
  }

  // Build flat arrays (one entry per unique vertex combo)
  const keyMap = new Map<string, number>();
  const posArr: number[] = [];
  const normArr: number[] = [];
  const uvArr: number[] = [];
  const idxArr: number[] = [];

  const getVertex = (pi: number, ti: number | null, ni: number | null): number => {
    const key = `${pi}/${ti ?? ''}/${ni ?? ''}`;
    let idx = keyMap.get(key);
    if (idx !== undefined) return idx;
    idx = posArr.length / 3;
    keyMap.set(key, idx);
    const p = rawPositions[pi] ?? [0, 0, 0];
    posArr.push(p[0], p[1], p[2]);
    if (ni !== null && rawNormals[ni]) {
      const n = rawNormals[ni];
      normArr.push(n[0], n[1], n[2]);
    } else {
      normArr.push(0, 1, 0); // placeholder
    }
    if (ti !== null && rawUVs[ti]) {
      uvArr.push(rawUVs[ti][0], rawUVs[ti][1]);
    } else {
      uvArr.push(0, 0); // placeholder
    }
    return idx;
  };

  const triangles: Triangle[] = [];

  for (const face of faceGroups) {
    const [v0, v1, v2] = face;
    const i0 = getVertex(v0[0], v0[1], v0[2]);
    const i1 = getVertex(v1[0], v1[1], v1[2]);
    const i2 = getVertex(v2[0], v2[1], v2[2]);
    idxArr.push(i0, i1, i2);

    // Compute face normal
    const p0 = [posArr[i0 * 3], posArr[i0 * 3 + 1], posArr[i0 * 3 + 2]];
    const p1 = [posArr[i1 * 3], posArr[i1 * 3 + 1], posArr[i1 * 3 + 2]];
    const p2 = [posArr[i2 * 3], posArr[i2 * 3 + 1], posArr[i2 * 3 + 2]];
    const e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
    const e2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
    const fn = normalize(cross(e1, e2));
    triangles.push({ i0, i1, i2, faceNormal: fn });
  }

  const numVerts = posArr.length / 3;

  // Compute vertex normals from face normals (if OBJ had none)
  const vertNormals: number[][] = Array.from({ length: numVerts }, () => [0, 0, 0]);
  for (const tri of triangles) {
    const fn = tri.faceNormal;
    for (const idx of [tri.i0, tri.i1, tri.i2]) {
      vertNormals[idx][0] += fn[0];
      vertNormals[idx][1] += fn[1];
      vertNormals[idx][2] += fn[2];
    }
  }
  for (let i = 0; i < numVerts; i++) {
    const n = normalize(vertNormals[i] as [number, number, number]);
    normArr[i * 3] = n[0];
    normArr[i * 3 + 1] = n[1];
    normArr[i * 3 + 2] = n[2];
  }

  // Compute spherical UVs from vertex normal if no UV in OBJ
  const hasObjUVs = rawUVs.length > 0;
  if (!hasObjUVs) {
    for (let i = 0; i < numVerts; i++) {
      const nx = normArr[i * 3], ny = normArr[i * 3 + 1], nz = normArr[i * 3 + 2];
      const [u, v] = sphericalUV(nx, ny, nz);
      uvArr[i * 2] = u;
      uvArr[i * 2 + 1] = v;
    }
  }

  // Bounding sphere
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < numVerts; i++) {
    cx += posArr[i * 3]; cy += posArr[i * 3 + 1]; cz += posArr[i * 3 + 2];
  }
  cx /= numVerts; cy /= numVerts; cz /= numVerts;
  let r = 0;
  for (let i = 0; i < numVerts; i++) {
    const dx = posArr[i * 3] - cx, dy = posArr[i * 3 + 1] - cy, dz = posArr[i * 3 + 2] - cz;
    r = Math.max(r, Math.sqrt(dx * dx + dy * dy + dz * dz));
  }

  return {
    positions: new Float32Array(posArr),
    normals: new Float32Array(normArr),
    uvs: new Float32Array(uvArr),
    indices: new Uint32Array(idxArr),
    triangles,
    center: [cx, cy, cz],
    radius: r || 1,
  };
}

// ── Procedural Mesh Generators ───────────────────────────────────────────────

export function generateSphere(latBands = 32, lonBands = 32): Mesh {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let lat = 0; lat <= latBands; lat++) {
    const theta = (lat / latBands) * Math.PI;
    const sinT = Math.sin(theta), cosT = Math.cos(theta);
    for (let lon = 0; lon <= lonBands; lon++) {
      const phi = (lon / lonBands) * 2 * Math.PI;
      const x = Math.cos(phi) * sinT;
      const y = cosT;
      const z = Math.sin(phi) * sinT;
      pos.push(x, y, z);
      nor.push(x, y, z);
      uv.push(lon / lonBands, lat / latBands);
    }
  }
  for (let lat = 0; lat < latBands; lat++) {
    for (let lon = 0; lon < lonBands; lon++) {
      const a = lat * (lonBands + 1) + lon;
      const b = a + lonBands + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const mesh = buildMesh(pos, nor, uv, idx);
  mesh.center = [0, 0, 0]; mesh.radius = 1;
  return mesh;
}

export function generateCube(): Mesh {
  const v = [
    [-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],
    [-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1],
  ];
  const faces = [
    [0,1,2,3],[5,4,7,6],[4,0,3,7],[1,5,6,2],[3,2,6,7],[4,5,1,0],
  ];
  const normals = [[0,0,-1],[0,0,1],[-1,0,0],[1,0,0],[0,1,0],[0,-1,0]];
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  let vi = 0;
  for (let f = 0; f < 6; f++) {
    const face = faces[f], n = normals[f];
    const uvCoords = [[0,0],[1,0],[1,1],[0,1]];
    for (let i = 0; i < 4; i++) {
      const p = v[face[i]];
      pos.push(...p); nor.push(...n); uv.push(...uvCoords[i]);
    }
    idx.push(vi, vi+1, vi+2, vi, vi+2, vi+3);
    vi += 4;
  }
  const mesh = buildMesh(pos, nor, uv, idx);
  mesh.center = [0, 0, 0]; mesh.radius = Math.sqrt(3);
  return mesh;
}

function buildMesh(pos: number[], nor: number[], uv: number[], idx: number[]): Mesh {
  const numVerts = pos.length / 3;
  const triangles: Triangle[] = [];
  for (let i = 0; i < idx.length; i += 3) {
    const i0 = idx[i], i1 = idx[i + 1], i2 = idx[i + 2];
    const p0 = [pos[i0*3],pos[i0*3+1],pos[i0*3+2]];
    const p1 = [pos[i1*3],pos[i1*3+1],pos[i1*3+2]];
    const p2 = [pos[i2*3],pos[i2*3+1],pos[i2*3+2]];
    const e1 = [p1[0]-p0[0],p1[1]-p0[1],p1[2]-p0[2]];
    const e2 = [p2[0]-p0[0],p2[1]-p0[1],p2[2]-p0[2]];
    triangles.push({ i0, i1, i2, faceNormal: normalize(cross(e1,e2)) });
  }
  return {
    positions: new Float32Array(pos),
    normals: new Float32Array(nor),
    uvs: new Float32Array(uv),
    indices: new Uint32Array(idx),
    triangles,
    center: [0,0,0],
    radius: 1,
  };
}
