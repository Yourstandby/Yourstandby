// 像素风动效：Bayer 抖动揭示 + 页面转场重播。无依赖。
(function () {
  var BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];

  /** 4×4 Bayer 阈值矩阵 → 8 级 dither 遮罩（像素风不能用透明度淡入） */
  function ditherMask(level) {
    var cells = [];
    for (var y = 0; y < 4; y++) {
      for (var x = 0; x < 4; x++) {
        if (BAYER[y][x] < level * 2) {
          cells.push("<rect x='" + x + "' y='" + y + "' width='1' height='1'/>");
        }
      }
    }
    var svg = "<svg xmlns='http://www.w3.org/2000/svg' width='4' height='4'><g fill='%23fff'>" + cells.join('') + "</g></svg>";
    return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';
  }

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** 0 → 8 级逐级揭示，每级 40ms，结束后清掉遮罩 */
  function reveal(el) {
    if (el.dataset.done === '1') return;
    el.dataset.done = '1';
    el.classList.add('is-done');
    if (reduce) return;
    var level = 0;
    var timer = setInterval(function () {
      level += 1;
      if (level >= 8) {
        clearInterval(timer);
        el.style.maskImage = '';
        el.style.webkitMaskImage = '';
        return;
      }
      var mask = ditherMask(level);
      el.style.maskImage = mask;
      el.style.webkitMaskImage = mask;
    }, 40);
    var first = ditherMask(0);
    el.style.maskImage = first;
    el.style.webkitMaskImage = first;
  }

  var observer = null;

  function init() {
    if (observer) observer.disconnect();
    observer = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) {
          reveal(entries[i].target);
          observer.unobserve(entries[i].target);
        }
      }
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

    var nodes = document.querySelectorAll('[data-dither]');
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].dataset.done !== '1') observer.observe(nodes[i]);
    }
  }

  document.addEventListener('astro:page-load', init);
  document.addEventListener('astro:after-swap', function () {
    requestAnimationFrame(init);
  });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
