// Yolly Free — main.js
(function () {
  'use strict';

  // year
  var y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();

  // mobile burger
  var burger = document.getElementById('burger');
  var nav = document.getElementById('mainNav');
  if (burger && nav) {
    burger.addEventListener('click', function () {
      nav.classList.toggle('open');
      burger.classList.toggle('open');
    });
    // mobile accordion: toggle on link click (touch)
    var toggles = nav.querySelectorAll('.nav-drop-toggle');
    toggles.forEach(function (t) {
      t.addEventListener('click', function (e) {
        if (window.innerWidth <= 860) {
          e.preventDefault();
          var item = t.closest('.nav-item');
          var wasOpen = item.classList.contains('open');
          nav.querySelectorAll('.nav-item.open').forEach(function (i) { i.classList.remove('open'); });
          if (!wasOpen) item.classList.add('open');
        }
      });
    });
  }

  // prompt prefill
  var useBtn = document.getElementById('usePrompt');
  var promptText = document.querySelector('.prompt-code');
  if (useBtn && promptText) {
    var url = '/studio.html?prompt=' + encodeURIComponent(promptText.textContent.trim());
    useBtn.setAttribute('href', url);
  }

  // scroll reveal
  var reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && reveals.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add('visible');
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.12 });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('visible'); });
  }

  // stats counter
  var nums = document.querySelectorAll('.stat-num[data-count]');
  function animateCount(el) {
    var target = parseInt(el.getAttribute('data-count'), 10) || 0;
    var dur = 1400, t0 = null;
    function step(ts) {
      if (!t0) t0 = ts;
      var p = Math.min((ts - t0) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased).toLocaleString('ru-RU');
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  if ('IntersectionObserver' in window && nums.length) {
    var io2 = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          animateCount(en.target);
          io2.unobserve(en.target);
        }
      });
    }, { threshold: 0.4 });
    nums.forEach(function (el) { io2.observe(el); });
  } else {
    nums.forEach(animateCount);
  }
})();
