(function () {
'use strict';

/* ============================================================ utilities */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const TAU = 2 * Math.PI, SQ = Math.SQRT1_2;
function rnd() { try { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 4294967296; } catch (e) { return Math.random(); } }
function randInt(lo, hi) { return lo + Math.floor(rnd() * (hi - lo + 1)); }
function clean(x) { return Math.abs(x) < 5e-10 ? 0 : x; }
function fnum(x, d = 3) { x = clean(x); let s = (+x.toFixed(d)).toString(); return s.replace('-', '−'); }
function fcx(re, im, d = 3) {
  re = clean(re); im = clean(im);
  if (im === 0) return fnum(re, d);
  if (re === 0) return (im < 0 ? '−' : '') + fnum(Math.abs(im), d) + 'i';
  return '(' + fnum(re, d) + (im < 0 ? ' − ' : ' + ') + fnum(Math.abs(im), d) + 'i)';
}
function bin(i, n) { return i.toString(2).padStart(n, '0'); }
function tok(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#000'; }
function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a; }
function modpow(b, e, m) { let r = 1; b %= m; while (e > 0) { if (e & 1) r = (r * b) % m; b = (b * b) % m; e >>= 1; } return r; }
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
function fmtAngle(rad) {
  const d = Math.round(rad * 180 / Math.PI * 1000) / 1000;
  const map = { 180: 'π', '-180': '−π', 90: 'π/2', '-90': '−π/2', 45: 'π/4', '-45': '−π/4', 22.5: 'π/8', '-22.5': '−π/8', 270: '3π/2', 360: '2π', 135: '3π/4', 60: 'π/3', 30: 'π/6', 120: '2π/3' };
  return map[d] !== undefined ? map[d] : (fnum(d, 1) + '°');
}
function sci(log10v, digits = 3) {
  if (log10v < 15) { const v = Math.round(Math.pow(10, log10v)); return v.toLocaleString('en-US'); }
  const e = Math.floor(log10v); const m = Math.pow(10, log10v - e);
  return '≈ ' + m.toFixed(2) + ' × 10' + sup(e);
}
function sup(n) { const m = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻' }; return String(n).split('').map(c => m[c] || c).join(''); }
function fmtTime(log10s) {
  const AGE = 17.638; // log10 of 4.35e17 s
  if (log10s < -6) return 'instant';
  if (log10s > AGE) { const k = log10s - AGE; return sci(k) + ' × age of universe'; }
  const s = Math.pow(10, log10s);
  if (s < 1e-3) return (s * 1e6).toFixed(1) + ' µs';
  if (s < 1) return (s * 1e3).toFixed(1) + ' ms';
  if (s < 60) return s.toFixed(1) + ' s';
  if (s < 3600) return (s / 60).toFixed(1) + ' min';
  if (s < 86400) return (s / 3600).toFixed(1) + ' hours';
  if (s < 3.156e7) return (s / 86400).toFixed(1) + ' days';
  const y = s / 3.156e7; return (y < 1e6 ? Math.round(y).toLocaleString('en-US') : sci(Math.log10(y))) + ' years';
}
function lgamma(n) { let s = 0; for (let i = 2; i <= n; i++) s += Math.log10(i); return s; } // log10(n!)

/* ============================================================ state-vector simulator */
const c4 = Math.cos(Math.PI / 4);
const G = {
  I: [1,0,0,0,0,0,1,0], H: [SQ,0,SQ,0,SQ,0,-SQ,0], X: [0,0,1,0,1,0,0,0], Y: [0,0,0,-1,0,1,0,0], Z: [1,0,0,0,0,0,-1,0],
  S: [1,0,0,0,0,0,0,1], SDG: [1,0,0,0,0,0,0,-1], T: [1,0,0,0,0,0,c4,c4], TDG: [1,0,0,0,0,0,c4,-c4], SX: [.5,.5,.5,-.5,.5,-.5,.5,.5]
};
function RX(t) { const c = Math.cos(t / 2), s = Math.sin(t / 2); return [c,0,0,-s,0,-s,c,0]; }
function RY(t) { const c = Math.cos(t / 2), s = Math.sin(t / 2); return [c,0,-s,0,s,0,c,0]; }
function RZ(t) { const c = Math.cos(t / 2), s = Math.sin(t / 2); return [c,-s,0,0,0,0,c,s]; }
function PH(l) { return [1,0,0,0,0,0,Math.cos(l),Math.sin(l)]; }
function matFor(g, a) {
  switch (g) { case 'RX': return RX(a); case 'RY': return RY(a); case 'RZ': return RZ(a); case 'P': case 'CP': return PH(a);
    case 'CX': case 'CCX': return G.X; case 'CZ': return G.Z; default: return G[g]; }
}
class QState {
  constructor(n) { this.n = n; this.N = 1 << n; this.re = new Float64Array(this.N); this.im = new Float64Array(this.N); this.re[0] = 1; }
  m(q) { return 1 << (this.n - 1 - q); }
  apply(M, t, ctrls) {
    const mk = this.m(t); let cm = 0; (ctrls || []).forEach(c => cm |= this.m(c));
    const [ar, ai, br, bi, cr, ci, dr, di] = M, re = this.re, im = this.im;
    for (let i = 0; i < this.N; i++) {
      if (i & mk) continue; if ((i & cm) !== cm) continue; const j = i | mk;
      const xr = re[i], xi = im[i], yr = re[j], yi = im[j];
      re[i] = ar * xr - ai * xi + br * yr - bi * yi; im[i] = ar * xi + ai * xr + br * yi + bi * yr;
      re[j] = cr * xr - ci * xi + dr * yr - di * yi; im[j] = cr * xi + ci * xr + dr * yi + di * yr;
    }
    return this;
  }
  swap(a, b) {
    const ma = this.m(a), mb = this.m(b);
    for (let i = 0; i < this.N; i++) if ((i & ma) && !(i & mb)) { const j = (i & ~ma) | mb;
      let t = this.re[i]; this.re[i] = this.re[j]; this.re[j] = t; t = this.im[i]; this.im[i] = this.im[j]; this.im[j] = t; }
    return this;
  }
  op(o) { if (o.g === 'M') return this; if (o.g === 'SWAP') return this.swap(o.t, o.c[0]); return this.apply(matFor(o.g, o.a), o.t, o.c || []); }
  run(ops) { ops.forEach(o => this.op(o)); return this; }
  probs() { const p = new Float64Array(this.N); for (let i = 0; i < this.N; i++) p[i] = this.re[i] ** 2 + this.im[i] ** 2; return p; }
  measure(q) {
    const mk = this.m(q); let p1 = 0;
    for (let i = 0; i < this.N; i++) if (i & mk) p1 += this.re[i] ** 2 + this.im[i] ** 2;
    const b = rnd() < p1 ? 1 : 0, norm = Math.sqrt(b ? p1 : 1 - p1);
    for (let i = 0; i < this.N; i++) { if (((i & mk) ? 1 : 0) !== b) { this.re[i] = 0; this.im[i] = 0; } else { this.re[i] /= norm; this.im[i] /= norm; } }
    return b;
  }
  ket(d = 3) {
    const parts = [];
    for (let i = 0; i < this.N; i++) {
      const r = clean(this.re[i]), m = clean(this.im[i]); if (r === 0 && m === 0) continue;
      parts.push(fcx(r, m, d) + '|' + bin(i, this.n) + '⟩');
    }
    return parts.join(' + ').replace(/\+ −/g, '− ') || '0';
  }
}
function sample(p, shots) {
  const c = new Array(p.length).fill(0), cum = []; let s = 0; for (const v of p) { s += v; cum.push(s); }
  for (let k = 0; k < shots; k++) { const r = rnd() * s; let i = 0; while (i < cum.length - 1 && r > cum[i]) i++; c[i]++; }
  return c;
}

/* ============================================================ SVG helpers */
function barChart(host, vals, opt = {}) {
  const N = vals.length, W = opt.w || 560, H = opt.h || 170, showLab = opt.labels !== false;
  const pb = showLab ? 26 : 8, pt = opt.pct ? 18 : 10, pl = 4, pr = 4;
  const signed = !!opt.signed;
  const maxv = opt.max || Math.max(1e-9, ...vals.map(Math.abs));
  const bw = (W - pl - pr) / N;
  const innerH = H - pt - pb;
  const base = signed ? pt + innerH / 2 : H - pb;
  const scale = signed ? innerH / 2 / maxv : innerH / maxv;
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opt.aria || 'bar chart')}">`;
  s += `<line class="c-axis" x1="${pl}" x2="${W - pr}" y1="${base}" y2="${base}"/>`;
  for (let i = 0; i < N; i++) {
    const v = vals[i], h = Math.abs(v) * scale, x = pl + i * bw + bw * 0.12, w = Math.max(1, bw * 0.76);
    const y = v >= 0 ? base - h : base;
    const cls = (opt.classes && opt.classes[i]) || (v < 0 ? 'c-neg' : 'c-pos');
    if (h > 0.05) s += `<rect class="${cls}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}"/>`;
    if (opt.pct && N <= 16 && Math.abs(v) > 0.0005) {
      const ty = v >= 0 ? y - 4 : y + h + 12;
      s += `<text class="c-txt-ink" x="${(x + w / 2).toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="middle">${opt.pctFmt ? opt.pctFmt(v) : (v * 100).toFixed(1) + '%'}</text>`;
    }
    if (showLab) {
      const step = N <= 16 ? 1 : Math.ceil(N / 8);
      if (i % step === 0) {
        const lab = opt.labels ? opt.labels[i] : String(i);
        s += `<text class="c-txt" x="${(x + w / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(lab)}</text>`;
      }
    }
  }
  if (opt.mean != null) { const y = base - opt.mean * scale; s += `<line class="c-mean" x1="${pl}" x2="${W - pr}" y1="${y.toFixed(2)}" y2="${y.toFixed(2)}"/><text class="c-txt-ink" x="${W - pr - 2}" y="${(y - 4).toFixed(1)}" text-anchor="end">mean</text>`; }
  host.innerHTML = s + '</svg>';
}
const GLBL = { SDG: 'S†', TDG: 'T†', SX: '√X', RX: 'Rx', RY: 'Ry', RZ: 'Rz', CP: 'P' };
function circuitSVG(n, ops, opt = {}) {
  const colW = 50, rowH = 44, left = opt.qlabels ? 62 : 42, top = 24;
  const cols = []; let ncol = ops.length;
  if (opt.pack) {
    const last = new Array(n).fill(-1); ncol = 0;
    ops.forEach(o => { const qs = [o.t, ...(o.c || [])], lo = Math.min(...qs), hi = Math.max(...qs); let c = 0;
      for (let q = lo; q <= hi; q++) c = Math.max(c, last[q] + 1);
      for (let q = lo; q <= hi; q++) last[q] = c; cols.push(c); ncol = Math.max(ncol, c + 1); });
  } else ops.forEach((o, k) => cols.push(k));
  const W = Math.max(220, left + ncol * colW + 26), H = top + (n - 1) * rowH + 30;
  const Y = q => top + q * rowH;
  let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="circuit diagram">`;
  for (let q = 0; q < n; q++) {
    const lab = opt.qlabels ? opt.qlabels[q] : 'q' + q;
    s += `<text class="clbl" x="4" y="${Y(q) + 4}">${esc(lab)}</text><line class="cw" x1="${left - 8}" x2="${W - 8}" y1="${Y(q)}" y2="${Y(q)}"/>`;
  }
  ops.forEach((o, k) => {
    const x = left + cols[k] * colW + colW / 2, y = Y(o.t);
    const hl = opt.hl != null && k < opt.hl ? '' : (opt.hl != null ? ' opacity="0.35"' : '');
    s += `<g${hl}>`;
    if (o.g === 'M') {
      s += `<rect class="cmeter" x="${x - 14}" y="${y - 12}" width="28" height="24"/><path d="M${x - 9} ${y + 6} A10 10 0 0 1 ${x + 9} ${y + 6}" fill="none" stroke="currentColor" stroke-width="1.3"/><line x1="${x}" y1="${y + 6}" x2="${x + 7}" y2="${y - 6}" stroke="currentColor" stroke-width="1.3"/>`;
    } else if (o.g === 'SWAP') {
      const y2 = Y(o.c[0]);
      s += `<line class="cline" x1="${x}" x2="${x}" y1="${y}" y2="${y2}"/>`;
      [y, y2].forEach(yy => { s += `<path d="M${x - 6} ${yy - 6} L${x + 6} ${yy + 6} M${x + 6} ${yy - 6} L${x - 6} ${yy + 6}" stroke="currentColor" stroke-width="2"/>`; });
    } else {
      const ctr = o.c || [];
      if (ctr.length) {
        const all = [o.t, ...ctr].map(Y);
        s += `<line class="cline" x1="${x}" x2="${x}" y1="${Math.min(...all)}" y2="${Math.max(...all)}"/>`;
        ctr.forEach(c => { s += `<circle class="cdot" cx="${x}" cy="${Y(c)}" r="4.5"/>`; });
      }
      if (o.g === 'CX' || o.g === 'CCX') {
        s += `<circle class="ctgt" cx="${x}" cy="${y}" r="11"/><line class="cline" x1="${x - 11}" x2="${x + 11}" y1="${y}" y2="${y}"/><line class="cline" x1="${x}" x2="${x}" y1="${y - 11}" y2="${y + 11}"/>`;
      } else if (o.g === 'CZ') {
        s += `<circle class="cdot" cx="${x}" cy="${y}" r="4.5"/>`;
      } else {
        const lbl = o.lbl || GLBL[o.g] || o.g;
        const hasA = ['RX', 'RY', 'RZ', 'P', 'CP'].includes(o.g) && !o.lbl;
        const w = Math.max(30, lbl.length * 8 + 12);
        s += `<rect class="cg" x="${x - w / 2}" y="${y - 13}" width="${w}" height="26"/><text class="cgt" x="${x}" y="${y + (hasA ? 0 : 4)}" text-anchor="middle">${esc(lbl)}</text>`;
        if (hasA) s += `<text class="cgt" style="font-size:9px;font-weight:400" x="${x}" y="${y + 10}" text-anchor="middle">${esc(fmtAngle(o.a))}</text>`;
      }
    }
    s += '</g>';
  });
  return s + '</svg>';
}

/* ============================================================ TOC */
(function toc() {
  const d = $('#toc-d'); if (!d) return;
  try { if (window.matchMedia('(min-width: 961px)').matches) d.open = true; } catch (e) { d.open = true; }
  const links = $$('.toc a'); const targets = links.map(a => document.getElementById(a.getAttribute('href').slice(1))).filter(Boolean);
  let ticking = false;
  function upd() {
    ticking = false; let cur = null;
    for (const t of targets) { if (t.getBoundingClientRect().top < 140) cur = t; else break; }
    links.forEach(a => a.classList.toggle('active', cur && a.getAttribute('href') === '#' + cur.id));
  }
  window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(upd); } }, { passive: true });
  upd();
})();

/* ============================================================ theme switch */
(function theme() {
  const btn = $('#theme-btn'), lbl = $('#theme-lbl'), root = document.documentElement;
  let mq = null; try { mq = window.matchMedia('(prefers-color-scheme: dark)'); } catch (e) {}
  const isDark = () => { const t = root.getAttribute('data-theme'); return t ? t === 'dark' : !!(mq && mq.matches); };
  let lastDark = null;
  const sync = () => { const d = isDark(); if (lbl) lbl.textContent = d ? 'Light mode' : 'Dark mode'; if (d !== lastDark) { lastDark = d; window.dispatchEvent(new Event('qc-theme')); } };
  if (btn) btn.addEventListener('click', () => {
    const next = isDark() ? 'light' : 'dark'; root.setAttribute('data-theme', next);
    try { localStorage.setItem('qc-theme', next); } catch (e) {}
    sync();
  });
  if (mq) { const f = () => sync(); if (mq.addEventListener) mq.addEventListener('change', f); else if (mq.addListener) mq.addListener(f); }
  try { new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ['data-theme'] }); } catch (e) {}
  sync();
})();

/* ============================================================ reading progress pill */
(function progress() {
  const pill = $('#pp'); if (!pill) return;
  const pct = $('#pp-pct'), sec = $('#pp-sec'), bar = $('#pp-bar');
  const targets = $$('.toc a').map(a => {
    const el = document.getElementById(a.getAttribute('href').slice(1));
    const chapA = a.closest('.chap') && a.closest('.chap').querySelector(':scope > a');
    const num = chapA && chapA !== a ? (chapA.textContent.split('·')[0] || '').trim() : '';
    return el ? { el, name: (num && /^\d/.test(num) ? 'Ch ' + num + ' · ' : '') + a.textContent.trim() } : null;
  }).filter(Boolean);
  let lastY = window.scrollY, upAcc = 0, win = [], hideT = null, cur, ready = false, ticking = false;
  setTimeout(() => { ready = true; cur = current(); fill(); }, 800);
  const isBar = () => window.matchMedia('(max-width:960px)').matches;
  function current() { let c = null; for (const t of targets) { if (t.el.getBoundingClientRect().top < 140) c = t; else break; } return c; }
  function percent() { const h = document.documentElement.scrollHeight - window.innerHeight; return h > 0 ? Math.min(100, Math.max(0, Math.round(window.scrollY / h * 100))) : 100; }
  function fill() { const p = percent(), c = current(); pct.textContent = p + '%'; bar.style.width = p + '%'; sec.textContent = c ? c.name : 'Introduction'; }
  function show() { fill(); pill.classList.add('show'); clearTimeout(hideT); hideT = setTimeout(() => pill.classList.remove('show'), 1700); }
  function check() {
    ticking = false;
    const y = window.scrollY, t = performance.now(), dy = y - lastY; lastY = y;
    win.push([t, Math.abs(dy)]); while (win.length && t - win[0][0] > 350) win.shift();
    const fast = win.reduce((a, b) => a + b[1], 0) > window.innerHeight * 0.9;   // big, quick jump
    if (dy < 0) upAcc += -dy; else if (dy > 0) upAcc = 0;                          // sustained upward scroll
    const c = current(), crossed = ready && c !== cur; if (ready) cur = c;          // entered a new section
    if (!ready) return;
    if (crossed || fast || upAcc > 80) show();
    else if (pill.classList.contains('show') || isBar()) fill();
  }
  window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(check); } }, { passive: true });
})();

/* ============================================================ Ch1: growth */
(function growth() {
  const n = $('#gr-n'); if (!n) return;
  const tb = $('#gr-table tbody'), c = $('#gr-c');
  function upd() {
    const v = +n.value; $('#gr-nv').textContent = v;
    const rows = [
      ['O(1)', 'Constant', 0], ['O(log n)', 'Logarithmic', Math.log10(Math.max(1, Math.log2(v)))],
      ['O(n)', 'Linear', Math.log10(v)], ['O(n log n)', 'Log-linear', Math.log10(v * Math.max(1, Math.log2(v)))],
      ['O(n²)', 'Quadratic', 2 * Math.log10(v)], ['O(n³)', 'Polynomial', 3 * Math.log10(v)],
      ['O(2ⁿ)', 'Exponential', v * Math.log10(2)], ['O(n!)', 'Factorial', lgamma(v)]
    ];
    tb.innerHTML = rows.map(r => `<tr><td class="mono">${r[0]}</td><td>${r[1]}</td><td class="num">${sci(r[2])}</td><td class="num">${fmtTime(r[2] - 9)}</td></tr>`).join('');
    const cv = +c.value; $('#gr-cv').textContent = cv;
    const lr = lgamma(cv - 1) - Math.log10(2);
    $('#gr-tsp').innerHTML = `Routes for ${cv} cities = (${cv}−1)!/2 = <b>${sci(lr)}</b>\nChecking 10⁹ routes per second: <b>${fmtTime(lr - 9)}</b>` + (cv === 20 ? '\n(Exactly 60,822,550,204,416,000 ≈ 6.08 × 10¹⁶)' : '');
  }
  n.addEventListener('input', upd); c.addEventListener('input', upd); upd();
})();

/* ============================================================ Ch1: memory */
(function memory() {
  const n = $('#mem-n'); if (!n) return;
  function bytes(l10) {
    const units = [['B', 0], ['KB', 3], ['MB', 6], ['GB', 9], ['TB', 12], ['PB', 15], ['EB', 18], ['ZB', 21], ['YB', 24]];
    if (l10 > 27) return sci(l10) + ' bytes';
    let u = units[0]; for (const x of units) if (l10 >= x[1]) u = x;
    return (Math.pow(10, l10 - u[1])).toFixed(1) + ' ' + u[0];
  }
  function upd() {
    const v = +n.value; $('#mem-nv').textContent = v;
    const la = v * Math.log10(2), lb = la + Math.log10(16);
    let cmp;
    if (lb < 10.2) cmp = 'Fits on a normal laptop (16 GB).';
    else if (lb < 16) cmp = 'Too big for a laptop; needs a supercomputer (Frontier has about 9 PB).';
    else if (la < 80) cmp = 'Bigger than every computer on Earth combined.';
    else cmp = 'More numbers than atoms in the observable universe (~10⁸⁰).';
    $('#mem-out').innerHTML = `${v} qubits → 2${sup(v)} = <b>${sci(la)}</b> amplitudes\nAt 16 bytes per complex number: <b>${bytes(lb)}</b>\n${cmp}\nEvery extra qubit doubles it.`;
  }
  n.addEventListener('input', upd);
  $$('#lab-memory [data-q]').forEach(b => b.addEventListener('click', () => { n.value = b.dataset.q; upd(); }));
  upd();
})();

/* ============================================================ Ch1: coin */
(function coin() {
  const gen = $('#cn-gen'); if (!gen) return;
  function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  gen.addEventListener('click', () => {
    const seed = parseInt($('#cn-seed').value, 10) || 0, r = mulberry(seed); let s = '';
    for (let i = 0; i < 24; i++) s += (r() < 0.5 ? 'H' : 'T') + (i % 8 === 7 ? '\n' : ' ');
    $('#cn-prng').textContent = 'seed ' + seed + ':\n' + s.trim();
  });
  const th = $('#cn-th');
  function upd(counts) {
    const t = +th.value * Math.PI / 180, p0 = Math.cos(t) ** 2;
    $('#cn-thv').textContent = th.value + '°';
    $('#cn-q').innerHTML = `|ψ⟩ = ${fnum(Math.cos(t))}|0⟩ + ${fnum(Math.sin(t))}|1⟩\nP(0) = cos²θ = <b>${fnum(p0)}</b>   P(1) = sin²θ = <b>${fnum(1 - p0)}</b>` + (counts ? `\nMeasured 100 times: 0 → ${counts[0]}, 1 → ${counts[1]}` : '');
    barChart($('#cn-chart'), counts ? [counts[0] / 100, counts[1] / 100] : [p0, 1 - p0], { labels: ['0', '1'], max: 1, pct: true, h: 140, w: 300, aria: 'quantum coin results' });
  }
  th.addEventListener('input', () => upd());
  $$('#lab-coin [data-th]').forEach(b => b.addEventListener('click', () => { th.value = b.dataset.th; upd(); }));
  $('#cn-meas').addEventListener('click', () => { const t = +th.value * Math.PI / 180, p0 = Math.cos(t) ** 2; upd(sample([p0, 1 - p0], 100)); });
  upd();
})();

/* ============================================================ Ch1: tabs */
(function tabs() {
  const box = $('#lab-apps'); if (!box) return;
  $$('[data-tab]', box).forEach(b => b.addEventListener('click', () => {
    $$('[data-tab]', box).forEach(x => x.classList.toggle('on', x === b));
    $$('[data-panel]', box).forEach(p => { p.hidden = p.dataset.panel !== b.dataset.tab; });
  }));
})();

/* ============================================================ Ch2: double slit */
(function slit() {
  const cv = $('#sl-canvas'); if (!cv) return;
  const ctx = cv.getContext('2d'); const W = cv.width, H = cv.height;
  const BINS = 72; let hits = [], hist = new Array(BINS).fill(0), timer = null;
  const sinc = u => Math.abs(u) < 1e-9 ? 1 : Math.sin(u) / u;
  function pdf(x, det) { if (det) return 0.5 * (sinc(3.2 * (x - 0.22)) ** 2 + sinc(3.2 * (x + 0.22)) ** 2); return sinc(3.2 * x) ** 2 * Math.cos(11 * x) ** 2; }
  function draw() {
    const det = $('#sl-det').checked, ink = tok('--ink'), mut = tok('--neg');
    ctx.fillStyle = tok('--bg'); ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = ink; ctx.lineWidth = 1.5; ctx.strokeRect(1, 1, W - 2, 168);
    ctx.fillStyle = ink; for (const h of hits) ctx.fillRect(h[0], h[1], 2.2, 2.2);
    const mx = Math.max(1, ...hist), bw = W / BINS;
    ctx.fillStyle = tok('--dim');
    hist.forEach((v, i) => { const h = v / mx * 70; ctx.fillRect(i * bw + 1, 255 - h, bw - 2, h); });
    ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.beginPath();
    let pm = 0; for (let i = 0; i <= 200; i++) pm = Math.max(pm, pdf(-1 + i / 100, det));
    for (let i = 0; i <= 200; i++) { const x = -1 + i / 100, px = (x + 1) / 2 * W, py = 255 - pdf(x, det) / pm * 70; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
    ctx.stroke();
    ctx.fillStyle = mut; ctx.font = '11px Inter, sans-serif'; ctx.fillText(det ? 'Expected pattern with detector: two blobs, no stripes' : 'Expected pattern: interference stripes', 8, 182);
  }
  function fire(k) {
    const det = $('#sl-det').checked;
    for (let j = 0; j < k; j++) {
      let x; do { x = -1 + 2 * rnd(); } while (rnd() > pdf(x, det));
      const px = (x + 1) / 2 * W; hits.push([px, 6 + rnd() * 158]);
      hist[Math.min(BINS - 1, Math.floor((x + 1) / 2 * BINS))]++;
    }
    if (hits.length > 6000) hits = hits.slice(-6000);
    $('#sl-status').textContent = hist.reduce((a, b) => a + b, 0) + ' particles detected.' + (det ? ' Detector ON: which-path is known, so the stripes vanish.' : '');
    draw();
  }
  function clear() { hits = []; hist.fill(0); $('#sl-status').textContent = '0 particles detected.'; draw(); }
  $('#sl-1').addEventListener('click', () => fire(1));
  $('#sl-100').addEventListener('click', () => fire(100));
  $('#sl-clear').addEventListener('click', clear);
  $('#sl-det').addEventListener('change', clear);
  window.addEventListener('qc-theme', draw);
  $('#sl-auto').addEventListener('click', e => {
    if (timer) { clearInterval(timer); timer = null; e.target.textContent = 'Auto fire'; }
    else { timer = setInterval(() => fire(8), 60); e.target.textContent = 'Stop'; }
  });
  draw();
})();

/* ============================================================ Bloch drawing */
function drawBloch(cv, vecs) {
  const dpr = window.devicePixelRatio || 1, size = 300;
  cv.width = size * dpr; cv.height = size * dpr; cv.style.width = Math.min(size, (cv.parentElement && cv.parentElement.clientWidth) || size) + 'px';
  const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cx = 150, cy = 150, R = 105, ink = tok('--ink');
  const P = (x, y, z) => [cx + R * (y * 0.94 - x * 0.36), cy - R * (z * 0.92 - x * 0.24)];
  ctx.fillStyle = tok('--bg'); ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = ink; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, R * 1.0, 0, TAU); ctx.stroke();
  ctx.lineWidth = 1; ctx.strokeStyle = tok('--neg');
  const curve = f => { ctx.beginPath(); for (let i = 0; i <= 120; i++) { const t = i / 120 * TAU, p = P(...f(t)); i ? ctx.lineTo(...p) : ctx.moveTo(...p); } ctx.stroke(); };
  curve(t => [Math.cos(t), Math.sin(t), 0]);
  ctx.setLineDash([3, 4]); curve(t => [Math.sin(t), 0, Math.cos(t)]); ctx.setLineDash([]);
  const axis = (a, b, lbl) => { const p = P(...a), q = P(...b); ctx.strokeStyle = tok('--dim'); ctx.beginPath(); ctx.moveTo(...p); ctx.lineTo(...q); ctx.stroke(); ctx.fillStyle = ink; ctx.font = '600 12px JetBrains Mono, monospace'; ctx.fillText(lbl, q[0] + (q[0] < cx ? -26 : 4), q[1] + 4); };
  axis([0, 0, -1], [0, 0, 1.18], '|0⟩'); ctx.fillText('|1⟩', P(0, 0, -1.25)[0] - 10, P(0, 0, -1.25)[1] + 6);
  axis([-1, 0, 0], [1.3, 0, 0], '|+⟩'); axis([0, -1, 0], [0, 1.22, 0], '|i⟩');
  vecs.forEach(v => {
    const o = P(0, 0, 0), e = P(v.x, v.y, v.z);
    ctx.strokeStyle = v.color || ink; ctx.lineWidth = v.w || 3; ctx.setLineDash(v.dash ? [6, 4] : []);
    ctx.beginPath(); ctx.moveTo(...o); ctx.lineTo(...e); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = v.color || ink; ctx.beginPath(); ctx.arc(e[0], e[1], 5.5, 0, TAU); ctx.fill();
  });
}
function blochOf(ar, ai, br, bi) {
  const x = 2 * (ar * br + ai * bi), y = 2 * (ar * bi - ai * br), z = (ar * ar + ai * ai) - (br * br + bi * bi);
  return { x, y, z };
}

/* ============================================================ Ch2: Bloch playground */
(function bloch() {
  const cv = $('#bl-canvas'); if (!cv) return;
  let st = new QState(1), hist = [], last = null;
  const ang = $('#bl-ang');
  ang.addEventListener('input', () => { $('#bl-angv').textContent = ang.value + '°'; });
  function render(extra) {
    const v = blochOf(st.re[0], st.im[0], st.re[1], st.im[1]);
    drawBloch(cv, [v]);
    const p0 = st.re[0] ** 2 + st.im[0] ** 2, th = Math.acos(Math.max(-1, Math.min(1, v.z))), ph = Math.atan2(v.y, v.x);
    $('#bl-out').innerHTML = `|ψ⟩ = ${fcx(st.re[0], st.im[0])}|0⟩ + ${fcx(st.re[1], st.im[1])}|1⟩`.replace('+ −', '− ') +
      `\nP(0) = <b>${fnum(p0)}</b>   P(1) = <b>${fnum(1 - p0)}</b>` +
      `\nBloch: x=${fnum(v.x, 2)} y=${fnum(v.y, 2)} z=${fnum(v.z, 2)}  (θ=${fnum(th * 180 / Math.PI, 1)}°, φ=${fnum((ph * 180 / Math.PI + 360) % 360, 1)}°)` +
      `\nGates: ${hist.length ? hist.join(' → ') : '(none)'}` + (extra ? '\n' + extra : '');
    barChart($('#bl-chart'), last || [p0, 1 - p0], { labels: ['0', '1'], max: 1, pct: true, h: 120, w: 300, aria: 'measurement probabilities' });
  }
  $$('#lab-bloch [data-g]').forEach(b => b.addEventListener('click', () => {
    const g = b.dataset.g, a = +ang.value * Math.PI / 180;
    st.apply(matFor(g, a), 0, []); hist.push(['RX', 'RY', 'RZ', 'P'].includes(g) ? (GLBL[g] || g) + '(' + ang.value + '°)' : (GLBL[g] || g)); last = null; render();
  }));
  $$('#lab-bloch [data-s]').forEach(b => b.addEventListener('click', () => {
    st = new QState(1); const s = b.dataset.s;
    if (s === '1') st.apply(G.X, 0); if (s === '+') st.apply(G.H, 0); if (s === '-') { st.apply(G.X, 0); st.apply(G.H, 0); } if (s === 'i') { st.apply(G.H, 0); st.apply(G.S, 0); }
    hist = []; last = null; render();
  }));
  $('#bl-shots').addEventListener('click', () => { const p = st.probs(), c = sample(p, 100); last = [c[0] / 100, c[1] / 100]; render(`100 shots: 0 → ${c[0]}, 1 → ${c[1]}`); });
  window.addEventListener('qc-theme', () => render()); window.addEventListener('resize', () => render());
  $('#bl-meas').addEventListener('click', () => { const b = st.measure(0); hist.push('measure=' + b); last = null; render(`Measured ${b}. The state collapsed to |${b}⟩; measure again and you get ${b} every time.`); });
  render();
})();

/* ============================================================ Ch2: circuit builder */
const D = Math.PI / 180;
const PRESETS = [
  { name: 'Bell pair', n: 2, ops: [{ g: 'H', t: 0 }, { g: 'CX', t: 1, c: [0] }], d: 'H on q0, then CNOT: (|00⟩ + |11⟩)/√2. Results 00 or 11, never 01/10.' },
  { name: 'Lab: Bell + extra H on q0 at the end', n: 2, ops: [{ g: 'H', t: 0 }, { g: 'CX', t: 1, c: [0] }, { g: 'H', t: 0 }], d: 'All four outcomes at 25%. The correlation hides in the minus sign on |11⟩.' },
  { name: 'Lab: extra H on q0 before the CNOT', n: 2, ops: [{ g: 'H', t: 0 }, { g: 'H', t: 0 }, { g: 'CX', t: 1, c: [0] }], d: 'H·H = I (interference), so the CNOT does nothing: 00 with 100%.' },
  { name: 'Interference: H then H', n: 1, ops: [{ g: 'H', t: 0 }, { g: 'H', t: 0 }], d: 'Paths to |1⟩ cancel: always 0.' },
  { name: 'Interference: H, Z, H', n: 1, ops: [{ g: 'H', t: 0 }, { g: 'Z', t: 0 }, { g: 'H', t: 0 }], d: 'Z moves the minus sign, so paths to |0⟩ cancel: always 1.' },
  { name: 'Phase kickback', n: 2, ops: [{ g: 'H', t: 0 }, { g: 'X', t: 1 }, { g: 'H', t: 1 }, { g: 'CX', t: 1, c: [0] }, { g: 'H', t: 0 }], d: 'q1 = |−⟩. The CNOT kicks a minus sign back onto q0 (|+⟩ → |−⟩); the final H turns it into 1 (100%).' },
  { name: 'Deutsch: constant f(x)=1', n: 2, ops: [{ g: 'X', t: 1 }, { g: 'H', t: 0 }, { g: 'H', t: 1 }, { g: 'X', t: 1, lbl: 'Uf' }, { g: 'H', t: 0 }], d: 'Oracle for f(x)=1 is just X on the target. q0 reads 0 → constant.' },
  { name: 'Deutsch: balanced f(x)=x', n: 2, ops: [{ g: 'X', t: 1 }, { g: 'H', t: 0 }, { g: 'H', t: 1 }, { g: 'CX', t: 1, c: [0] }, { g: 'H', t: 0 }], d: 'Oracle for f(x)=x is a CNOT. q0 reads 1 → balanced.' },
  { name: 'GHZ state (3 qubits)', n: 3, ops: [{ g: 'H', t: 0 }, { g: 'CX', t: 1, c: [0] }, { g: 'CX', t: 2, c: [1] }], d: '(|000⟩ + |111⟩)/√2: three qubits all linked.' },
  { name: 'Toffoli: 1 AND 1', n: 3, ops: [{ g: 'X', t: 0 }, { g: 'X', t: 1 }, { g: 'CCX', t: 2, c: [0, 1] }], d: 'Both controls are 1, so the target flips: |111⟩. A reversible AND.' },
  { name: 'Superdense coding, message 11', n: 2, ops: [{ g: 'H', t: 0 }, { g: 'CX', t: 1, c: [0] }, { g: 'X', t: 0 }, { g: 'Z', t: 0 }, { g: 'CX', t: 1, c: [0] }, { g: 'H', t: 0 }], d: 'Bell pair, Alice applies X then Z, Bob decodes with CNOT + H: reads 11.' },
  { name: 'QFT (2 qubits) of |01⟩', n: 2, ops: [{ g: 'X', t: 1 }, { g: 'H', t: 0 }, { g: 'CP', t: 0, c: [1], a: 90 * D }, { g: 'H', t: 1 }, { g: 'SWAP', t: 0, c: [1] }], d: 'Output is an even superposition; look at the phases: 1, i, −1, −i (one quarter-turn per step).' },
  { name: 'QFT then inverse QFT (lab demo)', n: 2, ops: [{ g: 'H', t: 0 }, { g: 'CP', t: 0, c: [1], a: 90 * D }, { g: 'H', t: 1 }, { g: 'SWAP', t: 0, c: [1] }, { g: 'SWAP', t: 0, c: [1] }, { g: 'H', t: 1 }, { g: 'CP', t: 0, c: [1], a: -90 * D }, { g: 'H', t: 0 }], d: 'QFT·QFT⁻¹ = I, so |00⟩ comes back with 100% (a single bar of 1024 counts).' },
  { name: 'Empty circuit', n: 2, ops: [], d: 'Build your own: choose a gate, a target (and control), then "Add gate".' }
];
(function builder() {
  const host = $('#lab-circuit'); if (!host) return;
  const sel = $('#cb-preset'), nSel = $('#cb-n'), gate = $('#cb-gate'), tS = $('#cb-t'), cS = $('#cb-c'), c2S = $('#cb-c2'), ang = $('#cb-ang');
  let n = 2, ops = [], shotCounts = null;
  sel.innerHTML = PRESETS.map((p, i) => `<option value="${i}">${esc(p.name)}</option>`).join('');
  function fillQ() { const o = Array.from({ length: n }, (_, i) => `<option value="${i}">q${i}</option>`).join(''); [tS, cS, c2S].forEach((s, k) => { const v = s.value; s.innerHTML = o; s.value = v && +v < n ? v : String(Math.min(k, n - 1)); }); }
  function need() { const g = gate.value; cS.disabled = !['CX', 'CZ', 'CP', 'SWAP', 'CCX'].includes(g); c2S.disabled = g !== 'CCX'; ang.disabled = !['RX', 'RY', 'RZ', 'P', 'CP'].includes(g); }
  function render() {
    $('#cb-svg').innerHTML = circuitSVG(n, ops);
    const st = new QState(n).run(ops), p = st.probs();
    let h = '';
    for (let i = 0; i < st.N; i++) {
      const r = clean(st.re[i]), m = clean(st.im[i]), z = r === 0 && m === 0;
      h += `<div${z ? ' style="color:var(--dim)"' : ''}>|${bin(i, n)}⟩  ${fcx(r, m).padStart(8, ' ')}   P=${(p[i] * 100).toFixed(1)}%</div>`;
    }
    $('#cb-state').innerHTML = h;
    const labels = Array.from({ length: st.N }, (_, i) => bin(i, n));
    if (shotCounts) { barChart($('#cb-hist'), shotCounts.map(c => c / 1024), { labels, max: 1, pct: true, pctFmt: v => Math.round(v * 1024), h: 170, aria: 'shot counts' }); $('#cb-hist-title').textContent = 'Counts from 1024 shots'; }
    else { barChart($('#cb-hist'), Array.from(p), { labels, max: 1, pct: true, h: 170, aria: 'probabilities' }); $('#cb-hist-title').textContent = 'Measurement probabilities'; }
  }
  function load(i) { const p = PRESETS[i]; n = p.n; nSel.value = String(n); ops = p.ops.map(o => Object.assign({}, o)); $('#cb-desc').textContent = p.d; shotCounts = null; fillQ(); render(); }
  sel.addEventListener('change', () => load(+sel.value));
  nSel.addEventListener('change', () => { n = +nSel.value; ops = ops.filter(o => o.t < n && (o.c || []).every(c => c < n)); shotCounts = null; fillQ(); render(); });
  gate.addEventListener('change', need);
  $('#cb-add').addEventListener('click', () => {
    const g = gate.value, t = +tS.value, c = +cS.value, c2 = +c2S.value, st = $('#cb-status');
    const o = { g, t };
    if (['CX', 'CZ', 'CP', 'SWAP'].includes(g)) { if (c === t) { st.textContent = 'Control and target must be different qubits.'; st.className = 'status bad'; return; } o.c = [c]; }
    if (g === 'CCX') { if (n < 3) { st.textContent = 'Toffoli needs 3 qubits. Switch "Qubits" to 3.'; st.className = 'status bad'; return; } if (new Set([t, c, c2]).size < 3) { st.textContent = 'Toffoli needs two controls and a target, all different.'; st.className = 'status bad'; return; } o.c = [c, c2]; }
    if (!ang.disabled) o.a = (+ang.value || 0) * D;
    if (ops.length >= 24) { st.textContent = 'That\'s 24 gates; undo or clear to add more.'; st.className = 'status bad'; return; }
    ops.push(o); shotCounts = null; st.textContent = 'Added ' + (GLBL[g] || g) + '.'; st.className = 'status ok'; render();
  });
  $('#cb-undo').addEventListener('click', () => { ops.pop(); shotCounts = null; render(); });
  $('#cb-clear').addEventListener('click', () => { ops = []; shotCounts = null; $('#cb-desc').textContent = 'Empty circuit: every qubit starts in |0⟩.'; render(); });
  $('#cb-shots').addEventListener('click', () => { shotCounts = sample(Array.from(new QState(n).run(ops).probs()), 1024); render(); });
  fillQ(); need(); load(0);
})();

/* ============================================================ Ch2: interference phasors */
(function phase() {
  const d = $('#ph-d'); if (!d) return;
  function upd() {
    const a = +d.value * D; $('#ph-dv').textContent = d.value + '°';
    const ox = 60, oy = 110, sc = 160;
    const p1 = [ox + 0.5 * sc, oy], p2 = [p1[0] + 0.5 * sc * Math.cos(a), oy - 0.5 * sc * Math.sin(a)];
    const P = (1 + Math.cos(a)) / 2;
    let s = `<svg viewBox="0 0 300 220" width="300" height="220" role="img" aria-label="amplitude arrows"><defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10z" fill="currentColor"/></marker><marker id="ah2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10z" class="f-mid"/></marker></defs>`;
    s += `<circle cx="${ox}" cy="${oy}" r="${sc}" fill="none" class="s-faint"/><line x1="10" x2="290" y1="${oy}" y2="${oy}" class="s-faint"/>`;
    s += `<line x1="${ox}" y1="${oy}" x2="${p1[0]}" y2="${p1[1]}" stroke="currentColor" stroke-width="2.5" marker-end="url(#ah)"/>`;
    s += `<line x1="${p1[0]}" y1="${p1[1]}" x2="${p2[0].toFixed(1)}" y2="${p2[1].toFixed(1)}" stroke="currentColor" stroke-width="2.5" marker-end="url(#ah)"/>`;
    if (P > 0.001) s += `<line x1="${ox}" y1="${oy}" x2="${p2[0].toFixed(1)}" y2="${p2[1].toFixed(1)}" class="s-mid" stroke-width="5" stroke-dasharray="7 4" marker-end="url(#ah2)"/>`;
    s += `<text class="c-txt-ink" x="${ox + 20}" y="${oy + 16}">path 1</text><text class="c-txt-ink" x="${(p1[0] + p2[0]) / 2 + 6}" y="${(p1[1] + p2[1]) / 2 - 6}">path 2</text></svg>`;
    $('#ph-svg').innerHTML = s;
    $('#ph-out').innerHTML = `Each path has amplitude ½ (length 0.5).\nPath 2 is turned by Δφ = ${d.value}°.\n\nQuantum (add arrows, then square):\nP = |½ + ½e^{iΔφ}|² = <b>${fnum(P)}</b>\n\nClassical (add the squares):\nP = ¼ + ¼ = <b>0.5</b> always\n\n` + (P > 0.97 ? 'Constructive: the arrows line up.' : P < 0.03 ? 'Destructive: the arrows cancel. This outcome never happens.' : 'Partial interference.') + '\nGrey dashed arrow = total amplitude.';
  }
  d.addEventListener('input', upd);
  $$('#lab-phase [data-ph]').forEach(b => b.addEventListener('click', () => { d.value = b.dataset.ph; upd(); }));
  upd();
})();

/* ============================================================ Ch2: teleportation */
(function tele() {
  const nx = $('#tp-next'); if (!nx) return;
  const th = $('#tp-th'), ph = $('#tp-ph'); let step = 0, st, m0, m1;
  const OPS = [{ g: 'H', t: 1 }, { g: 'CX', t: 2, c: [1] }, { g: 'CX', t: 1, c: [0] }, { g: 'H', t: 0 }, { g: 'M', t: 0 }, { g: 'M', t: 1 }, { g: 'X', t: 2, lbl: 'X^m1' }, { g: 'Z', t: 2, lbl: 'Z^m0' }];
  const HL = [0, 1, 2, 3, 4, 6, 6, 8];
  function psi() { const t = +th.value * D, p = +ph.value * D; return [Math.cos(t / 2), 0, Math.sin(t / 2) * Math.cos(p), Math.sin(t / 2) * Math.sin(p)]; }
  function reset() {
    $('#tp-thv').textContent = th.value + '°'; $('#tp-phv').textContent = ph.value + '°';
    const [ar, ai, br, bi] = psi(); st = new QState(3); st.re.fill(0); st.im.fill(0);
    st.re[0] = ar; st.im[0] = ai; st.re[4] = br; st.im[4] = bi; step = 0; m0 = m1 = null; render();
  }
  function bob() {
    if (m0 == null) return null; const base = (m0 << 2) | (m1 << 1);
    return [st.re[base], st.im[base], st.re[base | 1], st.im[base | 1]];
  }
  function render() {
    $$('#tp-steps li').forEach((li, i) => { li.classList.toggle('done', i < step); li.classList.toggle('cur', i === step); });
    $('#tp-svg').innerHTML = circuitSVG(3, OPS, { hl: HL[step], qlabels: ['q0 ψ', 'q1 A', 'q2 B'] });
    const [ar, ai, br, bi] = psi(), v0 = blochOf(ar, ai, br, bi);
    let s = `State to send |ψ⟩ = ${fnum(ar)}|0⟩ + ${fcx(br, bi)}|1⟩\nOriginal Bloch vector: (${fnum(v0.x, 2)}, ${fnum(v0.y, 2)}, ${fnum(v0.z, 2)})\n\n3-qubit state |q0 q1 q2⟩:\n${st.ket(3)}`;
    if (m0 != null) s += `\n\nAlice measured m0=${m0}, m1=${m1} → phones Bob "${m0}${m1}".`;
    const b = bob();
    if (b && step >= 7) {
      const v = blochOf(...b);
      const fid = Math.pow(ar * b[0] + ai * b[1] + br * b[2] + bi * b[3], 2) + Math.pow(ar * b[1] - ai * b[0] + br * b[3] - bi * b[2], 2);
      s += `\nBob's qubit now: ${fcx(b[0], b[1])}|0⟩ + ${fcx(b[2], b[3])}|1⟩\nBob's Bloch vector: (${fnum(v.x, 2)}, ${fnum(v.y, 2)}, ${fnum(v.z, 2)})\n<b>Match with the original: fidelity ${fnum(fid, 4)}</b>`;
      s += '\n\nTeleported. Alice\'s q0 is now just a plain |' + m0 + '⟩: the original is gone (no cloning).';
    } else if (b) { const v = blochOf(...b); s += `\nBob's qubit before fixing: (${fnum(v.x, 2)}, ${fnum(v.y, 2)}, ${fnum(v.z, 2)}), a scrambled (rotated) version of ψ. The 2 bits tell him how to undo it.`; }
    $('#tp-out').innerHTML = s;
    nx.disabled = step >= 7;
  }
  function next() {
    if (step >= 7) return;
    if (step === 0) st.op(OPS[0]); else if (step === 1) st.op(OPS[1]); else if (step === 2) st.op(OPS[2]); else if (step === 3) st.op(OPS[3]);
    else if (step === 4) { m0 = st.measure(0); m1 = st.measure(1); }
    else if (step === 5) { /* sending bits */ }
    else if (step === 6) { if (m1) st.apply(G.X, 2); if (m0) st.apply(G.Z, 2); }
    step++; render();
  }
  nx.addEventListener('click', next);
  $('#tp-all').addEventListener('click', () => { while (step < 7) next(); });
  $('#tp-reset').addEventListener('click', reset);
  th.addEventListener('input', reset); ph.addEventListener('input', reset);
  reset();
})();

/* ============================================================ Ch2: superdense coding */
(function sdc() {
  const box = $('#lab-sdc'); if (!box) return;
  function run(bits) {
    $$('[data-b]', box).forEach(b => b.classList.toggle('on', b.dataset.b === bits));
    const enc = { '00': [], '01': [{ g: 'X', t: 0 }], '10': [{ g: 'Z', t: 0 }], '11': [{ g: 'X', t: 0 }, { g: 'Z', t: 0 }] }[bits];
    const share = [{ g: 'H', t: 0 }, { g: 'CX', t: 1, c: [0] }], dec = [{ g: 'CX', t: 1, c: [0] }, { g: 'H', t: 0 }];
    const ops = share.concat(enc.length ? enc : [{ g: 'I', t: 0, lbl: 'I' }], dec, [{ g: 'M', t: 0 }, { g: 'M', t: 1 }]);
    $('#sd-svg').innerHTML = circuitSVG(2, ops, { qlabels: ['q0 Alice', 'q1 Bob'] });
    const s1 = new QState(2).run(share), s2 = new QState(2).run(share.concat(enc)), s3 = new QState(2).run(share.concat(enc, dec));
    const names = { '00': '|Φ+⟩', '01': '|Ψ+⟩', '10': '|Φ−⟩', '11': '−|Ψ−⟩' };
    const p = s3.probs(); let out = 0; for (let i = 0; i < 4; i++) if (p[i] > 0.5) out = i;
    $('#sd-out').innerHTML = `1. Shared Bell pair:        ${s1.ket()}\n2. Alice applies ${enc.length ? enc.map(o => o.g).join(' then ') : 'I (nothing)'} to q0:  ${s2.ket()}   = ${names[bits]}\n3. Alice sends q0 to Bob (1 qubit travels).\n4. Bob: CNOT, then H on q0:  ${s3.ket()}\n5. Bob measures: <b>${bin(out, 2)}</b> with 100%. Message "${bits}" received.`;
  }
  $$('[data-b]', box).forEach(b => b.addEventListener('click', () => run(b.dataset.b)));
  run('10');
})();

/* ============================================================ Ch3: chip routing */
(function chip() {
  const host = $('#chip-svg'); if (!host) return;
  const pos = { 0: [0, 0], 1: [1, 0], 2: [2, 0], 3: [1, 1], 4: [0, 2], 5: [1, 2], 6: [2, 2] };
  const E = [[0, 1], [1, 2], [1, 3], [3, 5], [4, 5], [5, 6]];
  let sel = [], path = [];
  const adj = {}; for (let i = 0; i < 7; i++) adj[i] = []; E.forEach(([a, b]) => { adj[a].push(b); adj[b].push(a); });
  function bfs(a, b) { const prev = { [a]: -1 }, q = [a]; while (q.length) { const u = q.shift(); if (u === b) break; for (const v of adj[u]) if (!(v in prev)) { prev[v] = u; q.push(v); } } const p = []; let u = b; while (u !== -1) { p.unshift(u); u = prev[u]; } return p; }
  function render() {
    const P = i => [50 + pos[i][0] * 90, 40 + pos[i][1] * 80];
    const onPath = (a, b) => { for (let i = 0; i < path.length - 1; i++) if ((path[i] === a && path[i + 1] === b) || (path[i] === b && path[i + 1] === a)) return true; return false; };
    let s = '<svg viewBox="0 0 280 240" width="280" height="240" role="img" aria-label="7-qubit coupling map">';
    E.forEach(([a, b]) => { const p = P(a), q = P(b); s += `<line class="edge${onPath(a, b) ? ' path' : ''}" x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}"/>`; });
    for (let i = 0; i < 7; i++) { const [x, y] = P(i), isSel = sel.includes(i), onp = path.includes(i) && !isSel;
      s += `<g style="cursor:pointer" data-node="${i}" tabindex="0" role="button" aria-label="qubit ${i}"><circle class="node${isSel ? ' sel' : onp ? ' path' : ''}" cx="${x}" cy="${y}" r="20"/><text class="ntxt${isSel ? ' sel' : ''}" x="${x}" y="${y + 5}" text-anchor="middle">${i}</text></g>`; }
    host.innerHTML = s + '</svg>';
    $$('[data-node]', host).forEach(g => { const f = () => pick(+g.dataset.node); g.addEventListener('click', f); g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); f(); } }); });
    const out = $('#chip-out');
    if (sel.length < 2) out.textContent = sel.length ? `Control = qubit ${sel[0]}. Now pick a target.` : 'No CNOT chosen yet.';
    else {
      const sw = path.length - 2;
      out.innerHTML = `CNOT from qubit ${sel[0]} to qubit ${sel[1]}\nRoute: ${path.join(' → ')}\n` + (sw === 0 ? '<b>Neighbours: no SWAPs needed.</b>' : `<b>${sw} SWAP${sw > 1 ? 's' : ''}</b> to bring them together = ${sw * 3} extra CNOTs\n(each SWAP = 3 CNOTs, and every CNOT adds noise)`);
    }
  }
  function pick(i) { if (sel.length >= 2) { sel = []; path = []; } if (sel[0] === i) return; sel.push(i); if (sel.length === 2) path = bfs(sel[0], sel[1]); render(); }
  $('#chip-ex').addEventListener('click', () => { sel = [0, 6]; path = bfs(0, 6); render(); });
  $('#chip-reset').addEventListener('click', () => { sel = []; path = []; render(); });
  render();
})();

/* ============================================================ Ch3: Deutsch–Jozsa */
(function dj() {
  const nS = $('#dj-n'); if (!nS) return;
  const fS = $('#dj-f'); let f = [], kind = '';
  function make() {
    const n = +nS.value, N = 1 << n; let t = fS.value;
    if (t === 'mystery') t = rnd() < 0.5 ? (rnd() < 0.5 ? 'c0' : 'c1') : 'bal';
    kind = t === 'bal' ? 'balanced' : 'constant';
    if (t === 'c0') f = new Array(N).fill(0); else if (t === 'c1') f = new Array(N).fill(1);
    else { const idx = [...Array(N).keys()]; for (let i = N - 1; i > 0; i--) { const j = randInt(0, i); [idx[i], idx[j]] = [idx[j], idx[i]]; } f = new Array(N).fill(0); idx.slice(0, N / 2).forEach(i => f[i] = 1); }
    $('#dj-out').textContent = `A new secret function on ${n} bit${n > 1 ? 's' : ''} (${N} inputs) is loaded. Constant or balanced?`;
    $('#dj-chart').innerHTML = '';
  }
  $('#dj-new').addEventListener('click', make); nS.addEventListener('change', make); fS.addEventListener('change', make);
  $('#dj-classic').addEventListener('click', () => {
    const n = +nS.value, N = 1 << n; const order = [...Array(N).keys()]; for (let i = N - 1; i > 0; i--) { const j = randInt(0, i); [order[i], order[j]] = [order[j], order[i]]; }
    const seen = []; let verdict = '';
    for (const x of order) { seen.push(`f(${bin(x, n)}) = ${f[x]}`); if (seen.length > 1 && f[x] !== f[order[0]]) { verdict = 'balanced (two different outputs seen)'; break; } if (seen.length === N / 2 + 1) { verdict = 'constant (more than half the inputs agree)'; break; } }
    $('#dj-out').innerHTML = seen.join('\n') + `\n\nClassical answer after <b>${seen.length} queries</b>: ${verdict}.\nWorst case for n=${n}: 2^(n−1)+1 = ${N / 2 + 1} queries.`;
  });
  $('#dj-quantum').addEventListener('click', () => {
    const n = +nS.value, N = 1 << n, amp = new Array(N).fill(0);
    for (let y = 0; y < N; y++) { let s = 0; for (let x = 0; x < N; x++) { let dot = x & y, par = 0; while (dot) { par ^= dot & 1; dot >>= 1; } s += ((f[x] + par) & 1) ? -1 : 1; } amp[y] = s / N; }
    const p = amp.map(a => a * a), p0 = p[0];
    barChart($('#dj-chart'), p, { labels: [...Array(N).keys()].map(i => bin(i, n)), max: 1, pct: N <= 16, h: 160, aria: 'Deutsch–Jozsa output' });
    $('#dj-out').innerHTML = `1 oracle query. Amplitude of |${'0'.repeat(n)}⟩ = (1/${N})·Σ(−1)^f(x) = <b>${fnum(amp[0])}</b>\nP(all zeros) = <b>${fnum(p0)}</b> → <b>${p0 > 0.5 ? 'CONSTANT' : 'BALANCED'}</b>` + (p0 < 0.5 ? '\nThe + and − signs cancelled exactly, so 00…0 never appears.' : '\nAll signs agreed, so every path led to 00…0.');
  });
  $('#dj-reveal').addEventListener('click', () => { const n = +nS.value; $('#dj-out').innerHTML = `It was <b>${kind}</b>.\nTruth table: ${f.map((v, i) => bin(i, n) + '→' + v).join('  ')}`; });
  make();
})();

/* ============================================================ Ch3: Grover */
(function grover() {
  const nS = $('#gv-n'); if (!nS) return;
  const tS = $('#gv-t'); let a, k = 0, last = '';
  function fillT() { const n = +nS.value, N = 1 << n; const v = tS.value; tS.innerHTML = [...Array(N).keys()].map(i => `<option value="${i}">${bin(i, n)}</option>`).join(''); tS.value = v && +v < N ? v : String(n === 3 ? 6 : N - 2); }
  function reset() { const N = 1 << +nS.value; a = new Float64Array(N).fill(1 / Math.sqrt(N)); k = 0; last = 'Start: equal superposition (H on every qubit).'; render(); }
  function oracle() { a[+tS.value] *= -1; last = `Oracle flipped the sign of |${bin(+tS.value, +nS.value)}⟩. Probabilities are unchanged.`; }
  function diff() { const m = a.reduce((s, v) => s + v, 0) / a.length; for (let i = 0; i < a.length; i++) a[i] = 2 * m - a[i]; last = `Diffusion reflected every amplitude about the mean (${fnum(m)}).`; }
  function render() {
    const n = +nS.value, N = 1 << n, t = +tS.value, mean = a.reduce((s, v) => s + v, 0) / N;
    const cls = [...Array(N).keys()].map(i => i === t ? (a[i] < 0 ? 'c-neg' : 'c-hi') : (a[i] < 0 ? 'c-neg' : 'c-dim'));
    barChart($('#gv-chart'), Array.from(a), { signed: true, max: 1, mean, classes: cls, labels: [...Array(N).keys()].map(i => bin(i, n)), h: 210, pct: N <= 8, pctFmt: v => fnum(v, 3), aria: 'Grover amplitudes' });
    const opt = Math.floor(Math.PI / 4 * Math.sqrt(N));
    $('#gv-status').innerHTML = `${last}  ·  Iterations: <b>${k}</b>  ·  P(target) = <b>${(a[t] ** 2 * 100).toFixed(1)}%</b>  ·  Optimal ≈ ⌊π/4·√${N}⌋ = <b>${opt}</b>`;
  }
  $('#gv-oracle').addEventListener('click', () => { oracle(); render(); });
  $('#gv-diff').addEventListener('click', () => { diff(); k++; render(); });
  $('#gv-iter').addEventListener('click', () => { oracle(); diff(); k++; last = 'One full iteration (oracle + diffusion).'; render(); });
  $('#gv-opt').addEventListener('click', () => { reset(); const N = 1 << +nS.value, opt = Math.floor(Math.PI / 4 * Math.sqrt(N)); for (let i = 0; i < opt; i++) { oracle(); diff(); k++; } last = `Ran ${opt} iterations.`; render(); });
  $('#gv-reset').addEventListener('click', reset);
  nS.addEventListener('change', () => { fillT(); reset(); }); tS.addEventListener('change', reset);
  fillT(); reset();
})();

/* ============================================================ Ch3: RSA estimate chart */
(function rsa() {
  const host = $('#rsa-svg'); if (!host) return;
  const rows = [['2012 estimate', 9, '~1 billion'], ['2019 estimate', Math.log10(2e7), '~20 million'], ['2025 estimate', 6, '< 1 million'], ['2025 chip (IBM Nighthawk)', Math.log10(120), '~120 qubits']];
  const W = 640, L = 190, R = 90, rowH = 34, H = rows.length * rowH + 40, maxL = 9;
  const x = v => L + (v / maxL) * (W - L - R);
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Qubits needed to break RSA-2048, log scale">`;
  for (let e = 0; e <= 9; e += 3) s += `<line class="c-grid" x1="${x(e)}" x2="${x(e)}" y1="8" y2="${H - 26}"/><text class="c-txt" x="${x(e)}" y="${H - 10}" text-anchor="middle">10${sup(e)}</text>`;
  rows.forEach((r, i) => { const y = 14 + i * rowH; s += `<text class="c-txt-ink" x="${L - 8}" y="${y + 15}" text-anchor="end">${r[0]}</text><rect class="${i === 3 ? 'c-dim' : 'c-pos'}" x="${L}" y="${y}" width="${(x(r[1]) - L).toFixed(1)}" height="20"/><text class="c-txt-ink" x="${x(r[1]) + 6}" y="${y + 15}">${r[2]}</text>`; });
  host.innerHTML = s + '</svg>';
})();

/* ============================================================ Ch3: Shor */
function qpeProb(phi, M, m) { const d = phi - m / M; const sd = Math.sin(Math.PI * d); if (Math.abs(sd) < 1e-12) return 1; const v = Math.sin(Math.PI * M * d) / (M * sd); return v * v; }
function convergents(num, den) { const cf = []; let a = num, b = den; while (b) { cf.push(Math.floor(a / b)); [a, b] = [b, a % b]; } const out = []; let p0 = 0, q0 = 1, p1 = 1, q1 = 0; for (const x of cf) { const p2 = x * p1 + p0, q2 = x * q1 + q0; out.push([p2, q2]); p0 = p1; q0 = q1; p1 = p2; q1 = q2; } return out; }
(function shor() {
  const run = $('#sh-run'); if (!run) return;
  const Ni = $('#sh-N'), ai = $('#sh-a');
  function isPrime(n) { if (n < 2) return false; for (let i = 2; i * i <= n; i++) if (n % i === 0) return false; return true; }
  function go() {
    const N = Math.floor(+Ni.value), a = Math.floor(+ai.value), out = $('#sh-out');
    $('#sh-seq').innerHTML = ''; $('#sh-qpe').innerHTML = ''; $('#sh-cf').textContent = '';
    if (!(N >= 4 && N <= 2000)) { out.textContent = 'Pick N between 4 and 2000.'; return; }
    if (N % 2 === 0) { out.innerHTML = `N = ${N} is even, so 2 is a factor: <b>${N} = 2 × ${N / 2}</b>. Shor is only needed for odd N.`; return; }
    if (isPrime(N)) { out.textContent = `N = ${N} is prime. There's nothing to factor.`; return; }
    for (let p = 3; p * p <= N; p += 2) { let q = N; while (q % p === 0) q /= p; if (q === 1) { out.innerHTML = `N = ${N} is a power of the prime ${p}. Shor assumes N is not a prime power; a classical check finds <b>${p}</b> directly.`; return; } }
    if (!(a >= 2 && a < N)) { out.textContent = `Pick a with 2 ≤ a < ${N}.`; return; }
    const g = gcd(a, N); let s = `Step 1. gcd(${a}, ${N}) = ${g}`;
    if (g > 1) { out.innerHTML = s + `\nLucky! ${a} already shares a factor with ${N}: <b>${N} = ${g} × ${N / g}</b>\n(No quantum computer needed this time. Try another a to see the period finding.)`; return; }
    s += ' → no shortcut, so find the period.';
    let r = 1; while (modpow(a, r, N) !== 1) r++;
    s += `\nStep 2. Smallest r with ${a}^r ≡ 1 (mod ${N}): <b>r = ${r}</b>   ← the quantum computer's job`;
    const L = Math.min(Math.max(3 * r + 1, 12), 60), seq = [...Array(L).keys()].map(x => modpow(a, x, N));
    barChart($('#sh-seq'), seq.map(v => v / N), { labels: [...Array(L).keys()].map(String), max: 1, classes: seq.map(v => v === 1 ? 'c-pos' : 'c-dim'), h: 130, aria: 'power sequence' });
    let ok = false;
    if (r % 2) s += `\nStep 3. r = ${r} is odd → this a fails. Retry with another a.`;
    else {
      const x = modpow(a, r / 2, N);
      s += `\nStep 3. r is even. x = ${a}^${r / 2} mod ${N} = ${x}`;
      if (x === N - 1) s += `\n        But x ≡ −1 (mod ${N}) → this a fails. Retry with another a.`;
      else { const p = gcd(x - 1, N), q = gcd(x + 1, N); s += `\nStep 4. gcd(${x}−1, ${N}) = ${p},  gcd(${x}+1, ${N}) = ${q}\n<b>${N} = ${p} × ${N / p}</b>`; ok = true; }
    }
    out.innerHTML = s;
    const M = 256, P = new Array(M).fill(0);
    for (let m = 0; m < M; m++) { let t = 0; for (let k = 0; k < r; k++) t += qpeProb(k / r, M, m); P[m] = t / r; }
    barChart($('#sh-qpe'), P, { labels: [...Array(M).keys()].map(String), h: 150, w: 720, aria: 'QPE histogram' });
    const peaks = []; for (let m = 0; m < M; m++) if (P[m] > 0.02 && P[m] >= (P[m - 1] || 0) && P[m] >= (P[m + 1] || 0)) peaks.push(m);
    peaks.sort((x, y) => P[y] - P[x]);
    const lines = peaks.slice(0, 5).map(m => {
      if (m === 0) return `m = 0 → phase 0: tells us nothing (s = 0). Run again.`;
      const conv = convergents(m, M).filter(([, q]) => q < N); let best = conv.length ? conv[conv.length - 1] : [0, 1];
      for (const c of conv) if (Math.abs(m / M - c[0] / c[1]) < 1 / (2 * M)) { best = c; break; }
      return `m = ${m} → m/256 = ${fnum(m / M, 4)} ≈ ${best[0]}/${best[1]} → candidate r = ${best[1]}` + (best[1] === r ? '  ✓' : (r % best[1] === 0 ? `  (a divisor of r; combine runs)` : ''));
    });
    $('#sh-cf').textContent = `Peaks sit near multiples of 256/r = ${fnum(256 / r, 2)}. Continued fractions turn a measured m into r:\n` + lines.join('\n') + (ok ? '' : '');
  }
  run.addEventListener('click', go);
  $('#sh-rand').addEventListener('click', () => { const N = Math.floor(+Ni.value); if (N > 3) ai.value = randInt(2, N - 1); go(); });
  go();
})();

/* ============================================================ Ch3: VQE */
(function vqe() {
  const th = $('#vq-th'); if (!th) return;
  const C = t => Math.cos(t) + 0.8 * Math.sin(t), dC = t => -Math.sin(t) + 0.8 * Math.cos(t);
  const Emin = -Math.sqrt(1.64); let steps = 0, path = [];
  function render() {
    const t = +th.value * D; $('#vq-thv').textContent = Math.round(+th.value) + '°';
    const W = 600, H = 200, L = 40, R = 10, T = 10, B = 26;
    const X = d => L + d / 360 * (W - L - R), Y = e => T + (1.4 - e) / 2.8 * (H - T - B);
    let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="VQE cost curve">`;
    [-1, 0, 1].forEach(e => { s += `<line class="c-grid" x1="${L}" x2="${W - R}" y1="${Y(e)}" y2="${Y(e)}"/><text class="c-txt" x="${L - 6}" y="${Y(e) + 4}" text-anchor="end">${fnum(e)}</text>`; });
    [0, 90, 180, 270, 360].forEach(d => { s += `<text class="c-txt" x="${X(d)}" y="${H - 8}" text-anchor="middle">${d}°</text>`; });
    s += `<line class="c-mean" x1="${L}" x2="${W - R}" y1="${Y(Emin)}" y2="${Y(Emin)}"/><text class="c-txt-ink" x="${W - R - 2}" y="${Y(Emin) + 14}" text-anchor="end">true ground energy ${fnum(Emin)}</text>`;
    let d = ''; for (let i = 0; i <= 360; i += 2) d += (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(C(i * D)).toFixed(1);
    s += `<path class="c-curve" d="${d}"/>`;
    path.forEach(p => { s += `<circle cx="${X(p)}" cy="${Y(C(p * D))}" r="3" class="f-mid"/>`; });
    s += `<circle cx="${X(+th.value)}" cy="${Y(C(t))}" r="7" fill="currentColor"/>`;
    $('#vq-chart').innerHTML = s + '</svg>';
    const e = C(t);
    $('#vq-out').innerHTML = `θ = ${fnum(+th.value, 1)}°   C(θ) = ⟨Z⟩ + 0.8⟨X⟩ = cos θ + 0.8 sin θ = <b>${fnum(e, 4)}</b>\nTrue lowest energy = −√(1 + 0.8²) = ${fnum(Emin, 4)}   Gap: ${fnum(e - Emin, 4)}\nOptimizer steps so far: ${steps}` + (e - Emin < 1e-3 ? '\n<b>Converged.</b> The circuit now prepares the ground state.' : '');
  }
  function step() { let t = +th.value * D; t -= 0.35 * dC(t); let deg = ((t / D) % 360 + 360) % 360; path.push(+th.value); th.value = deg; steps++; render(); }
  th.addEventListener('input', () => { steps = 0; path = []; render(); });
  $('#vq-step').addEventListener('click', step);
  $('#vq-run').addEventListener('click', () => { for (let i = 0; i < 25; i++) step(); });
  $('#vq-reset').addEventListener('click', () => { th.value = 20; steps = 0; path = []; render(); });
  render();
})();

/* ============================================================ Ch4: hidden beat */
(function beat() {
  const play = $('#bt-play'); if (!play) return;
  let period = 3, ac = null, playing = false, total = 0;
  const guess = $('#bt-guess');
  for (let p = 2; p <= 10; p++) { const b = document.createElement('button'); b.className = 'btn'; b.textContent = p; b.addEventListener('click', () => check(p)); guess.appendChild(b); }
  function build() {
    const cycles = Math.max(2, Math.min(4, Math.floor(24 / period))); total = period * cycles;
    $('#bt-dots').innerHTML = Array.from({ length: total }, (_, i) => `<span class="${i % period === 0 ? 'acc' : ''}"></span>`).join('');
  }
  function clap(t, accent) {
    const len = 0.09, buf = ac.createBuffer(1, Math.floor(ac.sampleRate * len), ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (rnd() * 2 - 1) * Math.pow(1 - i / d.length, 3);
    const src = ac.createBufferSource(); src.buffer = buf;
    const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = accent ? 1900 : 1100; f.Q.value = 0.9;
    const g = ac.createGain(); g.gain.value = accent ? 1.0 : 0.35;
    src.connect(f); f.connect(g); g.connect(ac.destination); src.start(t);
  }
  play.addEventListener('click', () => {
    if (playing) return; playing = true; $('#bt-status').textContent = 'Listen… how many claps before the pattern repeats?';
    const snd = $('#bt-sound').checked;
    if (snd) { try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); } catch (e) { ac = null; } }
    const dots = $$('#bt-dots span'), dt = 0.26; const t0 = ac && snd ? ac.currentTime + 0.1 : 0;
    dots.forEach((el, i) => {
      if (ac && snd) clap(t0 + i * dt, i % period === 0);
      setTimeout(() => { dots.forEach(x => x.classList.remove('lit')); el.classList.add('lit'); if (i === dots.length - 1) setTimeout(() => { el.classList.remove('lit'); playing = false; $('#bt-status').textContent = 'What was the period?'; }, 300); }, 100 + i * dt * 1000);
    });
  });
  function check(p) { const st = $('#bt-status'); if (p === period) { st.textContent = `Correct: period = ${period}. Press "New pattern" for another.`; st.className = 'status ok'; } else { st.textContent = `Not ${p}. Count the claps from one loud clap to the next.`; st.className = 'status bad'; } }
  $('#bt-new').addEventListener('click', () => { let p; do { p = randInt(2, 10); } while (p === period); period = p; build(); const st = $('#bt-status'); st.textContent = 'New pattern ready. Press "Play pattern".'; st.className = 'status'; });
  build();
})();

/* ============================================================ Ch4: QFT clocks */
(function clocks() {
  const jS = $('#ck-j'); if (!jS) return;
  jS.innerHTML = [...Array(8).keys()].map(i => `<option value="${i}">|${bin(i, 3)}⟩ = |${i}⟩</option>`).join(''); jS.value = '1';
  function dial(angle, lbl, sub) {
    const r = 30, cx = 36, cy = 36, x = cx + r * Math.cos(angle), y = cy - r * Math.sin(angle);
    return `<div class="clock"><svg viewBox="0 0 72 72" width="72" height="72" aria-hidden="true"><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="${cx}" y1="${cy}" x2="${cx + r}" y2="${cy}" class="s-faint"/><line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="3" fill="currentColor"/></svg><span><b style="color:var(--ink)">${lbl}</b></span><span>${sub}</span></div>`;
  }
  function render() {
    const j = +jS.value, inv = $('#ck-inv').checked, sg = inv ? -1 : 1;
    let h = ''; for (let k = 0; k < 8; k++) { const turns = ((j * k) % 8); h += dial(sg * TAU * turns / 8, `|${k}⟩`, `${sg < 0 && turns ? '−' : ''}${turns}/8 turn`); }
    $('#ck-dials').innerHTML = h;
    const q = [2, 4, 8].map(d => `(|0⟩ + e^{${sg < 0 ? '−' : ''}2πi·${j}/${d}}|1⟩)/√2  → turns ${fnum(((j / d) % 1), 3)}`);
    $('#ck-out').textContent = `${inv ? 'QFT⁻¹' : 'QFT'}|${j}⟩ = (1/√8) Σ_k e^{${sg < 0 ? '−' : ''}2πi·${j}k/8}|k⟩\nEvery |k⟩ has size 1/√8 ≈ 0.354, so all 8 outcomes are equally likely (12.5%).\nThe information is in the hand angles: each step in k turns the hand ${j}/8 of a circle further.\n\nProduct form (one factor per qubit):\n` + q.join('\n');
  }
  jS.addEventListener('change', render); $('#ck-inv').addEventListener('change', render); render();
})();

/* ============================================================ Ch4: QFT 2-qubit circuit (static) */
(function qft2() {
  const h = $('#qft2-svg'); if (!h) return;
  h.innerHTML = circuitSVG(2, [{ g: 'H', t: 0 }, { g: 'CP', t: 0, c: [1], a: Math.PI / 2 }, { g: 'H', t: 1 }, { g: 'SWAP', t: 0, c: [1] }]);
})();

/* ============================================================ Ch4: period finder */
(function qftp() {
  const nS = $('#qp-n'); if (!nS) return;
  const rS = $('#qp-r'), oS = $('#qp-o');
  function render() {
    const n = +nS.value, N = 1 << n; rS.max = Math.min(16, N); if (+rS.value > N) rS.value = N;
    const r = +rS.value; oS.max = r - 1; if (+oS.value > r - 1) oS.value = r - 1; const x0 = +oS.value;
    $('#qp-rv').textContent = r; $('#qp-ov').textContent = x0;
    const xs = []; for (let x = x0; x < N; x += r) xs.push(x);
    const amp = 1 / Math.sqrt(xs.length), pin = new Array(N).fill(0); xs.forEach(x => pin[x] = amp * amp);
    const pout = new Array(N).fill(0);
    for (let k = 0; k < N; k++) { let re = 0, im = 0; for (const x of xs) { const a = TAU * x * k / N; re += amp * Math.cos(a); im += amp * Math.sin(a); } pout[k] = (re * re + im * im) / N; }
    const labels = [...Array(N).keys()].map(String);
    barChart($('#qp-in'), pin, { labels, max: 1, h: 120, pct: N <= 16, aria: 'input probabilities' });
    barChart($('#qp-out'), pout, { labels, max: 1, h: 140, pct: N <= 16, aria: 'output probabilities' });
    const peaks = []; for (let k = 0; k < N; k++) if (pout[k] > 0.04) peaks.push(k);
    const exact = N % r === 0;
    let t = `N = 2${sup(n)} = ${N}, period r = ${r}, N/r = ${fnum(N / r, 3)}\nPattern occupies x = ${xs.slice(0, 12).join(', ')}${xs.length > 12 ? ', …' : ''}\nStrong outputs at k = ${peaks.slice(0, 16).join(', ')}${peaks.length > 16 ? ', …' : ''}\n`;
    if (r === 1) t += 'r = 1 means "no repetition structure": every input is filled, and the QFT puts everything at k = 0.';
    else if (r >= N) t += 'The period is as big as the whole space: the pattern never repeats inside N, so the QFT can\'t see it. Add qubits.';
    else if (exact) t += `Sharp peaks exactly at multiples of N/r = ${N / r}. Estimate: r = N / ${N / r} = <b>${r}</b>.`;
    else t += `N isn't a multiple of r, so peaks are blurry around multiples of ${fnum(N / r, 2)}. More qubits make them sharper.`;
    $('#qp-txt').innerHTML = t + (x0 ? `\nChanging the offset x₀ = ${x0} only changes phases: the peak positions stay put.` : '');
  }
  [nS, rS, oS].forEach(e => e.addEventListener('input', render)); nS.addEventListener('change', render); render();
})();

/* ============================================================ Ch4: Bernstein–Vazirani */
(function bv() {
  const run = $('#bv-run'); if (!run) return;
  function go() {
    const s = $('#bv-s').value.trim(), st = $('#bv-status');
    if (!/^[01]{1,10}$/.test(s)) { st.textContent = 'Use 1 to 10 characters, each 0 or 1 (for example 1011001).'; st.className = 'status bad'; return; }
    const n = s.length, N = n + 1;
    const ops = [{ g: 'X', t: n }]; for (let i = 0; i <= n; i++) ops.push({ g: 'H', t: i });
    for (let i = 0; i < n; i++) if (s[i] === '1') ops.push({ g: 'CX', t: n, c: [i] });
    for (let i = 0; i < n; i++) ops.push({ g: 'H', t: i });
    const draw = ops.concat([...Array(n).keys()].map(i => ({ g: 'M', t: i })));
    const ql = [...Array(N).keys()].map(i => i < n ? 'q' + i : 'anc');
    $('#bv-svg').innerHTML = circuitSVG(N, draw, { qlabels: ql, pack: true });
    const q = new QState(N).run(ops), pf = q.probs(), p = new Array(1 << n).fill(0); let best = 0;
    for (let i = 0; i < pf.length; i++) p[i >> 1] += pf[i]; // add up over the ancilla (last qubit)
    for (let i = 0; i < p.length; i++) if (p[i] > p[best]) best = i;
    const outBits = bin(best, n);
    st.textContent = `${N} qubits (${n} + 1 ancilla), ${n} classical bits.`; st.className = 'status ok';
    $('#bv-classic').textContent = [...Array(n).keys()].map(i => { const x = '0'.repeat(i) + '1' + '0'.repeat(n - i - 1); return `query ${i + 1}: x=${x} → f=${s[i]}`; }).join('\n') + `\n→ secret = ${s} after ${n} queries`;
    $('#bv-quantum').innerHTML = `1 query, then measure q0…q${n - 1}:\nresult <b>${outBits}</b> with probability ${(p[best] * 100).toFixed(1)}%\n${outBits === s ? 'Matches the secret.' : ''}\n(In Qiskit this prints reversed: ${s.split('').reverse().join('')}.)`;
  }
  run.addEventListener('click', go);
  $('#bv-s').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  go();
})();

/* ============================================================ Ch4: QPE */
(function qpe() {
  const ph = $('#qe-phi'); if (!ph) return;
  const nS = $('#qe-n');
  function render() {
    const phi = +ph.value / 1000, n = +nS.value, M = 1 << n;
    $('#qe-phiv').textContent = phi.toFixed(3);
    const P = [...Array(M).keys()].map(m => qpeProb(phi, M, m));
    let best = 0; P.forEach((v, i) => { if (v > P[best]) best = i; });
    barChart($('#qe-chart'), P, { labels: [...Array(M).keys()].map(i => M <= 16 ? bin(i, n) : String(i)), max: 1, pct: M <= 16, h: 170, w: 600, classes: P.map((v, i) => i === best ? 'c-pos' : 'c-dim'), aria: 'QPE outcomes' });
    const est = best / M;
    $('#qe-out').innerHTML = `True phase φ = ${phi.toFixed(3)}   Counting qubits n = ${n} (resolution 1/${M} = ${fnum(1 / M, 4)})\nMost likely result: <b>${bin(best, n)}</b> = ${best} → φ ≈ ${best}/${M} = <b>${fnum(est, 4)}</b>   (P = ${(P[best] * 100).toFixed(1)}%)\nError: ${fnum(Math.abs(est - phi), 4)}` + (Math.abs(P[best] - 1) < 1e-9 ? '\nExact: φ fits in n binary digits.' : '\nNot exact: φ doesn\'t fit in n bits, so the probability spreads to neighbours.');
  }
  ph.addEventListener('input', render); nS.addEventListener('change', render);
  $$('#lab-qpe [data-phi]').forEach(b => b.addEventListener('click', () => { ph.value = b.dataset.phi; if (b.dataset.n) nS.value = b.dataset.n; render(); }));
  render();
})();


})();
