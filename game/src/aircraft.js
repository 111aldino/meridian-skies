// Meridian Skies — aircraft.js
// A low-poly single-prop aeroplane assembled from tapered boxes and a disc: white fuselage
// with red wings and tail, dark canopy, spinning propeller. Local axes: forward -Z,
// right +X, up +Y; the origin sits at the centre of mass, about 9 m long, 11 m span.

(function () {
  'use strict';

  var WHITE = [0.94, 0.94, 0.92];
  var RED = [0.80, 0.16, 0.14];
  var DARK = [0.10, 0.12, 0.18];
  var GREY = [0.55, 0.57, 0.60];
  var PROP = [0.12, 0.12, 0.14];

  // Airframe without the propeller (drawn once per frame with the plane's model matrix).
  function buildAirframe() {
    var g = MS.geo.empty();
    // Fuselage: nose block, cabin block, then a long taper to the tail.
    MS.geo.box(g, 0, 0, -3.4, 1.15, 1.15, 1.6, WHITE, 0.92);        // engine cowling
    MS.geo.box(g, 0, 0.08, -1.7, 1.35, 1.35, 1.9, WHITE, 1);        // cabin
    MS.geo.box(g, 0, 0.16, 0.6, 1.15, 1.15, 2.8, WHITE, 0.55);      // rear fuselage
    MS.geo.box(g, 0, 0.24, 2.6, 0.62, 0.7, 1.6, WHITE, 0.4);        // tail cone
    // Red cheatline along the cabin sides.
    MS.geo.box(g, 0.69, -0.05, -1.7, 0.04, 0.28, 1.8, RED, 1);
    MS.geo.box(g, -0.69, -0.05, -1.7, 0.04, 0.28, 1.8, RED, 1);
    // Canopy: dark glasshouse on top of the cabin.
    MS.geo.box(g, 0, 0.78, -1.75, 0.95, 0.5, 1.5, DARK, 0.8);
    // Main wing: two tapered halves with a touch of dihedral built from stepped boxes.
    MS.geo.box(g, 2.1, 0.62, -1.55, 4.2, 0.16, 1.7, RED, 0.94);
    MS.geo.box(g, -2.1, 0.62, -1.55, 4.2, 0.16, 1.7, RED, 0.94);
    MS.geo.box(g, 4.9, 0.78, -1.6, 1.6, 0.13, 1.45, RED, 0.9);
    MS.geo.box(g, -4.9, 0.78, -1.6, 1.6, 0.13, 1.45, RED, 0.9);
    // Wingtip caps in white.
    MS.geo.box(g, 5.75, 0.84, -1.62, 0.25, 0.15, 1.3, WHITE, 1);
    MS.geo.box(g, -5.75, 0.84, -1.62, 0.25, 0.15, 1.3, WHITE, 1);
    // Tail: vertical fin (red) and horizontal stabiliser (white with red tips).
    MS.geo.box(g, 0, 0.95, 3.1, 0.14, 1.5, 1.25, RED, 0.7);
    MS.geo.box(g, 0, 0.42, 3.25, 3.4, 0.13, 1.05, WHITE, 0.9);
    MS.geo.box(g, 1.78, 0.42, 3.25, 0.3, 0.14, 0.95, RED, 1);
    MS.geo.box(g, -1.78, 0.42, 3.25, 0.3, 0.14, 0.95, RED, 1);
    // Fixed landing gear: two legs, two wheels, tail wheel.
    MS.geo.box(g, 0.85, -0.95, -2.2, 0.12, 0.9, 0.12, GREY, 1);
    MS.geo.box(g, -0.85, -0.95, -2.2, 0.12, 0.9, 0.12, GREY, 1);
    MS.geo.box(g, 0.85, -1.42, -2.2, 0.3, 0.42, 0.55, DARK, 1);
    MS.geo.box(g, -0.85, -1.42, -2.2, 0.3, 0.42, 0.55, DARK, 1);
    MS.geo.box(g, 0, -0.35, 3.3, 0.16, 0.3, 0.3, DARK, 1);
    // Spinner cone base (the spinning disc is a separate mesh).
    MS.geo.box(g, 0, 0, -4.35, 0.34, 0.34, 0.4, RED, 0.45);
    return g;
  }

  // Propeller disc, drawn spinning around the forward axis with partial transparency.
  function buildPropeller() {
    var g = MS.geo.empty();
    MS.geo.disc(g, 1.35, 28, PROP);
    return g;
  }

  // What the pilot sees of the nose in cockpit view: cowling top, spinner, prop disc.
  function buildCockpitNose() {
    var g = MS.geo.empty();
    MS.geo.box(g, 0, -0.55, -3.6, 1.05, 0.7, 2.2, WHITE, 0.9);
    MS.geo.box(g, 0, -0.28, -4.35, 0.34, 0.34, 0.4, RED, 0.45);
    return g;
  }

  MS.aircraft = {
    buildAirframe: buildAirframe,
    buildPropeller: buildPropeller,
    buildCockpitNose: buildCockpitNose,
    GEAR_HEIGHT: 1.65,   // metres from centre of mass to wheel bottoms
    PROP_Z: -4.6         // propeller plane along the forward axis
  };
})();
