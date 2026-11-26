// Meridian Skies — math3d.js
// Small hand-written 3D math library: vectors, 4x4 matrices (column-major, WebGL order),
// deterministic value noise, and simple geometry builders. No external code.

window.MS = window.MS || {};

MS.math = (function () {
  'use strict';

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smoothstep(a, b, x) {
    var t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  }
  function deg2rad(d) { return d * Math.PI / 180; }
  function rad2deg(r) { return r * 180 / Math.PI; }
  function wrapAngle(r) {
    while (r > Math.PI) r -= Math.PI * 2;
    while (r < -Math.PI) r += Math.PI * 2;
    return r;
  }
  function wrapHeading(deg) {
    var d = deg % 360;
    return d < 0 ? d + 360 : d;
  }

  // Deterministic PRNG (mulberry32) so the world is the same on every load.
  function rng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Hash-based 2D value noise with smooth interpolation, plus fractal layering.
  function hash2(x, y) {
    var h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return h - Math.floor(h);
  }
  function valueNoise(x, y) {
    var xi = Math.floor(x), yi = Math.floor(y);
    var xf = x - xi, yf = y - yi;
    var u = xf * xf * (3 - 2 * xf);
    var v = yf * yf * (3 - 2 * yf);
    var a = hash2(xi, yi), b = hash2(xi + 1, yi);
    var c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  }
  function fbm(x, y, octaves) {
    var sum = 0, amp = 0.5, freq = 1, norm = 0;
    for (var i = 0; i < octaves; i++) {
      sum += amp * valueNoise(x * freq, y * freq);
      norm += amp;
      amp *= 0.5;
      freq *= 2.03;
    }
    return sum / norm;
  }

  // Vectors are plain [x, y, z] arrays.
  function v3(x, y, z) { return [x, y, z]; }
  function vAdd(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function vSub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function vScale(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function vDot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function vCross(a, b) {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0]
    ];
  }
  function vLen(a) { return Math.sqrt(vDot(a, a)); }
  function vNorm(a) {
    var l = vLen(a) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  }
  function vLerp(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }

  // Matrices are Float32Array(16), column-major.
  function mIdentity() {
    var m = new Float32Array(16);
    m[0] = 1; m[5] = 1; m[10] = 1; m[15] = 1;
    return m;
  }
  function mMultiply(a, b) {
    var out = new Float32Array(16);
    for (var c = 0; c < 4; c++) {
      for (var r = 0; r < 4; r++) {
        var s = 0;
        for (var k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
        out[c * 4 + r] = s;
      }
    }
    return out;
  }
  function mPerspective(fovyRad, aspect, near, far) {
    var f = 1 / Math.tan(fovyRad / 2);
    var m = new Float32Array(16);
    m[0] = f / aspect;
    m[5] = f;
    m[10] = (far + near) / (near - far);
    m[11] = -1;
    m[14] = (2 * far * near) / (near - far);
    return m;
  }
  function mLookAt(eye, center, up) {
    var z = vNorm(vSub(eye, center));
    var x = vNorm(vCross(up, z));
    var y = vCross(z, x);
    var m = mIdentity();
    m[0] = x[0]; m[1] = y[0]; m[2] = z[0];
    m[4] = x[1]; m[5] = y[1]; m[6] = z[1];
    m[8] = x[2]; m[9] = y[2]; m[10] = z[2];
    m[12] = -vDot(x, eye);
    m[13] = -vDot(y, eye);
    m[14] = -vDot(z, eye);
    return m;
  }
  function mTranslate(x, y, z) {
    var m = mIdentity();
    m[12] = x; m[13] = y; m[14] = z;
    return m;
  }
  function mScale(x, y, z) {
    var m = mIdentity();
    m[0] = x; m[5] = y; m[10] = z;
    return m;
  }
  function mRotateX(a) {
    var c = Math.cos(a), s = Math.sin(a);
    var m = mIdentity();
    m[5] = c; m[6] = s; m[9] = -s; m[10] = c;
    return m;
  }
  function mRotateY(a) {
    var c = Math.cos(a), s = Math.sin(a);
    var m = mIdentity();
    m[0] = c; m[2] = -s; m[8] = s; m[10] = c;
    return m;
  }
  function mRotateZ(a) {
    var c = Math.cos(a), s = Math.sin(a);
    var m = mIdentity();
    m[0] = c; m[1] = s; m[4] = -s; m[5] = c;
    return m;
  }
  // Transform a direction (no translation) by a matrix.
  function mDir(m, v) {
    return [
      m[0] * v[0] + m[4] * v[1] + m[8] * v[2],
      m[1] * v[0] + m[5] * v[1] + m[9] * v[2],
      m[2] * v[0] + m[6] * v[1] + m[10] * v[2]
    ];
  }
  // Transform a point by a matrix.
  function mPoint(m, v) {
    var x = m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12];
    var y = m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13];
    var z = m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14];
    var w = m[3] * v[0] + m[7] * v[1] + m[11] * v[2] + m[15];
    return [x / w, y / w, z / w];
  }

  return {
    clamp: clamp, lerp: lerp, smoothstep: smoothstep,
    deg2rad: deg2rad, rad2deg: rad2deg, wrapAngle: wrapAngle, wrapHeading: wrapHeading,
    rng: rng, valueNoise: valueNoise, fbm: fbm,
    v3: v3, vAdd: vAdd, vSub: vSub, vScale: vScale, vDot: vDot, vCross: vCross,
    vLen: vLen, vNorm: vNorm, vLerp: vLerp,
    mIdentity: mIdentity, mMultiply: mMultiply, mPerspective: mPerspective, mLookAt: mLookAt,
    mTranslate: mTranslate, mScale: mScale, mRotateX: mRotateX, mRotateY: mRotateY, mRotateZ: mRotateZ,
    mDir: mDir, mPoint: mPoint
  };
})();

// Geometry builders: each returns { positions, normals, colors, indices } as plain arrays,
// ready to be uploaded to GL buffers by game.js.
MS.geo = (function () {
  'use strict';
  var M = MS.math;

  function empty() { return { positions: [], normals: [], colors: [], indices: [] }; }

  function pushQuad(g, p0, p1, p2, p3, normal, color) {
    var base = g.positions.length / 3;
    var pts = [p0, p1, p2, p3];
    for (var i = 0; i < 4; i++) {
      g.positions.push(pts[i][0], pts[i][1], pts[i][2]);
      g.normals.push(normal[0], normal[1], normal[2]);
      g.colors.push(color[0], color[1], color[2]);
    }
    g.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  // Axis-aligned box centered at (cx, cy, cz) with full sizes (sx, sy, sz), flat-shaded.
  // taper shrinks the -Z face (tail taper for fuselages); 1 = no taper.
  function box(g, cx, cy, cz, sx, sy, sz, color, taper) {
    var t = (taper === undefined) ? 1 : taper;
    var hx = sx / 2, hy = sy / 2, hz = sz / 2;
    var fx = hx * t, fy = hy * t;
    // corners: front (+Z) full size, back (-Z) tapered
    var F = [
      [cx - hx, cy - hy, cz + hz], [cx + hx, cy - hy, cz + hz],
      [cx + hx, cy + hy, cz + hz], [cx - hx, cy + hy, cz + hz]
    ];
    var B = [
      [cx - fx, cy - fy, cz - hz], [cx + fx, cy - fy, cz - hz],
      [cx + fx, cy + fy, cz - hz], [cx - fx, cy + fy, cz - hz]
    ];
    pushQuad(g, F[0], F[1], F[2], F[3], [0, 0, 1], color);          // front
    pushQuad(g, B[1], B[0], B[3], B[2], [0, 0, -1], color);         // back
    pushQuad(g, F[3], F[2], B[2], B[3], [0, 1, 0], color);          // top
    pushQuad(g, F[1], F[0], B[0], B[1], [0, -1, 0], color);         // bottom
    pushQuad(g, F[1], B[1], B[2], F[2], [1, 0, 0], color);          // right
    pushQuad(g, B[0], F[0], F[3], B[3], [-1, 0, 0], color);         // left
    return g;
  }

  // Flat quad on the XZ plane (for runway markings), centered, rotated around Y by yaw.
  function flatQuad(g, cx, cy, cz, w, l, yaw, color) {
    var c = Math.cos(yaw), s = Math.sin(yaw);
    var hw = w / 2, hl = l / 2;
    function pt(x, z) { return [cx + x * c + z * s, cy, cz - x * s + z * c]; }
    pushQuad(g, pt(-hw, -hl), pt(hw, -hl), pt(hw, hl), pt(-hw, hl), [0, 1, 0], color);
    return g;
  }

  // Disc in the XY plane facing +Z (propeller disc), radius r, segments n.
  function disc(g, r, n, color) {
    var base = g.positions.length / 3;
    g.positions.push(0, 0, 0);
    g.normals.push(0, 0, 1);
    g.colors.push(color[0], color[1], color[2]);
    for (var i = 0; i <= n; i++) {
      var a = (i / n) * Math.PI * 2;
      g.positions.push(Math.cos(a) * r, Math.sin(a) * r, 0);
      g.normals.push(0, 0, 1);
      g.colors.push(color[0], color[1], color[2]);
    }
    for (var j = 0; j < n; j++) g.indices.push(base, base + 1 + j, base + 2 + j);
    return g;
  }

  // Torus around the Z axis: ring radius R, tube radius r.
  function torus(g, R, r, ringSegs, tubeSegs, color) {
    var base = g.positions.length / 3;
    for (var i = 0; i <= ringSegs; i++) {
      var u = (i / ringSegs) * Math.PI * 2;
      var cu = Math.cos(u), su = Math.sin(u);
      for (var j = 0; j <= tubeSegs; j++) {
        var v = (j / tubeSegs) * Math.PI * 2;
        var cv = Math.cos(v), sv = Math.sin(v);
        var px = (R + r * cv) * cu;
        var py = (R + r * cv) * su;
        var pz = r * sv;
        g.positions.push(px, py, pz);
        g.normals.push(cv * cu, cv * su, sv);
        g.colors.push(color[0], color[1], color[2]);
      }
    }
    var stride = tubeSegs + 1;
    for (var a = 0; a < ringSegs; a++) {
      for (var b = 0; b < tubeSegs; b++) {
        var p0 = base + a * stride + b;
        var p1 = base + (a + 1) * stride + b;
        g.indices.push(p0, p1, p0 + 1, p1, p1 + 1, p0 + 1);
      }
    }
    return g;
  }

  // UV sphere (for the sky dome), radius r, centered at origin.
  function sphere(g, r, latSegs, lonSegs, color) {
    var base = g.positions.length / 3;
    for (var i = 0; i <= latSegs; i++) {
      var phi = (i / latSegs) * Math.PI;
      var sp = Math.sin(phi), cp = Math.cos(phi);
      for (var j = 0; j <= lonSegs; j++) {
        var th = (j / lonSegs) * Math.PI * 2;
        var x = r * sp * Math.cos(th), y = r * cp, z = r * sp * Math.sin(th);
        g.positions.push(x, y, z);
        var n = M.vNorm([x, y, z]);
        g.normals.push(n[0], n[1], n[2]);
        g.colors.push(color[0], color[1], color[2]);
      }
    }
    var stride = lonSegs + 1;
    for (var a = 0; a < latSegs; a++) {
      for (var b = 0; b < lonSegs; b++) {
        var p0 = base + a * stride + b;
        var p1 = base + (a + 1) * stride + b;
        g.indices.push(p0, p0 + 1, p1, p1, p0 + 1, p1 + 1);
      }
    }
    return g;
  }

  return { empty: empty, pushQuad: pushQuad, box: box, flatQuad: flatQuad, disc: disc, torus: torus, sphere: sphere };
})();
