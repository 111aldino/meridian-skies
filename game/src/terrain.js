// Meridian Skies — terrain.js
// The archipelago: seven procedural islands from layered gaussian bumps and value noise,
// vertex-coloured by height and slope (sand, grass, forest, rock), a flattened plateau on
// the main island for the runway, and a wide ocean plane at y = 0. The same height function
// drives both the mesh and the flight model's ground collision, so they always agree.

(function () {
  'use strict';
  var M = MS.math;

  var WORLD_HALF = 3200;      // terrain spans [-3200, 3200] in x and z (metres)
  var SEA_FLOOR = -26;        // height far from any island

  // Island bumps: centre x/z, radius, peak height.
  var ISLANDS = [
    { x: 0,     z: 0,     r: 980, h: 128 },  // main island (runway)
    { x: 1500,  z: -950,  r: 620, h: 94 },
    { x: -1450, z: 820,   r: 560, h: 84 },
    { x: 920,   z: 1650,  r: 520, h: 74 },
    { x: -920,  z: -1550, r: 660, h: 104 },
    { x: 2250,  z: 620,   r: 470, h: 62 },
    { x: -2250, z: -620,  r: 520, h: 78 }
  ];

  // Runway plateau on the main island: an east-west strip flattened to RUNWAY_Y.
  var RUNWAY_Y = 18;
  var PLATEAU = { halfLen: 300, halfWid: 70, blend: 130 };

  function islandBump(x, z) {
    var h = 0;
    for (var i = 0; i < ISLANDS.length; i++) {
      var isl = ISLANDS[i];
      var dx = x - isl.x, dz = z - isl.z;
      var d2 = dx * dx + dz * dz;
      var sigma = isl.r * 0.52;
      h += isl.h * Math.exp(-d2 / (2 * sigma * sigma));
    }
    return h;
  }

  // Distance outside the plateau rectangle (0 when inside).
  function plateauDistance(x, z) {
    var dx = Math.max(Math.abs(x) - PLATEAU.halfLen, 0);
    var dz = Math.max(Math.abs(z) - PLATEAU.halfWid, 0);
    return Math.sqrt(dx * dx + dz * dz);
  }

  // Terrain height in metres at (x, z). Deterministic; used for mesh and collisions.
  function terrainHeight(x, z) {
    var h = SEA_FLOOR + islandBump(x, z);
    // Rolling detail, stronger on land, gentle under water.
    var detail = (M.fbm(x * 0.0016 + 7.3, z * 0.0016 - 2.1, 4) - 0.5) * 22;
    var detailFine = (M.fbm(x * 0.008 - 3.7, z * 0.008 + 5.9, 3) - 0.5) * 5;
    var landMask = M.smoothstep(-6, 14, h);
    h += detail * (0.25 + 0.75 * landMask) + detailFine * landMask;
    // Flatten the runway plateau with a smooth shoulder.
    var pd = plateauDistance(x, z);
    var flat = 1 - M.smoothstep(0, PLATEAU.blend, pd);
    if (flat > 0) h = M.lerp(h, RUNWAY_Y, flat);
    return h;
  }

  function terrainNormal(x, z) {
    var e = 6;
    var hx = terrainHeight(x + e, z) - terrainHeight(x - e, z);
    var hz = terrainHeight(x, z + e) - terrainHeight(x, z - e);
    return M.vNorm([-hx / (2 * e), 1, -hz / (2 * e)]);
  }

  // Vertex colour by height, slope and a forest noise mask.
  function terrainColor(x, z, h, normal) {
    var slope = 1 - normal[1];
    var forest = M.fbm(x * 0.0021 + 11.7, z * 0.0021 + 4.2, 3);
    var sand = [0.86, 0.74, 0.52];
    var grass = [0.34, 0.60, 0.27];
    var woods = [0.15, 0.40, 0.19];
    var rock = [0.46, 0.42, 0.39];
    var pale = [0.78, 0.76, 0.70];
    var col;
    if (h < 1.6) {
      col = sand;
    } else if (h < 30) {
      col = M.vLerp(sand, grass, M.smoothstep(1.6, 6, h));
    } else {
      col = grass;
    }
    if (h > 6 && h < 80 && forest > 0.54 && slope < 0.35) {
      col = M.vLerp(col, woods, M.smoothstep(0.54, 0.72, forest) * 0.85);
    }
    col = M.vLerp(col, rock, M.smoothstep(0.30, 0.55, slope));
    col = M.vLerp(col, pale, M.smoothstep(95, 125, h) * 0.7);
    if (h < 0) col = M.vLerp(col, [0.55, 0.55, 0.42], M.smoothstep(0, -14, h) * 0.6);
    return col;
  }

  // Indexed grid mesh over the whole world.
  function buildTerrainMesh() {
    var N = 170; // cells per side
    var step = (WORLD_HALF * 2) / N;
    var positions = [], normals = [], colors = [], indices = [];
    for (var j = 0; j <= N; j++) {
      for (var i = 0; i <= N; i++) {
        var x = -WORLD_HALF + i * step;
        var z = -WORLD_HALF + j * step;
        var h = terrainHeight(x, z);
        var n = terrainNormal(x, z);
        var c = terrainColor(x, z, h, n);
        positions.push(x, h, z);
        normals.push(n[0], n[1], n[2]);
        colors.push(c[0], c[1], c[2]);
      }
    }
    var stride = N + 1;
    for (var a = 0; a < N; a++) {
      for (var b = 0; b < N; b++) {
        var p0 = a * stride + b;
        var p1 = p0 + stride;
        indices.push(p0, p1, p0 + 1, p1, p1 + 1, p0 + 1);
      }
    }
    return { positions: positions, normals: normals, colors: colors, indices: indices };
  }

  // Ocean: one big quad at sea level; the sparkle lives in the fragment shader.
  function buildOceanMesh() {
    var g = MS.geo.empty();
    var S = 7000;
    var deep = [0.07, 0.32, 0.48];
    MS.geo.pushQuad(g, [-S, 0, -S], [S, 0, -S], [S, 0, S], [-S, 0, S], [0, 1, 0], deep);
    return g;
  }

  MS.terrain = {
    WORLD_HALF: WORLD_HALF,
    RUNWAY_Y: RUNWAY_Y,
    height: terrainHeight,
    normal: terrainNormal,
    buildMesh: buildTerrainMesh,
    buildOcean: buildOceanMesh
  };
})();
