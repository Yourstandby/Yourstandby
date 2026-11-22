/* 十关闯关动画：Canvas 2D，320x180 内部分辨率，整数倍放大。
   法师从左、战士从右，各自 5 关向中间推进，最后在中央相遇。 */
(function () {
  'use strict';
  var canvas = document.getElementById('quest-canvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  var W = canvas.width, H = canvas.height;
  var BASE = canvas.getAttribute('data-base') || '';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var C = {
    ink: '#1A1D23', ember: '#FF3B1F', deep: '#C21B00', flame: '#FFB000', spark: '#FFE9A8',
    cyan: '#2BD9FF', lime: '#4CE06A', ash: '#8A6A64',
    snow: '#EAF2F7', snowShade: '#C0D3E2', ice: '#8FD4EA', iceLit: '#D8F1FA',
    snake: '#7B3FA0', snakeLit: '#B47AD8',
    sand: '#E0B15E', dune: '#C98F3D', sun: '#FFD27A',
    rock: '#5A5F66', rockDark: '#31353A', rockLit: '#8B929B',
    water: '#1F5C7A', waterDeep: '#0E2E3F', bubble: '#8FE3F0',
    white: '#FFFFFF'
  };

  /* ---------- 关卡表：交替推进，双方的顺序互为倒序 ---------- */
  var LEVELS = [
    { who: 'mage', env: 'snow', act: 'icewall', place: '雪原', tech: '法杖点地，一道冰墙拔地而起挡住雪崩' },
    { who: 'knight', env: 'water', act: 'swirl', place: '水底', tech: '大剑搅出涡流，借水流把自己推出去' },
    { who: 'mage', env: 'forest', act: 'fire', place: '原始森林', tech: '杖头迸出火星，毒蛇退进藤蔓深处' },
    { who: 'knight', env: 'quarry', act: 'shield', place: '石坑', tech: '盾面撞击石人膝关节，追兵碎成一地' },
    { who: 'mage', env: 'desert', act: 'orb', place: '沙漠', tech: '凝出一颗水球，拖着身子喝下去' },
    { who: 'knight', env: 'desert', act: 'blade', place: '沙漠', tech: '大剑插进沙里遮阴，靠剑刃反光找到绿洲' },
    { who: 'mage', env: 'quarry', act: 'petrify', place: '石坑', tech: '石化咒把追兵定在原地' },
    { who: 'knight', env: 'forest', act: 'slash', place: '原始森林', tech: '横扫一剑，藤蔓和蛇一起断了' },
    { who: 'mage', env: 'water', act: 'bubble', place: '水底', tech: '撑开呼吸法阵，气泡裹住全身' },
    { who: 'knight', env: 'snow', act: 'charge', place: '雪原', tech: '盾当滑板，从雪崩底下冲过去' }
  ];

  var SEG = { enter: 0.6, walk: 0.9, hazard: 1.1, act: 1.3, clear: 0.9, exit: 0.7 };
  var TOTAL = SEG.enter + SEG.walk + SEG.hazard + SEG.act + SEG.clear + SEG.exit;
  var MEET = 3.6;

  var SPR = null;

  function loadSprites() {
    if (SPR) return Promise.resolve(SPR);
    return fetch(BASE + '/sprites.json', { cache: 'force-cache' })
      .then(function (r) { return r.json(); })
      .then(function (d) { SPR = d; return d; });
  }

  var parts = [];
  var state = { i: 0, t: 0, meeting: false, mt: 0 };

  /* ---------- 粒子 ---------- */
  function spawn(type, n) {
    for (var i = 0; i < n; i++) {
      var p = { type: type, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 1 };
      if (type === 'snow') {
        p.x = Math.random() * W; p.y = Math.random() * H;
        p.vx = -6 - Math.random() * 10; p.vy = 8 + Math.random() * 14;
        p.size = Math.random() < 0.35 ? 2 : 1;
      } else if (type === 'leaf') {
        p.x = Math.random() * W; p.y = -8 - Math.random() * 40;
        p.vx = -4 + Math.random() * 8; p.vy = 10 + Math.random() * 12;
        p.size = 2;
      } else if (type === 'sand') {
        p.x = -10 + Math.random() * 40; p.y = 40 + Math.random() * 120;
        p.vx = 40 + Math.random() * 60; p.vy = -4 + Math.random() * 8;
        p.size = 1;
      } else if (type === 'bubble') {
        p.x = 20 + Math.random() * (W - 40); p.y = H;
        p.vx = -2 + Math.random() * 4; p.vy = -16 - Math.random() * 22;
        p.size = Math.random() < 0.3 ? 3 : 2;
      } else if (type === 'rock') {
        p.x = Math.random() * W; p.y = -6;
        p.vx = 0; p.vy = 40 + Math.random() * 40;
        p.size = 2;
      } else if (type === 'spark') {
        p.x = 0; p.y = 0; p.vy = -30 - Math.random() * 40; p.vx = -20 + Math.random() * 40;
        p.size = 2;
      }
      p.max = 1 + Math.random() * 2;
      parts.push(p);
    }
  }

  function stepParts(dt) {
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.life += dt;
      if (p.type === 'snow' && p.y > H) { p.y = -4; p.x = Math.random() * W; }
      if (p.type === 'sand' && p.x > W + 10) { p.x = -10; p.y = 40 + Math.random() * 120; }
      if (p.type === 'bubble' && p.y < -6) { p.y = H + 4; p.x = 20 + Math.random() * (W - 40); }
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
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- 环境 ---------- */
  function band(y, h, color) { ctx.fillStyle = color; ctx.fillRect(0, y, W, h); }

  function terrain(kind, t) {
    if (kind === 'snow') {
      band(0, 74, '#0E1B28'); band(74, 40, '#1B3348'); band(114, 66, '#264760');
      // 远山
      ctx.fillStyle = '#3D5F7A';
      for (var i = 0; i < 5; i++) {
        var bx = i * 70 - 20, bh = 34 + (i % 3) * 12;
        for (var r = 0; r < bh; r += 4) ctx.fillRect(bx + r, 118 - bh + r, 70 - r * 2, 4);
      }
      // 地面
      band(150, 30, C.snow);
      ctx.fillStyle = C.snowShade; ctx.fillRect(0, 150, W, 4);
      // 松树
      for (var j = 0; j < 6; j++) {
        var tx = 12 + j * 54;
        ctx.fillStyle = '#12392C';
        for (var k = 0; k < 4; k++) ctx.fillRect(tx + k * 3, 138 - k * 8, 16 - k * 6, 8);
        ctx.fillStyle = '#0C2A20'; ctx.fillRect(tx + 6, 148, 4, 8);
      }
    } else if (kind === 'forest') {
      band(0, 120, '#0A1A12'); band(120, 60, '#123423');
      ctx.fillStyle = '#0E2418';
      for (var a = 0; a < 7; a++) { ctx.fillRect(a * 48, 30, 10, 130); }
      ctx.fillStyle = '#1B4A2E';
      for (var b = 0; b < 9; b++) {
        var cx = b * 38 - 10, cy = 16 + (b % 3) * 10;
        ctx.fillRect(cx, cy, 34, 12); ctx.fillRect(cx + 6, cy + 12, 22, 8);
      }
      ctx.fillStyle = '#0F2E1E'; ctx.fillRect(0, 150, W, 30);
      ctx.fillStyle = '#1C4630'; ctx.fillRect(0, 150, W, 3);
      // 藤蔓
      ctx.fillStyle = '#2A6B45';
      for (var c = 0; c < 5; c++) {
        var vx = 30 + c * 62, sway = Math.round(Math.sin(t * 1.4 + c) * 3);
        for (var d = 0; d < 5; d++) ctx.fillRect(vx + sway + d, 40 + d * 12, 2, 10);
      }
    } else if (kind === 'desert') {
      band(0, 90, '#4A2A0E'); band(90, 40, '#8A5418'); band(130, 50, C.sand);
      // 太阳
      ctx.fillStyle = C.sun; ctx.fillRect(238, 26, 26, 26); ctx.fillRect(242, 22, 18, 34); ctx.fillRect(234, 30, 34, 18);
      // 沙丘
      ctx.fillStyle = C.dune;
      for (var e = 0; e < 4; e++) {
        var dx = e * 90 - 20, dh = 22 + (e % 2) * 10;
        for (var f = 0; f < dh; f += 3) ctx.fillRect(dx + f * 2, 150 - dh + f, 90 - f * 3, 3);
      }
      ctx.fillStyle = '#C98F3D'; ctx.fillRect(0, 168, W, 12);
      // 热浪
      ctx.globalAlpha = 0.18;
      for (var g = 0; g < 4; g++) {
        ctx.fillStyle = C.spark;
        ctx.fillRect(0, 118 + g * 8 + Math.round(Math.sin(t * 3 + g) * 3), W, 1);
      }
      ctx.globalAlpha = 1;
    } else if (kind === 'quarry') {
      band(0, 60, '#14161A'); band(60, 60, '#20242A'); band(120, 60, C.rock);
      ctx.fillStyle = C.rockDark;
      for (var h = 0; h < 8; h++) {
        var wx = h * 42, wh = 40 + (h % 3) * 24;
        ctx.fillRect(wx, 60 + (60 - wh), 38, wh);
      }
      ctx.fillStyle = C.rock; ctx.fillRect(0, 162, W, 18);
      ctx.fillStyle = C.rockDark;
      for (var k2 = 0; k2 < 9; k2++) ctx.fillRect(k2 * 38 + 6, 162, 20, 6);
      // 石坑
      ctx.fillStyle = '#0B0C0E';
      ctx.fillRect(96, 150, 48, 12); ctx.fillRect(104, 144, 32, 6);
      ctx.fillRect(196, 152, 40, 10); ctx.fillRect(204, 146, 24, 6);
    } else {
      band(0, 60, '#0A2A3A'); band(60, 60, '#12465E'); band(120, 60, C.water);
      // 光柱
      ctx.globalAlpha = 0.16; ctx.fillStyle = C.bubble;
      for (var m = 0; m < 3; m++) {
        var lx = 40 + m * 96 + Math.round(Math.sin(t * 0.8 + m) * 6);
        for (var n = 0; n < 12; n++) ctx.fillRect(lx + n * 3, 0, 6, 150 - n * 8);
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = C.waterDeep; ctx.fillRect(0, 158, W, 22);
      // 水草
      ctx.fillStyle = '#2F8A6B';
      for (var q = 0; q < 7; q++) {
        var gx = 16 + q * 46, sway2 = Math.round(Math.sin(t * 2 + q * 0.9) * 4);
        for (var r2 = 0; r2 < 5; r2++) ctx.fillRect(gx + sway2 + r2 - 2, 158 - r2 * 8, 3, 8);
      }
    }
  }

  /* ---------- 危险物 ---------- */
  function hazard(kind, p, t) {
    if (p <= 0) return;
    var a = Math.min(1, p);
    if (kind === 'snow') {
      // 雪崩：从左上滚下的团块
      for (var i = 0; i < 22; i++) {
        var d = a * 1.4 - i * 0.03;
        if (d < 0 || d > 1) continue;
        var x = 40 + i * 12 - d * 150;
        var y = 40 + d * 96 + (i % 4) * 7;
        ctx.fillStyle = i % 3 ? C.snow : C.snowShade;
        ctx.fillRect(Math.round(x), Math.round(y), 14, 11);
      }
    } else if (kind === 'forest') {
      // 毒蛇：S 形逼近
      ctx.fillStyle = C.snake;
      for (var s = 0; s < 16; s++) {
        var sx = 300 - a * 120 - s * 9;
        var sy = 138 + Math.round(Math.sin(t * 5 + s * 0.6) * 7);
        ctx.fillRect(Math.round(sx), sy, 9, 5);
      }
      ctx.fillStyle = C.snakeLit; ctx.fillRect(Math.round(300 - a * 120), 136, 7, 4);
      ctx.fillStyle = C.ember; ctx.fillRect(Math.round(300 - a * 120) + 4, 137, 3, 2);
    } else if (kind === 'desert') {
      // 干裂地面 + 逼近的沙暴
      ctx.fillStyle = '#A8762E';
      for (var c = 0; c < 6; c++) {
        var cx = 30 + c * 52;
        ctx.fillRect(cx, 158, 22, 2); ctx.fillRect(cx + 6, 155, 2, 6);
      }
      ctx.globalAlpha = 0.5 * a;
      ctx.fillStyle = C.dune;
      for (var k = 0; k < 5; k++) {
        ctx.fillRect(0, 150 - k * 10 - a * 20, W, 6);
      }
      ctx.globalAlpha = 1;
    } else if (kind === 'quarry') {
      // 石头人：从右侧逼近
      var gx = 320 - a * 110;
      ctx.fillStyle = C.rock;
      ctx.fillRect(gx, 116, 30, 34);            // 身体
      ctx.fillRect(gx + 4, 100, 22, 18);        // 头
      ctx.fillRect(gx - 6, 122, 8, 20);         // 左臂
      ctx.fillRect(gx + 28, 122, 8, 20);        // 右臂
      ctx.fillRect(gx + 4, 150, 8, 12);
      ctx.fillRect(gx + 18, 150, 8, 12);
      ctx.fillStyle = C.rockDark;
      ctx.fillRect(gx + 4, 100, 22, 3);
      ctx.fillStyle = C.ember;
      ctx.fillRect(gx + 9, 106, 4, 4); ctx.fillRect(gx + 18, 106, 4, 4);
    } else {
      // 水下：暗流
      ctx.globalAlpha = 0.3 * a;
      ctx.fillStyle = C.bubble;
      for (var w2 = 0; w2 < 6; w2++) {
        ctx.fillRect(0, 40 + w2 * 18 + Math.round(Math.sin(t * 4 + w2) * 4), W, 3);
      }
      ctx.globalAlpha = 1;
    }
  }

  /* ---------- 角色技能特效 ---------- */
  function effect(kind, p, t, hx, hy) {
    if (p <= 0) return;
    var a = Math.min(1, p);
    if (kind === 'icewall') {
      for (var i = 0; i < 9; i++) {
        var h = Math.max(0, Math.min(1, a * 1.8 - i * 0.08)) * 56;
        if (h <= 0) continue;
        ctx.fillStyle = C.ice;
        ctx.fillRect(hx + 16 + i * 7, hy + 26 - h, 6, h);
        ctx.fillStyle = C.iceLit;
        ctx.fillRect(hx + 17 + i * 7, hy + 26 - h, 2, h);
      }
    } else if (kind === 'fire') {
      for (var f = 0; f < 7; f++) {
        var fh = 6 + Math.round(Math.abs(Math.sin(t * 12 + f)) * 10) * a;
        ctx.fillStyle = f % 2 ? C.ember : C.flame;
        ctx.fillRect(hx + 16 + f * 9, hy + 20 - fh, 8, fh);
      }
      ctx.fillStyle = C.spark;
      ctx.fillRect(hx + 20, hy + 12, 4, 4);
    } else if (kind === 'orb') {
      var oy = hy + 10 - Math.round(Math.sin(a * Math.PI) * 10);
      ctx.fillStyle = C.cyan;
      ctx.fillRect(hx + 18, oy, 8, 8); ctx.fillRect(hx + 16, oy + 2, 12, 4);
      ctx.fillStyle = C.iceLit; ctx.fillRect(hx + 20, oy + 2, 3, 3);
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
      ctx.fillStyle = C.rockLit;
      ctx.fillRect(hx + 28, hy + 10, 6, 22);
      ctx.fillStyle = C.spark;
      ctx.fillRect(hx + 26, hy + 14, 10, 4);
      // 石人碎裂
      ctx.fillStyle = C.rock;
      for (var k = 0; k < 8; k++) {
        var px = 210 + (k % 4) * 12 - Math.round(a * 20);
        var py = 150 + Math.floor(k / 4) * 10 - Math.round(Math.sin(a * 3) * 6);
        ctx.fillRect(px, py, 8, 6);
      }
    } else if (kind === 'slash') {
      ctx.fillStyle = C.white;
      for (var s = 0; s < 6; s++) {
        var reached = a * 6 > s;
        if (!reached) continue;
        ctx.globalAlpha = 0.9 - s * 0.12;
        ctx.fillRect(hx + 26 + s * 10, hy + 14 - s * 4, 6, 30 - s * 3);
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = C.cyan;
      ctx.fillRect(hx + 30, hy + 26, 34, 2);
    } else if (kind === 'swirl') {
      ctx.strokeStyle = C.bubble; ctx.lineWidth = 2;
      for (var w = 0; w < 3; w++) {
        var rr = 10 + w * 8;
        ctx.beginPath();
        ctx.arc(hx + 16, hy + 18, rr, t * 4 + w, t * 4 + w + 4.2);
        ctx.stroke();
      }
    } else if (kind === 'charge') {
      ctx.fillStyle = C.spark;
      for (var ch = 0; ch < 6; ch++) {
        ctx.globalAlpha = 0.7 - ch * 0.1;
        ctx.fillRect(hx - ch * 12, hy + 12 + (ch % 2) * 6, 10, 6);
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = C.iceLit; ctx.fillRect(hx + 6, hy + 26, 30, 4);
    } else if (kind === 'blade') {
      ctx.fillStyle = C.rockLit;
      ctx.fillRect(hx + 20, hy + 6, 4, 26);
      ctx.globalAlpha = 0.8 * a; ctx.fillStyle = C.spark;
      ctx.fillRect(hx + 24, hy + 4, 3, 28);
      ctx.globalAlpha = 1;
    }
  }

  /* ---------- 角色 ---------- */
  function drawHero(who, x, y, t, act, actP) {
    if (!SPR) return;
    var sprite = null, i;
    for (i = 0; i < SPR.sprites.length; i++) if (SPR.sprites[i].id === who) sprite = SPR.sprites[i];
    if (!sprite) return;
    var pal = SPR.palette, U = 1;
    var bob = 0;
    if (actP <= 0) bob = Math.round(Math.sin(t * 9) * 1);
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y + bob));
    var rs = sprite.rects, r;
    for (i = 0; i < rs.length; i++) {
      r = rs[i];
      if (r[5]) { ctx.fillStyle = pal.K; ctx.fillRect((r[0] - 1) * U, (r[1] - 1) * U, (r[2] + 2) * U, (r[3] + 2) * U); }
    }
    for (i = 0; i < rs.length; i++) {
      r = rs[i];
      ctx.fillStyle = pal[r[4]];
      ctx.fillRect(r[0] * U, r[1] * U, r[2] * U, r[3] * U);
    }
    ctx.restore();
  }

  /* ---------- 阶段计算 ---------- */
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

  function heroX(lv, ph, t) {
    var home = lv.who === 'mage' ? 44 : 244;
    var off = lv.who === 'mage' ? -48 : 48;
    if (ph.n === 'walk') return off + (home - off) * ph.p;
    if (ph.n === 'exit') return home + (lv.who === 'mage' ? 6 : -6) * ph.p;
    return home;
  }

  /* ---------- HUD ---------- */
  var elIdx = document.getElementById('quest-idx');
  var elWho = document.getElementById('quest-who');
  var elPlace = document.getElementById('quest-place');
  var elTech = document.getElementById('quest-tech');
  var track = document.getElementById('quest-track');

  var trackM = document.getElementById('quest-track-mage');
  var trackK = document.getElementById('quest-track-knight');

  function paintTrack() {
    var mageDone = Math.ceil(state.i / 2);
    var knightDone = Math.floor(state.i / 2);
    var curWho = state.i < LEVELS.length ? LEVELS[state.i].who : '';
    var i, dots;
    if (trackM) {
      dots = trackM.children;
      for (i = 0; i < dots.length; i++) {
        dots[i].className = 'trk__dot is-mage' +
          (i < mageDone ? ' is-done' : (i === mageDone && curWho === 'mage' ? ' is-cur' : ''));
      }
    }
    if (trackK) {
      dots = trackK.children;
      for (i = 0; i < dots.length; i++) {
        // DOM 里是倒序：第 0 个是第 5 关
        var order = dots.length - 1 - i;
        dots[i].className = 'trk__dot is-knight' +
          (order < knightDone ? ' is-done' : (order === knightDone && curWho === 'knight' ? ' is-cur' : ''));
      }
    }
  }

  function syncHud() {
    if (state.meeting) return;
    var lv = LEVELS[state.i];
    if (elIdx) elIdx.textContent = ('0' + (state.i + 1)).slice(-2);
    if (elWho) elWho.textContent = lv.who === 'mage' ? '鸡毛法师' : '小白战士';
    if (elPlace) elPlace.textContent = lv.place;
    if (elTech) elTech.textContent = lv.tech;
    paintTrack();
  }

  /* ---------- 主循环 ---------- */
  var last = 0, phaseInit = false;

  function frame(now) {
    if (!last) last = now;
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (reduce) { drawStatic(); return; }

    if (state.meeting) {
      state.mt += dt;
      drawMeeting(state.mt);
      if (state.mt > MEET + 2.4) { state.meeting = false; state.mt = 0; state.i = 0; state.t = 0; phaseInit = false; parts = []; }
      requestAnimationFrame(frame);
      return;
    }

    state.t += dt;
    if (state.t > TOTAL) {
      state.i++;
      state.t = 0;
      parts = [];
      if (state.i >= LEVELS.length) { state.meeting = true; state.mt = 0; state.i = LEVELS.length; }
      else syncHud();
    }

    var lv = LEVELS[Math.min(state.i, LEVELS.length - 1)];
    var ph = phaseOf(state.t);
    if (!phaseInit) { syncHud(); resetParts(lv.env); phaseInit = true; }
    if (ph.n === 'enter' && Math.random() < 0.3) spawn(partOf(lv.env), 1);

    render(lv, ph, state.t);
    requestAnimationFrame(frame);
  }

  function partOf(env) {
    return env === 'snow' ? 'snow' : env === 'forest' ? 'leaf' : env === 'desert' ? 'sand' : env === 'quarry' ? 'rock' : 'bubble';
  }

  function resetParts(env) {
    parts = [];
    var k = partOf(env);
    spawn(k, env === 'snow' ? 26 : env === 'desert' ? 20 : 16);
  }

  function render(lv, ph, t) {
    var hx = heroX(lv, ph, t);
    ctx.clearRect(0, 0, W, H);
    terrain(lv.env, t);

    var hz = 0;
    if (ph.n === 'hazard') hz = ph.p;
    else if (ph.n === 'act') hz = 1;
    else if (ph.n === 'clear') hz = 1 - ph.p * 0.7;
    else if (ph.n === 'exit') hz = 0.15;
    hazard(lv.env, hz, t);

    stepParts(1 / 60);
    drawParts();

    drawHero(lv.who, hx, 120, t, lv.act, ph.n === 'act' ? 1 : 0);

    var ep = 0;
    if (ph.n === 'act') ep = ph.p;
    else if (ph.n === 'clear') ep = 1;
    effect(lv.act, ep, t, hx, 120);

    // 转场：像素擦除
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

  /* ---------- 相遇 ---------- */
  function drawMeeting(t) {
    ctx.clearRect(0, 0, W, H);
    terrain('snow', t);
    // 中景：一堆火
    ctx.fillStyle = C.deep; ctx.fillRect(148, 150, 24, 6);
    var fh = 10 + Math.round(Math.abs(Math.sin(t * 8)) * 8);
    ctx.fillStyle = C.ember; ctx.fillRect(152, 150 - fh, 16, fh);
    ctx.fillStyle = C.flame; ctx.fillRect(156, 150 - fh + 4, 8, fh - 4);
    ctx.fillStyle = C.spark; ctx.fillRect(158, 150 - fh + 8, 4, 4);

    var p = Math.min(1, t / 1.6);
    var mx = -32 + (128 + 32) * p;
    var kx = 320 + 32 - (160 + 32) * p;
    drawHero('mage', Math.round(mx), 120, t, '', 0);
    drawHero('knight', Math.round(kx), 120, t, '', 0);

    if (t > 1.8) {
      // 上方冒出火花
      for (var i = 0; i < 6; i++) {
        var ang = t * 1.6 + i * 1.05;
        var rr = 26 + Math.sin(t * 3 + i) * 4;
        ctx.fillStyle = i % 2 ? C.spark : C.cyan;
        ctx.fillRect(Math.round(144 + Math.cos(ang) * rr), Math.round(100 + Math.sin(ang) * rr * 0.5), 3, 3);
      }
    }
    spawn('spark', 1);
    stepParts(1 / 60);
    drawParts();
  }

  function drawStatic() {
    var lv = LEVELS[state.i % LEVELS.length];
    ctx.clearRect(0, 0, W, H);
    terrain(lv.env, 0);
    hazard(lv.env, 1, 0);
    drawHero(lv.who, lv.who === 'mage' ? 44 : 244, 120, 0, lv.act, 0);
    effect(lv.act, 1, 0, lv.who === 'mage' ? 44 : 244, 120);
    syncHud();
  }

  // 调试：?lv=3&t=2.2 定格到指定关卡的第 2.2 秒，用于截图核对
  var qs = new URLSearchParams(location.search);
  var fixT = parseFloat(qs.get('t'));
  var fixLv = parseInt(qs.get('lv') || '0', 10);

  loadSprites().then(function () {
    if (!isNaN(fixT)) {
      state.i = Math.min(Math.max(fixLv, 0), LEVELS.length - 1);
      var lv = LEVELS[state.i];
      syncHud();
      resetParts(lv.env);
      render(lv, phaseOf(fixT), fixT);
      return;
    }
    syncHud();
    if (reduce) { drawStatic(); return; }
    requestAnimationFrame(frame);
  }).catch(function () { /* 精灵加载失败就保持空白，不阻塞页面 */ });

  // 不可见时暂停
  var visible = true;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (en) {
      visible = en[0].isIntersecting;
      if (visible && !reduce) { last = 0; requestAnimationFrame(frame); }
    }, { threshold: 0.05 }).observe(canvas);
  }
})();
