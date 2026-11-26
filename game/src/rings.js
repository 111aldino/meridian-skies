// Meridian Skies — rings.js
// The eight-ring course: glowing torus gates threaded over the islands and water, flown in
// order. The next ring burns gold and pulses; the rest glow cyan; flown rings fade green.
// A pass is detected when the aircraft crosses the ring's plane inside its radius.

(function () {
  'use strict';
  var M = MS.math;

  var RING_RADIUS = 28;   // metres, centre to tube centre
  var TUBE_RADIUS = 1.7;

  // Course layout: position + heading (degrees) the ring faces. The last ring lines the
  // pilot up for an eastbound final approach to the runway on the main island.
  var COURSE = [
    { x: 0,     y: 125, z: -720,  heading: 0 },
    { x: 520,   y: 155, z: -1320, heading: 55 },
    { x: 1250,  y: 135, z: -980,  heading: 120 },
    { x: 1620,  y: 175, z: 120,   heading: 165 },
    { x: 920,   y: 145, z: 1250,  heading: 205 },
    { x: -180,  y: 165, z: 1520,  heading: 250 },
    { x: -1220, y: 135, z: 720,   heading: 290 },
    { x: -880,  y: 95,  z: 0,     heading: 90 }
  ];

  function ringNormal(headingDeg) {
    var h = M.deg2rad(headingDeg);
    return [Math.sin(h), 0, -Math.cos(h)];
  }

  function buildRingMesh() {
    var g = MS.geo.empty();
    MS.geo.torus(g, RING_RADIUS, TUBE_RADIUS, 44, 10, [1, 1, 1]);
    return g;
  }

  // Model matrix placing the torus (built around +Z) at the ring, its axis along the
  // heading normal: Ry(pi - h) maps local +Z onto (sin h, 0, -cos h).
  function ringMatrix(ring, pulseScale) {
    var h = M.deg2rad(ring.heading);
    var rot = M.mRotateY(Math.PI - h);
    var scl = M.mScale(pulseScale, pulseScale, pulseScale);
    var trn = M.mTranslate(ring.x, ring.y, ring.z);
    return M.mMultiply(trn, M.mMultiply(rot, scl));
  }

  // Signed distance of a point from the ring plane, along the ring's normal.
  function planeDistance(ring, p) {
    var n = ringNormal(ring.heading);
    return (p[0] - ring.x) * n[0] + (p[1] - ring.y) * n[1] + (p[2] - ring.z) * n[2];
  }

  // True when the segment prev->cur crosses the ring plane within the gate radius.
  function crossedRing(ring, prev, cur) {
    var d0 = planeDistance(ring, prev);
    var d1 = planeDistance(ring, cur);
    if ((d0 < 0 && d1 < 0) || (d0 > 0 && d1 > 0) || d0 === d1) return false;
    var t = d0 / (d0 - d1);
    var hit = [
      M.lerp(prev[0], cur[0], t),
      M.lerp(prev[1], cur[1], t),
      M.lerp(prev[2], cur[2], t)
    ];
    var dx = hit[0] - ring.x, dy = hit[1] - ring.y, dz = hit[2] - ring.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz) < RING_RADIUS - 1;
  }

  MS.rings = {
    COURSE: COURSE,
    RING_RADIUS: RING_RADIUS,
    buildMesh: buildRingMesh,
    matrix: ringMatrix,
    normal: ringNormal,
    crossed: crossedRing
  };
})();
