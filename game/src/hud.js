// Meridian Skies — hud.js
// The 2D-canvas heads-up display: compass ribbon, airspeed and altitude readouts,
// throttle bar, ring/time/score panel, pitch ladder, next-ring guide arrow, stall
// warning, the cockpit dashboard with lit gauges, and the title / pause / crash /
// finish screens. Everything is drawn each frame from the flight state game.js passes in.

(function () {
  'use strict';
  var M = MS.math;

  var GOLD = '#ffc94d';
  var INK = '#f4f7ff';
  var PANEL = 'rgba(10, 16, 30, 0.55)';
  var PANEL_EDGE = 'rgba(180, 205, 255, 0.45)';

  function fmtInt(n) {
    var s = String(Math.round(Math.abs(n)));
    var out = '';
    while (s.length > 3) { out = ',' + s.slice(-3) + out; s = s.slice(0, -3); }
    return (n < 0 ? '-' : '') + s + out;
  }
  function fmtTime(sec) {
    var m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }
  function pad3(n) {
    var s = String(Math.round(M.wrapHeading(n)) % 360);
    while (s.length < 3) s = '0' + s;
    return s;
  }

  function panel(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
    ctx.fillStyle = PANEL;
    ctx.fill();
    ctx.strokeStyle = PANEL_EDGE;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function drawCompassRibbon(ctx, cx, y, w, headingDeg, S) {
    var pxPerDeg = w / 90; // 90 degrees visible
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - w / 2, y, w, 34 * S);
    ctx.clip();
    ctx.fillStyle = PANEL;
    ctx.fillRect(cx - w / 2, y, w, 34 * S);
    ctx.fillStyle = INK;
    ctx.font = 'bold ' + Math.round(13 * S) + 'px Arial, sans-serif';
    ctx.textAlign = 'center';
    var names = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    for (var d = -60; d <= 60; d += 5) {
      var hdg = M.wrapHeading(headingDeg + d);
      var x = cx + d * pxPerDeg;
      var major = (Math.round(hdg) % 45 === 0);
      var mid = (Math.round(hdg) % 15 === 0);
      ctx.fillRect(x - 0.75, y + 2 * S, 1.5, (major ? 10 : mid ? 7 : 4) * S);
      if (major) ctx.fillText(names[Math.round(hdg)] || '', x, y + 27 * S);
      else if (mid) ctx.fillText(String(Math.round(hdg / 10)), x, y + 27 * S);
    }
    ctx.restore();
    // Centre caret and digital heading.
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.moveTo(cx - 6 * S, y - 1);
    ctx.lineTo(cx + 6 * S, y - 1);
    ctx.lineTo(cx, y + 7 * S);
    ctx.closePath();
    ctx.fill();
    panel(ctx, cx - 44 * S, y + 38 * S, 88 * S, 26 * S, 5 * S);
    ctx.fillStyle = INK;
    ctx.font = 'bold ' + Math.round(15 * S) + 'px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('HDG ' + pad3(headingDeg) + '°', cx, y + 56 * S);
  }

  function drawReadout(ctx, x, y, w, label, value, unit, S, alignRight) {
    panel(ctx, x, y, w, 62 * S, 7 * S);
    ctx.fillStyle = '#9fc3ff';
    ctx.font = 'bold ' + Math.round(12 * S) + 'px Arial, sans-serif';
    ctx.textAlign = alignRight ? 'right' : 'left';
    ctx.fillText(label, alignRight ? x + w - 10 * S : x + 10 * S, y + 18 * S);
    ctx.fillStyle = INK;
    ctx.font = 'bold ' + Math.round(27 * S) + 'px Arial, sans-serif';
    ctx.fillText(value, alignRight ? x + w - 10 * S : x + 10 * S, y + 47 * S);
    ctx.fillStyle = '#9fc3ff';
    ctx.font = 'bold ' + Math.round(11 * S) + 'px Arial, sans-serif';
    ctx.fillText(unit, alignRight ? x + w - 10 * S : x + 10 * S, y + 59 * S);
  }

  function drawThrottle(ctx, x, y, h, throttle, S) {
    panel(ctx, x, y, 46 * S, h, 7 * S);
    var innerH = h - 34 * S;
    var fillH = innerH * M.clamp(throttle, 0, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(x + 14 * S, y + 8 * S, 18 * S, innerH);
    ctx.fillStyle = GOLD;
    ctx.fillRect(x + 14 * S, y + 8 * S + (innerH - fillH), 18 * S, fillH);
    ctx.fillStyle = INK;
    ctx.font = 'bold ' + Math.round(11 * S) + 'px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('THR', x + 23 * S, y + h - 14 * S);
    ctx.fillText(Math.round(throttle * 100) + '%', x + 23 * S, y + h - 3 * S);
  }

  function drawScorePanel(ctx, x, y, st, S) {
    panel(ctx, x, y, 168 * S, 86 * S, 7 * S);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#9fc3ff';
    ctx.font = 'bold ' + Math.round(12 * S) + 'px Arial, sans-serif';
    ctx.fillText('RINGS', x + 12 * S, y + 20 * S);
    ctx.fillText('TIME', x + 12 * S, y + 44 * S);
    ctx.fillText('SCORE', x + 12 * S, y + 68 * S);
    ctx.fillStyle = INK;
    ctx.font = 'bold ' + Math.round(17 * S) + 'px Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(st.ringsDone + ' / ' + st.ringsTotal, x + 156 * S, y + 21 * S);
    ctx.fillText(fmtTime(st.timeSec), x + 156 * S, y + 45 * S);
    ctx.fillStyle = GOLD;
    ctx.fillText(fmtInt(st.score), x + 156 * S, y + 69 * S);
  }

  function drawPitchLadder(ctx, cx, cy, pitch, roll, S) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-roll);
    var dy = pitch * 220 * S; // pitch in radians -> pixels
    ctx.strokeStyle = 'rgba(140, 255, 190, 0.85)';
    ctx.lineWidth = 2 * S;
    ctx.beginPath();
    ctx.moveTo(-90 * S, dy);
    ctx.lineTo(-28 * S, dy);
    ctx.moveTo(28 * S, dy);
    ctx.lineTo(90 * S, dy);
    ctx.stroke();
    ctx.restore();
    // Fixed aircraft symbol.
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 2.5 * S;
    ctx.beginPath();
    ctx.moveTo(cx - 34 * S, cy);
    ctx.lineTo(cx - 10 * S, cy);
    ctx.lineTo(cx - 10 * S, cy + 6 * S);
    ctx.moveTo(cx + 34 * S, cy);
    ctx.lineTo(cx + 10 * S, cy);
    ctx.lineTo(cx + 10 * S, cy + 6 * S);
    ctx.stroke();
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.arc(cx, cy, 2.6 * S, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawGuide(ctx, cx, y, st, S) {
    if (!st.guide) return;
    var rel = M.deg2rad(st.guide.relativeBearing);
    panel(ctx, cx - 130 * S, y, 260 * S, 34 * S, 8 * S);
    ctx.save();
    ctx.translate(cx - 104 * S, y + 17 * S);
    ctx.rotate(rel);
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.moveTo(0, -9 * S);
    ctx.lineTo(6 * S, 6 * S);
    ctx.lineTo(0, 2 * S);
    ctx.lineTo(-6 * S, 6 * S);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = INK;
    ctx.font = 'bold ' + Math.round(14 * S) + 'px Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(st.guide.label + '  ·  ' + fmtInt(st.guide.distance) + ' m', cx - 88 * S, y + 22 * S);
  }

  // ---- Cockpit dashboard -------------------------------------------------

  function gauge(ctx, cx, cy, r, label, drawFace, S) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#0d1420';
    ctx.fill();
    ctx.strokeStyle = '#3d4c66';
    ctx.lineWidth = 3 * S;
    ctx.stroke();
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r - 3 * S, 0, Math.PI * 2);
    ctx.clip();
    drawFace(cx, cy, r - 3 * S);
    ctx.restore();
    ctx.fillStyle = '#9fc3ff';
    ctx.font = 'bold ' + Math.round(10 * S) + 'px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, cx, cy + r + 13 * S);
  }

  function drawDashboard(ctx, w, h, st, S) {
    var top = h - 205 * S;
    // Panel silhouette with a raised centre hump.
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(0, top + 40 * S);
    ctx.quadraticCurveTo(w * 0.30, top + 6 * S, w * 0.42, top);
    ctx.lineTo(w * 0.58, top);
    ctx.quadraticCurveTo(w * 0.70, top + 6 * S, w, top + 40 * S);
    ctx.lineTo(w, h);
    ctx.closePath();
    var grad = ctx.createLinearGradient(0, top, 0, h);
    grad.addColorStop(0, '#232c3d');
    grad.addColorStop(1, '#0b0f18');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 201, 77, 0.35)';
    ctx.lineWidth = 2 * S;
    ctx.stroke();
    // Canopy frame: dark pillars at the edges.
    ctx.fillStyle = 'rgba(8, 10, 16, 0.9)';
    ctx.fillRect(0, 0, 26 * S, h);
    ctx.fillRect(w - 26 * S, 0, 26 * S, h);
    ctx.fillRect(0, 0, w, 18 * S);

    var cy = top + 92 * S;
    var r = 52 * S;
    // Artificial horizon.
    gauge(ctx, w * 0.5, cy, r, 'ATTITUDE', function (cx, cyy, rr) {
      ctx.save();
      ctx.translate(cx, cyy);
      ctx.rotate(-st.roll);
      var dy = st.pitch * rr * 1.6;
      ctx.fillStyle = '#3d7bd6';
      ctx.fillRect(-rr * 2, -rr * 2 + dy, rr * 4, rr * 2);
      ctx.fillStyle = '#8a5a33';
      ctx.fillRect(-rr * 2, dy, rr * 4, rr * 2);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2 * S;
      ctx.beginPath();
      ctx.moveTo(-rr * 2, dy);
      ctx.lineTo(rr * 2, dy);
      ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 3 * S;
      ctx.beginPath();
      ctx.moveTo(cx - rr * 0.55, cyy);
      ctx.lineTo(cx - rr * 0.16, cyy);
      ctx.moveTo(cx + rr * 0.16, cyy);
      ctx.lineTo(cx + rr * 0.55, cyy);
      ctx.stroke();
      ctx.fillStyle = GOLD;
      ctx.beginPath();
      ctx.arc(cx, cyy, 3 * S, 0, Math.PI * 2);
      ctx.fill();
    }, S);
    // Airspeed.
    gauge(ctx, w * 0.5 - 150 * S, cy, r, 'AIRSPEED KT', function (cx, cyy, rr) {
      dialTicks(ctx, cx, cyy, rr, 0, 160, 20, S);
      needle(ctx, cx, cyy, rr, -135 + (st.speedKt / 160) * 270, S);
      ctx.fillStyle = INK;
      ctx.font = 'bold ' + Math.round(15 * S) + 'px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(Math.round(st.speedKt)), cx, cyy + rr * 0.62);
    }, S);
    // Altimeter.
    gauge(ctx, w * 0.5 + 150 * S, cy, r, 'ALTITUDE FT', function (cx, cyy, rr) {
      dialTicks(ctx, cx, cyy, rr, 0, 10, 1, S);
      needle(ctx, cx, cyy, rr, (st.altFt % 1000) / 1000 * 360, S);
      ctx.fillStyle = INK;
      ctx.font = 'bold ' + Math.round(13 * S) + 'px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(fmtInt(st.altFt), cx, cyy + rr * 0.62);
    }, S);
    // Compass card.
    gauge(ctx, w * 0.5 - 300 * S, cy, r * 0.82, 'HEADING', function (cx, cyy, rr) {
      ctx.save();
      ctx.translate(cx, cyy);
      ctx.rotate(-M.deg2rad(st.headingDeg));
      ctx.fillStyle = INK;
      ctx.font = 'bold ' + Math.round(12 * S) + 'px Arial, sans-serif';
      ctx.textAlign = 'center';
      var pts = [['N', 0], ['E', 90], ['S', 180], ['W', 270]];
      for (var i = 0; i < pts.length; i++) {
        var a = M.deg2rad(pts[i][1]);
        ctx.fillText(pts[i][0], Math.sin(a) * rr * 0.60, -Math.cos(a) * rr * 0.60 + 4 * S);
      }
      ctx.restore();
      ctx.fillStyle = GOLD;
      ctx.beginPath();
      ctx.moveTo(cx - 5 * S, cyy - rr);
      ctx.lineTo(cx + 5 * S, cyy - rr);
      ctx.lineTo(cx, cyy - rr + 8 * S);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = INK;
      ctx.font = 'bold ' + Math.round(12 * S) + 'px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(pad3(st.headingDeg) + '°', cx, cyy + rr * 0.84);
    }, S);
    // Throttle quadrant.
    var tx = w * 0.5 + 300 * S;
    ctx.fillStyle = '#0d1420';
    ctx.fillRect(tx - 16 * S, cy - r, 32 * S, r * 2);
    ctx.strokeStyle = '#3d4c66';
    ctx.strokeRect(tx - 16 * S, cy - r, 32 * S, r * 2);
    ctx.fillStyle = GOLD;
    var th = r * 2 * M.clamp(st.throttle, 0, 1);
    ctx.fillRect(tx - 12 * S, cy + r - th, 24 * S, th);
    ctx.fillStyle = '#9fc3ff';
    ctx.font = 'bold ' + Math.round(10 * S) + 'px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('THROTTLE', tx, cy + r + 13 * S);
    // Stall warning light.
    if (st.stalling && Math.floor(st.timeSec * 3) % 2 === 0) {
      ctx.fillStyle = '#ff4030';
      ctx.beginPath();
      ctx.arc(w * 0.5, top + 26 * S, 11 * S, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold ' + Math.round(11 * S) + 'px Arial, sans-serif';
      ctx.fillText('STALL', w * 0.5, top + 30 * S);
    }
  }

  function dialTicks(ctx, cx, cy, r, lo, hi, step, S) {
    ctx.strokeStyle = '#cfe0ff';
    ctx.lineWidth = 1.6 * S;
    for (var v = lo; v <= hi; v += step) {
      var a = M.deg2rad(-135 + ((v - lo) / (hi - lo)) * 270 - 90);
      var x1 = cx + Math.cos(a) * r * 0.78, y1 = cy + Math.sin(a) * r * 0.78;
      var x2 = cx + Math.cos(a) * r * 0.95, y2 = cy + Math.sin(a) * r * 0.95;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  }
  function needle(ctx, cx, cy, r, angleDeg, S) {
    var a = M.deg2rad(angleDeg - 90);
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 3 * S;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * r * 0.82, cy + Math.sin(a) * r * 0.82);
    ctx.stroke();
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.arc(cx, cy, 4 * S, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---- Screens -----------------------------------------------------------

  function drawTitle(ctx, w, h, st, S) {
    var grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(8, 12, 26, 0.42)');
    grad.addColorStop(0.55, 'rgba(8, 12, 26, 0.18)');
    grad.addColorStop(1, 'rgba(8, 12, 26, 0.55)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 18 * S;
    ctx.shadowOffsetY = 4 * S;
    ctx.fillStyle = GOLD;
    ctx.font = 'bold ' + Math.round(74 * S) + 'px Georgia, "Times New Roman", serif';
    ctx.fillText('MERIDIAN SKIES', w / 2, h * 0.24);
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.fillStyle = INK;
    ctx.font = 'italic ' + Math.round(19 * S) + 'px Georgia, serif';
    ctx.fillText('A golden-hour ring run over the archipelago', w / 2, h * 0.24 + 34 * S);

    var bw = 560 * S, bh = 196 * S;
    var bx = w / 2 - bw / 2, by = h * 0.40;
    panel(ctx, bx, by, bw, bh, 12 * S);
    ctx.fillStyle = GOLD;
    ctx.font = 'bold ' + Math.round(16 * S) + 'px Arial, sans-serif';
    ctx.fillText('FLY THE 8 GOLD RINGS · THEN LAND ON THE RUNWAY', w / 2, by + 30 * S);
    ctx.fillStyle = INK;
    ctx.font = Math.round(15 * S) + 'px Arial, sans-serif';
    ctx.textAlign = 'left';
    var rows = [
      ['↑ / W', 'nose up'], ['↓ / S', 'nose down'],
      ['← → / A D', 'bank left / right'], ['Shift / Ctrl', 'throttle up / down'],
      ['C', 'cockpit / chase view'], ['P', 'pause'],
      ['R', 'restart'], ['Mouse', 'steer (move from centre)']
    ];
    for (var i = 0; i < rows.length; i++) {
      var colX = bx + 34 * S + (i % 2) * 272 * S;
      var rowY = by + 62 * S + Math.floor(i / 2) * 30 * S;
      ctx.fillStyle = GOLD;
      ctx.font = 'bold ' + Math.round(14 * S) + 'px Arial, sans-serif';
      ctx.fillText(rows[i][0], colX, rowY);
      ctx.fillStyle = INK;
      ctx.font = Math.round(14 * S) + 'px Arial, sans-serif';
      ctx.fillText(rows[i][1], colX + 104 * S, rowY);
    }
    if (Math.floor(st.timeSec * 1.6) % 2 === 0) {
      ctx.fillStyle = GOLD;
      ctx.font = 'bold ' + Math.round(22 * S) + 'px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('PRESS ENTER TO FLY', w / 2, by + bh + 46 * S);
    }
  }

  function drawEndScreen(ctx, w, h, st, S, crashed) {
    ctx.fillStyle = crashed ? 'rgba(40, 6, 6, 0.45)' : 'rgba(6, 20, 14, 0.45)';
    ctx.fillRect(0, 0, w, h);
    var bw = 460 * S, bh = 300 * S;
    var bx = w / 2 - bw / 2, by = h / 2 - bh / 2;
    panel(ctx, bx, by, bw, bh, 14 * S);
    ctx.textAlign = 'center';
    ctx.fillStyle = crashed ? '#ff6a55' : GOLD;
    ctx.font = 'bold ' + Math.round(40 * S) + 'px Georgia, serif';
    ctx.fillText(crashed ? 'CRASHED' : 'COURSE COMPLETE', w / 2, by + 58 * S);
    ctx.fillStyle = INK;
    ctx.font = Math.round(16 * S) + 'px Arial, sans-serif';
    if (crashed) ctx.fillText(st.crashReason || '', w / 2, by + 86 * S);
    var rows = [
      ['Rings flown', st.ringsDone + ' / ' + st.ringsTotal],
      ['Time', fmtTime(st.timeSec)],
      ['Landing bonus', crashed ? '—' : '+' + fmtInt(st.landingBonus)],
      ['Final score', fmtInt(st.score)]
    ];
    ctx.font = Math.round(17 * S) + 'px Arial, sans-serif';
    for (var i = 0; i < rows.length; i++) {
      var y = by + 128 * S + i * 32 * S;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#9fc3ff';
      ctx.fillText(rows[i][0], bx + 46 * S, y);
      ctx.textAlign = 'right';
      ctx.fillStyle = INK;
      ctx.fillText(rows[i][1], bx + bw - 46 * S, y);
    }
    if (!crashed) {
      ctx.fillStyle = GOLD;
      ctx.font = 'bold ' + Math.round(30 * S) + 'px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText('GRADE  ' + st.grade, w / 2, by + bh - 52 * S);
    }
    ctx.fillStyle = INK;
    ctx.font = 'bold ' + Math.round(15 * S) + 'px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Press R to fly again', w / 2, by + bh - 20 * S);
  }

  // Main entry: draws the whole HUD for one frame.
  function draw(ctx, w, h, st) {
    var S = h / 720;
    ctx.clearRect(0, 0, w, h);
    if (st.mode === 'title') {
      drawTitle(ctx, w, h, st, S);
      return;
    }
    if (st.view === 'cockpit') {
      drawDashboard(ctx, w, h, st, S);
      drawScorePanel(ctx, w - 186 * S, 14 * S, st, S);
      drawGuide(ctx, w / 2, 16 * S, st, S);
    } else {
      drawCompassRibbon(ctx, w / 2, 14 * S, 430 * S, st.headingDeg, S);
      drawReadout(ctx, 16 * S, 16 * S, 150 * S, 'AIRSPEED', String(Math.round(st.speedKt)), 'KNOTS', S, false);
      drawReadout(ctx, w - 166 * S, 16 * S, 150 * S, 'ALTITUDE', fmtInt(st.altFt), 'FEET', S, true);
      drawScorePanel(ctx, w - 186 * S, 92 * S, st, S);
      drawThrottle(ctx, 16 * S, h - 176 * S, 160 * S, st.throttle, S);
      drawPitchLadder(ctx, w / 2, h / 2, st.pitch, st.roll, S);
      drawGuide(ctx, w / 2, h - 52 * S, st, S);
      if (st.stalling && Math.floor(st.timeSec * 3) % 2 === 0) {
        ctx.fillStyle = '#ff4030';
        ctx.font = 'bold ' + Math.round(26 * S) + 'px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('⚠ STALL', w / 2, h * 0.30);
      }
    }
    if (st.flash && st.flash.until > st.timeSec) {
      var fade = M.clamp((st.flash.until - st.timeSec) / 0.5, 0, 1);
      ctx.globalAlpha = fade;
      ctx.fillStyle = GOLD;
      ctx.font = 'bold ' + Math.round(30 * S) + 'px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(st.flash.text, w / 2, h * 0.38);
      ctx.globalAlpha = 1;
    }
    if (st.mode === 'paused') {
      ctx.fillStyle = 'rgba(6, 10, 20, 0.5)';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = INK;
      ctx.font = 'bold ' + Math.round(38 * S) + 'px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText('PAUSED', w / 2, h / 2);
      ctx.font = Math.round(16 * S) + 'px Arial, sans-serif';
      ctx.fillText('Press P to resume', w / 2, h / 2 + 34 * S);
    }
    if (st.mode === 'crashed') drawEndScreen(ctx, w, h, st, S, true);
    if (st.mode === 'finished') drawEndScreen(ctx, w, h, st, S, false);
  }

  MS.hud = { draw: draw };
})();
