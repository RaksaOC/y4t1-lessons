/* Quizzes and final exams. Question banks live in quizzes/<subject>.js and set window.QUIZ_BANK.
   Types: mc, ms, tf, match, bucket, order, fill, spot, circuit, tune. */
(function () {
  'use strict';
  const BANK = window.QUIZ_BANK;
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => [].slice.call((r || document).querySelectorAll(s));
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const range = n => Array.from({ length: n }, (_, i) => i);
  function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  const load = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const drop = k => { try { localStorage.removeItem(k); } catch (e) {} };
  function sig(qs) { let h = 7; qs.forEach(q => { const s = q.t + q.q; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; }); return qs.length + ':' + h; }
  function math(el) { if (window.MathJax && MathJax.typesetPromise && /\\\(|\\\[/.test(el.innerHTML)) MathJax.typesetPromise([el]).catch(() => {}); }

  /* ---------- drag: mouse and touch, with tap as the equal alternative ---------- */
  let dragEnded = 0;
  function dragger(el, payload, onDrop) {
    el.addEventListener('pointerdown', e => {
      if (e.button) return;
      const sx = e.clientX, sy = e.clientY; let ghost = null, over = null;
      const move = ev => {
        if (!ghost) {
          if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 7) return;
          ghost = el.cloneNode(true); ghost.classList.add('xq-ghost'); ghost.removeAttribute('id'); document.body.appendChild(ghost);
          el.classList.add('xq-dragging');
        }
        ev.preventDefault();
        ghost.style.left = ev.clientX + 'px'; ghost.style.top = ev.clientY + 'px';
        ghost.style.display = 'none';
        const t = document.elementFromPoint(ev.clientX, ev.clientY); ghost.style.display = '';
        const d = t && t.closest('[data-drop]');
        if (d !== over) { if (over) over.classList.remove('xq-over'); over = d; if (over) over.classList.add('xq-over'); }
      };
      const end = () => {
        window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel);
        if (ghost) { ghost.remove(); el.classList.remove('xq-dragging'); if (over) over.classList.remove('xq-over'); }
      };
      const up = () => { const was = !!ghost, target = over; end(); if (was) { dragEnded = Date.now(); onDrop(payload, target); } };
      const cancel = () => end();
      window.addEventListener('pointermove', move, { passive: false }); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', cancel);
    });
  }
  const wasDrag = () => Date.now() - dragEnded < 150;

  /* ---------- quantum simulator for the circuit questions (q0 is the leftmost bit) ---------- */
  const R = Math.SQRT1_2, C8 = Math.SQRT1_2;
  const GATES = {
    X: [[0, 0], [1, 0], [1, 0], [0, 0]], Y: [[0, 0], [0, -1], [0, 1], [0, 0]], Z: [[1, 0], [0, 0], [0, 0], [-1, 0]], H: [[R, 0], [R, 0], [R, 0], [-R, 0]],
    S: [[1, 0], [0, 0], [0, 0], [0, 1]], T: [[1, 0], [0, 0], [0, 0], [C8, C8]], Sdg: [[1, 0], [0, 0], [0, 0], [0, -1]], Tdg: [[1, 0], [0, 0], [0, 0], [C8, -C8]]
  };
  const TWO = { CX: 'X', CZ: 'Z', CS: 'S', CT: 'T', CSdg: 'Sdg', CTdg: 'Tdg' };
  const LABEL = { CX: 'CNOT', CZ: 'CZ', CS: 'CS', CT: 'CT', CSdg: 'CS†', CTdg: 'CT†', SWAP: 'SWAP', Sdg: 'S†', Tdg: 'T†' };
  const isTwo = g => g === 'SWAP' || !!TWO[g];
  function sim(n, ops, input) {
    const N = 1 << n, re = new Float64Array(N), im = new Float64Array(N), bit = q => 1 << (n - 1 - q); re[input || 0] = 1;
    const apply = (M, t, cm) => {
      const b = bit(t);
      for (let i = 0; i < N; i++) {
        if (i & b || (cm && (i & cm) !== cm)) continue;
        const j = i | b, ar = re[i], ai = im[i], br = re[j], bi = im[j];
        re[i] = M[0][0] * ar - M[0][1] * ai + M[1][0] * br - M[1][1] * bi; im[i] = M[0][0] * ai + M[0][1] * ar + M[1][0] * bi + M[1][1] * br;
        re[j] = M[2][0] * ar - M[2][1] * ai + M[3][0] * br - M[3][1] * bi; im[j] = M[2][0] * ai + M[2][1] * ar + M[3][0] * bi + M[3][1] * br;
      }
    };
    ops.forEach(o => {
      if (o.g === 'SWAP') { const a = bit(o.q), b = bit(o.t); for (let i = 0; i < N; i++) if ((i & a) && !(i & b)) { const j = (i ^ a) | b;[re[i], re[j]] = [re[j], re[i]];[im[i], im[j]] = [im[j], im[i]]; } }
      else if (TWO[o.g]) apply(GATES[TWO[o.g]], o.t, bit(o.q));
      else apply(GATES[o.g], o.q, 0);
    });
    return { n, re, im };
  }
  function overlap(a, b) { let r = 0, i = 0; for (let k = 0; k < a.re.length; k++) { r += a.re[k] * b.re[k] + a.im[k] * b.im[k]; i += a.re[k] * b.im[k] - a.im[k] * b.re[k]; } return [r, i]; }
  const basisIndex = s => parseInt(s, 2);
  function amp(r, i) {
    const f = v => (+v.toFixed(3)).toString(), z = v => Math.abs(v) < 5e-4;
    if (z(i)) return f(r); if (z(r)) return (Math.abs(Math.abs(i) - 1) < 5e-4 ? (i < 0 ? '−' : '') : f(i)) + 'i';
    return '(' + f(r) + (i < 0 ? ' − ' : ' + ') + f(Math.abs(i)) + 'i)';
  }
  function ketString(s) {
    const parts = []; for (let k = 0; k < s.re.length; k++) { if (Math.hypot(s.re[k], s.im[k]) < 5e-4) continue; const a = amp(s.re[k], s.im[k]); parts.push({ a: a === '1' ? '' : a, k: k.toString(2).padStart(s.n, '0') }); }
    return parts.map((p, i) => { let a = p.a.replace(/^-/, '−'), sign = ''; if (a[0] === '−') { sign = i ? ' − ' : '−'; a = a.slice(1); } else if (i) sign = ' + '; return sign + a + '|' + p.k + '⟩'; }).join('') || '0';
  }
  function barsHTML(s) {
    return '<div class="xc-bars">' + range(s.re.length).map(k => { const p = s.re[k] * s.re[k] + s.im[k] * s.im[k]; return '<div class="xc-bar"><span class="mono">' + k.toString(2).padStart(s.n, '0') + '</span><i><s style="width:' + (p * 100).toFixed(1) + '%"></s></i><span class="mono">' + (p * 100).toFixed(1) + '%</span></div>'; }).join('') + '</div>';
  }
  /* bank form ["CX",0,1] -> {g,q,t,c}, packed into the earliest free column */
  function toOps(list, n) {
    const free = new Array(n).fill(0);
    return list.map(a => { const g = a[0], q = a[1], t = a.length > 2 ? a[2] : undefined, rows = t === undefined ? [q] : rows2(q, t), c = Math.max.apply(null, rows.map(r => free[r])); rows.forEach(r => { free[r] = c + 1; }); return t === undefined ? { g, q, c } : { g, q, t, c }; });
  }
  function rows2(q, t) { const a = []; for (let r = Math.min(q, t); r <= Math.max(q, t); r++) a.push(r); return a; }
  const opsSorted = ops => ops.slice().sort((a, b) => a.c - b.c);
  function circuitMatches(q, ops) {
    const seq = opsSorted(ops), ref = toOps(q.target, q.n);
    if (q.unitary) {
      let r = 0, i = 0; const N = 1 << q.n;
      for (let k = 0; k < N; k++) { const o = overlap(sim(q.n, ref, k), sim(q.n, seq, k)); r += o[0]; i += o[1]; }
      return Math.hypot(r, i) / N > 1 - 1e-6;
    }
    const start = q.init ? basisIndex(q.init) : 0, o = overlap(sim(q.n, ref, start), sim(q.n, seq, start));
    return Math.hypot(o[0], o[1]) > 1 - 1e-6;
  }
  function gridHTML(q, ops, opt) {
    const n = q.n, cols = q.cols, init = (q.init || '0'.repeat(n));
    const sel = opt.sel, cellOf = {};
    ops.forEach((o, i) => { cellOf[o.q + ':' + o.c] = { i, part: 'c' }; if (o.t !== undefined) cellOf[o.t + ':' + o.c] = { i, part: 't' }; });
    let h = '<div class="xc-grid" style="--cols:' + cols + ';--rows:' + n + '">';
    for (let r = 0; r < n; r++) {
      h += '<div class="xc-lbl mono">q' + r + ' <span>|' + init[r] + '⟩</span></div>';
      for (let c = 0; c < cols; c++) {
        const hit = cellOf[r + ':' + c]; let inner = '';
        if (hit) {
          const o = ops[hit.i], g = o.g;
          if (o.t === undefined) inner = '<span class="xc-g">' + esc(LABEL[g] || g) + '</span>';
          else if (g === 'SWAP') inner = '<span class="xc-x">×</span>';
          else if (hit.part === 'c') inner = '<span class="xc-dot"></span>';
          else if (g === 'CX') inner = '<span class="xc-tg">⊕</span>';
          else if (g === 'CZ') inner = '<span class="xc-dot"></span>';
          else inner = '<span class="xc-g">' + esc({ CS: 'S', CT: 'T', CSdg: 'S†', CTdg: 'T†' }[g]) + '</span>';
        }
        const on = hit && hit.i === sel ? ' on' : '', aria = 'q' + r + ', step ' + (c + 1) + (hit ? ', ' + (LABEL[ops[hit.i].g] || ops[hit.i].g) : ', empty');
        h += opt.static ? '<div class="xc-cell' + (hit ? ' has' : '') + '">' + inner + '</div>' :
          '<button type="button" class="xc-cell' + (hit ? ' has' : '') + on + '" data-drop="cell" data-r="' + r + '" data-c="' + c + '" data-fk="c' + r + '-' + c + '" aria-label="' + aria + '"' + (opt.locked ? ' disabled' : '') + '>' + inner + '</button>';
      }
    }
    ops.forEach(o => { if (o.t !== undefined) h += '<i class="xc-link" style="--c:' + o.c + ';--top:' + Math.min(o.q, o.t) + ';--span:' + Math.abs(o.q - o.t) + '"></i>'; });
    return h + '</div>';
  }

  /* ---------- question types: init(q) -> state, render(el,q,st,ctx), grade(q,st) -> {score,answered}, solve(q,st) for the test harness ---------- */
  const mark = ok => ok ? '<span class="xq-mk ok" aria-label="correct">✓</span>' : '<span class="xq-mk bad" aria-label="incorrect">✗</span>';
  function pickList(el, q, st, ctx, multi) {
    const correct = multi ? q.a : [q.a];
    el.innerHTML = '<div class="xq-opts' + (q.mono ? ' mono' : '') + '" role="' + (multi ? 'group' : 'radiogroup') + '">' + st.order.map(j => {
      const on = st.pick.indexOf(j) >= 0, isC = correct.indexOf(j) >= 0;
      let cls = on ? ' on' : '', m = '';
      if (ctx.locked) { if (isC) { cls += ' right'; m = mark(true); } else if (on) { cls += ' wrong'; m = mark(false); } }
      return '<button type="button" class="xq-opt' + cls + '" data-j="' + j + '" data-fk="o' + j + '" role="' + (multi ? 'checkbox' : 'radio') + '" aria-checked="' + on + '"' + (ctx.locked ? ' disabled' : '') + '><span class="xq-box ' + (multi ? 'sq' : 'rd') + '" aria-hidden="true"></span><span class="xq-otxt">' + q.o[j] + '</span>' + m + '</button>';
    }).join('') + '</div>';
    if (ctx.locked) return;
    $$('.xq-opt', el).forEach(b => b.addEventListener('click', () => {
      const j = +b.dataset.j;
      if (multi) { const i = st.pick.indexOf(j); if (i >= 0) st.pick.splice(i, 1); else st.pick.push(j); } else st.pick = [j];
      ctx.changed();
    }));
  }
  /* chips that go into slots: shared by match and bucket */
  function bindChips(el, st, ctx, place) {
    $$('[data-chip]', el).forEach(ch => {
      const id = +ch.dataset.chip;
      if (ctx.locked) return;
      ch.addEventListener('click', e => { if (wasDrag()) return; e.stopPropagation(); st.arm = st.arm === id ? null : id; ctx.changed(); });
      dragger(ch, id, (p, target) => { st.arm = null; place(p, target && el.contains(target) ? target.dataset.slot : 'tray'); ctx.changed(); });
    });
    if (ctx.locked) return;
    $$('[data-drop="slot"]', el).forEach(s => s.addEventListener('click', e => {
      if (wasDrag() || e.target.closest('[data-chip]')) return;
      if (st.arm !== null && st.arm !== undefined) { place(st.arm, s.dataset.slot); st.arm = null; ctx.changed(); }
    }));
  }
  const TYPES = {
    mc: {
      label: 'Choose one',
      init: q => ({ order: q.keep ? range(q.o.length) : shuffle(range(q.o.length)), pick: [] }),
      render: (el, q, st, ctx) => pickList(el, q, st, ctx, false),
      grade: (q, st) => ({ answered: st.pick.length > 0, score: st.pick[0] === q.a ? 1 : 0 }),
      solve: (q, st) => { st.pick = [q.a]; }
    },
    ms: {
      label: 'Select all that apply',
      init: q => ({ order: q.keep ? range(q.o.length) : shuffle(range(q.o.length)), pick: [] }),
      render: (el, q, st, ctx) => pickList(el, q, st, ctx, true),
      grade: (q, st) => { const hit = st.pick.filter(j => q.a.indexOf(j) >= 0).length, miss = st.pick.length - hit; return { answered: st.pick.length > 0, score: Math.max(0, (hit - miss) / q.a.length), note: hit + ' of ' + q.a.length + ' correct picks' + (miss ? ', ' + miss + ' wrong' : '') }; },
      solve: (q, st) => { st.pick = q.a.slice(); }
    },
    tf: {
      label: 'True or false for each',
      init: q => ({ order: shuffle(range(q.s.length)), pick: {} }),
      render: (el, q, st, ctx) => {
        el.innerHTML = '<div class="xq-tf">' + st.order.map(i => {
          const v = st.pick[i], c = q.s[i][1], btn = (val, t) => { let cls = v === val ? ' on' : ''; if (ctx.locked) { if (val === c) cls += ' right'; else if (v === val) cls += ' wrong'; } return '<button type="button" class="xq-seg' + cls + '" data-i="' + i + '" data-v="' + val + '" data-fk="t' + i + val + '" aria-pressed="' + (v === val) + '"' + (ctx.locked ? ' disabled' : '') + '>' + t + '</button>'; };
          return '<div class="xq-tfrow"><div class="xq-tft">' + q.s[i][0] + (ctx.locked ? ' ' + mark(v === c) : '') + '</div><div class="xq-segs">' + btn(true, 'True') + btn(false, 'False') + '</div></div>';
        }).join('') + '</div>';
        if (!ctx.locked) $$('.xq-seg', el).forEach(b => b.addEventListener('click', () => { st.pick[b.dataset.i] = b.dataset.v === 'true'; ctx.changed(); }));
      },
      grade: (q, st) => { const n = q.s.length, got = range(n).filter(i => st.pick[i] === q.s[i][1]).length; return { answered: Object.keys(st.pick).length > 0, score: got / n, note: got + ' of ' + n + ' correct' }; },
      solve: (q, st) => { q.s.forEach((s, i) => { st.pick[i] = s[1]; }); }
    },
    match: {
      label: 'Match each item',
      init: q => { const rights = q.pairs.map(p => p[1]).concat(q.extra || []); return { left: q.keep ? range(q.pairs.length) : shuffle(range(q.pairs.length)), bank: shuffle(range(rights.length)), place: {}, arm: null }; },
      render: (el, q, st, ctx) => {
        const rights = q.pairs.map(p => p[1]).concat(q.extra || []), used = Object.keys(st.place).map(k => st.place[k]);
        const chip = (id, extra) => '<button type="button" class="xq-chip' + (st.arm === id ? ' on' : '') + (extra || '') + '" data-chip="' + id + '" data-fk="m' + id + '"' + (ctx.locked ? ' disabled' : '') + '>' + rights[id] + '</button>';
        el.innerHTML = '<div class="xq-match">' + st.left.map(i => {
          const p = st.place[i], ok = p !== undefined && rights[p].trim() === q.pairs[i][1].trim();
          return '<div class="xq-mrow"><div class="xq-mleft">' + q.pairs[i][0] + '</div><div class="xq-slot' + (st.arm !== null && !ctx.locked ? ' ready' : '') + '" data-drop="slot" data-slot="' + i + '">' + (p !== undefined ? chip(p, ctx.locked ? (ok ? ' right' : ' wrong') : '') : '<span class="xq-empty">' + (ctx.locked ? 'No answer' : 'Drop here') + '</span>') +
            (ctx.locked ? mark(ok) + (ok ? '' : '<div class="xq-fix">Answer: ' + q.pairs[i][1] + '</div>') : '') + '</div></div>';
        }).join('') + '</div>' + (ctx.locked ? '' : '<div class="xq-tray" data-drop="slot" data-slot="tray">' + st.bank.filter(id => used.indexOf(id) < 0).map(id => chip(id)).join('') + '</div>');
        bindChips(el, st, ctx, (id, slot) => { Object.keys(st.place).forEach(k => { if (st.place[k] === id) delete st.place[k]; }); if (slot !== undefined && slot !== 'tray') st.place[slot] = id; });
      },
      grade: (q, st) => { const rights = q.pairs.map(p => p[1]).concat(q.extra || []), n = q.pairs.length, got = range(n).filter(i => st.place[i] !== undefined && rights[st.place[i]].trim() === q.pairs[i][1].trim()).length; return { answered: Object.keys(st.place).length > 0, score: got / n, note: got + ' of ' + n + ' matched' }; },
      solve: (q, st) => { q.pairs.forEach((p, i) => { st.place[i] = i; }); }
    },
    bucket: {
      label: 'Sort into the right group',
      init: q => ({ tray: shuffle(range(q.items.length)), place: {}, arm: null }),
      render: (el, q, st, ctx) => {
        const chip = id => { const pl = st.place[id], cls = ctx.locked && pl !== undefined ? (pl === q.items[id][1] ? ' right' : ' wrong') : ''; return '<button type="button" class="xq-chip' + (st.arm === id ? ' on' : '') + cls + '" data-chip="' + id + '" data-fk="b' + id + '"' + (ctx.locked ? ' disabled' : '') + '>' + q.items[id][0] + (ctx.locked && pl !== undefined ? ' ' + mark(pl === q.items[id][1]) : '') + '</button>'; };
        el.innerHTML = '<div class="xq-buckets" style="--n:' + q.buckets.length + '">' + q.buckets.map((b, i) => '<div class="xq-bucket' + (st.arm !== null && !ctx.locked ? ' ready' : '') + '" data-drop="slot" data-slot="' + i + '"><div class="xq-bname">' + b + '</div><div class="xq-bitems">' + st.tray.filter(id => st.place[id] === i).map(chip).join('') + '</div>' +
          (ctx.locked ? q.items.map((it, id) => it[1] === i && st.place[id] !== i ? '<div class="xq-fix">Belongs here: ' + it[0] + '</div>' : '').join('') : '') + '</div>').join('') + '</div>' +
          (ctx.locked ? '' : '<div class="xq-tray" data-drop="slot" data-slot="tray">' + st.tray.filter(id => st.place[id] === undefined).map(chip).join('') + '</div>');
        bindChips(el, st, ctx, (id, slot) => { if (slot === 'tray' || slot === undefined) delete st.place[id]; else st.place[id] = +slot; });
        if (!ctx.locked) $$('.xq-bucket .xq-chip', el).forEach(c => c.addEventListener('dblclick', () => { delete st.place[+c.dataset.chip]; st.arm = null; ctx.changed(); }));
      },
      grade: (q, st) => { const n = q.items.length, got = range(n).filter(i => st.place[i] === q.items[i][1]).length; return { answered: Object.keys(st.place).length > 0, score: got / n, note: got + ' of ' + n + ' in the right group' }; },
      solve: (q, st) => { q.items.forEach((it, i) => { st.place[i] = it[1]; }); }
    },
    order: {
      label: 'Put in the right order',
      init: q => { let p; do { p = shuffle(range(q.items.length)); } while (q.items.length > 1 && p.every((v, i) => v === i)); return { perm: p, moved: false }; },
      render: (el, q, st, ctx) => {
        el.innerHTML = '<ol class="xq-order' + (q.mono ? ' mono' : '') + '">' + st.perm.map((id, pos) => {
          const ok = id === pos, cls = ctx.locked ? (ok ? ' right' : ' wrong') : '';
          return '<li class="xq-row' + cls + '" data-drop="row" data-pos="' + pos + '"><span class="xq-grip" data-pos="' + pos + '" aria-hidden="true">⋮⋮</span><span class="xq-rtxt">' + q.items[id] + '</span>' +
            (ctx.locked ? mark(ok) + (ok ? '' : '<span class="xq-fix">Should be step ' + (id + 1) + '</span>') : '<span class="xq-ud"><button type="button" class="btn sm" data-mv="-1" data-pos="' + pos + '" data-fk="u' + id + '" aria-label="Move up"' + (pos === 0 ? ' disabled' : '') + '>↑</button><button type="button" class="btn sm" data-mv="1" data-pos="' + pos + '" data-fk="d' + id + '" aria-label="Move down"' + (pos === st.perm.length - 1 ? ' disabled' : '') + '>↓</button></span>') + '</li>';
        }).join('') + '</ol>';
        if (ctx.locked) return;
        const move = (a, b) => { if (b < 0 || b >= st.perm.length || a === b) return; const x = st.perm.splice(a, 1)[0]; st.perm.splice(b, 0, x); st.moved = true; ctx.changed(); };
        $$('[data-mv]', el).forEach(b => b.addEventListener('click', () => move(+b.dataset.pos, +b.dataset.pos + (+b.dataset.mv))));
        $$('.xq-grip', el).forEach(g => dragger(g.parentNode, +g.dataset.pos, (p, t) => { if (t && el.contains(t) && t.dataset.pos !== undefined) move(p, +t.dataset.pos); }));
      },
      grade: (q, st) => {
        const p = st.perm, n = p.length, best = new Array(n).fill(1);   /* longest run already in order, so one misplaced step costs one step */
        for (let i = 0; i < n; i++) for (let j = 0; j < i; j++) if (p[j] < p[i]) best[i] = Math.max(best[i], best[j] + 1);
        const lis = Math.max.apply(null, best), exact = p.every((v, i) => v === i);
        return { answered: !!st.moved, score: exact ? 1 : lis <= 1 ? 0 : Math.min(.9, (lis - 1) / (n - 1)), note: p.filter((v, i) => v === i).length + ' of ' + n + ' in the right place' };
      },
      solve: (q, st) => { st.perm = range(q.items.length); st.moved = true; }
    },
    fill: {
      label: 'Fill in the blanks',
      init: q => ({ v: {}, shuf: q.blanks.map(b => b.opts ? shuffle(range(b.opts.length)) : null) }),
      render: (el, q, st, ctx) => {
        const parts = q.text.split(/\{(\d+)\}/); let h = '';
        parts.forEach((p, i) => {
          if (i % 2 === 0) { h += p; return; }
          const k = +p, b = q.blanks[k], v = st.v[k], ok = fillOK(b, v), cls = ctx.locked ? (ok ? ' right' : ' wrong') : '';
          if (b.opts) h += '<select class="xq-blank' + cls + '" data-b="' + k + '" aria-label="Blank ' + (k + 1) + '"' + (ctx.locked ? ' disabled' : '') + '><option value="">Choose…</option>' + st.shuf[k].map(o => '<option value="' + o + '"' + (String(v) === String(o) ? ' selected' : '') + '>' + esc(b.opts[o]) + '</option>').join('') + '</select>';
          else h += '<input class="xq-blank' + cls + '" data-b="' + k + '" type="text" inputmode="' + (b.num !== undefined ? 'decimal' : 'text') + '" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Blank ' + (k + 1) + '" style="width:' + (b.w || (b.num !== undefined ? 8 : 13)) + 'ch" value="' + esc(v === undefined ? '' : v) + '"' + (ctx.locked ? ' disabled' : '') + '>';
          if (ctx.locked) h += mark(ok) + (ok ? '' : ' <span class="xq-fix inl">' + esc(fillAnswer(b)) + '</span>');
        });
        el.innerHTML = q.code ? '<pre class="xq-fillcode">' + h + '</pre>' : '<div class="xq-filltext">' + h + '</div>';
        if (ctx.locked) return;
        $$('.xq-blank', el).forEach(b => { const on = () => { st.v[b.dataset.b] = b.value; ctx.touched(); }; b.addEventListener('input', on); b.addEventListener('change', on); });
      },
      grade: (q, st) => { const n = q.blanks.length, got = range(n).filter(k => fillOK(q.blanks[k], st.v[k])).length; return { answered: Object.keys(st.v).some(k => st.v[k] !== ''), score: got / n, note: got + ' of ' + n + ' blanks' }; },
      solve: (q, st) => { q.blanks.forEach((b, k) => { st.v[k] = b.opts ? String(b.a) : b.num !== undefined ? String(b.num) : b.ans[0]; }); }
    },
    spot: {
      label: 'Click the answer in the text',
      init: () => ({ pick: [] }),
      render: (el, q, st, ctx) => {
        const lines = q.lines || q.tokens, inline = !q.lines;
        el.innerHTML = '<div class="' + (inline ? 'xq-tokens' : 'xq-lines mono') + '">' + lines.map((l, i) => {
          const on = st.pick.indexOf(i) >= 0, c = q.a.indexOf(i) >= 0, plain = typeof l === 'object' ? l.fixed : null; let cls = on ? ' on' : '';
          if (ctx.locked) { if (c) cls += ' right'; else if (on) cls += ' wrong'; }
          if (plain) return inline ? '<span class="xq-tok-plain">' + esc(l.fixed) + '</span>' : '<div class="xq-line plain">' + esc(l.fixed) + '</div>';
          return '<button type="button" class="' + (inline ? 'xq-tok' : 'xq-line') + cls + '" data-i="' + i + '" data-fk="s' + i + '" aria-pressed="' + on + '"' + (ctx.locked ? ' disabled' : '') + '>' + (inline ? '' : '<span class="xq-ln">' + (i + 1) + '</span>') + '<span>' + esc(l) + '</span>' + (ctx.locked && (c || on) ? mark(c) : '') + '</button>';
        }).join('') + '</div>';
        if (!ctx.locked) $$('[data-i]', el).forEach(b => b.addEventListener('click', () => {
          const i = +b.dataset.i, at = st.pick.indexOf(i);
          if (at >= 0) st.pick.splice(at, 1); else if (q.a.length === 1 && !q.many) st.pick = [i]; else st.pick.push(i);
          ctx.changed();
        }));
      },
      grade: (q, st) => { const hit = st.pick.filter(j => q.a.indexOf(j) >= 0).length, miss = st.pick.length - hit; return { answered: st.pick.length > 0, score: Math.max(0, (hit - miss) / q.a.length), note: hit + ' of ' + q.a.length + ' found' + (miss ? ', ' + miss + ' wrong' : '') }; },
      solve: (q, st) => { st.pick = q.a.slice(); }
    },
    circuit: {
      label: 'Build the circuit', retry: true,
      init: () => ({ ops: [], arm: null, sel: null, ran: false }),
      render: (el, q, st, ctx) => {
        const palette = q.palette || ['H', 'X', 'Z', 'CX'];
        let h = '';
        if (!ctx.locked) h += '<div class="xc-pal" role="group" aria-label="Gates">' + palette.map(g => '<button type="button" class="xc-pg' + (st.arm === g ? ' on' : '') + '" data-g="' + g + '" data-fk="p' + g + '" aria-pressed="' + (st.arm === g) + '">' + esc(LABEL[g] || g) + '</button>').join('') + '</div>' +
          '<p class="xq-how">Drag a gate onto a wire, or tap a gate and then a wire. Tap a placed gate to change or remove it. Drag one off the grid to delete it.</p>';
        h += '<div class="xc-wrap">' + gridHTML(q, st.ops, { sel: st.sel, locked: ctx.locked }) + '</div>';
        const so = st.sel !== null && !ctx.locked ? st.ops[st.sel] : null;
        if (so) {
          h += '<div class="xc-tools"><b>' + esc(LABEL[so.g] || so.g) + '</b>';
          if (so.t !== undefined) {
            if (so.g === 'CX' || so.g === 'CS' || so.g === 'CT') h += '<button type="button" class="btn sm" data-tool="flip">Swap control and target</button>';
            range(q.n).filter(r => r !== so.q && r !== so.t).forEach(r => { h += '<button type="button" class="btn sm" data-tool="target" data-r="' + r + '">Target q' + r + '</button>'; });
          }
          h += '<button type="button" class="btn sm" data-tool="del">Remove</button></div>';
        }
        if (!ctx.locked) h += '<div class="row xc-acts">' + (ctx.mode === 'exam' ? '' : '<button type="button" class="btn sm" data-act="run" data-fk="run">Run it</button>') + '<button type="button" class="btn sm" data-act="clear" data-fk="clear"' + (st.ops.length ? '' : ' disabled') + '>Clear</button><span class="small muted">' + st.ops.length + ' gate' + (st.ops.length === 1 ? '' : 's') + (q.maxGates ? ' · limit ' + q.maxGates : '') + '</span></div>';
        if (st.ran || ctx.locked) { const s = sim(q.n, opsSorted(st.ops), q.init ? basisIndex(q.init) : 0); h += '<div class="xc-out"><div class="xc-state"><b>Your circuit gives</b> <span class="mono">' + ketString(s) + '</span></div>' + barsHTML(s) + '</div>'; }
        if (ctx.locked && ctx.reveal) {
          const shown = q.sol || q.target, ops = toOps(shown, q.n); h += '<div class="xc-sol"><b>One correct circuit</b><div class="xc-wrap">' + gridHTML(Object.assign({}, q, { cols: Math.max(q.cols, 1) }), ops, { static: true }) + '</div></div>';
        }
        el.innerHTML = h; el.classList.add('xc');
        if (ctx.locked) return;
        const free = (r, c, skip) => !st.ops.some((o, i) => i !== skip && o.c === c && occupied(o).indexOf(r) >= 0);
        const occupied = o => o.t === undefined ? [o.q] : rows2(o.q, o.t);
        const place = (g, r, c) => {
          if (!isTwo(g)) { if (!free(r, c)) return ctx.notice('That spot is taken.'); st.ops.push({ g, q: r, c }); return; }
          const near = [r + 1, r - 1].concat(range(q.n)).filter(x => x >= 0 && x < q.n && x !== r);
          const t = near.find(x => rows2(r, x).every(y => free(y, c)));
          if (t === undefined) return ctx.notice('That column has no free wire for a two-qubit gate.');
          st.ops.push({ g, q: r, t, c }); st.sel = st.ops.length - 1;
        };
        const moveOp = (i, r, c) => {
          const o = st.ops[i], d = o.t === undefined ? 0 : o.t - o.q, t = r + d;
          if (o.t !== undefined && (t < 0 || t >= q.n)) return ctx.notice('The gate would fall off the wires.');
          const rows = o.t === undefined ? [r] : rows2(r, t);
          if (!rows.every(y => free(y, c, i))) return ctx.notice('That spot is taken.');
          o.q = r; o.c = c; if (o.t !== undefined) o.t = t;
        };
        $$('.xc-pg', el).forEach(b => {
          b.addEventListener('click', () => { if (wasDrag()) return; st.arm = st.arm === b.dataset.g ? null : b.dataset.g; st.sel = null; ctx.changed(); });
          dragger(b, b.dataset.g, (g, t) => { if (t && el.contains(t) && t.dataset.drop === 'cell') { place(g, +t.dataset.r, +t.dataset.c); st.arm = null; st.ran = false; ctx.changed(); } });
        });
        $$('.xc-cell', el).forEach(cell => {
          const r = +cell.dataset.r, c = +cell.dataset.c;
          cell.addEventListener('click', () => {
            if (wasDrag()) return;
            const hit = st.ops.findIndex(o => o.c === c && (o.q === r || o.t === r));
            if (st.arm) { place(st.arm, r, c); st.ran = false; if (!isTwo(st.arm)) st.sel = null; ctx.changed(); return; }
            st.sel = hit >= 0 && hit !== st.sel ? hit : null; ctx.changed();
          });
          const hit = st.ops.findIndex(o => o.c === c && (o.q === r || o.t === r));
          if (hit >= 0) {
            cell.classList.add('grab');
            dragger(cell, hit, (i, t) => {
              if (!t || !el.contains(t)) { st.ops.splice(i, 1); st.sel = null; }
              else if (t.dataset.drop === 'cell') { const o = st.ops[i], base = o.t !== undefined && r === o.t ? (+t.dataset.r) - (o.t - o.q) : +t.dataset.r; moveOp(i, base, +t.dataset.c); }
              st.ran = false; ctx.changed();
            });
          }
        });
        $$('[data-tool]', el).forEach(b => b.addEventListener('click', () => {
          const o = st.ops[st.sel], a = b.dataset.tool;
          if (a === 'del') { st.ops.splice(st.sel, 1); st.sel = null; }
          else if (a === 'flip') { const x = o.q; o.q = o.t; o.t = x; }
          else if (a === 'target') { const nr = +b.dataset.r; if (rows2(o.q, nr).every(y => free(y, o.c, st.sel))) o.t = nr; else ctx.notice('Another gate is in the way in that column.'); }
          st.ran = false; ctx.changed();
        }));
        $$('[data-act]', el).forEach(b => b.addEventListener('click', () => { if (b.dataset.act === 'run') st.ran = true; else { st.ops = []; st.sel = null; st.ran = false; } ctx.changed(); }));
      },
      grade: (q, st) => {
        const over = q.maxGates && st.ops.length > q.maxGates, match = st.ops.length ? circuitMatches(q, st.ops) : false;
        return { answered: st.ops.length > 0, score: match && !over ? 1 : 0, note: over && match ? 'Right result, but it uses ' + st.ops.length + ' gates and the limit is ' + q.maxGates + '.' : match ? '' : 'The final state doesn\'t match the target yet.' };
      },
      solve: (q, st) => { st.ops = toOps(q.sol || q.target, q.n); }
    },
    tune: {
      label: 'Adjust until it works', retry: true,
      init: q => { const v = {}; q.sliders.forEach(s => { v[s.k] = s.val; }); return { v, moved: false }; },
      render: (el, q, st, ctx) => {
        const r = q.run(st.v);
        el.innerHTML = '<div class="xt-sliders">' + q.sliders.map(s => '<label class="xt-s"><span>' + s.label + ' <b class="mono" data-show="' + s.k + '">' + st.v[s.k] + '</b></span><input type="range" min="' + s.min + '" max="' + s.max + '" step="' + s.step + '" value="' + st.v[s.k] + '" data-k="' + s.k + '"' + (ctx.locked ? ' disabled' : '') + '></label>').join('') + '</div><div class="xt-out">' + r.html + '</div>' + (ctx.locked && ctx.reveal && q.solText ? '<div class="xc-sol">' + q.solText + '</div>' : '');
        if (ctx.locked) return;
        $$('input[type=range]', el).forEach(i => i.addEventListener('input', () => { st.v[i.dataset.k] = +i.value; st.moved = true; $('[data-show="' + i.dataset.k + '"]', el).textContent = i.value; $('.xt-out', el).innerHTML = q.run(st.v).html; ctx.touched(); }));
      },
      grade: (q, st) => ({ answered: !!st.moved, score: q.run(st.v).ok ? 1 : 0, note: q.run(st.v).ok ? '' : 'The target isn\'t met yet.' }),
      solve: (q, st) => { st.v = Object.assign({}, st.v, q.sol); st.moved = true; }
    }
  };
  function norm(s) { return String(s === undefined ? '' : s).trim().toLowerCase().replace(/\s+/g, ' '); }
  function fillOK(b, v) {
    if (v === undefined || v === '') return false;
    if (b.opts) return +v === b.a;
    if (b.num !== undefined) { const x = parseFloat(String(v).replace(/,/g, '').replace('−', '-')); return isFinite(x) && Math.abs(x - b.num) <= (b.tol === undefined ? 1e-9 : b.tol); }
    return b.cs ? b.ans.some(a => String(v).trim().replace(/\s+/g, ' ') === a) : b.ans.some(a => norm(a) === norm(v));
  }
  const fillAnswer = b => b.opts ? b.opts[b.a] : b.num !== undefined ? String(b.num) : b.ans[0];

  /* ---------- one question inside a host ---------- */
  function drawQ(host, q, st, opt) {
    const T = TYPES[q.t];
    host.innerHTML = '<div class="xq-tag">' + esc(q.hint || T.label) + '</div><div class="xq-prompt">' + q.q + '</div><div class="xq-body"></div><div class="xq-notice" role="status"></div>';
    const body = $('.xq-body', host), notice = $('.xq-notice', host);
    const ctx = {
      locked: !!opt.locked, reveal: !!opt.reveal, mode: opt.mode,
      changed: () => { const k = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.fk : null; T.render(body, q, st, ctx); if (k) { const f = $('[data-fk="' + k + '"]', body); if (f) f.focus(); } opt.onChange && opt.onChange(); },
      touched: () => { opt.onChange && opt.onChange(); },
      notice: m => { notice.textContent = m; setTimeout(() => { notice.textContent = ''; }, 2600); }
    };
    T.render(body, q, st, ctx); math(host);
  }
  const verdict = s => s >= 1 ? 'Correct' : s > 0 ? 'Partly right' : 'Not quite';
  function feedbackHTML(q, g, showWhy) {
    return '<div class="xq-fb ' + (g.score >= 1 ? 'ok' : g.score > 0 ? 'part' : 'bad') + '"><b>' + verdict(g.score) + (g.score > 0 && g.score < 1 ? ' · ' + Math.round(g.score * 100) + '%' : '') + '.</b> ' + (g.score < 1 && g.note ? esc(g.note) + ' ' : '') + (showWhy && q.why ? '<div class="xq-why">' + q.why + '</div>' : '') + '</div>';
  }

  /* ---------- chapter quiz: check one question at a time, learn from the feedback ---------- */
  function Quiz(host, id, qs) {
    const KEY = 'hub-quiz-' + BANK.subject + '-' + id, SIG = sig(qs);
    let S = load(KEY);
    if (!S || S.sig !== SIG) S = fresh();
    function fresh() { return { sig: SIG, at: 0, st: qs.map(q => TYPES[q.t].init(q)), res: qs.map(() => null), order: shuffle(range(qs.length)) }; }
    host.innerHTML = '<div class="qc xq" tabindex="-1"><div class="xq-slide"></div><div class="xq-acts"></div><div class="qnav"><button class="btn" type="button" data-n="-1" aria-label="Previous question">←</button><div class="qdots"></div><button class="btn" type="button" data-n="1" aria-label="Next question">→</button></div><div class="qscore"></div></div>';
    const slide = $('.xq-slide', host), acts = $('.xq-acts', host), dots = $('.qdots', host), scoreEl = $('.qscore', host), prev = $('[data-n="-1"]', host), next = $('[data-n="1"]', host), keep = () => save(KEY, S);
    const N = qs.length, ord = () => S.order;
    function finals() { return S.res.filter(r => r && r.final).length; }
    function total() { return S.res.reduce((a, r) => a + (r && r.final ? r.score : 0), 0); }
    function draw(focus) {
      const atEnd = S.at >= N;
      dots.innerHTML = ord().map((qi, i) => { const r = S.res[qi]; let c = ''; if (r && r.final) c = r.score >= 1 ? 'ok' : r.score > 0 ? 'part' : 'bad'; return '<button type="button" class="' + c + (i === S.at ? ' now' : '') + '" data-go="' + i + '" aria-label="Question ' + (i + 1) + '"></button>'; }).join('') + '<button type="button" class="qd-end' + (atEnd ? ' now' : '') + '" data-go="' + N + '" aria-label="Results">✓</button>';
      prev.disabled = S.at === 0; next.disabled = atEnd;
      scoreEl.textContent = finals() === N ? 'Finished: ' + fmtMarks(total()) + ' of ' + N : fmtMarks(total()) + (total() === 1 ? ' mark · ' : ' marks · ') + finals() + ' of ' + N + ' done';
      if (atEnd) { drawEnd(); return after(focus); }
      const qi = ord()[S.at], q = qs[qi], st = S.st[qi], T = TYPES[q.t];
      slide.innerHTML = '<div class="eyebrow">Question ' + (S.at + 1) + ' of ' + N + '</div><div class="xq-q"></div>';
      const w = $('.xq-q', slide);
      const paint = () => {
        const r = S.res[qi], done = !!(r && r.final);
        drawQ(w, q, st, { locked: done, reveal: done, mode: 'quiz', onChange: () => { keep(); syncCheck(); } });
        let h = '';
        if (done) { h = feedbackHTML(q, { score: r.score, note: r.note }, true) + '<div class="row">' + (S.at < N - 1 || finals() < N ? '<button type="button" class="btn primary" data-a="next">' + (S.at === N - 1 ? 'See results' : 'Next question') + '</button>' : '<button type="button" class="btn primary" data-a="next">See results</button>') + '</div>'; }
        else {
          if (r && r.tries) h = feedbackHTML(q, { score: 0, note: r.note }, false);
          h += '<div class="row"><button type="button" class="btn primary" data-a="check">' + (r && r.tries ? 'Check again' : 'Check answer') + '</button>' + (r && r.tries ? '<button type="button" class="btn" data-a="reveal">Show a solution</button>' : '') + '</div>';
        }
        acts.innerHTML = h; math(acts); syncCheck();
      };
      function syncCheck() { const c = $('[data-a="check"]', acts); if (c) c.disabled = !T.grade(q, st).answered; }
      paint();
      acts.onclick = e => {
        const b = e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a;
        if (a === 'next') { S.at = Math.min(N, S.at + 1); keep(); draw(true); return; }
        if (a === 'check') {
          const g = T.grade(q, st), rr = S.res[qi] || { tries: 0 }; rr.tries = (rr.tries || 0) + 1; rr.note = g.note;
          if (g.score >= 1) { rr.score = rr.tries === 1 ? 1 : .5; rr.final = true; if (rr.tries > 1) rr.note = 'Solved on try ' + rr.tries + ', so half marks.'; }
          else if (T.retry) { rr.score = 0; rr.final = false; }
          else { rr.score = g.score; rr.final = true; }
          S.res[qi] = rr; keep(); drawDotsOnly(); paint();
        }
        if (a === 'reveal') { S.res[qi].final = true; S.res[qi].score = 0; S.res[qi].note = 'Solution shown, so no marks this time.'; keep(); drawDotsOnly(); paint(); }
      };
      after(focus);
    }
    function drawDotsOnly() { const at = S.at; dots.innerHTML = ord().map((qi, i) => { const r = S.res[qi]; let c = ''; if (r && r.final) c = r.score >= 1 ? 'ok' : r.score > 0 ? 'part' : 'bad'; return '<button type="button" class="' + c + (i === at ? ' now' : '') + '" data-go="' + i + '" aria-label="Question ' + (i + 1) + '"></button>'; }).join('') + '<button type="button" class="qd-end" data-go="' + N + '" aria-label="Results">✓</button>'; scoreEl.textContent = finals() === N ? 'Finished: ' + fmtMarks(total()) + ' of ' + N : fmtMarks(total()) + (total() === 1 ? ' mark · ' : ' marks · ') + finals() + ' of ' + N + ' done'; }
    function after(focus) { if (focus) { const q = $('.xq', host); const r = q.getBoundingClientRect(); if (r.top < 70 || r.top > innerHeight * .6) window.scrollTo({ top: scrollY + r.top - 76, behavior: 'auto' }); q.focus({ preventScroll: true }); } }
    function drawEnd() {
      const missed = qs.map((q, i) => i).filter(i => !S.res[i] || !S.res[i].final || S.res[i].score < 1), left = N - finals();
      const pct = Math.round(total() / N * 100);
      slide.innerHTML = '<div class="eyebrow">Results</div><div class="xq-result"><b class="xq-big">' + (finals() ? pct + '%' : '–') + '</b><span>' + fmtMarks(total()) + ' of ' + N + ' marks' + (left ? ' · ' + left + ' not answered yet' : '') + '</span></div>' +
        (missed.length && finals() ? '<p class="small">Worth another look:</p><ul class="xq-missed">' + missed.map(i => '<li><button type="button" class="lk xq-jump" data-q="' + i + '">' + strip(qs[i].q) + '</button></li>').join('') + '</ul>' : finals() ? '<p>Every question right. Try the final exam next.</p>' : '<p class="small">Answer some questions first.</p>');
      acts.innerHTML = '<div class="row">' + (missed.length && finals() ? '<button type="button" class="btn primary" data-a="retry">Retry these ' + missed.length + '</button>' : '') + '<button type="button" class="btn" data-a="reset">Start over</button></div>';
      acts.onclick = e => {
        const b = e.target.closest('[data-a]'); if (!b) return;
        if (b.dataset.a === 'retry') { missed.forEach(i => { S.st[i] = TYPES[qs[i].t].init(qs[i]); S.res[i] = null; }); S.at = ord().indexOf(missed[0]); keep(); draw(true); }
        if (b.dataset.a === 'reset') { S = fresh(); keep(); draw(true); }
      };
      $$('.xq-jump', slide).forEach(b => b.addEventListener('click', () => { S.at = ord().indexOf(+b.dataset.q); keep(); draw(true); }));
    }
    host.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.n) { S.at = Math.max(0, Math.min(N, S.at + (+b.dataset.n))); keep(); draw(); }
      else if (b.dataset.go != null) { S.at = +b.dataset.go; keep(); draw(); }
    });
    draw();
  }
  const fmtMarks = v => (Math.round(v * 10) / 10).toString();
  const strip = h => { const d = document.createElement('div'); d.innerHTML = h; const t = d.textContent.replace(/\s+/g, ' ').trim(); return esc(t.length > 96 ? t.slice(0, 93) + '…' : t); };

  /* ---------- final exam: one long paper on its own page, no feedback until it is handed in ---------- */
  const DEFAULT_MARKS = { mc: 1, ms: 2, tf: 2, match: 3, bucket: 3, order: 2, fill: 2, spot: 1, circuit: 4, tune: 3 };
  function Exam(host, def) {
    const qs = [], secs = def.sections.map((sec, si) => { const ids = sec.q.map(q => { q.ch = sec.ch; q.sec = si; qs.push(q); return qs.length - 1; }); return { name: sec.name, ch: sec.ch, ids }; });
    const KEY = 'hub-exam-run-' + BANK.subject, BEST = 'hub-exam-' + BANK.subject, SIG = sig(qs), LETTER = 'ABCDEFGHIJKLMNOP';
    const marks = q => q.marks || DEFAULT_MARKS[q.t] || 1, totalMarks = qs.reduce((a, q) => a + marks(q), 0);
    let S = load(KEY); if (!S || S.sig !== SIG) S = { sig: SIG, phase: 'intro' };
    let timer = null;
    const keep = () => save(KEY, S);
    function start() { S = { sig: SIG, phase: 'run', flag: {}, sec: 0, order: secs.map(x => shuffle(x.ids)), st: qs.map(q => TYPES[q.t].init(q)) }; keep(); draw(); window.scrollTo(0, 0); }
    function draw() { clearInterval(timer); host.innerHTML = ''; if (S.phase === 'intro') intro(); else if (S.phase === 'run') paper(); else results(); }
    const secMeta = x => { const m = x.ids.reduce((a, i) => a + marks(qs[i]), 0); return x.ids.length + ' question' + (x.ids.length > 1 ? 's' : '') + ' · ' + m + ' marks'; };
    function intro() {
      const best = load(BEST), kinds = {}; qs.forEach(q => { kinds[q.t] = 1; });
      host.innerHTML = '<div class="xq xe-cover"><div class="kpis"><div class="kpi"><b>' + qs.length + '</b><span>Questions</span></div><div class="kpi"><b>' + totalMarks + '</b><span>Marks</span></div><div class="kpi"><b>' + def.minutes + '</b><span>Minutes</span></div><div class="kpi"><b>' + def.pass + '%</b><span>To pass</span></div></div>' +
        '<h2 class="xe-h">Instructions</h2><ol class="xe-rules body"><li>Answer every section. There are no negative marks, so attempt everything.</li><li>Nothing is marked until you hand the paper in, and you see no hints on the way.</li><li>Multi-part questions earn partial marks. A wrong tick in a "select all" question cancels a right one.</li><li>The clock is a guide and won\'t stop you. To make the score mean something, work from memory with the lesson closed.</li><li>Your answers are saved on this device, so you can leave and come back.</li></ol>' +
        '<h2 class="xe-h">Paper structure</h2><div class="tbl"><table><thead><tr><th>Section</th><th>Covers</th><th class="num">Questions</th><th class="num">Marks</th></tr></thead><tbody>' + secs.map((x, i) => '<tr><td>' + LETTER[i] + '</td><td>' + esc(x.name) + '</td><td class="num">' + x.ids.length + '</td><td class="num">' + x.ids.reduce((a, k) => a + marks(qs[k]), 0) + '</td></tr>').join('') + '</tbody></table></div>' +
        (best ? '<p><b>Your best so far:</b> ' + best.pct + '% on ' + esc(best.date) + '</p>' : '') + '<div class="row"><button type="button" class="btn primary xe-go" data-a="start">Begin the exam</button></div></div>';
      $('[data-a="start"]', host).onclick = start;
    }
    const answered = i => TYPES[qs[i].t].grade(qs[i], S.st[i]).answered;
    const clock = () => Math.floor(S.sec / 60) + ':' + String(S.sec % 60).padStart(2, '0');
    function numbering() { const n = {}; let k = 0; S.order.forEach(o => o.forEach(i => { n[i] = ++k; })); return n; }
    function paper() {
      const num = numbering(), all = S.order.reduce((a, o) => a.concat(o), []);
      host.innerHTML = '<div class="xq xe-paper"><div class="xe-sticky"><div class="xe-stat"><span class="mono xe-clock"></span><span class="xe-count"></span><i class="xe-prog"><s></s></i><button type="button" class="btn sm" data-a="nav" aria-expanded="false">Questions</button><button type="button" class="btn sm primary" data-a="end">Hand in</button></div><div class="xe-nav" hidden></div></div><div class="xe-secs"></div><div class="xe-handin" id="xe-handin"></div></div>';
      const box = $('.xe-paper', host), nav = $('.xe-nav', box), wrap = $('.xe-secs', box);
      S.order.forEach((order, si) => {
        const sec = document.createElement('section'); sec.className = 'xe-sec';
        sec.innerHTML = '<div class="xe-sechead"><div class="eyebrow">Section ' + LETTER[si] + '</div><h2>' + esc(secs[si].name) + '</h2><p class="small muted">' + secMeta(secs[si]) + '</p></div>';
        order.forEach(i => {
          const q = qs[i], card = document.createElement('article'); card.className = 'xe-card'; card.id = 'xq-' + i;
          card.innerHTML = '<div class="xe-qhead"><b>Question ' + num[i] + '</b><span class="small muted">' + marks(q) + ' mark' + (marks(q) > 1 ? 's' : '') + '</span><button type="button" class="xe-flagb" data-flag="' + i + '" aria-pressed="' + !!S.flag[i] + '">' + (S.flag[i] ? '⚑ Flagged' : '⚐ Flag') + '</button></div><div class="xe-q"></div>';
          sec.appendChild(card);
          drawQ($('.xe-q', card), q, S.st[i], { locked: false, mode: 'exam', onChange: () => { keep(); status(); } });
        });
        wrap.appendChild(sec);
      });
      function status() {
        const done = all.filter(answered).length;
        $('.xe-count', box).textContent = done + ' of ' + all.length + ' answered';
        $('.xe-prog s', box).style.width = (done / all.length * 100) + '%';
        nav.innerHTML = all.map(i => '<button type="button" class="xe-n' + (answered(i) ? ' done' : '') + (S.flag[i] ? ' flag' : '') + '" data-go="' + i + '" aria-label="Question ' + num[i] + (answered(i) ? ', answered' : ', not answered') + (S.flag[i] ? ', flagged' : '') + '">' + num[i] + '</button>').join('');
        const un = all.filter(i => !answered(i)), fl = all.filter(i => S.flag[i]);
        $('.xe-handin', box).innerHTML = '<h2 class="xe-h">Hand in</h2><p>' + (un.length ? '<b>' + un.length + ' unanswered</b>, which will score 0: ' + un.slice(0, 40).map(i => '<button type="button" class="lk xe-to" data-go="' + i + '">Q' + num[i] + '</button>').join(' ') : 'Every question has an answer.') + '</p>' + (fl.length ? '<p>Flagged: ' + fl.map(i => '<button type="button" class="lk xe-to" data-go="' + i + '">Q' + num[i] + '</button>').join(' ') + '</p>' : '') + '<p class="small muted">You can\'t change your answers after this.</p><div class="row"><button type="button" class="btn primary" data-a="submit">Hand in the exam</button><button type="button" class="btn" data-a="abandon">Abandon this attempt</button></div>';
      }
      const clockEl = $('.xe-clock', box), tick = () => { clockEl.textContent = clock() + ' / ' + def.minutes + ':00'; };
      status(); tick();
      timer = setInterval(() => { S.sec++; tick(); if (S.sec % 5 === 0) keep(); }, 1000);
      const stickyH = () => $('.xe-sticky', box).getBoundingClientRect().height + 12;
      const goTo = el => { window.scrollTo({ top: scrollY + el.getBoundingClientRect().top - stickyH(), behavior: 'auto' }); };
      box.addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.go != null) { const c = document.getElementById('xq-' + b.dataset.go); if (c) goTo(c); return; }
        if (b.dataset.flag != null) { const i = b.dataset.flag; S.flag[i] = !S.flag[i]; b.setAttribute('aria-pressed', S.flag[i]); b.textContent = S.flag[i] ? '⚑ Flagged' : '⚐ Flag'; keep(); status(); return; }
        const a = b.dataset.a;
        if (a === 'nav') { nav.hidden = !nav.hidden; b.setAttribute('aria-expanded', !nav.hidden); }
        else if (a === 'end') goTo($('.xe-handin', box));
        else if (a === 'submit') submit();
        else if (a === 'abandon') { S = { sig: SIG, phase: 'intro' }; drop(KEY); draw(); window.scrollTo(0, 0); }
      });
    }
    function submit() {
      clearInterval(timer);
      S.res = qs.map((q, i) => { const g = TYPES[q.t].grade(q, S.st[i]); return { score: g.score, note: g.note, answered: g.answered }; });
      S.phase = 'done'; keep();
      const got = qs.reduce((a, q, i) => a + S.res[i].score * marks(q), 0), pct = Math.round(got / totalMarks * 100), old = load(BEST);
      if (!old || pct >= old.pct) save(BEST, { pct, date: new Date().toLocaleDateString() });
      draw(); window.scrollTo(0, 0);
    }
    function results() {
      const got = qs.reduce((a, q, i) => a + S.res[i].score * marks(q), 0), pct = Math.round(got / totalMarks * 100), pass = pct >= def.pass, num = numbering();
      const rows = secs.map((x, si) => { const g = x.ids.reduce((a, i) => a + S.res[i].score * marks(qs[i]), 0), m = x.ids.reduce((a, i) => a + marks(qs[i]), 0), p = Math.round(g / m * 100), href = x.ch ? BANK.page + '#ch' + x.ch : BANK.page; return '<a class="xe-topic" href="' + href + '"><span>' + LETTER[si] + ' · ' + esc(x.name) + '</span><i><s style="width:' + p + '%"></s></i><span class="mono">' + p + '%</span></a>'; }).join('');
      const m = Math.floor(S.sec / 60);
      host.innerHTML = '<div class="xq xe-done"><div class="eyebrow">Result</div><div class="xq-result"><b class="xq-big">' + pct + '%</b><span>' + fmtMarks(got) + ' of ' + totalMarks + ' marks · ' + (pass ? 'Pass' : 'Below the ' + def.pass + '% pass mark') + ' · ' + m + ' min</span></div><p class="xe-lead">' + (pct >= 90 ? 'That is exam-ready. Skim the review for anything you got by luck.' : pass ? 'A solid pass. The section scores show where the remaining marks are.' : pct >= 50 ? 'Close. Revisit your weakest sections below, then sit it again.' : 'Worth going back through the chapters first. Start with your lowest section.') + '</p><h2 class="xe-h">By section</h2><div class="xe-topics">' + rows + '</div><div class="row xe-revbar"><button type="button" class="btn sm" data-rev="miss">Missed only</button><button type="button" class="btn sm" data-rev="all">All questions</button><button type="button" class="btn primary sm" data-a="again">Sit it again</button></div><div class="xe-review"></div></div>';
      const list = $('.xe-review', host), paintRev = mode => {
        list.innerHTML = '';
        S.order.forEach((order, si) => {
          const shown = order.filter(i => mode === 'all' || S.res[i].score < 1); if (!shown.length) return;
          const sec = document.createElement('section'); sec.className = 'xe-sec'; sec.innerHTML = '<div class="xe-sechead"><div class="eyebrow">Section ' + LETTER[si] + '</div><h2>' + esc(secs[si].name) + '</h2></div>'; list.appendChild(sec);
          shown.forEach(i => { const d = document.createElement('article'); d.className = 'xe-card'; d.innerHTML = '<div class="xe-qhead"><b>Question ' + num[i] + '</b><span class="small muted">' + fmtMarks(S.res[i].score * marks(qs[i])) + ' of ' + marks(qs[i]) + (S.res[i].answered ? '' : ' · not answered') + '</span></div><div class="xe-q"></div><div class="xe-fb"></div>'; sec.appendChild(d); drawQ($('.xe-q', d), qs[i], S.st[i], { locked: true, reveal: true, mode: 'review' }); $('.xe-fb', d).innerHTML = feedbackHTML(qs[i], S.res[i], true); });
        });
        if (!list.children.length) list.innerHTML = '<p>Nothing missed. Full marks.</p>';
        $$('[data-rev]', host).forEach(b => b.setAttribute('aria-pressed', b.dataset.rev === mode));
      };
      paintRev('miss');
      host.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.rev) paintRev(b.dataset.rev); if (b.dataset.a === 'again') { S = { sig: SIG, phase: 'intro' }; drop(KEY); draw(); window.scrollTo(0, 0); } });
    }
    draw();
  }

  window.XQ = { TYPES, sim, toOps, ketString, overlap, circuitMatches, fillOK };
  if (!BANK) return;
  $$('[data-xq]').forEach(host => { const def = BANK.chapters && BANK.chapters[host.dataset.xq]; if (def) Quiz(host, host.dataset.xq, def); });
  const ex = $('[data-xexam]'); if (ex && BANK.exam) Exam(ex, BANK.exam);
})();
