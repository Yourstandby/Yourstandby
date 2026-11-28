/* 语言切换：默认英文，选择记在 localStorage。
   文案是构建期的双语双份 DOM，CSS 按 html[data-lang] 显隐；
   这里只做五件事：切换属性、记住选择、同步无法双语的属性（aria/alt/title）、
   同步 <html> 上挂着的中英标题与描述、广播 langchange 让 canvas 面板重画 HUD。 */
(function () {
  'use strict';
  var KEY = 'ys.lang';
  var root = document.documentElement;

  function current() {
    return root.getAttribute('data-lang') === 'zh' ? 'zh' : 'en';
  }

  function apply(lang, persist) {
    root.setAttribute('data-lang', lang);
    root.setAttribute('lang', lang === 'zh' ? 'zh-CN' : 'en');
    if (persist) {
      try { localStorage.setItem(KEY, lang); } catch (e) { /* 隐私模式下忽略 */ }
    }

    /* aria-label / alt 这类属性没法用 CSS 双语：元素上并排放 data-a11y-en / -zh */
    var attrs = document.querySelectorAll('[data-a11y-en]');
    for (var i = 0; i < attrs.length; i++) {
      var el = attrs[i];
      var v = el.getAttribute('data-a11y-' + lang);
      if (v == null) continue;
      el.setAttribute(el.getAttribute('data-a11y-attr') || 'aria-label', v);
    }

    /* 标题与描述只有一份，从 <html> 上的两版里取 */
    var t = root.getAttribute('data-title-' + lang);
    if (t) document.title = t;
    var d = root.getAttribute('data-desc-' + lang);
    if (d) {
      var m = document.querySelector('meta[name="description"]');
      if (m) m.setAttribute('content', d);
    }

    var btns = document.querySelectorAll('[data-lang-set]');
    for (var j = 0; j < btns.length; j++) {
      btns[j].setAttribute('aria-pressed', btns[j].getAttribute('data-lang-set') === lang ? 'true' : 'false');
    }

    document.dispatchEvent(new CustomEvent('langchange', { detail: { lang: lang } }));
  }

  /* 事件委托：ClientRouter 换页会重建导航，绑在 document 上就不会丢 */
  document.addEventListener('click', function (e) {
    var target = e.target;
    if (!target || !target.closest) return;
    var btn = target.closest('[data-lang-set]');
    if (!btn) return;
    e.preventDefault();
    var next = btn.getAttribute('data-lang-set') === 'zh' ? 'zh' : 'en';
    if (next === current()) return;
    apply(next, true);
  });

  apply(current(), false);
  document.addEventListener('astro:page-load', function () { apply(current(), false); });
})();
