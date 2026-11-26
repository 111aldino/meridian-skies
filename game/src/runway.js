// Meridian Skies — runway.js
// The east-west runway on the main island plateau: dark asphalt with white threshold
// stripes, centreline dashes and edge lines, plus glowing threshold and edge lights for
// the golden-hour approach. Also owns the landing geometry the flight model tests against.

(function () {
  'use strict';

  var RUNWAY = {
    cx: 0, cz: 0,
    y: MS.terrain.RUNWAY_Y,
    halfLen: 210,     // metres along x
    halfWid: 15,      // metres along z
    heading: 90       // eastbound landing direction, degrees
  };

  var ASPHALT = [0.16, 0.16, 0.18];
  var PAINT = [0.92, 0.92, 0.90];
  var SHOULDER = [0.42, 0.40, 0.36];

  function buildRunwayMesh() {
    var g = MS.geo.empty();
    var y = RUNWAY.y + 0.25;
    var L = RUNWAY.halfLen * 2, W = RUNWAY.halfWid * 2;
    // Gravel shoulder, then the asphalt strip on top. (flatQuad takes width along X,
    // length along Z; the runway runs east-west, so length L goes in the width slot.)
    MS.geo.flatQuad(g, RUNWAY.cx, y - 0.08, RUNWAY.cz, L + 30, W + 14, 0, SHOULDER);
    MS.geo.flatQuad(g, RUNWAY.cx, y, RUNWAY.cz, L, W, 0, ASPHALT);
    // Edge lines.
    MS.geo.flatQuad(g, RUNWAY.cx, y + 0.05, RUNWAY.cz - RUNWAY.halfWid + 1.2, L - 8, 0.8, 0, PAINT);
    MS.geo.flatQuad(g, RUNWAY.cx, y + 0.05, RUNWAY.cz + RUNWAY.halfWid - 1.2, L - 8, 0.8, 0, PAINT);
    // Centreline dashes.
    for (var x = -RUNWAY.halfLen + 26; x < RUNWAY.halfLen - 20; x += 24) {
      MS.geo.flatQuad(g, RUNWAY.cx + x, y + 0.05, RUNWAY.cz, 12, 1.1, 0, PAINT);
    }
    // Threshold stripes ("piano keys") at both ends.
    for (var e = -1; e <= 1; e += 2) {
      var tx = RUNWAY.cx + e * (RUNWAY.halfLen - 14);
      for (var s = -3; s <= 3; s++) {
        MS.geo.flatQuad(g, tx, y + 0.05, RUNWAY.cz + s * 3.6, 14, 1.8, 0, PAINT);
      }
      // Touchdown zone bars.
      MS.geo.flatQuad(g, RUNWAY.cx + e * (RUNWAY.halfLen - 44), y + 0.05, RUNWAY.cz - 5, 16, 2.4, 0, PAINT);
      MS.geo.flatQuad(g, RUNWAY.cx + e * (RUNWAY.halfLen - 44), y + 0.05, RUNWAY.cz + 5, 16, 2.4, 0, PAINT);
    }
    return g;
  }

  // Light fixtures: small emissive boxes. Green at the thresholds, warm white along the
  // edges, red at the far end — drawn with the solid shader's emissive term.
  function buildLightsMesh() {
    var g = MS.geo.empty();
    var y = RUNWAY.y + 0.7;
    var GREEN = [0.25, 1.0, 0.45];
    var WARM = [1.0, 0.85, 0.55];
    var RED = [1.0, 0.25, 0.2];
    for (var x = -RUNWAY.halfLen; x <= RUNWAY.halfLen; x += 30) {
      var col = (Math.abs(x) >= RUNWAY.halfLen - 1) ? GREEN : WARM;
      MS.geo.box(g, RUNWAY.cx + x, y, RUNWAY.cz - RUNWAY.halfWid - 2.2, 0.8, 0.8, 0.8, col, 1);
      MS.geo.box(g, RUNWAY.cx + x, y, RUNWAY.cz + RUNWAY.halfWid + 2.2, 0.8, 0.8, 0.8, col, 1);
    }
    // Red end lights just past the east threshold (the landing direction's far end).
    for (var s = -2; s <= 2; s++) {
      MS.geo.box(g, RUNWAY.cx + RUNWAY.halfLen + 4, y, RUNWAY.cz + s * 5, 0.8, 0.8, 0.8, RED, 1);
    }
    // Approach light bar west of the runway, guiding the final.
    for (var a = 1; a <= 5; a++) {
      MS.geo.box(g, RUNWAY.cx - RUNWAY.halfLen - a * 26, RUNWAY.y + 1.2, RUNWAY.cz, 1.4, 0.7, 1.4, WARM, 1);
    }
    return g;
  }

  // Is the point over the runway strip (with a small margin)?
  function overRunway(x, z, margin) {
    var m = margin || 0;
    return Math.abs(x - RUNWAY.cx) <= RUNWAY.halfLen + m && Math.abs(z - RUNWAY.cz) <= RUNWAY.halfWid + m;
  }

  // Landing quality 0..500 from sink rate (m/s, negative down), centreline offset and speed.
  function landingBonus(sinkRate, centreOffset, speed) {
    var sinkScore = Math.max(0, 1 - Math.abs(sinkRate) / 5.5);
    var centreScore = Math.max(0, 1 - Math.abs(centreOffset) / RUNWAY.halfWid);
    var speedScore = Math.max(0, 1 - Math.max(0, speed - 34) / 22);
    return Math.round(500 * (0.45 * sinkScore + 0.35 * centreScore + 0.20 * speedScore));
  }

  MS.runway = {
    INFO: RUNWAY,
    buildMesh: buildRunwayMesh,
    buildLights: buildLightsMesh,
    overRunway: overRunway,
    landingBonus: landingBonus
  };
})();
