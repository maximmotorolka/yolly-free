// Yolly Free — music-gen.js
// AI: MusicGen (Hugging Face Spaces, Gradio API, no key)
// Fallback: instant in-browser synth (Web Audio -> WAV)
(function () {
  'use strict';

  // ============ AI spaces (tried in order) ============
  // sanchit-gandhi/musicgen-streaming: Gradio endpoint /generate_audio
  // args: [prompt, audio_length_in_s (10..30), play_steps_in_s, seed] -> HLS (m3u8) stream
  var MUSIC_SPACES = [
    {
      base: 'https://sanchit-gandhi-musicgen-streaming.hf.space',
      endpoint: 'generate_audio',
      args: function (promptText) {
        return [promptText, 15, 1.5, Math.floor(Math.random() * 1000000)];
      }
    }
  ];

  var form = document.getElementById('musicForm');
  var promptEl = document.getElementById('songPrompt');
  var styleEl = document.getElementById('songStyle');
  var moodEl = document.getElementById('songMood');
  var wrap = document.getElementById('songAudioWrap');
  var statusEl = document.getElementById('songStatus');
  var btnLabel = document.getElementById('songBtnLabel');
  var quickBtn = document.getElementById('songQuickBtn');
  var downloadBtn = document.getElementById('songDownload');
  var regenBtn = document.getElementById('songRegen');
  var lastMode = 'ai';
  var lastPrompt = '';
  var busy = false;
  var currentHls = null;

  var MOOD_EN = {
    happy: 'happy, bright', energetic: 'energetic, uplifting', calm: 'calm, relaxing',
    sad: 'sad, melancholic', epic: 'epic, cinematic', romantic: 'romantic, warm'
  };
  var STYLE_EN = {
    pop: 'pop song', rock: 'rock song', 'hip-hop': 'hip hop rap', electronic: 'electronic dance music',
    chill: 'chill lo-fi', jazz: 'jazz', classical: 'classical orchestral'
  };

  function setStatus(html, spinning) {
    statusEl.innerHTML = (spinning ? '<span class="spinner"></span>' : '') + html;
  }
  function resetResult() {
    wrap.innerHTML = '<div class="gen-empty"><span class="big-emoji">🎵</span>Опишите песню слева и нажмите «Сгенерировать» — получится трек, который можно прослушать и скачать в WAV.</div>';
    downloadBtn.style.display = 'none';
    regenBtn.style.display = 'none';
  }
  function showAudio(url, filename) {
    var a = document.createElement('audio');
    a.controls = true;
    a.preload = 'auto';
    wrap.innerHTML = '';
    wrap.appendChild(a);
    if (url.indexOf('.m3u8') !== -1 && window.Hls && Hls.isSupported()) {
      if (currentHls) { try { currentHls.destroy(); } catch (e) { } }
      currentHls = new Hls({ maxBufferLength: 30 });
      currentHls.loadSource(url);
      currentHls.attachMedia(a);
      currentHls.on(Hls.Events.MANIFEST_PARSED, function () { a.play().catch(function () {}); });
    } else if (url.indexOf('.m3u8') !== -1 && a.canPlayType('application/vnd.apple.mpegurl')) {
      a.src = url; // Safari native HLS
    } else {
      a.src = url;
    }
    downloadBtn.href = url;
    downloadBtn.download = filename;
    downloadBtn.dataset.filename = filename;
    downloadBtn.style.display = '';
    regenBtn.style.display = '';
  }

  function buildPrompt() {
    var p = promptEl.value.trim() || 'song';
    return (STYLE_EN[styleEl.value] || 'song') + ', ' + (MOOD_EN[moodEl.value] || 'bright') +
      ' — ' + p + ' (instrumental mix)';
  }

  // ============ AI generation via Gradio ============
  function trySpace(space, promptText, onDone) {
    var callUrl = space.base + '/gradio_api/call/' + space.endpoint;
    var ctrl = new AbortController();
    var to = setTimeout(function () { ctrl.abort(); }, 60000);
    fetch(callUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: space.args(promptText) }),
      signal: ctrl.signal
    }).then(function (r) {
      clearTimeout(to);
      if (!r.ok) throw new Error('http ' + r.status);
      return r.json();
    }).then(function (j) {
      if (!j.event_id) throw new Error('no event_id');
      listenSSE(space, j.event_id, onDone);
    }).catch(function (e) {
      clearTimeout(to);
      onDone(null, e);
    });
  }

  function extractFile(node) {
    if (!node) return null;
    if (typeof node === 'string') return node.indexOf('/') === 0 ? node : (node.indexOf('http') === 0 ? node : null);
    if (typeof node === 'object') {
      if (node.url) return node.url.indexOf('http') === 0 ? node.url : node.url.indexOf('/') === 0 ? node.url : null;
      if (node.path && node.path.indexOf('/') === 0) return node.path;
      if (Array.isArray(node)) {
        for (var i = 0; i < node.length; i++) { var r = extractFile(node[i]); if (r) return r; }
      }
    }
    return null;
  }

  function listenSSE(space, eventId, onDone) {
    var es = new EventSource(space.base + '/gradio_api/call/' + space.endpoint + '/' + eventId);
    var done = false;
    var to = setTimeout(function () { if (!done) { done = true; es.close(); onDone(null, new Error('timeout')); } }, 240000);
    es.addEventListener('complete', function (ev) {
      if (done) return;
      done = true; es.close(); clearTimeout(to);
      try {
        var data = JSON.parse(ev.data);
        var out = data && data.output ? data.output : null;
        var f = extractFile(out);
        if (f) onDone(f.indexOf('http') === 0 ? f : space.base + f, null);
        else onDone(null, new Error('no audio in response'));
      } catch (e) { onDone(null, e); }
    });
    es.addEventListener('error', function (ev) {
      if (done) return;
      // real stream error (data:null) OR EventSource network close
      if (ev.data) {
        done = true; es.close(); clearTimeout(to); onDone(null, new Error('space error'));
      } else if (es.readyState === EventSource.CLOSED) {
        done = true; clearTimeout(to); onDone(null, new Error('closed'));
      }
    });
  }

  function generateAI(promptText, onDone) {
    var idx = 0;
    (function next() {
      if (idx >= MUSIC_SPACES.length) return onDone(null, new Error('all spaces failed'));
      trySpace(MUSIC_SPACES[idx++], promptText, function (url, err) {
        if (url) return onDone(url, null);
        next();
      });
    })();
  }

  // ============ Instant in-browser generator ============
  function hashStr(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  var STYLES = {
    pop:        { bpm: 112, kick: [1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0], snare: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0], hat:  [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0], bass: 'eighth', wave: 'sawtooth', chordWave: 'sawtooth', leadWave: 'sawtooth', drums: true },
    rock:       { bpm: 120, kick: [1,0,0,1,0,0,1,0,1,0,0,1,0,0,1,0], snare: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0], hat:  [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0], bass: 'eighth', wave: 'square', chordWave: 'sawtooth', leadWave: 'square', drums: true },
    'hip-hop':  { bpm: 88,  kick: [1,0,0,0,0,0,0,1,0,0,1,0,0,0,0,0], snare: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0], hat:  [1,0,1,0,1,0,1,1,1,0,1,0,1,0,1,0], bass: 'sparse', wave: 'square', chordWave: 'triangle', leadWave: 'square', drums: true },
    electronic: { bpm: 126, kick: [1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0], snare: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0], hat:  [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,1], bass: 'offbeat', wave: 'sawtooth', chordWave: 'sawtooth', leadWave: 'sawtooth', drums: true },
    chill:      { bpm: 80,  kick: [1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0], snare: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0], hat:  [1,0,0,1,0,0,1,0,1,0,0,1,0,0,1,0], bass: 'sparse', wave: 'sine', chordWave: 'triangle', leadWave: 'triangle', drums: true },
    jazz:       { bpm: 96,  kick: [1,0,0,0,0,0,1,0,0,0,0,0,1,0,0,0], snare: [0,0,0,0,0,0,0,1,0,0,0,0,1,0,0,0], hat:  [1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1], bass: 'walk', wave: 'sine', chordWave: 'triangle', leadWave: 'sine', drums: true },
    classical:  { bpm: 72,  kick: [], snare: [], hat: [], bass: 'sparse', wave: 'sine', chordWave: 'sine', leadWave: 'triangle', drums: false }
  };
  var MOODS = {
    happy:     { scale: 'major', bpmMul: 1.0, energy: 1.0 },
    energetic: { scale: 'major', bpmMul: 1.15, energy: 1.2 },
    calm:      { scale: 'major', bpmMul: 0.9, energy: 0.6 },
    sad:       { scale: 'minor', bpmMul: 0.92, energy: 0.6 },
    epic:      { scale: 'minor', bpmMul: 1.05, energy: 1.25 },
    romantic:  { scale: 'major', bpmMul: 0.95, energy: 0.75 }
  };
  var MAJOR = [0, 2, 4, 5, 7, 9, 11], MINOR = [0, 2, 3, 5, 7, 8, 10];
  var MAJ_PENT = [0, 2, 4, 7, 9], MIN_PENT = [0, 3, 5, 7, 10];
  var PROG_MAJOR = [[0, 4, 5, 3], [0, 5, 3, 4], [0, 3, 4, 0]];
  var PROG_MINOR = [[0, 5, 3, 6], [0, 2, 5, 6], [0, 6, 5, 4]];
  var ROOTS = [48, 50, 52, 53, 55, 57];

  function midiHz(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  function instantGenerate(prompt, style, mood, onDone) {
    var seed = hashStr(prompt + '|' + style + '|' + mood + '|' + Date.now());
    var rng = mulberry32(seed);
    var S = STYLES[style] || STYLES.pop;
    var M = MOODS[mood] || MOODS.happy;
    var bpm = Math.round(S.bpm * M.bpmMul);
    var scale = M.scale === 'major' ? MAJOR : MINOR;
    var pent = M.scale === 'major' ? MAJ_PENT : MIN_PENT;
    var progSet = M.scale === 'major' ? PROG_MAJOR : PROG_MINOR;
    var prog = progSet[Math.floor(rng() * progSet.length)];
    var rootMidi = ROOTS[Math.floor(rng() * ROOTS.length)];

    var beat = 60 / bpm;
    var step = beat / 4; // 16 steps per bar
    var BARS = 12;
    var dur = BARS * 4 * beat + 1.2;
    var sr = 44100;

    var ctx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(2, Math.ceil(dur * sr), sr);

    // master chain
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.18;
    var master = ctx.createGain(); master.gain.value = 0.85;
    comp.connect(master); master.connect(ctx.destination);

    // noise buffer
    var noiseBuf = ctx.createBuffer(1, sr * 0.5, sr);
    var nd = noiseBuf.getChannelData(0);
    for (var i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    function noiseSrc(t, durS, type, freq, gainPeak, t0) {
      var src = ctx.createBufferSource(); src.buffer = noiseBuf;
      var f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = type === 'bandpass' ? 1.2 : 0.8;
      var g = ctx.createGain();
      g.gain.setValueAtTime(gainPeak, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + durS);
      src.connect(f); f.connect(g); g.connect(comp);
      src.start(t0); src.stop(t0 + durS + 0.05);
    }
    function osc(t0, type, f0, f1, gainPeak, a, dS, sS) {
      var o = ctx.createOscillator(); o.type = type;
      if (f1 && f1 !== f0) { o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dS); }
      else o.frequency.setValueAtTime(f0, t0);
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gainPeak, t0 + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + dS);
      var lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
      o.connect(lp); lp.connect(g); g.connect(comp);
      o.start(t0); o.stop(t0 + a + dS + 0.05);
      return { o: o, lp: lp };
    }
    function chordVoice(t0, midi, wave, gainPeak, hold) {
      var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
      var g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(gainPeak, t0 + 0.03);
      g.gain.setValueAtTime(gainPeak, t0 + hold - 0.15);
      g.gain.linearRampToValueAtTime(0.0001, t0 + hold);
      lp.connect(g); g.connect(comp);
      [-6, 6].forEach(function (det) {
        var o = ctx.createOscillator(); o.type = wave; o.frequency.value = midiHz(midi); o.detune.value = det;
        o.connect(lp); o.start(t0); o.stop(t0 + hold + 0.05);
      });
    }

    var tBar = function (b) { return 0.15 + b * 4 * beat; };

    for (var b = 0; b < BARS; b++) {
      var tb = tBar(b);
      var deg = prog[(b / 1) % 4 | 0]; // one chord per bar
      var chordRoot = rootMidi + scale[deg % 7] + (deg >= 7 ? 12 : 0);
      var isIntro = (b === 0), isOutro = (b === BARS - 1);

      // pad / chords
      if (isIntro || isOutro) {
        for (var p = 0; p < 3; p++) chordVoice(tb, chordRoot + 12 + scale[p], 'sine', 0.10 * M.energy, 4 * beat);
      } else {
        var cw = S.chordWave;
        for (var c = 0; c < 3; c++) chordVoice(tb, chordRoot + 24 + scale[c], cw, 0.055 * M.energy, 4 * beat * 0.92);
      }

      // drums
      if (S.drums && !isIntro && !isOutro) {
        for (var s = 0; s < 16; s++) {
          var ts = tb + s * step;
          if (S.kick[s]) {
            var o = ctx.createOscillator(); o.type = 'sine';
            o.frequency.setValueAtTime(150, ts); o.frequency.exponentialRampToValueAtTime(44, ts + 0.11);
            var gk = ctx.createGain(); gk.gain.setValueAtTime(0.9 * M.energy, ts);
            gk.gain.exponentialRampToValueAtTime(0.001, ts + 0.26);
            o.connect(gk); gk.connect(comp); o.start(ts); o.stop(ts + 0.3);
          }
          if (S.snare[s]) noiseSrc(ts, 0.18, 'bandpass', 1800, 0.5 * M.energy, ts);
          if (S.hat[s]) noiseSrc(ts, 0.045, 'highpass', 7500, (s % 2 ? 0.10 : 0.16) * M.energy, ts);
        }
      }

      // bass
      if (!isIntro) {
        var bassRoot = midiHz(chordRoot);
        if (S.bass === 'eighth' || S.bass === 'offbeat') {
          for (var e = 0; e < 8; e++) {
            var tse = tb + e * (beat / 2) + (S.bass === 'offbeat' ? beat / 4 : 0);
            if (tse < tb + 4 * beat - 0.05)
              osc(tse, S.wave, bassRoot, bassRoot, 0.28 * M.energy, 0.008, beat / 2 * 0.85, 0);
          }
        } else if (S.bass === 'walk') {
          for (var w = 0; w < 4; w++) {
            var stepDeg = scale[(deg + w) % 7] + ((deg + w) >= 7 ? 12 : 0);
            osc(tb + w * beat, 'sine', midiHz(rootMidi + stepDeg), 0, 0.30 * M.energy, 0.01, beat * 0.9, 0);
          }
        } else { // sparse
          osc(tb, S.wave, bassRoot, 0, 0.32 * M.energy, 0.01, beat * 0.9, 0);
          if (!isOutro) osc(tb + 2 * beat, S.wave, bassRoot * (M.scale === 'major' ? 1.5 : Math.pow(2, 3 / 12)), 0, 0.28 * M.energy, 0.01, beat * 0.9, 0);
        }
      }

      // melody
      if (!isIntro) {
        var melStep = (bpm > 110 || style === 'jazz') ? step * 2 : step * 2; // 8th notes
        var lastNote = 7; // middle of pent range
        var notesInBar = 4 * 4 / 2;
        for (var n = 0; n < notesInBar; n++) {
          var ts2 = tb + n * melStep;
          if (rng() < 0.28) continue; // rests
          var jump = Math.floor(rng() * 5) - 2;
          lastNote = Math.max(0, Math.min(pent.length * 2 - 1, lastNote + jump));
          var oct = Math.floor(lastNote / pent.length);
          var degM = pent[lastNote % pent.length];
          var midi = chordRoot + 36 + degM + oct * 12;
          var hold = isOutro ? melStep * 2.5 : melStep * (rng() < 0.2 ? 1.8 : 0.9);
          var v = osc(ts2, S.leadWave, midiHz(midi), 0, 0.16 * M.energy, 0.012, hold, 0);
          if (v) v.lp.frequency.value = 2600;
        }
      }
    }

    ctx.startRendering().then(function (buf) {
      var blob = encodeWav(buf);
      onDone(URL.createObjectURL(blob), 'yolly-free-song.wav');
    }).catch(function (e) { onDone(null, e); });
  }

  function encodeWav(buffer) {
    var nCh = buffer.numberOfChannels, sr = buffer.sampleRate, len = buffer.length;
    var blockAlign = nCh * 2;
    var dataSize = len * blockAlign;
    var ab = new ArrayBuffer(44 + dataSize), v = new DataView(ab);
    function ws(o, s) { for (var i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); }
    ws(0, 'RIFF'); v.setUint32(4, 36 + dataSize, true); ws(8, 'WAVE'); ws(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, nCh, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * blockAlign, true);
    v.setUint16(32, blockAlign, true); v.setUint16(34, 16, true);
    ws(36, 'data'); v.setUint32(40, dataSize, true);
    var off = 44, chans = [];
    for (var c = 0; c < nCh; c++) chans.push(buffer.getChannelData(c));
    for (var i = 0; i < len; i++) for (var ch = 0; ch < nCh; ch++) {
      var s = Math.max(-1, Math.min(1, chans[ch][i]));
      v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true); off += 2;
    }
    return new Blob([ab], { type: 'audio/wav' });
  }

  // ============ UI wiring ============
  function startAI() {
    if (busy) return;
    lastMode = 'ai';
    lastPrompt = promptEl.value.trim();
    busy = true;
    form.disabled = true;
    btnLabel.textContent = 'Генерация…';
    quickBtn.style.opacity = '0.4';
    setStatus('ИИ генерирует песню… обычно 1–3 минуты', true);
    resetResult();
    var pt = buildPrompt();
    generateAI(pt, function (url, err) {
      busy = false;
      form.disabled = false;
      btnLabel.textContent = 'Сгенерировать песню бесплатно';
      quickBtn.style.opacity = '';
      if (url) {
        showAudio(url, 'yolly-free-song');
        setStatus('Готово · ИИ (MusicGen) · без водяного знака', false);
      } else {
        setStatus('ИИ-сервис сейчас недоступен — сгенерируем демо в браузере', true);
        startInstant(true);
      }
    });
  }

  function startInstant(auto) {
    if (busy && !auto) return;
    lastMode = 'instant';
    lastPrompt = promptEl.value.trim();
    if (!auto) busy = true;
    setStatus('Синтезирую в браузере… пару секунд', true);
    var p = lastPrompt || 'song';
    instantGenerate(p, styleEl.value, moodEl.value, function (url, err) {
      busy = false;
      if (!auto) form.disabled = false;
      if (url) {
        showAudio(url, 'yolly-free-demo.wav');
        setStatus('Готово · демо-режим (браузер) · ' + styleEl.value + ' · ' + moodEl.value, false);
      } else {
        setStatus('Не получилось: ' + (err && err.message ? err.message : 'ошибка'), false);
      }
    });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    startAI();
  });
  quickBtn.addEventListener('click', function () { startInstant(false); });
  regenBtn.addEventListener('click', function () {
    if (lastMode === 'ai') startAI(); else startInstant(false);
  });
  downloadBtn.addEventListener('click', function (e) {
    var href = downloadBtn.href;
    var fname = downloadBtn.dataset.filename || 'yolly-free-song';
    if (!href) return;
    if (href.indexOf('blob:') === 0) return; // browser saves blob directly
    e.preventDefault();
    if (href.indexOf('.m3u8') !== -1) {
      // stitch HLS AAC segments into one .aac file
      setStatus('Собираю файл для скачивания…', true);
      fetch(href).then(function (r) { return r.text(); }).then(function (pl) {
        var lines = pl.split(/\r?\n/).filter(function (l) { return l && l[0] !== '#'; });
        var baseDir = href.replace(/[^/]*$/, '');
        return lines.reduce(function (chain, seg) {
          var segUrl = seg.indexOf('http') === 0 ? seg : baseDir + seg;
          return chain.then(function (parts) {
            return fetch(segUrl).then(function (r) {
              if (!r.ok) throw new Error('seg ' + r.status);
              return r.arrayBuffer();
            }).then(function (buf) { parts.push(buf); return parts; });
          });
        }, Promise.resolve([])).then(function (parts) {
          var blob = new Blob(parts, { type: 'audio/aac' });
          var a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = fname + '.aac';
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
          setStatus('Файл сохранён', false);
        });
      }).catch(function (err) {
        setStatus('Скачать не удалось: ' + (err && err.message ? err.message : err) + ' — можно сохранить по ссылке', false);
        window.open(href, '_blank');
      });
    } else {
      fetch(href)
        .then(function (r) { return r.ok ? r.blob() : Promise.reject(); })
        .then(function (blob) {
          var a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = fname;
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
        })
        .catch(function () { window.open(href, '_blank'); });
    }
  });
})();
