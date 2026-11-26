// Meridian Skies — sky.js
// Golden-hour sky: a gradient dome with a low sun disc and warm glow (fragment shader),
// plus ~40 soft billboard clouds using a procedurally painted puff texture. The sun
// direction is shared with the solid shader's lighting so light and sky agree.

(function () {
  'use strict';
  var M = MS.math;

  // Direction TO the sun: low in the north-east so the opening view flies toward the light.
  var SUN_DIR = M.vNorm([0.55, 0.17, -0.72]);
  var FOG_COLOR = [0.98, 0.71, 0.50];

  var SKY_VERT = [
    'attribute vec3 aPos;',
    'uniform mat4 uMVP;',
    'varying vec3 vDir;',
    'void main() {',
    '  vDir = aPos;',
    '  gl_Position = uMVP * vec4(aPos, 1.0);',
    '}'
  ].join('\n');

  var SKY_FRAG = [
    'precision mediump float;',
    'varying vec3 vDir;',
    'uniform vec3 uSunDir;',
    'void main() {',
    '  vec3 d = normalize(vDir);',
    '  float h = clamp(d.y, -1.0, 1.0);',
    '  vec3 horizon = vec3(1.00, 0.62, 0.34);',
    '  vec3 mid = vec3(0.58, 0.62, 0.84);',
    '  vec3 zenith = vec3(0.22, 0.40, 0.74);',
    '  vec3 col = mix(horizon, mid, smoothstep(0.0, 0.22, h));',
    '  col = mix(col, zenith, smoothstep(0.18, 0.65, h));',
    '  col = mix(vec3(0.96, 0.66, 0.44), col, smoothstep(-0.12, 0.02, h));',
    '  float s = max(dot(d, normalize(uSunDir)), 0.0);',
    '  col += vec3(1.0, 0.62, 0.30) * pow(s, 6.0) * 0.35;',
    '  col += vec3(1.0, 0.72, 0.40) * pow(s, 40.0) * 0.55;',
    '  col += vec3(1.0, 0.88, 0.66) * smoothstep(0.9993, 0.9997, s) * 1.6;',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  var SPRITE_VERT = [
    'attribute vec3 aPos;',
    'attribute vec2 aUv;',
    'uniform mat4 uMVP;',
    'varying vec2 vUv;',
    'void main() {',
    '  vUv = aUv;',
    '  gl_Position = uMVP * vec4(aPos, 1.0);',
    '}'
  ].join('\n');

  var SPRITE_FRAG = [
    'precision mediump float;',
    'varying vec2 vUv;',
    'uniform sampler2D uTex;',
    'uniform vec3 uTint;',
    'uniform float uAlpha;',
    'void main() {',
    '  vec4 t = texture2D(uTex, vUv);',
    '  gl_FragColor = vec4(uTint, t.a * uAlpha);',
    '}'
  ].join('\n');

  function buildSkyMesh() {
    var g = MS.geo.empty();
    MS.geo.sphere(g, 9000, 24, 36, [1, 1, 1]);
    return g;
  }

  // Soft cloud puff: a few overlapping radial gradients painted on a canvas.
  function makeCloudTexture(gl) {
    var c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    var ctx = c.getContext('2d');
    var rand = M.rng(4242);
    ctx.clearRect(0, 0, 256, 128);
    for (var i = 0; i < 26; i++) {
      var x = 30 + rand() * 196;
      var y = 44 + rand() * 44;
      var r = 18 + rand() * 34;
      var grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, 'rgba(255,255,255,0.55)');
      grad.addColorStop(0.55, 'rgba(255,250,244,0.28)');
      grad.addColorStop(1, 'rgba(255,250,244,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  // Cloud field: fixed seeded layout so screenshots are deterministic.
  function makeClouds() {
    var rand = M.rng(20261126);
    var clouds = [];
    for (var i = 0; i < 42; i++) {
      clouds.push({
        x: (rand() * 2 - 1) * 3600,
        y: 330 + rand() * 240,
        z: (rand() * 2 - 1) * 3600,
        w: 300 + rand() * 340,
        h: 90 + rand() * 90,
        alpha: 0.5 + rand() * 0.35,
        drift: 1.5 + rand() * 2.5
      });
    }
    return clouds;
  }

  // Rebuild billboard vertices facing the camera (right/up taken from the view matrix).
  function cloudVertices(clouds, view, time) {
    var right = [view[0], view[4], view[8]];
    var up = [view[1], view[5], view[9]];
    var pos = [], uv = [], idx = [];
    for (var i = 0; i < clouds.length; i++) {
      var c = clouds[i];
      // Slow eastward drift, wrapping around the world so clouds never run out.
      var cx = c.x + (time * c.drift) % 7200;
      if (cx > 3600) cx -= 7200;
      var hw = c.w / 2, hh = c.h / 2;
      var base = pos.length / 3;
      var corners = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
      var uvs = [[0, 1], [1, 1], [1, 0], [0, 0]];
      for (var k = 0; k < 4; k++) {
        pos.push(
          cx + right[0] * corners[k][0] + up[0] * corners[k][1],
          c.y + right[1] * corners[k][0] + up[1] * corners[k][1],
          c.z + right[2] * corners[k][0] + up[2] * corners[k][1]
        );
        uv.push(uvs[k][0], uvs[k][1]);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    return { positions: pos, uvs: uv, indices: idx };
  }

  MS.sky = {
    SUN_DIR: SUN_DIR,
    FOG_COLOR: FOG_COLOR,
    SKY_VERT: SKY_VERT,
    SKY_FRAG: SKY_FRAG,
    SPRITE_VERT: SPRITE_VERT,
    SPRITE_FRAG: SPRITE_FRAG,
    buildMesh: buildSkyMesh,
    makeCloudTexture: makeCloudTexture,
    makeClouds: makeClouds,
    cloudVertices: cloudVertices
  };
})();
