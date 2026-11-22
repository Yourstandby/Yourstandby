/* 十关双屏闯关：左右两个屏幕并排，法师与战士同时推进，
   五组环境互为倒序（雪原↔水底、森林↔石坑、沙漠↔沙漠…），第十关后跨越分屏线相遇。
   Canvas 640x180（两个 320x180 屏幕），整数倍放大，无第三方依赖。 */
(function () {
  'use strict';
  var canvas = document.getElementById('quest-canvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  var SW = 320, H = 180, W = 640;
  var BASE = canvas.getAttribute('data-base') || '';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var C = {
    ink: '#1A1D23', ember: '#FF3B1F', deep: '#C21B00', flame: '#FFB000', spark: '#FFE9A8',
    cyan: '#2BD9FF', lime: '#4CE06A', ash: '#8A6A64', white: '#FFFFFF',
    snow: '#EAF2F7', snowShade: '#C0D3E2', ice: '#8FD4EA', iceLit: '#D8F1FA',
    snake: '#7B3FA0', snakeLit: '#B47AD8',
    sand: '#E0B15E', dune: '#C98F3D', sun: '#FFD27A',
    rock: '#5A5F66', rockDark: '#31353A', rockLit: '#8B929B',
    water: '#1F5C7A', waterDeep: '#0E2E3F', bubble: '#8FE3F0'
  };

  /* ---------- 五组关卡：左=法师，右=战士，环境互为倒序 ---------- */
  var STAGES = [
    { l: { env: 'snow',   act: 'icewall', place: '雪原',     tech: '法杖点地，冰墙挡住雪崩' },
      r: { env: 'water',  act: 'swirl',   place: '水底',     tech: '大剑搅出涡流借力上浮' } },
    { l: { env: 'forest', act: 'fire',    place: '原始森林', tech: '杖头迸火星，毒蛇退散' },
      r: { env: 'quarry', act: 'shield',  place: '石坑',     tech: '盾面撞碎石人的膝盖' } },
    { l: { env: 'desert', act: 'orb',     place: '沙漠',     tech: '凝出水球，拖着身子喝下去' },
      r: { env: 'desert', act: 'blade',   place: '沙漠',     tech: '大剑插沙遮阴，反光找到绿洲' } },
    { l: { env: 'quarry', act: 'petrify', place: '石坑',     tech: '石化咒把追兵定在原地' },
      r: { env: 'forest', act: 'slash',   place: '原始森林', tech: '横扫一剑，藤蔓和蛇一起断' } },
    { l: { env: 'water',  act: 'bubble',  place: '水底',     tech: '撑开呼吸法阵，气泡裹身' },
      r: { env: 'snow',   act: 'charge',  place: '雪原',     tech: '盾当滑板，从雪崩底下冲过' } }
  ];

  var SEG = { enter: 0.6, walk: 0.9, hazard: 1.2, act: 1.4, clear: 0.8, exit: 0.6 };
  var TOTAL = SEG.enter + SEG.walk + SEG.hazard + SEG.act + SEG.clear + SEG.exit;
  var MEET = 4.2;

  var SPR = null;
  function loadSprites() {
    if (SPR) return Promise.resolve(SPR);
    return fetch(BASE + '/sprites.json', { cache: 'force-cache' })
      .then(function (r) { return r.json(); })
      .then(function (d) { SPR = d; return d; });
  }

  var parts = [];
  function spawn(side, type, n) {
    for (var i = 0; i < n; i++) {
      var p = { side: side, type: type, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 1 };
      if (type === 'snow') {
        p.x = Math.random() * SW; p.y = Math.random() * H;
        p.vx = -8 - Math.random() * 12; p.vy = 8 + Math.random() * 14;
        p.size = Math.random() < 0.35 ? 2 : 1;
      } else if (type === 'leaf') {
        p.x = Math.random() * SW; p.y = -8 - Math.random() * 40;
        p.vx = -4 + Math.random() * 8; p.vy = 10 + Math.random() * 12; p.size = 2;
      } else if (type === 'sand') {
        p.x = -10 + Math.random() * 40; p.y = 40 + Math.random() * 120;
        p.vx = 40 + Math.random() * 60; p.vy = -4 + Math.random() * 8; p.size = 1;
      } else if (type === 'bubble') {
        p.x = 20 + Math.random() * (SW - 40); p.y = H;
        p.vx = -2 + Math.random() * 4; p.vy = -16 - Math.random() * 22;
        p.size = Math.random() < 0.3 ? 3 : 2;
      } else if (type === 'rock') {
        p.x = Math.random() * SW; p.y = -6; p.vy = 40 + Math.random() * 40; p.size = 2;
      } else {
        p.x = 0; p.y = 0; p.vx = -20 + Math.random() * 40; p.vy = -30 - Math.random() * 40; p.size = 2;
      }
      p.max = 1 + Math.random() * 2;
      parts.push(p);
    }
  }

  function stepParts(dt) {
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.life += dt;
      if (p.type === 'snow' && p.y > H) { p.y = -4; p.x = Math.random() * SW; }
      if (p.type === 'sand' && p.x > SW + 10) { p.x = -10; p.y = 40 + Math.random() * 120; }
      if (p.type === 'bubble' && p.y < -6) { p.y = H + 4; p.x = 20 + Math.random() * (SW - 40); }
      if (p.life > p.max || p.y > H + 12) parts.splice(i, 1);
    }
  }

  function drawParts() {
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (p.type === 'snow') ctx.fillStyle = C.snow;
      else if (p.type === 'leaf') ctx.fillStyle = C.lime;
      else if (p.type === 'sand') ctx.fillStyle = C.sand;
      else if (p.type === 'bubble') ctx.fillStyle = C.bubble;
      else if (p.type === 'rock') ctx.fillStyle = C.rockLit;
      else ctx.fillStyle = C.spark;
      ctx.globalAlpha = p.type === 'spark' ? Math.max(0, 1 - p.life / p.max) : 1;
      ctx.fillRect(Math.round(p.x) + p.side * SW, Math.round(p.y), p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- 地形（单屏 320 宽内绘制） ---------- */
  function band(y, h, color) { ctx.fillStyle = color; ctx.fillRect(0, y, SW, h); }

  function terrain(kind, t) {
    if (kind === 'snow') {
      band(0, 74, '#0E1B28'); band(74, 40, '#1B3348'); band(114, 66, '#264760');
      ctx.fillStyle = '#3D5F7A';
      for (var i = 0; i < 5; i++) {
        var bx = i * 70 - 20, bh = 34 + (i % 3) * 12;
        for (var r = 0; r < bh; r += 4) ctx.fillRect(bx + r, 118 - bh + r, 70 - r * 2, 4);
      }
      band(150, 30, C.snow); ctx.fillStyle = C.snowShade; ctx.fillRect(0, 150, SW, 4);
      for (var j = 0; j < 6; j++) {
        var tx = 12 + j * 54;
        ctx.fillStyle = '#12392C';
        for (var k = 0; k < 4; k++) ctx.fillRect(tx + k * 3, 138 - k * 8, 16 - k * 6, 8);
        ctx.fillStyle = '#0C2A20'; ctx.fillRect(tx + 6, 148, 4, 8);
      }
    } else if (kind === 'forest') {
      band(0, 120, '#0A1A12'); band(120, 60, '#123423');
      ctx.fillStyle = '#0E2418';
      for (var a = 0; a < 7; a++) ctx.fillRect(a * 48, 30, 10, 130);
      ctx.fillStyle = '#1B4A2E';
      for (var b = 0; b < 9; b++) {
        var cx = b * 38 - 10, cy = 16 + (b % 3) * 10;
        ctx.fillRect(cx, cy, 34, 12); ctx.fillRect(cx + 6, cy + 12, 22, 8);
      }
      ctx.fillStyle = '#0F2E1E'; ctx.fillRect(0, 150, SW, 30);
      ctx.fillStyle = '#1C4630'; ctx.fillRect(0, 150, SW, 3);
      ctx.fillStyle = '#2A6B45';
      for (var c = 0; c < 5; c++) {
        var vx = 30 + c * 62, sway = Math.round(Math.sin(t * 1.4 + c) * 3);
        for (var d = 0; d < 5; d++) ctx.fillRect(vx + sway + d, 40 + d * 12, 2, 10);
      }
    } else if (kind === 'desert') {
      band(0, 90, '#4A2A0E'); band(90, 40, '#8A5418'); band(130, 50, C.sand);
      ctx.fillStyle = C.sun; ctx.fillRect(238, 26, 26, 26); ctx.fillRect(242, 22, 18, 34); ctx.fillRect(234, 30, 34, 18);
      ctx.fillStyle = C.dune;
      for (var e = 0; e < 4; e++) {
        var dx = e * 90 - 20, dh = 22 + (e % 2) * 10;
        for (var f = 0; f < dh; f += 3) ctx.fillRect(dx + f * 2, 150 - dh + f, 90 - f * 3, 3);
      }
      ctx.fillStyle = '#C98F3D'; ctx.fillRect(0, 168, SW, 12);
      ctx.globalAlpha = 0.18; ctx.fillStyle = C.spark;
      for (var g = 0; g < 4; g++) ctx.fillRect(0, 118 + g * 8 + Math.round(Math.sin(t * 3 + g) * 3), SW, 1);
      ctx.globalAlpha = 1;
    } else if (kind === 'quarry') {
      band(0, 60, '#14161A'); band(60, 60, '#20242A'); band(120, 60, C.rock);
      ctx.fillStyle = C.rockDark;
      for (var h = 0; h < 8; h++) {
        var wx = h * 42, wh = 40 + (h % 3) * 24;
        ctx.fillRect(wx, 60 + (60 - wh), 38, wh);
      }
      ctx.fillStyle = C.rock; ctx.fillRect(0, 162, SW, 18);
      ctx.fillStyle = C.rockDark;
      for (var k2 = 0; k2 < 9; k2++) ctx.fillRect(k2 * 38 + 6, 162, 20, 6);
      ctx.fillStyle = '#0B0C0E';
      ctx.fillRect(96, 150, 48, 12); ctx.fillRect(104, 144, 32, 6);
      ctx.fillRect(196, 152, 40, 10); ctx.fillRect(204, 146, 24, 6);
    } else {
      band(0, 60, '#0A2A3A'); band(60, 60, '#12465E'); band(120, 60, C.water);
      ctx.globalAlpha = 0.16; ctx.fillStyle = C.bubble;
      for (var m = 0; m < 3; m++) {
        var lx = 40 + m * 96 + Math.round(Math.sin(t * 0.8 + m) * 6);
        for (var n = 0; n < 12; n++) ctx.fillRect(lx + n * 3, 0, 6, 150 - n * 8);
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = C.waterDeep; ctx.fillRect(0, 158, SW, 22);
      ctx.fillStyle = '#2F8A6B';
      for (var q = 0; q < 7; q++) {
        var gx = 16 + q * 46, sway2 = Math.round(Math.sin(t * 2 + q * 0.9) * 4);
        for (var r2 = 0; r2 < 5; r2++) ctx.fillRect(gx + sway2 + r2 - 2, 158 - r2 * 8, 3, 8);
      }
    }
  }

  /* ---------- 危险物：dir=1 从左来（法师侧），dir=-1 从右来（战士侧） ---------- */
  function hazard(kind, p, t, dir) {
    if (p <= 0) return;
    var a = Math.min(1, p);
    if (kind === 'snow') {
      for (var i = 0; i < 22; i++) {
        var d = a * 1.4 - i * 0.03;
        if (d < 0 || d > 1) continue;
        var x = dir > 0 ? 40 + i * 12 - d * 150 : SW - 54 - i * 12 + d * 150;
        var y = 40 + d * 96 + (i % 4) * 7;
        ctx.fillStyle = i % 3 ? C.snow : C.snowShade;
        ctx.fillRect(Math.round(x), Math.round(y), 14, 11);
      }
    } else if (kind === 'forest') {
      ctx.fillStyle = C.snake;
      for (var s = 0; s < 16; s++) {
        var sx = dir > 0 ? 300 - a * 120 - s * 9 : 20 + a * 120 + s * 9 - 9;
        var sy = 138 + Math.round(Math.sin(t * 5 + s * 0.6) * 7);
        ctx.fillRect(Math.round(sx), sy, 9, 5);
      }
      var hx = dir > 0 ? 300 - a * 120 : 20 + a * 120;
      ctx.fillStyle = C.snakeLit; ctx.fillRect(Math.round(hx), 136, 7, 4);
      ctx.fillStyle = C.ember; ctx.fillRect(Math.round(hx) + 4, 137, 3, 2);
    } else if (kind === 'desert') {
      ctx.fillStyle = '#A8762E';
      for (var c = 0; c < 6; c++) {
        var cx = 30 + c * 52;
        ctx.fillRect(cx, 158, 22, 2); ctx.fillRect(cx + 6, 155, 2, 6);
      }
      ctx.globalAlpha = 0.5 * a; ctx.fillStyle = C.dune;
      for (var k = 0; k < 5; k++) ctx.fillRect(0, 150 - k * 10 - a * 20, SW, 6);
      ctx.globalAlpha = 1;
    } else if (kind === 'quarry') {
      var gx = dir > 0 ? SW - a * 110 : a * 110 - 30;
      ctx.fillStyle = C.rock;
      ctx.fillRect(gx, 116, 30, 34); ctx.fillRect(gx + 4, 100, 22, 18);
      ctx.fillRect(gx - 6, 122, 8, 20); ctx.fillRect(gx + 28, 122, 8, 20);
      ctx.fillRect(gx + 4, 150, 8, 12); ctx.fillRect(gx + 18, 150, 8, 12);
      ctx.fillStyle = C.rockDark; ctx.fillRect(gx + 4, 100, 22, 3);
      ctx.fillStyle = C.ember;
      ctx.fillRect(gx + 9, 106, 4, 4); ctx.fillRect(gx + 18, 106, 4, 4);
    } else {
      ctx.globalAlpha = 0.3 * a; ctx.fillStyle = C.bubble;
      for (var w2 = 0; w2 < 6; w2++) {
        ctx.fillRect(0, 40 + w2 * 18 + Math.round(Math.sin(t * 4 + w2) * 4), SW, 3);
      }
      ctx.globalAlpha = 1;
    }
  }

  /* ---------- 技能特效 ---------- */
  function effect(kind, p, t, hx, hy, dir) {
    if (p <= 0) return;
    var a = Math.min(1, p);
    var flip = dir < 0 ? -1 : 1;
    function rx(v) { return dir < 0 ? SW - v : v; }
    if (kind === 'icewall') {
      for (var i = 0; i < 9; i++) {
        var h = Math.max(0, Math.min(1, a * 1.8 - i * 0.08)) * 56;
        if (h <= 0) continue;
        var bx = rx(hx + 16 + i * 7 + 6);
        ctx.fillStyle = C.ice; ctx.fillRect(bx, hy + 26 - h, 6, h);
        ctx.fillStyle = C.iceLit; ctx.fillRect(bx + 1, hy + 26 - h, 2, h);
      }
    } else if (kind === 'fire') {
      for (var f = 0; f < 7; f++) {
        var fh = 6 + Math.round(Math.abs(Math.sin(t * 12 + f)) * 10) * a;
        var fx = rx(hx + 16 + f * 9);
        ctx.fillStyle = f % 2 ? C.ember : C.flame;
        ctx.fillRect(dir > 0 ? fx : fx - 8, hy + 20 - fh, 8, fh);
      }
      ctx.fillStyle = C.spark; ctx.fillRect(rx(hx + 20), hy + 12, 4, 4);
    } else if (kind === 'orb') {
      var oy = hy + 10 - Math.round(Math.sin(a * Math.PI) * 10);
      var ox2 = hx + 18;
      ctx.fillStyle = C.cyan;
      ctx.fillRect(ox2, oy, 8, 8); ctx.fillRect(ox2 - 2, oy + 2, 12, 4);
      ctx.fillStyle = C.iceLit; ctx.fillRect(ox2 + 2, oy + 2, 3, 3);
    } else if (kind === 'petrify') {
      ctx.globalAlpha = 0.7 * a; ctx.fillStyle = C.rockLit;
      ctx.fillRect(200, 92, 44, 68);
      ctx.globalAlpha = 1; ctx.fillStyle = C.rockDark;
      for (var c = 0; c < 4; c++) ctx.fillRect(206 + c * 10, 100 + c * 14, 3, 12);
    } else if (kind === 'bubble') {
      ctx.strokeStyle = C.bubble; ctx.lineWidth = 2;
      var r = 20 + a * 10;
      ctx.beginPath(); ctx.arc(hx + 16, hy + 18, r, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = C.iceLit;
      for (var b = 0; b < 6; b++) {
        var ang = t * 3 + b * 1.05;
        ctx.fillRect(Math.round(hx + 16 + Math.cos(ang) * r), Math.round(hy + 18 + Math.sin(ang) * r), 3, 3);
      }
    } else if (kind === 'shield') {
      var sx2 = dir > 0 ? hx + 28 : hx - 8;
      ctx.fillStyle = C.rockLit; ctx.fillRect(sx2, hy + 10, 6, 22);
      ctx.fillStyle = C.spark; ctx.fillRect(sx2 - 2, hy + 14, 10, 4);
      ctx.fillStyle = C.rock;
      for (var k = 0; k < 8; k++) {
        var px = (dir > 0 ? 210 : 40) + (k % 4) * 12 - Math.round(a * 20);
        ctx.fillRect(px, 150 + Math.floor(k / 4) * 10 - Math.round(Math.sin(a * 3) * 6), 8, 6);
      }
    } else if (kind === 'slash') {
      for (var s = 0; s < 6; s++) {
        if (a * 6 <= s) continue;
        ctx.globalAlpha = 0.9 - s * 0.12;
        ctx.fillStyle = C.white;
        var bx2 = dir > 0 ? hx + 26 + s * 10 : hx - 6 - s * 10;
        ctx.fillRect(bx2, hy + 14 - s * 4, 6, 30 - s * 3);
      }
      ctx.globalAlpha = 1; ctx.fillStyle = C.cyan;
      ctx.fillRect(dir > 0 ? hx + 30 : hx - 34, hy + 26, 34, 2);
    } else if (kind === 'swirl') {
      ctx.strokeStyle = C.bubble; ctx.lineWidth = 2;
      for (var w = 0; w < 3; w++) {
        ctx.beginPath();
        ctx.arc(hx + 16, hy + 18, 10 + w * 8, t * 4 + w, t * 4 + w + 4.2);
        ctx.stroke();
      }
    } else if (kind === 'charge') {
      ctx.fillStyle = C.spark;
      for (var ch = 0; ch < 6; ch++) {
        ctx.globalAlpha = 0.7 - ch * 0.1;
        ctx.fillRect(dir > 0 ? hx - ch * 12 : hx + 32 + ch * 12, hy + 12 + (ch % 2) * 6, 10, 6);
      }
      ctx.globalAlpha = 1; ctx.fillStyle = C.iceLit;
      ctx.fillRect(hx + 6, hy + 26, 30, 4);
    } else if (kind === 'blade') {
      ctx.fillStyle = C.rockLit; ctx.fillRect(hx + 20, hy + 6, 4, 26);
      ctx.globalAlpha = 0.8 * a; ctx.fillStyle = C.spark;
      ctx.fillRect(hx + 24, hy + 4, 3, 28);
      ctx.globalAlpha = 1;
    }
  }

  /* ---------- 角色 ---------- */
  function drawHero(who, x, y, t, moving, flip) {
    if (!SPR) return;
    var sprite = null, i;
    for (i = 0; i < SPR.sprites.length; i++) if (SPR.sprites[i].id === who) sprite = SPR.sprites[i];
    if (!sprite) return;
    var pal = SPR.palette, U = 1;
    var bob = moving ? Math.round(Math.sin(t * 9) * 1) : 0;
    ctx.save();
    // 镜像：右屏的战士水平翻转，剑朝向中心，两人严格对阵
    if (flip) { ctx.translate(Math.round(x) + 32, Math.round(y + bob)); ctx.scale(-1, 1); }
    else { ctx.translate(Math.round(x), Math.round(y + bob)); }
    var rs = sprite.rects, r;
    for (i = 0; i < rs.length; i++) {
      r = rs[i];
      if (r[5]) { ctx.fillStyle = pal.K; ctx.fillRect((r[0] - 1) * U, (r[1] - 1) * U, (r[2] + 2) * U, (r[3] + 2) * U); }
    }
    for (i = 0; i < rs.length; i++) {
      r = rs[i]; ctx.fillStyle = pal[r[4]]; ctx.fillRect(r[0] * U, r[1] * U, r[2] * U, r[3] * U);
    }
    ctx.restore();
  }

  function phaseOf(t) {
    var a = SEG.enter, b = a + SEG.walk, c = b + SEG.hazard, d = c + SEG.act,
        e = d + SEG.clear, f = e + SEG.exit;
    if (t < a) return { n: 'enter', p: t / a };
    if (t < b) return { n: 'walk', p: (t - a) / SEG.walk };
    if (t < c) return { n: 'hazard', p: (t - b) / SEG.hazard };
    if (t < d) return { n: 'act', p: (t - c) / SEG.act };
    if (t < e) return { n: 'clear', p: (t - d) / SEG.clear };
    return { n: 'exit', p: (t - e) / SEG.exit };
  }

  /* 左侧角色站在 x=36 朝右，右侧角色站在 x=SW-68 朝左 */
  function heroX(side, ph) {
    var home = side === 0 ? 34 : SW - 66;
    var off = side === 0 ? -40 : SW + 8;
    if (ph.n === 'walk') return off + (home - off) * ph.p;
    if (ph.n === 'exit') return home + ph.p * (side === 0 ? 4 : -4);
    return home;
  }

  /* ---------- HUD ---------- */
  var elIdx = document.getElementById('quest-idx');
  var elPlace = document.getElementById('quest-place');
  var elTech = document.getElementById('quest-tech');
  var track = document.getElementById('quest-track');

  function paintTrack() {
    if (!track) return;
    var dots = track.children;
    for (var i = 0; i < dots.length; i++) {
      dots[i].className = 'trk__dot' +
        (i < state.k ? ' is-done' : '') +
        (i === state.k && !state.meeting ? ' is-cur' : '');
    }
  }

  function syncHud() {
    if (state.meeting) return;
    var st = STAGES[state.k];
    if (elIdx) elIdx.textContent = ('0' + (state.k + 1)).slice(-2);
    if (elPlace) elPlace.textContent = st.l.place + ' ↔ ' + st.r.place;
    if (elTech) elTech.textContent = st.l.tech + ' / ' + st.r.tech;
    paintTrack();
  }

  /* ---------- 渲染 ---------- */
  var state = { k: 0, t: 0, meeting: false, mt: 0 };

  function drawScreen(side, cfg, ph, t) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(side * SW, 0, SW, H);
    ctx.clip();
    ctx.translate(side * SW, 0);

    terrain(cfg.env, t);

    var hz = 0;
    if (ph.n === 'hazard') hz = ph.p;
    else if (ph.n === 'act') hz = 1;
    else if (ph.n === 'clear') hz = 1 - ph.p * 0.7;
    else if (ph.n === 'exit') hz = 0.15;
    hazard(cfg.env, hz, t, side === 0 ? 1 : -1);

    var hx = heroX(side, ph);
    drawHero(side === 0 ? 'mage' : 'knight', hx, 120, t,
             ph.n === 'walk' || ph.n === 'exit', side === 1);

    var ep = ph.n === 'act' ? ph.p : (ph.n === 'clear' ? 1 : 0);
    effect(cfg.act, ep, t, hx, 120, side === 0 ? 1 : -1);

    ctx.restore();
  }

  function drawDivider(t, gap) {
    // 中间分屏线：相遇时从中间裂开
    var half = gap / 2;
    ctx.fillStyle = 'rgba(11,12,14,0.9)';
    ctx.fillRect(SW - 2, 0, 4, Math.max(0, H / 2 - half));
    ctx.fillRect(SW - 2, Math.min(H, H / 2 + half), 4, Math.max(0, H / 2 - half));
    ctx.fillStyle = C.ember;
    ctx.fillRect(SW - 1, 0, 1, Math.max(0, H / 2 - half));
    ctx.fillRect(SW - 1, Math.min(H, H / 2 + half), 1, Math.max(0, H / 2 - half));
  }

  function render(ph, t) {
    var st = STAGES[state.k];
    ctx.clearRect(0, 0, W, H);
    drawScreen(0, st.l, ph, t);
    drawScreen(1, st.r, ph, t);
    stepParts(1 / 60);
    drawParts();
    drawDivider(t, 0);

    if (ph.n === 'enter') {
      var rows = Math.round((1 - ph.p) * 9);
      ctx.fillStyle = '#0B0C0E';
      for (var i = 0; i < rows; i++) ctx.fillRect(0, i * 20, W, 20);
      for (var j = 0; j < rows; j++) ctx.fillRect(0, H - (j + 1) * 20, W, 20);
    }
    if (ph.n === 'exit') {
      var r2 = Math.round(ph.p * 9);
      ctx.fillStyle = '#0B0C0E';
      for (var a = 0; a < r2; a++) ctx.fillRect(0, a * 20, W, 20);
      for (var b = 0; b < r2; b++) ctx.fillRect(0, H - (b + 1) * 20, W, 20);
    }
  }

  /* ---------- 相遇：破屏 ---------- */
  function drawMeeting(t) {
    ctx.clearRect(0, 0, W, H);
    // 两侧地形连成一片
    ctx.save(); ctx.translate(0, 0); terrain('snow', t); ctx.restore();
    ctx.save(); ctx.translate(SW, 0); terrain('snow', t); ctx.restore();

    var gapP = Math.min(1, t / 1.4);
    drawDivider(t, gapP * 190);

    // 中央篝火
    ctx.fillStyle = C.deep; ctx.fillRect(SW - 14, 152, 28, 6);
    var fh = 10 + Math.round(Math.abs(Math.sin(t * 8)) * 10);
    ctx.fillStyle = C.ember; ctx.fillRect(SW - 10, 152 - fh, 20, fh);
    ctx.fillStyle = C.flame; ctx.fillRect(SW - 6, 152 - fh + 5, 12, fh - 5);
    ctx.fillStyle = C.spark; ctx.fillRect(SW - 3, 152 - fh + 10, 6, 5);

    // 法师从左走到中线右侧，战士从右走到中线左侧 —— 互相跨越
    var p = Math.min(1, Math.max(0, (t - 0.6) / 1.8));
    // 法师终点 326（跨到右屏），战士终点 282（跨到左屏），中间留 12px 给篝火
    var mx = -34 + (SW + 40) * p;
    var kx = (W + 34) - ((W + 34) - (SW - 38)) * p;
    // 相遇时法师在右、战士在左，隔着篝火相对
    drawHero('mage', Math.round(mx), 120, t, p < 1, true);
    drawHero('knight', Math.round(kx), 120, t, p < 1, false);

    if (t > 2.2) {
      for (var i = 0; i < 7; i++) {
        var ang = t * 1.6 + i * 0.9;
        var rr = 24 + Math.sin(t * 3 + i) * 5;
        ctx.fillStyle = i % 2 ? C.spark : C.cyan;
        ctx.fillRect(Math.round(SW + Math.cos(ang) * rr), Math.round(96 + Math.sin(ang) * rr * 0.55), 3, 3);
      }
    }
    spawn(0, 'spark', 1); spawn(1, 'spark', 1);
    stepParts(1 / 60);
    drawParts();
  }

  /* ---------- 主循环 ---------- */
  var last = 0, partsInit = false;

  function frame(now) {
    if (!last) last = now;
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (state.meeting) {
      state.mt += dt;
      drawMeeting(state.mt);
      if (state.mt > MEET + 2.6) {
        state.meeting = false; state.mt = 0; state.k = 0; state.t = 0;
        parts = []; partsInit = false;
      }
      requestAnimationFrame(frame);
      return;
    }

    state.t += dt;
    if (state.t > TOTAL) {
      state.k++; state.t = 0; parts = []; partsInit = false;
      if (state.k >= STAGES.length) { state.meeting = true; state.mt = 0; }
      else syncHud();
    }

    if (!partsInit) {
      var st = STAGES[Math.min(state.k, STAGES.length - 1)];
      seedParts(st.l.env, st.r.env);
      if (state.k < STAGES.length) syncHud();
      partsInit = true;
    }

    render(phaseOf(state.t), state.t);
    requestAnimationFrame(frame);
  }

  function partOf(env) {
    return env === 'snow' ? 'snow' : env === 'forest' ? 'leaf' : env === 'desert' ? 'sand' : env === 'quarry' ? 'rock' : 'bubble';
  }
  function seedParts(leftEnv, rightEnv) {
    parts = [];
    spawn(0, partOf(leftEnv), 16);
    spawn(1, partOf(rightEnv), 16);
  }

  function drawStatic() {
    var st = STAGES[state.k % STAGES.length];
    ctx.clearRect(0, 0, W, H);
    drawScreen(0, st.l, { n: 'act', p: 0.8 }, 0);
    drawScreen(1, st.r, { n: 'act', p: 0.8 }, 0);
    drawDivider(0, 0);
    syncHud();
  }

  /* 调试：?k=2&t=2.4 定格；?meet=1&t=2 看相遇 */
  var qs = new URLSearchParams(location.search);
  var fixT = parseFloat(qs.get('t'));
  var fixK = parseInt(qs.get('k') || '0', 10);
  var isMeet = qs.get('meet') === '1';

  loadSprites().then(function () {
    if (!isNaN(fixT)) {
      if (isMeet) { drawMeeting(fixT); return; }
      state.k = Math.min(Math.max(fixK, 0), STAGES.length - 1);
      var st = STAGES[state.k];
      syncHud();
      seedParts(st.l.env, st.r.env);
      render(phaseOf(fixT), fixT);
      return;
    }
    if (reduce) { drawStatic(); return; }
    requestAnimationFrame(frame);
  }).catch(function () { /* 精灵加载失败就留空，不阻塞页面 */ });

  var visible = true;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (en) {
      visible = en[0].isIntersecting;
      if (visible && !reduce) { last = 0; requestAnimationFrame(frame); }
    }, { threshold: 0.05 }).observe(canvas);
  }
})();
