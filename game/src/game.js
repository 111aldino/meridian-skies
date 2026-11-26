// Meridian Skies — game.js
// The engine room: hand-written WebGL renderer (one lambert+fog shader for the world,
// a gradient sky shader, a sprite shader for clouds), the arcade flight model, chase and
// cockpit cameras, the ring-course game loop, and the ?demo= screenshot modes. Everything
// is procedural — no libraries, no network, no assets beyond this code.

(function () {
  'use strict';
  var M = MS.math;

  // ---------------------------------------------------------------- shaders
  var SOLID_VERT = [
    'attribute vec3 aPos;',
    'attribute vec3 aNorm;',
    'attribute vec3 aColor;',
    'uniform mat4 uMVP;',
    'uniform mat4 uModel;',
    'varying vec3 vColor;',
    'varying vec3 vNorm;',
    'varying vec3 vWorld;',
    'void main() {',
    '  vec4 w = uModel * vec4(aPos, 1.0);',
    '  vWorld = w.xyz;',
    '  vNorm = mat3(uModel) * aNorm;',
    '  vColor = aColor;',
    '  gl_Position = uMVP * vec4(aPos, 1.0);',
    '}'
  ].join('\n');

  var SOLID_FRAG = [
    'precision mediump float;',
    'varying vec3 vColor;',
    'varying vec3 vNorm;',
    'varying vec3 vWorld;',
    'uniform vec3 uSunDir;',
    'uniform vec3 uCamPos;',
    'uniform vec3 uFogColor;',
    'uniform vec3 uTint;',
    'uniform float uTime;',
    'uniform float uSpecular;',
    'uniform float uEmissive;',
    'uniform float uAlpha;',
    'void main() {',
    '  vec3 N = normalize(vNorm);',
    '  vec3 L = normalize(uSunDir);',
    '  float diff = max(dot(N, L), 0.0);',
    '  vec3 col = vColor * uTint * (0.38 + 0.78 * diff);',
    '  col *= vec3(1.06, 0.99, 0.90);',
    '  if (uSpecular > 0.0) {',
    '    vec3 V = normalize(uCamPos - vWorld);',
    '    vec3 Nw = normalize(N + vec3(sin(vWorld.x * 0.09 + uTime * 1.4) * 0.07, 0.0, cos(vWorld.z * 0.08 + uTime * 1.15) * 0.07));',
    '    vec3 H = normalize(L + V);',
    '    float spec = pow(max(dot(Nw, H), 0.0), 80.0) * uSpecular;',
    '    col += vec3(1.0, 0.72, 0.42) * spec * 1.5;',
    '  }',
    '  col += vColor * uTint * uEmissive;',
    '  float d = length(uCamPos - vWorld);',
    '  float f = smoothstep(700.0, 6200.0, d);',
    '  col = mix(col, uFogColor, f);',
    '  gl_FragColor = vec4(col, uAlpha);',
    '}'
  ].join('\n');

  // ---------------------------------------------------------------- GL helpers
  function compileShader(gl, type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error('shader: ' + gl.getShaderInfoLog(sh));
    }
    return sh;
  }
  function makeProgram(gl, vs, fs) {
    var p = gl.createProgram();
    gl.attachShader(p, compileShader(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compileShader(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error('program: ' + gl.getProgramInfoLog(p));
    }
    var attribs = {}, uniforms = {};
    var na = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES);
    for (var i = 0; i < na; i++) {
      var info = gl.getActiveAttrib(p, i);
      attribs[info.name] = gl.getAttribLocation(p, info.name);
    }
    var nu = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var j = 0; j < nu; j++) {
      var uinfo = gl.getActiveUniform(p, j);
      uniforms[uinfo.name] = gl.getUniformLocation(p, uinfo.name);
    }
    return { prog: p, attribs: attribs, uniforms: uniforms };
  }
  function uploadMesh(gl, geo) {
    function buf(data, target) {
      var b = gl.createBuffer();
      gl.bindBuffer(target, b);
      gl.bufferData(target, target === gl.ELEMENT_ARRAY_BUFFER ? new Uint32Array(data) : new Float32Array(data), gl.STATIC_DRAW);
      return b;
    }
    return {
      pos: buf(geo.positions, gl.ARRAY_BUFFER),
      norm: geo.normals ? buf(geo.normals, gl.ARRAY_BUFFER) : null,
      col: geo.colors ? buf(geo.colors, gl.ARRAY_BUFFER) : null,
      idx: buf(geo.indices, gl.ELEMENT_ARRAY_BUFFER),
      count: geo.indices.length
    };
  }

  // ---------------------------------------------------------------- state
  var gl = null, hudCtx = null;
  var progSolid = null, progSky = null, progSprite = null;
  var meshTerrain, meshOcean, meshSky, meshPlane, meshProp, meshNose, meshRing, meshRunway, meshLights;
  var cloudTexture = null, clouds = [], cloudBuffers = null;
  var camPos = [0, 200, 400];

  var plane = {
    pos: [-820, 150, -60],
    heading: M.deg2rad(58), pitch: 0, roll: 0,
    speed: 50, throttle: 0.62
  };
  var mode = 'title';            // title | flying | paused | crashed | finished
  var view = 'chase';            // chase | cockpit
  var onGround = false;
  var ringsDone = 0;
  var timeSec = 0;
  var landingBonus = 0;
  var crashReason = '';
  var flash = null;              // {text, until}
  var propAngle = 0;
  var demoMode = null;
  var framesRendered = 0;

  var STALL_SPEED = 24;          // m/s
  var RING_SCORE = 250;
  var TIME_BONUS_START = 3000;

  function orientation(heading, pitch, roll) {
    var ry = M.mRotateY(-heading);
    var rx = M.mRotateX(pitch);
    var rz = M.mRotateZ(roll);
    return M.mMultiply(ry, M.mMultiply(rx, rz));
  }
  function forwardOf(p) { return M.mDir(orientation(p.heading, p.pitch, p.roll), [0, 0, -1]); }
  function upOf(p) { return M.mDir(orientation(p.heading, p.pitch, p.roll), [0, 1, 0]); }

  function currentScore() {
    return ringsDone * RING_SCORE + Math.max(0, TIME_BONUS_START - Math.floor(timeSec) * 10);
  }
  function gradeFor(score) {
    if (score >= 4500) return 'S';
    if (score >= 3800) return 'A';
    if (score >= 3000) return 'B';
    if (score >= 2000) return 'C';
    return 'D';
  }

  function resetFlight() {
    plane.pos = [-820, 150, -60];
    plane.heading = M.deg2rad(58);
    plane.pitch = 0; plane.roll = 0;
    plane.speed = 50; plane.throttle = 0.62;
    onGround = false;
    ringsDone = 0;
    timeSec = 0;
    landingBonus = 0;
    crashReason = '';
    flash = null;
    camPos = [plane.pos[0] - 30, plane.pos[1] + 10, plane.pos[2] + 30];
  }

  function setFlash(text, seconds) {
    flash = { text: text, until: timeSec + seconds };
  }

  // ---------------------------------------------------------------- flight model
  function stepFlight(dt, ax) {
    var prevPos = plane.pos.slice();

    plane.throttle = M.clamp(plane.throttle + ax.throttle * 0.55 * dt, 0, 1);

    if (onGround) {
      stepGround(dt, ax);
    } else {
      plane.pitch = M.clamp(plane.pitch + ax.pitch * 0.85 * dt, -0.62, 0.58);
      if (ax.roll !== 0) {
        plane.roll = M.clamp(plane.roll + ax.roll * 2.4 * dt, -1.15, 1.15);
      } else {
        plane.roll -= plane.roll * Math.min(1, 1.1 * dt);
      }
      var turnRate = Math.tan(plane.roll) * 9.81 / Math.max(plane.speed, 18);
      plane.heading += M.clamp(turnRate, -1.1, 1.1) * dt;

      var target = 16 + plane.throttle * 64;
      plane.speed += (target - plane.speed) * (1 - Math.exp(-0.45 * dt));
      plane.speed -= Math.sin(plane.pitch) * 9.81 * dt * 0.55;
      plane.speed = M.clamp(plane.speed, 0, 95);

      var stalling = plane.speed < STALL_SPEED;
      if (stalling) plane.pitch -= 0.55 * dt;

      var fwd = forwardOf(plane);
      var velY = fwd[1] * plane.speed - (stalling ? 5 : 0);
      plane.pos = [
        plane.pos[0] + fwd[0] * plane.speed * dt,
        plane.pos[1] + velY * dt,
        plane.pos[2] + fwd[2] * plane.speed * dt
      ];
      checkGroundContact(velY);
    }

    // Ring pass detection against the next ring in the course.
    if (mode === 'flying' && ringsDone < MS.rings.COURSE.length) {
      var ring = MS.rings.COURSE[ringsDone];
      if (MS.rings.crossed(ring, prevPos, plane.pos)) {
        ringsDone++;
        MS.audio.ringChime();
        if (ringsDone >= MS.rings.COURSE.length) {
          setFlash('ALL RINGS! LAND ON THE RUNWAY', 3.2);
        } else {
          setFlash('RING ' + ringsDone + ' / ' + MS.rings.COURSE.length + '   +' + RING_SCORE, 2.0);
        }
      }
    }
    return plane.speed < STALL_SPEED && !onGround;
  }

  function stepGround(dt, ax) {
    var target = 16 + plane.throttle * 64;
    if (plane.throttle < 0.15) {
      plane.speed = Math.max(0, plane.speed - 3.2 * dt);
    } else {
      plane.speed += (target - plane.speed) * (1 - Math.exp(-0.6 * dt));
    }
    plane.pitch = M.clamp(plane.pitch + ax.pitch * 0.4 * dt, 0, 0.14);
    plane.roll -= plane.roll * Math.min(1, 3 * dt);
    if (plane.speed > 2) plane.heading += ax.roll * 0.45 * dt;
    var fwd = forwardOf(plane);
    plane.pos[0] += fwd[0] * plane.speed * dt;
    plane.pos[2] += fwd[2] * plane.speed * dt;
    var surfY = Math.max(MS.terrain.height(plane.pos[0], plane.pos[2]), 0);
    plane.pos[1] = surfY + MS.aircraft.GEAR_HEIGHT;

    if (!MS.runway.overRunway(plane.pos[0], plane.pos[2], 6)) {
      if (plane.speed > 12) {
        crash('You ran off the runway.');
        return;
      }
      plane.speed = 0;
    }
    // Take off again when fast enough and the pilot pulls up.
    if (plane.speed > 30 && ax.pitch > 0.3) {
      onGround = false;
      plane.pitch = 0.16;
      plane.pos[1] += 0.5;
      setFlash('AIRBORNE', 1.4);
      return;
    }
    // Rolling to a stop ends the run when the course is complete.
    if (plane.speed < 0.5 && ringsDone >= MS.rings.COURSE.length) {
      finishRun();
    } else if (plane.speed < 0.5 && ringsDone < MS.rings.COURSE.length) {
      setFlash('RINGS REMAIN — THROTTLE UP AND TAKE OFF', 2.4);
      plane.speed = 0.6; // nudge so the flash does not retrigger every frame
    }
  }

  function checkGroundContact(velY) {
    var x = plane.pos[0], z = plane.pos[2];
    var surfY = Math.max(MS.terrain.height(x, z), 0);
    var wheelY = plane.pos[1] - MS.aircraft.GEAR_HEIGHT;
    if (wheelY > surfY + 0.02) return;

    var overRwy = MS.runway.overRunway(x, z, 4);
    var hdgDeg = M.wrapHeading(M.rad2deg(plane.heading));
    var aligned = Math.abs(M.wrapAngle(M.deg2rad(hdgDeg - 90))) < 0.61 ||
                  Math.abs(M.wrapAngle(M.deg2rad(hdgDeg - 270))) < 0.61;
    if (overRwy && velY > -6.5 && Math.abs(plane.roll) < 0.42 && plane.speed < 52 && aligned) {
      onGround = true;
      plane.pos[1] = MS.runway.INFO.y + MS.aircraft.GEAR_HEIGHT;
      var bonus = MS.runway.landingBonus(velY, z - MS.runway.INFO.cz, plane.speed);
      if (ringsDone >= MS.rings.COURSE.length) landingBonus = Math.max(landingBonus, bonus);
      MS.audio.touchdown();
      setFlash('TOUCHDOWN  +' + bonus, 2.4);
      return;
    }
    if (surfY <= 0.01) crash('You ditched in the sea.');
    else if (overRwy && velY <= -6.5) crash('Too hard a landing — the gear gave way.');
    else if (overRwy && plane.speed >= 52) crash('Too fast to land — you ran out of runway.');
    else if (Math.abs(plane.roll) >= 0.42) crash('Wing strike — too steep a bank at touchdown.');
    else crash('You hit the terrain.');
  }

  function crash(reason) {
    if (mode !== 'flying') return;
    mode = 'crashed';
    crashReason = reason;
    MS.audio.crash();
    MS.audio.setEngine(0, false);
  }
  function finishRun() {
    if (mode !== 'flying') return;
    mode = 'finished';
    MS.audio.finishJingle();
    MS.audio.setEngine(0, false);
  }

  // Autopilot for the title backdrop and the ?demo= screenshot modes: steers toward a
  // target point, holds an altitude and a speed, banks gently into turns.
  function autopilot(dt, targetPos, targetAlt, targetSpeed) {
    var to = M.vSub(targetPos, plane.pos);
    var desiredHeading = Math.atan2(to[0], -to[2]);
    var dh = M.wrapAngle(desiredHeading - plane.heading);
    var desiredRoll = M.clamp(dh * 1.1, -0.45, 0.45);
    plane.roll += M.clamp(desiredRoll - plane.roll, -1.4 * dt, 1.4 * dt);
    plane.heading += M.clamp(Math.tan(plane.roll) * 9.81 / Math.max(plane.speed, 18), -1, 1) * dt;
    var altErr = targetAlt - plane.pos[1];
    var desiredPitch = M.clamp(altErr * 0.004, -0.16, 0.16);
    plane.pitch += M.clamp(desiredPitch - plane.pitch, -0.6 * dt, 0.6 * dt);
    var desiredThrottle = M.clamp((targetSpeed - 16) / 64, 0, 1);
    plane.throttle += M.clamp(desiredThrottle - plane.throttle, -0.5 * dt, 0.5 * dt);
    var target = 16 + plane.throttle * 64;
    plane.speed += (target - plane.speed) * (1 - Math.exp(-0.45 * dt));
    plane.speed -= Math.sin(plane.pitch) * 9.81 * dt * 0.55;
    plane.speed = M.clamp(plane.speed, 0, 95);
    var fwd = forwardOf(plane);
    plane.pos = [
      plane.pos[0] + fwd[0] * plane.speed * dt,
      plane.pos[1] + fwd[1] * plane.speed * dt,
      plane.pos[2] + fwd[2] * plane.speed * dt
    ];
  }

  // ---------------------------------------------------------------- rendering
  function drawSolid(mesh, model, view, proj, opts) {
    opts = opts || {};
    gl.useProgram(progSolid.prog);
    var mvp = M.mMultiply(proj, M.mMultiply(view, model));
    gl.uniformMatrix4fv(progSolid.uniforms.uMVP, false, mvp);
    gl.uniformMatrix4fv(progSolid.uniforms.uModel, false, model);
    gl.uniform3fv(progSolid.uniforms.uSunDir, MS.sky.SUN_DIR);
    gl.uniform3fv(progSolid.uniforms.uCamPos, camPos);
    gl.uniform3fv(progSolid.uniforms.uFogColor, MS.sky.FOG_COLOR);
    gl.uniform3fv(progSolid.uniforms.uTint, opts.tint || [1, 1, 1]);
    gl.uniform1f(progSolid.uniforms.uTime, timeSec);
    gl.uniform1f(progSolid.uniforms.uSpecular, opts.specular || 0);
    gl.uniform1f(progSolid.uniforms.uEmissive, opts.emissive || 0);
    gl.uniform1f(progSolid.uniforms.uAlpha, opts.alpha === undefined ? 1 : opts.alpha);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.pos);
    gl.enableVertexAttribArray(progSolid.attribs.aPos);
    gl.vertexAttribPointer(progSolid.attribs.aPos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.norm);
    gl.enableVertexAttribArray(progSolid.attribs.aNorm);
    gl.vertexAttribPointer(progSolid.attribs.aNorm, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.col);
    gl.enableVertexAttribArray(progSolid.attribs.aColor);
    gl.vertexAttribPointer(progSolid.attribs.aColor, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.idx);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_INT, 0);
  }

  function drawSky(view, proj) {
    gl.useProgram(progSky.prog);
    gl.depthMask(false);
    var model = M.mTranslate(camPos[0], camPos[1], camPos[2]);
    var mvp = M.mMultiply(proj, M.mMultiply(view, model));
    gl.uniformMatrix4fv(progSky.uniforms.uMVP, false, mvp);
    gl.uniform3fv(progSky.uniforms.uSunDir, MS.sky.SUN_DIR);
    gl.bindBuffer(gl.ARRAY_BUFFER, meshSky.pos);
    gl.enableVertexAttribArray(progSky.attribs.aPos);
    gl.vertexAttribPointer(progSky.attribs.aPos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, meshSky.idx);
    gl.drawElements(gl.TRIANGLES, meshSky.count, gl.UNSIGNED_INT, 0);
    gl.depthMask(true);
  }

  function drawClouds(view, proj) {
    var verts = MS.sky.cloudVertices(clouds, view, timeSec);
    gl.useProgram(progSprite.prog);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    var mvp = M.mMultiply(proj, view);
    gl.uniformMatrix4fv(progSprite.uniforms.uMVP, false, mvp);
    gl.uniform3fv(progSprite.uniforms.uTint, [1.0, 0.93, 0.85]);
    gl.uniform1f(progSprite.uniforms.uAlpha, 0.8);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, cloudTexture);
    gl.uniform1i(progSprite.uniforms.uTex, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, cloudBuffers.pos);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts.positions), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(progSprite.attribs.aPos);
    gl.vertexAttribPointer(progSprite.attribs.aPos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, cloudBuffers.uv);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts.uvs), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(progSprite.attribs.aUv);
    gl.vertexAttribPointer(progSprite.attribs.aUv, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cloudBuffers.idx);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(verts.indices), gl.DYNAMIC_DRAW);
    gl.drawElements(gl.TRIANGLES, verts.indices.length, gl.UNSIGNED_INT, 0);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  function planeModel() {
    var rot = orientation(plane.heading, plane.pitch, plane.roll);
    var trn = M.mTranslate(plane.pos[0], plane.pos[1], plane.pos[2]);
    return M.mMultiply(trn, rot);
  }

  function render(dt) {
    var w = gl.canvas.width, h = gl.canvas.height;
    gl.viewport(0, 0, w, h);
    gl.clearColor(MS.sky.FOG_COLOR[0], MS.sky.FOG_COLOR[1], MS.sky.FOG_COLOR[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    var proj = M.mPerspective(M.deg2rad(62), w / h, 0.5, 16000);
    var fwd = forwardOf(plane);
    var up = upOf(plane);
    var viewMat;
    if (view === 'cockpit') {
      var head = M.vAdd(plane.pos, M.mDir(orientation(plane.heading, plane.pitch, plane.roll), [0, 1.05, -1.55]));
      camPos = head;
      viewMat = M.mLookAt(head, M.vAdd(head, M.vScale(fwd, 100)), up);
    } else {
      var desired = M.vAdd(M.vSub(plane.pos, M.vScale(fwd, 19)), [0, 6, 0]);
      var k = 1 - Math.exp(-3.4 * dt);
      camPos = M.vLerp(camPos, desired, k);
      var camUp = M.vNorm(M.vLerp([0, 1, 0], up, 0.35));
      viewMat = M.mLookAt(camPos, M.vAdd(plane.pos, M.vScale(fwd, 24)), camUp);
    }

    drawSky(viewMat, proj);
    drawSolid(meshOcean, M.mIdentity(), viewMat, proj, { specular: 1.0 });
    drawSolid(meshTerrain, M.mIdentity(), viewMat, proj, {});
    drawSolid(meshRunway, M.mIdentity(), viewMat, proj, {});
    drawSolid(meshLights, M.mIdentity(), viewMat, proj, { emissive: 1.1 });

    // Rings: flown ones fade green, the next burns gold and pulses, the rest glow cyan.
    for (var i = 0; i < MS.rings.COURSE.length; i++) {
      var ring = MS.rings.COURSE[i];
      if (i < ringsDone) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        drawSolid(meshRing, MS.rings.matrix(ring, 1), viewMat, proj, { tint: [0.35, 0.95, 0.45], emissive: 0.15, alpha: 0.5 });
        gl.disable(gl.BLEND);
      } else if (i === ringsDone) {
        var pulse = 1 + 0.045 * Math.sin(timeSec * 4.2);
        drawSolid(meshRing, MS.rings.matrix(ring, pulse), viewMat, proj, { tint: [1.0, 0.72, 0.18], emissive: 0.85 + 0.45 * Math.sin(timeSec * 4.2) });
      } else {
        drawSolid(meshRing, MS.rings.matrix(ring, 1), viewMat, proj, { tint: [0.25, 0.8, 1.0], emissive: 0.45 });
      }
    }

    drawClouds(viewMat, proj);

    // Aircraft (full airframe in chase view; nose only from the cockpit).
    var pm = planeModel();
    if (view === 'cockpit') {
      drawSolid(meshNose, pm, viewMat, proj, {});
    } else {
      drawSolid(meshPlane, pm, viewMat, proj, {});
    }
    propAngle += dt * (3 + plane.throttle * 42);
    var propModel = M.mMultiply(pm, M.mMultiply(
      M.mTranslate(0, 0, MS.aircraft.PROP_Z),
      M.mRotateZ(propAngle)
    ));
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    drawSolid(meshProp, propModel, viewMat, proj, { alpha: 0.5 });
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  // ---------------------------------------------------------------- HUD state
  function hudState(stalling) {
    var guide = null;
    var target = null, label = '';
    if (ringsDone < MS.rings.COURSE.length) {
      var r = MS.rings.COURSE[ringsDone];
      target = [r.x, r.y, r.z];
      label = 'RING ' + (ringsDone + 1);
    } else {
      target = [MS.runway.INFO.cx, MS.runway.INFO.y, MS.runway.INFO.cz];
      label = 'RUNWAY';
    }
    if (target && mode === 'flying') {
      var dx = target[0] - plane.pos[0], dy = target[1] - plane.pos[1], dz = target[2] - plane.pos[2];
      var bearing = M.wrapHeading(M.rad2deg(Math.atan2(dx, -dz)));
      var headingDeg = M.wrapHeading(M.rad2deg(plane.heading));
      guide = {
        label: label,
        distance: Math.sqrt(dx * dx + dy * dy + dz * dz),
        relativeBearing: M.wrapHeading(bearing - headingDeg + 180) - 180
      };
    }
    var score = currentScore() + (mode === 'finished' ? landingBonus : 0);
    return {
      mode: mode,
      view: view,
      speedKt: plane.speed * 1.94384,
      altFt: Math.max(0, plane.pos[1]) * 3.28084,
      headingDeg: M.wrapHeading(M.rad2deg(plane.heading)),
      throttle: plane.throttle,
      ringsDone: ringsDone,
      ringsTotal: MS.rings.COURSE.length,
      timeSec: timeSec,
      score: score,
      pitch: plane.pitch,
      roll: plane.roll,
      stalling: stalling,
      guide: guide,
      flash: flash,
      crashReason: crashReason,
      landingBonus: landingBonus,
      grade: gradeFor(score)
    };
  }

  // ---------------------------------------------------------------- demo modes
  function setupDemo(name) {
    demoMode = name;
    mode = 'flying';
    timeSec = 24;
    if (name === 'chase') {
      view = 'chase';
      plane.pos = [-840, 152, -40];
      plane.heading = M.deg2rad(56);
      plane.pitch = 0.03; plane.roll = 0.16;
      plane.speed = 52; plane.throttle = 0.62;
      ringsDone = 0;
    } else if (name === 'cockpit') {
      view = 'cockpit';
      plane.pos = [-680, 168, -260];
      plane.heading = M.deg2rad(50);
      plane.pitch = 0.02; plane.roll = 0.1;
      plane.speed = 52; plane.throttle = 0.62;
      ringsDone = 0;
    } else if (name === 'rings') {
      view = 'chase';
      ringsDone = 3;
      var r4 = MS.rings.COURSE[3];
      var n = MS.rings.normal(r4.heading);
      plane.pos = [r4.x - n[0] * 300, r4.y + 4, r4.z - n[2] * 300];
      plane.heading = M.deg2rad(r4.heading);
      plane.pitch = 0; plane.roll = -0.08;
      plane.speed = 54; plane.throttle = 0.64;
    } else if (name === 'approach') {
      view = 'chase';
      ringsDone = MS.rings.COURSE.length;
      plane.pos = [-330, 58, 2];
      plane.heading = M.deg2rad(90);
      plane.pitch = -0.05; plane.roll = 0.02;
      plane.speed = 38; plane.throttle = 0.34;
      timeSec = 96;
    }
    var fwd = forwardOf(plane);
    camPos = M.vAdd(M.vSub(plane.pos, M.vScale(fwd, 19)), [0, 6, 0]);
  }

  function demoTarget() {
    if (demoMode === 'approach') {
      var dist = Math.abs(plane.pos[0] - MS.runway.INFO.cx);
      return { pos: [MS.runway.INFO.cx, MS.runway.INFO.y, MS.runway.INFO.cz], alt: MS.runway.INFO.y + dist * 0.055 + 4, speed: 38 };
    }
    var r = MS.rings.COURSE[Math.min(ringsDone, MS.rings.COURSE.length - 1)];
    return { pos: [r.x, r.y, r.z], alt: r.y + 6, speed: 52 };
  }

  // ---------------------------------------------------------------- main loop
  var lastTime = 0;
  function frame(nowMs) {
    requestAnimationFrame(frame);
    var dt = Math.min(0.05, (nowMs - lastTime) / 1000 || 0.016);
    lastTime = nowMs;
    var stalling = false;

    if (mode === 'title') {
      timeSec += dt;
      var t = timeSec * 0.03;
      autopilot(dt, [Math.sin(t) * 950, 170, Math.cos(t) * 950], 170, 50);
    } else if (mode === 'flying') {
      timeSec += dt;
      if (demoMode) {
        var tgt = demoTarget();
        var prevPos = plane.pos.slice();
        autopilot(dt, tgt.pos, tgt.alt, tgt.speed);
        // Demo flights still count ring passes, so the autopilot keeps flying the course.
        if (ringsDone < MS.rings.COURSE.length &&
            MS.rings.crossed(MS.rings.COURSE[ringsDone], prevPos, plane.pos)) {
          ringsDone++;
        }
        stalling = false;
      } else {
        stalling = stepFlight(dt, MS.input.axes());
      }
      MS.audio.setEngine(plane.throttle, true);
    }

    // One-shot keys.
    if (MS.input.wasPressed('Enter') && mode === 'title') {
      resetFlight();
      mode = 'flying';
      setFlash('FLY THROUGH THE GOLD RING', 2.6);
    }
    if (MS.input.wasPressed('KeyC') && (mode === 'flying' || mode === 'paused')) {
      view = (view === 'chase') ? 'cockpit' : 'chase';
    }
    if (MS.input.wasPressed('KeyP')) {
      if (mode === 'flying') { mode = 'paused'; MS.audio.setEngine(0, false); }
      else if (mode === 'paused') mode = 'flying';
    }
    if (MS.input.wasPressed('KeyR') && mode !== 'title') {
      resetFlight();
      mode = 'flying';
      setFlash('FLY THROUGH THE GOLD RING', 2.6);
    }

    render(dt);
    MS.hud.draw(hudCtx, hudCtx.canvas.width, hudCtx.canvas.height, hudState(stalling));
    framesRendered++;
    if (framesRendered === 3) {
      window.MS_READY = true;
      document.body.setAttribute('data-ms-ready', '1');
    }
  }

  function resize() {
    var w = window.innerWidth, h = window.innerHeight;
    gl.canvas.width = w;
    gl.canvas.height = h;
    hudCtx.canvas.width = w;
    hudCtx.canvas.height = h;
  }

  function init() {
    var glCanvas = document.getElementById('gl');
    var hudCanvas = document.getElementById('hud');
    hudCtx = hudCanvas.getContext('2d');
    gl = glCanvas.getContext('webgl', { antialias: true, alpha: false }) ||
         glCanvas.getContext('experimental-webgl');
    if (!gl) {
      hudCtx.fillStyle = '#101828';
      hudCtx.fillRect(0, 0, hudCanvas.width, hudCanvas.height);
      hudCtx.fillStyle = '#ffffff';
      hudCtx.font = 'bold 20px Arial, sans-serif';
      hudCtx.textAlign = 'center';
      hudCtx.fillText('Meridian Skies needs WebGL — please try a desktop browser with WebGL enabled.', hudCanvas.width / 2, hudCanvas.height / 2);
      return;
    }
    gl.getExtension('OES_element_index_uint');
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);

    progSolid = makeProgram(gl, SOLID_VERT, SOLID_FRAG);
    progSky = makeProgram(gl, MS.sky.SKY_VERT, MS.sky.SKY_FRAG);
    progSprite = makeProgram(gl, MS.sky.SPRITE_VERT, MS.sky.SPRITE_FRAG);

    meshTerrain = uploadMesh(gl, MS.terrain.buildMesh());
    meshOcean = uploadMesh(gl, MS.terrain.buildOcean());
    meshSky = uploadMesh(gl, MS.sky.buildMesh());
    meshPlane = uploadMesh(gl, MS.aircraft.buildAirframe());
    meshProp = uploadMesh(gl, MS.aircraft.buildPropeller());
    meshNose = uploadMesh(gl, MS.aircraft.buildCockpitNose());
    meshRing = uploadMesh(gl, MS.rings.buildMesh());
    meshRunway = uploadMesh(gl, MS.runway.buildMesh());
    meshLights = uploadMesh(gl, MS.runway.buildLights());
    cloudTexture = MS.sky.makeCloudTexture(gl);
    clouds = MS.sky.makeClouds();
    cloudBuffers = {
      pos: gl.createBuffer(),
      uv: gl.createBuffer(),
      idx: gl.createBuffer()
    };

    MS.input.init();
    resize();
    window.addEventListener('resize', resize);

    var params = new URLSearchParams(window.location.search);
    var demo = params.get('demo');
    if (demo === 'chase' || demo === 'cockpit' || demo === 'rings' || demo === 'approach') {
      setupDemo(demo);
    } else {
      resetFlight();
      mode = 'title';
    }
    requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
