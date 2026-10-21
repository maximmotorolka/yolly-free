// Yolly Free — studio.js
(function () {
  'use strict';

  // ---- tabs ----
  var tabs = document.querySelectorAll('.tab');
  var panels = document.querySelectorAll('.panel');
  function activate(name) {
    tabs.forEach(function (t) { t.classList.toggle('active', t.dataset.tab === name); });
    panels.forEach(function (p) { p.classList.toggle('active', p.id === 'panel-' + name); });
  }
  tabs.forEach(function (t) {
    t.addEventListener('click', function () { activate(t.dataset.tab); });
  });
  document.querySelectorAll('[data-goto]').forEach(function (b) {
    b.addEventListener('click', function () { activate(b.dataset.goto); });
  });

  // ---- image generation (free, keyless) ----
  var form = document.getElementById('genForm');
  var promptInput = document.getElementById('promptInput');
  var modelSelect = document.getElementById('modelSelect');
  var sizeSelect = document.getElementById('sizeSelect');
  var wrap = document.getElementById('genImgWrap');
  var statusEl = document.getElementById('genStatus');
  var btnLabel = document.getElementById('genBtnLabel');
  var downloadBtn = document.getElementById('downloadBtn');
  var regenBtn = document.getElementById('regenBtn');
  var lastUrl = '';

  // prefill from URL (?prompt=...)
  try {
    var q = new URLSearchParams(location.search).get('prompt');
    if (q) promptInput.value = q;
  } catch (e) { /* no-op */ }

  function buildUrl(prompt, model, size, seed) {
    var parts = size.split('x');
    var w = parseInt(parts[0], 10) || 1024;
    var h = parseInt(parts[1], 10) || 1024;
    return 'https://image.pollinations.ai/prompt/' + encodeURIComponent(prompt) +
      '?width=' + w + '&height=' + h +
      '&model=' + model +
      '&nologo=true&seed=' + seed +
      '&referrer=yolly-free';
  }

  function setStatus(html, spinning) {
    statusEl.innerHTML = (spinning ? '<span class="spinner"></span>' : '') + html;
  }

  function resetResult() {
    wrap.innerHTML = '<div class="gen-empty"><span class="big-emoji">🎨</span>Опишите идею слева и нажмите «Создать бесплатно» — нейросеть нарисует картинку прямо здесь.</div>';
    downloadBtn.style.display = 'none';
    regenBtn.style.display = 'none';
    lastUrl = '';
  }

  function generate() {
    var prompt = promptInput.value.trim();
    if (!prompt) {
      promptInput.focus();
      setStatus('Сначала опишите картинку', false);
      return;
    }
    var model = modelSelect.value;
    var size = sizeSelect.value;
    var seed = Math.floor(Math.random() * 1e9);
    var url = buildUrl(prompt, model, size, seed);
    lastUrl = url;

    setStatus('Генерация… обычно 5–30 секунд', true);
    btnLabel.textContent = 'Генерация…';
    form.disabled = true;
    regenBtn.style.display = 'none';
    downloadBtn.style.display = 'none';

    var img = document.createElement('img');
    img.alt = prompt;
    var started = Date.now();
    var done = false;

    img.onload = function () {
      done = true;
      wrap.innerHTML = '';
      wrap.appendChild(img);
      var secs = Math.max(1, Math.round((Date.now() - started) / 1000));
      setStatus('Готово за ' + secs + ' сек · бесплатно · без водяного знака', false);
      btnLabel.textContent = 'Создать бесплатно';
      form.disabled = false;
      regenBtn.style.display = '';
      downloadBtn.style.display = '';
      downloadBtn.href = url;
      downloadBtn.download = 'yolly-free-' + seed + '.png';
    };
    img.onerror = function () {
      if (done) return;
      done = true;
      form.disabled = false;
      btnLabel.textContent = 'Создать бесплатно';
      setStatus('Не удалось сгенерировать. Попробуйте ещё раз или упростите промпт.', false);
      resetResult();
    };

    wrap.innerHTML = '';
    img.src = url;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    generate();
  });

  regenBtn.addEventListener('click', function () {
    var p = promptInput.value.trim();
    if (p) generate();
  });

  // download: fetch as blob for a proper save
  downloadBtn.addEventListener('click', function (e) {
    if (!lastUrl) return;
    e.preventDefault();
    fetch(lastUrl)
      .then(function (r) { return r.ok ? r.blob() : Promise.reject(); })
      .then(function (blob) {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'yolly-free-' + Date.now() + '.png';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      })
      .catch(function () {
        window.open(lastUrl, '_blank');
      });
  });
})();
