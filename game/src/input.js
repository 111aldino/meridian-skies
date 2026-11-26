// Meridian Skies — input.js
// Keyboard and mouse state. Keys are tracked by code (layout-independent); arrows and
// space are prevented from scrolling the page. The mouse steers by its offset from the
// screen centre once it has moved. One-shot key presses (camera, pause, restart, start)
// are queued for game.js to consume.

(function () {
  'use strict';
  var M = MS.math;

  var held = {};
  var pressedQueue = [];
  var mouse = { x: 0, y: 0, active: false };

  var PREVENT = {
    ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, Space: 1
  };

  function onKeyDown(e) {
    if (PREVENT[e.code]) e.preventDefault();
    if (!e.repeat) pressedQueue.push(e.code);
    held[e.code] = true;
    MS.audio.unlock();
  }
  function onKeyUp(e) {
    held[e.code] = false;
  }
  function onMouseMove(e) {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = (e.clientY / window.innerHeight) * 2 - 1;
    mouse.active = true;
  }
  function onMouseDown() { MS.audio.unlock(); }
  function onBlur() { held = {}; }

  function init() {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('blur', onBlur);
  }

  function isHeld(code) { return !!held[code]; }

  // Consume a one-shot press; returns true once per physical press.
  function wasPressed(code) {
    var i = pressedQueue.indexOf(code);
    if (i < 0) return false;
    pressedQueue.splice(i, 1);
    return true;
  }

  // Flight axes in [-1, 1]: pitch +1 = nose up, roll +1 = bank right, throttle +1 = up.
  function axes() {
    var pitch = 0, roll = 0, throttle = 0;
    if (isHeld('ArrowUp') || isHeld('KeyW')) pitch += 1;
    if (isHeld('ArrowDown') || isHeld('KeyS')) pitch -= 1;
    if (isHeld('ArrowRight') || isHeld('KeyD')) roll += 1;
    if (isHeld('ArrowLeft') || isHeld('KeyA')) roll -= 1;
    if (isHeld('ShiftLeft') || isHeld('ShiftRight')) throttle += 1;
    if (isHeld('ControlLeft') || isHeld('ControlRight')) throttle -= 1;
    if (mouse.active && pitch === 0 && roll === 0) {
      var dead = 0.12;
      if (Math.abs(mouse.x) > dead) roll = M.clamp((Math.abs(mouse.x) - dead) * Math.sign(mouse.x) * 1.6, -1, 1);
      if (Math.abs(mouse.y) > dead) pitch = M.clamp(-(Math.abs(mouse.y) - dead) * Math.sign(mouse.y) * 1.6, -1, 1);
    }
    return { pitch: pitch, roll: roll, throttle: throttle };
  }

  MS.input = { init: init, isHeld: isHeld, wasPressed: wasPressed, axes: axes };
})();
