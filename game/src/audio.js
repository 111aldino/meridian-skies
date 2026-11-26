// Meridian Skies — audio.js
// Fully procedural WebAudio sound: a piston-engine hum whose pitch follows the throttle,
// a two-note chime for each ring, a soft thud for touchdown, a noise crash, and a small
// finish jingle. The context is created lazily on the first keypress or click, as
// browsers require a user gesture before audio may start.

(function () {
  'use strict';

  var ctx = null;
  var engineOsc = null, engineOsc2 = null, engineGain = null, engineFilter = null;

  function unlock() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0.0;
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'square';
      engineOsc2.frequency.value = 27.5;
      var g2 = ctx.createGain();
      g2.gain.value = 0.5;
      engineOsc.connect(engineFilter);
      engineOsc2.connect(g2);
      g2.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(ctx.destination);
      engineOsc.start();
      engineOsc2.start();
    } catch (e) {
      ctx = null;
    }
  }

  // Called every frame while flying: engine pitch and loudness follow the throttle.
  function setEngine(throttle, running) {
    if (!ctx || !engineOsc) return;
    var t = ctx.currentTime;
    var freq = 42 + throttle * 95;
    engineOsc.frequency.setTargetAtTime(freq, t, 0.08);
    engineOsc2.frequency.setTargetAtTime(freq * 0.5 + 1.5, t, 0.08);
    engineFilter.frequency.setTargetAtTime(300 + throttle * 700, t, 0.1);
    engineGain.gain.setTargetAtTime(running ? 0.05 + throttle * 0.075 : 0.0, t, 0.12);
  }

  function tone(freq, startIn, dur, type, vol) {
    if (!ctx) return;
    var t0 = ctx.currentTime + startIn;
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.16, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function noiseBurst(dur, vol, cutoff) {
    if (!ctx) return;
    var t0 = ctx.currentTime;
    var len = Math.floor(ctx.sampleRate * dur);
    var buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = ctx.createBufferSource();
    src.buffer = buffer;
    var filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff || 900;
    var g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(ctx.destination);
    src.start(t0);
  }

  function ringChime() {
    tone(880, 0, 0.22, 'sine', 0.18);
    tone(1318, 0.09, 0.3, 'sine', 0.16);
  }
  function touchdown() { noiseBurst(0.25, 0.25, 500); }
  function crash() {
    noiseBurst(0.7, 0.5, 700);
    tone(90, 0, 0.5, 'sine', 0.3);
  }
  function finishJingle() {
    tone(659, 0, 0.18, 'triangle', 0.18);
    tone(880, 0.14, 0.18, 'triangle', 0.18);
    tone(1175, 0.28, 0.34, 'triangle', 0.2);
  }

  MS.audio = {
    unlock: unlock,
    setEngine: setEngine,
    ringChime: ringChime,
    touchdown: touchdown,
    crash: crash,
    finishJingle: finishJingle
  };
})();
