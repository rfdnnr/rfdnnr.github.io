// Rafael Donner, personal site. One screen: a landscape video, a dial of words and a glass card
// per case. Cards are rendered in the HTML; this script only moves them.
const DATA = JSON.parse(document.getElementById('site-data').textContent);
const ITEMS = DATA.items;
const N = ITEMS.length;
const CLIPS = ['16677124', '16677137', '16684655'];
const IDLE_MS = 45000;
const WRAP_T = 2;       // detents of push into the seam before the wheel wraps around

const root = document.documentElement;
const $ = (s) => document.querySelector(s);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const mod = (n, m) => ((n % m) + m) % m;
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(pointer: coarse)').matches;

/* ---------- springs (Apple's damping ratio + response) ---------- */
class Spring {
  constructor(v, damping = 1, response = 0.4) { this.x = v; this.v = 0; this.t = v; this.held = false; this.set(damping, response); }
  set(d, r) { r = RM ? Math.min(r, 0.14) : r; this.k = Math.pow(2 * Math.PI / r, 2); this.c = 4 * Math.PI * d / r; }
  step(dt) {
    if (this.held) return;
    const n = Math.max(1, Math.ceil(dt * 240)), h = dt / n;
    for (let i = 0; i < n; i++) { const a = -this.k * (this.x - this.t) - this.c * this.v; this.v += a * h; this.x += this.v * h; }
    if (Math.abs(this.x - this.t) < 1e-4 && Math.abs(this.v) < 1e-3) { this.x = this.t; this.v = 0; }
  }
  get moving() { return this.held || Math.abs(this.x - this.t) > 1e-3 || Math.abs(this.v) > 1e-2; }
}
const S = {
  pos: new Spring(0, 1, 0.22),   // the wheel follows a target made of a committed word plus a lean
  open: new Spring(0, 1, 0.48),
  wake: new Spring(0, 1, 0.9),
  nameT: new Spring(0, 1, 0.55),  // 0 = name in the wheel, 1 = name in the corner
  nameO: new Spring(1, 1, 0.3),   // opacity of the moving name (used during wrap-arounds)
  seam: new Spring(0, 1, 0.26),   // how much of the far side of the seam shows
  hover: new Spring(0, 1, 0.22),
  cardLean: new Spring(0, 1, 0.14), // small nudge of the card while a sideways swipe builds up
};

/* ---------- DOM ---------- */
const stage = $('#stage'), wheelEl = $('#wheel'), cardsEl = $('#cards'), nameEl = $('#name'), tagEl = $('#tagline');
const contactEl = $('#contact'), soundBtn = $('#sound'), still = $('#still'), dimEl = $('#dim'), bgEl = $('#bg');
const mains = [nameEl], ghosts = [], cards = [...cardsEl.querySelectorAll('.card')];
ITEMS.forEach((it, i) => {
  if (i > 0) {
    const b = document.createElement('button');
    b.className = 'item'; b.type = 'button'; b.dataset.i = i; b.textContent = it.label;
    wheelEl.appendChild(b); mains[i] = b;
  }
  const g = document.createElement('span');
  g.className = 'item ghost'; g.textContent = it.label; g.setAttribute('aria-hidden', 'true');
  wheelEl.appendChild(g); ghosts[i] = g;
  const c = cards[i];
  c.querySelector('.close').addEventListener('click', (e) => { e.stopPropagation(); setOpen(false); });
  c.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' && i === current && !isOpen) S.hover.t = 1; });
  c.addEventListener('pointerleave', () => { S.hover.t = 0; });
  c.querySelectorAll('.body a[href^="http"]').forEach((l) => { l.target = '_blank'; l.rel = 'noopener'; });
});

/* ---------- layout ---------- */
const probe = document.createElement('div');
probe.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
document.body.appendChild(probe);
let L = {}, W0 = [], T = [];
function insets() {
  const cs = getComputedStyle(probe);
  return { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
}
function layout() {
  const vw = innerWidth, vh = innerHeight, ins = insets();
  const mobile = vw < 760 || (vh > vw && vw < 900);
  root.classList.toggle('is-mobile', mobile);
  L = { vw, vh, ins, mobile };
  if (!mobile) {
    L.fs = clamp(vw * 0.046, 40, 78);
    L.ax = Math.max(ins.l + 24, vw * 0.075);
    L.cy = vh * 0.5;
    L.sp = L.fs * 1.62;
    L.V = clamp(vw * 0.22, 250, 340); L.W = L.V * 3; L.H = clamp(vh * 0.64, 400, 760);
    L.pad = 28; L.col = L.V - 2 * L.pad; L.sfs = clamp(L.V * 0.108, 24, 36);
    L.openL = Math.max(ins.l + 16, vw * 0.085); L.openT = ins.t + 70;
    L.openR = Math.max(ins.r + 16, vw * 0.025); L.openB = ins.b + Math.max(18, vh * 0.035);
    L.cornerX = Math.max(ins.l + 22, 24); L.cornerY = ins.t + 33; L.cfs = 17;
    L.tfs = clamp(vw * 0.0125, 15, 19);
    L.travel = (vw - L.V) - L.openL;
    L.dragPer = L.sp * 0.95;
  } else {
    L.fs = clamp(vw * 0.08, 26, 34);
    L.peekH = clamp(vh * 0.3, 196, 280);
    L.sheetL = ins.l + 8; L.sheetW = vw - ins.l - ins.r - 16;
    L.peekT = vh - ins.b - 8 - L.peekH;
    L.openT = ins.t + 62; L.openH = vh - L.openT - ins.b - 8;
    L.rowY = L.peekT - 44;
    L.cx = vw / 2; L.gap = 26;
    L.pad = 22; L.col = L.sheetW - 2 * L.pad; L.sfs = clamp(vw * 0.068, 24, 30);
    L.cornerX = Math.max(ins.l + 18, 18); L.cornerY = ins.t + 28; L.cfs = 15;
    L.tfs = 15;
    L.travel = L.peekT - L.openT;
    L.dragPer = 72;
  }
  root.style.setProperty('--fs', L.fs + 'px');
  root.style.setProperty('--sfs', L.sfs + 'px');
  root.style.setProperty('--col', L.col + 'px');
  root.style.setProperty('--pad', L.pad + 'px');
  root.style.setProperty('--tfs', L.tfs + 'px');
  W0 = ghosts.map((g) => g.offsetWidth || L.fs * 4);
  W0[0] = nameEl.offsetWidth || W0[0];
  T = [0];
  for (let i = 1; i < N; i++) T[i] = T[i - 1] + W0[i - 1] / 2 + L.gap + W0[i] / 2;
  L.period = T[N - 1] + W0[N - 1] / 2 + L.gap * 1.6 + W0[0] / 2;
  L.tagW = tagEl.offsetWidth;
  cards.forEach((c) => { c._w = c._h = -1; });
}
const trackAt = (j) => T[mod(j, N)] + Math.floor(j / N) * L.period;
function trackPos(p) { const k = Math.floor(p), f = p - k; return trackAt(k) + f * (trackAt(k + 1) - trackAt(k)); }
const nearest = (i, p) => { const k = Math.round((p - i) / N); return i + k * N; };

function geom(j, p) {
  const d = j - p, ad = Math.abs(d);
  const s = 1 / (1 + 0.28 * ad);
  const o = Math.pow(0.48, ad);
  const b = RM ? 0 : Math.min(ad, 3) * 1.6;
  if (!L.mobile) {
    return { x: L.ax - 0.45 * L.fs * Math.pow(ad, 0.72), y: L.cy + d * L.sp, s, o, b, d };
  }
  const w = W0[mod(j, N)];
  const cx = L.cx + (trackAt(j) - trackPos(p)) * 0.82;
  return { x: cx - (w * s) / 2, y: L.rowY, s, o, b, d };
}
function place(el, g) {
  const h = L.fs;
  el.style.transform = `translate3d(${g.x.toFixed(2)}px,${(g.y - h / 2).toFixed(2)}px,0) scale(${g.s.toFixed(4)})`;
  const o = clamp(g.o, 0, 1);
  el.style.opacity = o.toFixed(3);
  const bq = Math.round(clamp(g.b, 0, 16) * 2) / 2;
  if (el._b !== bq) { el.style.filter = bq > 0 ? `blur(${bq}px)` : 'none'; el._b = bq; }
  const vis = o > 0.02 ? 'visible' : 'hidden';
  if (el._v !== vis) { el.style.visibility = vis; el._v = vis; }
}
function reveal(g, w) {
  const ring = Math.abs(g.d);
  const rv = RM ? (w > 0.5 ? 1 : 0) : smooth(clamp(w * 1.4 - ring * 0.2, 0, 1));
  g.o *= rv; g.b += (1 - rv) * 10;
  return g;
}

/* ---------- state ---------- */
let awake = false, isOpen = false, current = 0, lastCenter = 0, wrapping = 0;
let base = 0, acc = 0, coolUntil = 0, relaxTimer = 0;
let lastInput = performance.now();

function wake() {
  lastInput = performance.now();
  if (awake) return;
  awake = true; S.wake.t = 1; S.pos.set(1, 0.22); root.classList.add('awake');
}
function sleep() {
  if (!awake || isOpen) return;
  awake = false; S.wake.t = 0; S.hover.t = 0; root.classList.remove('awake');
  base = 0; acc = 0; S.pos.set(1, 0.9); S.pos.t = 0; S.seam.t = 0;
}

/* ---------- the dial: committed word + lean, with detents and a seam ---------- */
const atEndFor = (s) => (s > 0 && base >= N - 1) || (s < 0 && base <= 0);
function leanOf(a) {
  const s = Math.sign(a), m = Math.abs(a);
  if (!s) return 0;
  if (atEndFor(s)) return s * 0.5 * Math.pow(Math.min(m / WRAP_T, 1), 0.85);  // keeps moving toward the seam
  return s * 0.5 * Math.pow(Math.min(m, 1), 1.7);                              // resists, then lets go
}
let preview = 0;   // small lean while a trackpad swipe builds up, before it moves a word
function setWheelTarget() {
  S.pos.t = base + leanOf(acc) + preview;
  if (!wrapping) {
    const s = Math.sign(acc);
    S.seam.t = s && atEndFor(s) ? 0.55 * clamp(Math.abs(acc) / WRAP_T, 0, 1) : 0;
  }
}
function relax() { if (wrapping) return; acc = 0; preview = 0; setWheelTarget(); }
function scheduleRelax(ms) { clearTimeout(relaxTimer); relaxTimer = setTimeout(relax, ms); }
function commitWrap(dir) {
  clearTimeout(relaxTimer);
  wrapping = dir; acc = 0; base = dir > 0 ? N : -1;
  S.pos.t = base; S.seam.t = 1;
  if (dir > 0) S.nameO.t = 0;   // the corner name fades; the start of the list arrives from below
}
function feed(delta) {          // trackpad, mouse wheel and keys, in detents
  const now = performance.now();
  if (wrapping || now < coolUntil) return;
  acc += delta;
  const s = Math.sign(acc), m = Math.abs(acc);
  if (s && atEndFor(s)) { if (m >= WRAP_T) { commitWrap(s); return; } }
  else if (m >= 1) { base += s; acc = 0; coolUntil = now + 140; }
  setWheelTarget();
}
function goTo(i) {
  wake(); if (wrapping) return;
  clearTimeout(relaxTimer); base = clamp(i, 0, N - 1); acc = 0; setWheelTarget();
}
function step(dir) {
  wake();
  if (isOpen || wrapping) return;
  if (!atEndFor(dir)) { clearTimeout(relaxTimer); base += dir; acc = 0; setWheelTarget(); return; }
  feed(dir);
  scheduleRelax(900);
}

/* ---------- open / close ---------- */
// Each case has its own address (/scentia/). Opening a case pushes it; closing goes back.
let pushed = false;
const pathFor = (slug) => (slug ? `/${slug}/` : '/');
const slugFromPath = () => location.pathname.replace(/^\/|\/$/g, '');
function count(path) { try { if (window.goatcounter && window.goatcounter.count) window.goatcounter.count({ path }); } catch (_) {} }
function setPath(slug) {
  try {
    if (slug) {
      if (location.pathname !== pathFor(slug)) { history.pushState({ slug }, '', pathFor(slug)); pushed = true; count(pathFor(slug)); }
    } else if (location.pathname !== '/') {
      if (pushed) { pushed = false; history.back(); }
      else history.replaceState(null, '', '/');
    }
  } catch (_) {}
}
function setOpen(on, v = 0, fromHash = false) {
  if (on) wake();
  if (on && wrapping) return;
  const was = isOpen; isOpen = on;
  S.open.held = false; S.open.set(1, 0.5); S.open.t = on ? 1 : 0; S.open.v = v;
  S.hover.t = 0;
  if (on) relax();
  if (on !== was) {
    document.title = on && current > 0 ? `${ITEMS[current].label} · Rafael Donner` : 'Rafael Donner';
    if (!fromHash) setPath(on ? ITEMS[current].slug : '');
    if (!on) { const ci = cards[current].querySelector('.card-in'); ci.scrollTop = 0; }
    else setTimeout(() => { try { cards[current].querySelector('.card-in').focus({ preventScroll: true }); } catch (_) {} }, 320);
  }
}
addEventListener('popstate', () => {
  const i = ITEMS.findIndex((x) => x.slug === slugFromPath());
  pushed = false;
  if (i >= 0) {
    if (isOpen && current === i) return;
    if (isOpen) setOpen(false, 0, true);
    goTo(i);
    const wait = () => { if (Math.round(S.pos.x) === i && !S.pos.moving) setOpen(true, 0, true); else requestAnimationFrame(wait); };
    requestAnimationFrame(wait);
  } else if (isOpen) setOpen(false, 0, true);
});

/* ---------- background video ---------- */
const vids = [$('#vA'), $('#vB')];
let active = 0, currentClip = null, switching = false, frozen = false;
const posterImg = new Image();
const urls = new Map();
let useBlob = true;
const variant = () => (innerHeight > innerWidth ? 'm' : 'd');
const pathOf = (id) => `/media/${id}_${variant()}.mp4`;
async function getURL(id) {
  const key = id + '_' + variant(), path = pathOf(id);
  if (!useBlob) return path;
  if (urls.has(key)) return urls.get(key);
  try { const r = await fetch(path); if (!r.ok) throw 0; const u = URL.createObjectURL(await r.blob()); urls.set(key, u); return u; }
  catch (_) { return path; }
}
function setPoster(id) {
  const src = `/media/${id}_${variant()}.jpg`;
  bgEl.style.backgroundImage = `url("${src}")`; posterImg.src = src;
}
const pickOther = (id) => { const pool = CLIPS.filter((c) => c !== id); return pool[Math.floor(Math.random() * pool.length)]; };
function loadInto(v, url, path) {
  return new Promise((res) => {
    let done = false;
    const fin = () => { if (done) return; done = true; v.removeEventListener('canplay', fin); v.removeEventListener('error', onErr); res(); };
    const onErr = () => { if (url.startsWith('blob:') && v.src.startsWith('blob:')) { useBlob = false; v.src = path; v.load(); } else fin(); };
    v.addEventListener('canplay', fin); v.addEventListener('error', onErr); setTimeout(fin, 6000);
    v.muted = true; v.src = url; v.load();
  });
}
async function startBg() {
  currentClip = CLIPS[Math.floor(Math.random() * CLIPS.length)];
  setPoster(currentClip);
  if (RM) return;
  const v = vids[active];
  await loadInto(v, await getURL(currentClip), pathOf(currentClip));
  try { await v.play(); } catch (_) {}
  v.classList.add('on');
  CLIPS.forEach((c) => { if (c !== currentClip) getURL(c); });
}
async function switchClip() {
  if (switching || frozen) return;
  switching = true;
  const id = pickOther(currentClip);
  const nextV = vids[1 - active], oldV = vids[active];
  await loadInto(nextV, await getURL(id), pathOf(id));
  if (frozen) { switching = false; return; }
  try { nextV.currentTime = 0; nextV.playbackRate = 1; await nextV.play(); } catch (_) {}
  nextV.classList.add('on'); oldV.classList.remove('on');
  active = 1 - active; currentClip = id; setPoster(id);
  setTimeout(() => { oldV.pause(); switching = false; }, 1700);
}
vids.forEach((v, k) => {
  v.addEventListener('timeupdate', () => { if (k === active && v.duration && v.duration - v.currentTime < 1.7) switchClip(); });
  v.addEventListener('ended', () => { if (k === active && !switching) switchClip(); });
});
// The landscape stops behind the open card: a still of the current frame, blurred, fades in with
// the card itself (same spring), and the video pauses only once the still fully covers it.
let stillTaken = false, bgPaused = false, lastFz = -1;
function snapshot() {
  const portrait = innerHeight > innerWidth;
  still.width = portrait ? 180 : 320; still.height = portrait ? 320 : 180;
  const ctx = still.getContext('2d'), v = vids[active];
  try {
    if (!RM && v.readyState >= 2) ctx.drawImage(v, 0, 0, still.width, still.height);
    else if (posterImg.complete && posterImg.naturalWidth) ctx.drawImage(posterImg, 0, 0, still.width, still.height);
  } catch (_) {}
}
function syncBackground(o) {
  if (o > 0.002 && !stillTaken) { snapshot(); stillTaken = true; }
  else if (o <= 0.002 && stillTaken) stillTaken = false;
  const fz = smooth(clamp(o, 0, 1));
  if (Math.abs(fz - lastFz) > 0.001) { still.style.opacity = fz.toFixed(3); dimEl.style.opacity = (0.26 * fz).toFixed(3); lastFz = fz; }
  frozen = o > 0.02;
  if (RM) return;
  if (fz > 0.985 && !bgPaused) { bgPaused = true; vids.forEach((v) => v.pause()); }
  else if (fz <= 0.985 && bgPaused) { bgPaused = false; vids[active].play().catch(() => {}); }
}
document.addEventListener('visibilitychange', () => {
  const v = vids[active];
  if (document.hidden) v.pause(); else if (!frozen && !RM) v.play().catch(() => {});
});

/* ---------- sound: a small metal detent click per word, none on the wrap-around ---------- */
let actx = null, master = null, clickBuf = null, soundOn = true, lastTickAt = 0;
function ensureAudio() {
  try {
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      try { if (navigator.audioSession) navigator.audioSession.type = 'ambient'; } catch (_) {}
      actx = new AC(); master = actx.createGain(); master.gain.value = 0.42; master.connect(actx.destination);
      const len = Math.floor(actx.sampleRate * 0.004);
      clickBuf = actx.createBuffer(1, len, actx.sampleRate);
      const d = clickBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (actx.sampleRate * 0.0006));
    }
    if (actx.state === 'suspended') actx.resume();
  } catch (_) {}
}
// inharmonic partials with short decays read as a small piece of aluminium: [Hz, level, seconds]
const MODES = [[3420, 0.04, 0.009], [5460, 0.032, 0.007], [7980, 0.022, 0.005], [10600, 0.012, 0.004]];
function tick() {
  const now = performance.now();
  if (now - lastTickAt < 30) return;
  lastTickAt = now;
  if (!soundOn) return;
  if (actx && actx.state === 'running') {
    const t = actx.currentTime + 0.003, det = 1 + (Math.random() - 0.5) * 0.04;
    const bus = actx.createGain(); bus.gain.value = 0.9 + Math.random() * 0.2; bus.connect(master);
    for (const [f, a, tau] of MODES) {
      const o = actx.createOscillator(); o.type = 'sine'; o.frequency.value = f * det;
      const g = actx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a, t + 0.0006); g.gain.setTargetAtTime(0, t + 0.0006, tau / 3);
      o.connect(g); g.connect(bus); o.start(t); o.stop(t + tau * 2.5 + 0.01);
    }
    const n = actx.createBufferSource(); n.buffer = clickBuf;
    const hp = actx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 4200;
    const gn = actx.createGain(); gn.gain.value = 0.12;
    n.connect(hp); hp.connect(gn); gn.connect(bus); n.start(t);
    const b = actx.createOscillator(); b.type = 'sine';
    b.frequency.setValueAtTime(170 * det, t); b.frequency.exponentialRampToValueAtTime(115, t + 0.014);
    const gb = actx.createGain(); gb.gain.setValueAtTime(0, t); gb.gain.linearRampToValueAtTime(0.015, t + 0.001); gb.gain.setTargetAtTime(0, t + 0.001, 0.0025);
    b.connect(gb); gb.connect(bus); b.start(t); b.stop(t + 0.04);
  }
  if (coarse && navigator.userActivation && navigator.userActivation.hasBeenActive) { try { if (navigator.vibrate) navigator.vibrate(5); } catch (_) {} }
}
const ICON_ON = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2.5 6h2.2L8 3.2v9.6L4.7 10H2.5z" fill="currentColor"/><path d="M10.6 5.4a3.6 3.6 0 0 1 0 5.2M12.4 3.6a6.2 6.2 0 0 1 0 8.8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';
const ICON_OFF = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2.5 6h2.2L8 3.2v9.6L4.7 10H2.5z" fill="currentColor"/><path d="M10.5 6l3.5 4M14 6l-3.5 4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';
function paintSound() {
  soundBtn.innerHTML = soundOn ? ICON_ON : ICON_OFF;
  soundBtn.setAttribute('aria-pressed', String(soundOn));
  soundBtn.setAttribute('aria-label', soundOn ? 'Turn sound off' : 'Turn sound on');
}
soundBtn.addEventListener('click', (e) => { e.stopPropagation(); ensureAudio(); soundOn = !soundOn; paintSound(); if (soundOn) { lastTickAt = 0; tick(); } });
paintSound();

/* ---------- input: wheel / trackpad ---------- */
// A trackpad swipe works like one click of a mouse wheel: it acts as soon as it has travelled a
// little, and the rest of that swipe and its momentum are ignored. Each axis has its own detector
// and each event only counts on its dominant axis, so a sideways swipe made while the momentum of
// a vertical one is still arriving opens the card instead of being read as more scrolling.
const FIRE_PX = 34, CARD_FIRE_PX = 40;
let lastWheelAt = 0, lastNotchAt = 0, leanTimer = 0, wsIgnoreUntil = 0;
// Momentum is judged on a smoothed magnitude, so the frame-to-frame jitter of a 120 Hz trackpad
// can't pass for a new swipe: after a word moves, the rest of that swipe is ignored until its
// momentum has faded to half its peak, and a new swipe counts once the smoothed force climbs back
// to twice where the momentum had settled. Tuned on simulated 60/120 Hz gestures with heavy jitter.
const mkG = () => ({ dir: 0, acc: 0, consumed: false, m: 0, peak: 0, decayed: false, low: Infinity, rises: 0, lastFire: 0, firedAt: 0 });
const GD = mkG(), GC = mkG();   // dial axis, card axis
function gReset(G) { const lf = G.lastFire; Object.assign(G, mkG()); G.lastFire = lf; }
function gFeed(G, raw, now, firePx, lean) {
  const a = Math.abs(raw), s = Math.sign(raw);
  if (s && G.dir && s !== G.dir && a > 3) gReset(G);           // reversing is a new intention
  if (s && a > 0.5) G.dir = s;
  if (G.consumed) {
    const prevM = G.m;
    G.m = G.m ? G.m * 0.4 + a * 0.6 : a;
    if (!G.decayed) {
      G.peak = Math.max(G.peak, G.m);
      if (G.m < G.peak * 0.5 && now - G.firedAt > 80) { G.decayed = true; G.low = G.m; }
      return 0;
    }
    G.rises = G.m > prevM + 0.5 ? G.rises + 1 : 0;
    if (G.m < G.low) G.low = G.m;
    const fresh = now - G.firedAt > 150 && G.rises >= 1 && G.m > Math.max(2, G.low * 2);
    if (!fresh) return 0;
    const d = G.dir; gReset(G); G.dir = d;
  }
  G.acc += raw;
  if (Math.abs(G.acc) >= firePx && now - G.lastFire > 150) {
    Object.assign(G, { consumed: true, m: a, peak: a, decayed: false, low: Infinity, rises: 0, acc: 0, lastFire: now, firedAt: now });
    lean(0);
    return s || 1;
  }
  lean(clamp(G.acc / firePx, -1, 1));
  return 0;
}
function leanDial(f) { if (wrapping) return; preview = 0.14 * f; setWheelTarget(); }
function leanCard(f) { S.cardLean.t = f; }
function clearLeansSoon() {
  clearTimeout(leanTimer);
  leanTimer = setTimeout(() => { if (!wrapping) { preview = 0; setWheelTarget(); } S.cardLean.t = 0; }, 160);
}
stage.addEventListener('wheel', (e) => {
  if (e.target.closest('#contact')) return;
  const now = performance.now();
  const wasAwake = awake; wake();
  let dx = e.deltaX, dy = e.deltaY;
  if (e.deltaMode === 1) { dx *= 40; dy *= 40; } else if (e.deltaMode === 2) { dx *= L.vh; dy *= L.vh; }
  if (e.shiftKey && !dx) { dx = dy; dy = 0; }
  const gap = now - lastWheelAt; lastWheelAt = now;
  if (gap > 110) { gReset(GD); gReset(GC); if (!wasAwake) wsIgnoreUntil = now + 320; }
  const dialIsY = !L.mobile;
  const dRaw = dialIsY ? dy : dx, cRaw = dialIsY ? dx : dy;
  const dA = Math.abs(dRaw), cA = Math.abs(cRaw);
  const inOpenCard = isOpen && e.target.closest('.card');
  if (inOpenCard && (L.mobile || !(cA > 1.2 * dA && cA > 1))) return;   // the open case scrolls natively
  e.preventDefault();
  if (now < wsIgnoreUntil) return;
  const dialPart = dA >= 1.2 * cA ? dRaw : 0;
  const cardPart = cA > 1.2 * dA ? cRaw : 0;
  if (dialPart && !isOpen && !wrapping) {
    if (e.deltaMode === 1 || (dA >= 40 && gap > 70)) {                     // a mouse wheel click
      gReset(GD); GD.consumed = true; GD.m = GD.peak = dA; GD.firedAt = now;
      if (now - lastNotchAt > 60) { lastNotchAt = now; GD.lastFire = now; step(Math.sign(dialPart)); }
    } else {
      const fired = gFeed(GD, dialPart, now, FIRE_PX, leanDial);
      if (fired) step(fired);
    }
  }
  if (cardPart) {
    const fired = gFeed(GC, cardPart, now, CARD_FIRE_PX, leanCard);
    if (fired > 0 && !isOpen) setOpen(true);
    else if (fired < 0 && isOpen) setOpen(false);
  }
  clearLeansSoon();
}, { passive: false });
function rb(r) { const c = 0.55; return (r * c) / (1 + c * r); }

/* ---------- input: pointer (drag, tap) ---------- */
let pd = null, lastMove = null;
stage.addEventListener('pointerdown', (e) => {
  if (e.target.closest('#contact, a, .close')) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  const wasAsleep = !awake;
  wake(); ensureAudio();
  const onCard = e.target.closest('.card');
  pd = { id: e.pointerId, x0: e.clientX, y0: e.clientY, axis: null, mode: null, target: e.target, onCard, wasAsleep,
         inOpenBody: isOpen && onCard && !e.target.closest('.grab'), samples: [[performance.now(), e.clientX, e.clientY]], anchor: 0, stepped: 0, open0: S.open.x };
});
stage.addEventListener('pointermove', (e) => {
  if (!pd || e.pointerId !== pd.id) {
    if (e.pointerType === 'mouse') {
      if (lastMove && Math.hypot(e.clientX - lastMove[0], e.clientY - lastMove[1]) > 4) wake();
      lastMove = [e.clientX, e.clientY];
    }
    return;
  }
  lastInput = performance.now();
  const dx = e.clientX - pd.x0, dy = e.clientY - pd.y0;
  pd.samples.push([performance.now(), e.clientX, e.clientY]); if (pd.samples.length > 8) pd.samples.shift();
  if (!pd.axis) {
    if (Math.hypot(dx, dy) < 8) return;
    pd.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    const dialAxis = L.mobile ? 'x' : 'y';
    if (pd.inOpenBody && pd.axis === 'y') { pd = null; return; }
    if (pd.axis === dialAxis) {
      if (isOpen || wrapping) { pd = null; return; }
      pd.mode = 'wheel'; pd.anchor = 0; pd.stepped = 0;
    } else { pd.mode = 'card'; S.open.held = true; pd.open0 = S.open.x; }
    try { stage.setPointerCapture(e.pointerId); } catch (_) {}
  }
  if (pd.mode === 'wheel') {
    if (wrapping) return;
    const along = L.mobile ? -dx : -dy;          // positive = next word
    const rel = along - pd.anchor, need = pd.stepped === 0 ? 26 : 120;
    if (Math.abs(rel) >= need) { const s = Math.sign(rel); preview = 0; step(s); pd.stepped += s; pd.anchor = along; }
    else { preview = 0.14 * clamp(rel / need, -1, 1); setWheelTarget(); }
  } else if (pd.mode === 'card') {
    const o = pd.open0 + (L.mobile ? -dy : -dx) / L.travel;
    S.open.x = o < 0 ? -rb(-o) * 0.2 : (o > 1 ? 1 + rb(o - 1) * 0.2 : o); S.open.t = S.open.x; S.open.v = 0;
  }
});
function velocity(samples) {
  const now = performance.now();
  const s = samples.filter((q) => now - q[0] < 120);
  if (s.length < 2) return { x: 0, y: 0 };
  const a = s[0], b = s[s.length - 1], dt = Math.max(0.008, (b[0] - a[0]) / 1000);
  return { x: (b[1] - a[1]) / dt, y: (b[2] - a[2]) / dt };
}
function endPointer(e, cancel) {
  if (!pd || e.pointerId !== pd.id) return;
  const p = pd; pd = null;
  if (!p.axis) { if (!cancel && !p.wasAsleep) handleTap(p.target); return; }
  const v = velocity(p.samples);
  if (p.mode === 'wheel') {
    preview = 0; setWheelTarget();
  } else if (p.mode === 'card') {
    S.open.held = false;
    const vo = (L.mobile ? -v.y : -v.x) / L.travel;
    const goOpen = Math.abs(vo) > 0.6 ? vo > 0 : S.open.x > 0.5;
    setOpen(goOpen, clamp(vo, -6, 6));
  }
}
stage.addEventListener('pointerup', (e) => endPointer(e, false));
stage.addEventListener('pointercancel', (e) => endPointer(e, true));
function handleTap(target) {
  const it = target.closest('.item:not(.ghost)');
  if (it) {
    const i = +it.dataset.i;
    if (isOpen) { setOpen(false); return; }
    if (i === current && S.nameT.x < 0.5) setOpen(true); else goTo(i);
    return;
  }
  const c = target.closest('.card');
  if (c) { if (+c.dataset.i === current && !isOpen) setOpen(true); return; }
  if (isOpen) setOpen(false);
}
addEventListener('keydown', (e) => {
  ensureAudio();
  if (!awake) { wake(); return; }
  wake();
  const k = e.key;
  if (k === 'ArrowDown' && !isOpen) { e.preventDefault(); step(1); }
  else if (k === 'ArrowUp' && !isOpen) { e.preventDefault(); step(-1); }
  else if (k === 'ArrowRight' && !isOpen) { e.preventDefault(); setOpen(true); }
  else if (k === 'Enter' && !isOpen) {
    const f = document.activeElement;
    if (f && f.classList && f.classList.contains('item') && +f.dataset.i !== current) { e.preventDefault(); goTo(+f.dataset.i); }
    else { e.preventDefault(); setOpen(true); }
  }
  else if ((k === 'ArrowLeft' || k === 'Escape') && isOpen) { e.preventDefault(); setOpen(false); }
});
['touchstart', 'pointerdown', 'keydown'].forEach((t) => addEventListener(t, () => wake(), { passive: true }));
// iOS only unlocks audio on the end of a tap (touchend / click), not on the finger going down
['touchend', 'pointerup', 'click'].forEach((t) => addEventListener(t, () => ensureAudio(), { passive: true }));
setInterval(() => { if (awake && !isOpen && !pd && !wrapping && performance.now() - lastInput > IDLE_MS) sleep(); }, 1000);

/* ---------- phone: pull the open card down to dismiss it ---------- */
cards.forEach((c, i) => {
  const ci = c.querySelector('.card-in');
  let ts = null;
  ci.addEventListener('touchstart', (e) => {
    if (!L.mobile || !isOpen || i !== current || e.touches.length !== 1) { ts = null; return; }
    const q = e.touches[0];
    ts = { y0: q.clientY, x0: q.clientX, pulling: false, samples: [[performance.now(), q.clientY]] };
  }, { passive: true });
  ci.addEventListener('touchmove', (e) => {
    if (!ts) return;
    const q = e.touches[0], dy = q.clientY - ts.y0, dx = q.clientX - ts.x0;
    ts.samples.push([performance.now(), q.clientY]); if (ts.samples.length > 8) ts.samples.shift();
    if (!ts.pulling) {
      if (ci.scrollTop <= 0 && dy > 6 && dy > Math.abs(dx)) { ts.pulling = true; ts.y0 = q.clientY; S.open.held = true; }
      else return;
    }
    e.preventDefault();
    const o = 1 - (q.clientY - ts.y0) / L.travel;
    S.open.x = o > 1 ? 1 + rb(o - 1) * 0.2 : o; S.open.t = S.open.x; S.open.v = 0;
  }, { passive: false });
  const end = () => {
    if (!ts) return;
    const was = ts; ts = null;
    if (!was.pulling) return;
    S.open.held = false;
    const s = was.samples, a = s[0], b = s[s.length - 1];
    const v = s.length > 1 ? (b[1] - a[1]) / Math.max(0.008, (b[0] - a[0]) / 1000) : 0;
    const vo = -v / L.travel;
    setOpen(!(vo < -0.6 || S.open.x < 0.75), clamp(vo, -6, 6));
  };
  ci.addEventListener('touchend', end);
  ci.addEventListener('touchcancel', end);
});

contactEl.addEventListener('pointerdown', (e) => { e.stopPropagation(); wake(); ensureAudio(); });

/* ---------- render loop ---------- */
let lastT = performance.now();
function frame(now) {
  const dt = clamp((now - lastT) / 1000, 0, 1 / 30); lastT = now;
  for (const k in S) S[k].step(dt);

  // finish a wrap-around: once the dial has landed on the far copy, renumber without a visible change
  if (wrapping && Math.abs(S.pos.x - base) < 0.002 && Math.abs(S.pos.v) < 0.02) {
    const dir = wrapping;
    S.pos.x -= dir * N; S.pos.t -= dir * N; base -= dir * N; lastCenter -= dir * N;
    wrapping = 0; S.seam.t = 0;
    if (dir > 0) { S.nameT.x = S.nameT.t = 0; S.nameO.x = S.nameO.t = 1; }
    else { S.nameT.x = S.nameT.t = 1; S.nameO.x = 0; S.nameO.t = 1; }
  }
  const p = S.pos.x;
  const ci = Math.round(p);
  if (ci !== lastCenter) {
    const a = mod(lastCenter, N), b = mod(ci, N);
    const seamCross = (a === N - 1 && b === 0) || (a === 0 && b === N - 1);
    if (awake && S.wake.t === 1 && !seamCross) tick();
    lastCenter = ci;
    if (b !== current) {
      current = b; S.hover.t = 0;
      mains.forEach((m, i) => m.setAttribute('aria-current', i === current ? 'true' : 'false'));
    }
  }
  if (!wrapping) S.nameT.t = awake && current !== 0 ? 1 : 0;

  const w = S.wake.x, o = clamp(S.open.x, 0, 1.05);
  syncBackground(clamp(S.open.x, 0, 1));
  const recX = L.mobile ? 0 : -46 * o, recO = L.mobile ? 1 - o : 1 - 0.8 * o, recB = L.mobile ? 0 : 5 * o;

  for (let i = 1; i < N; i++) {
    const g = reveal(geom(i, p), w);
    g.x += recX; g.o *= recO; g.b += recB;
    place(mains[i], g);
  }
  for (let i = 0; i < N; i++) {
    const j = Math.abs(i + N - p) < Math.abs(i - N - p) ? i + N : i - N;
    const g = reveal(geom(j, p), w);
    g.o *= S.seam.x;
    g.x += recX; g.o *= recO; g.b += recB;
    place(ghosts[i], g);
  }
  {
    const gw = geom(nearest(0, p), p);
    gw.x += recX; gw.o *= recO; gw.b += recB;
    const t = S.nameT.x;
    place(nameEl, {
      x: lerp(gw.x, L.cornerX, t), y: lerp(gw.y, L.cornerY, t),
      s: lerp(gw.s, L.cfs / L.fs, t), o: lerp(gw.o, 1, t) * S.nameO.x, b: lerp(gw.b, 0, t),
    });
    const tg = 1 - smooth(clamp(w * 1.7, 0, 1));
    const tx = L.mobile ? L.cx - L.tagW / 2 : L.ax;
    const ty = L.mobile ? L.rowY + L.fs * 0.85 : L.cy + L.fs * 0.78;
    tagEl.style.transform = `translate3d(${tx.toFixed(1)}px,${ty.toFixed(1)}px,0)`;
    tagEl.style.opacity = tg.toFixed(3);
  }

  const cw = smooth(clamp((w - 0.22) / 0.78, 0, 1));
  for (let i = 0; i < N; i++) {
    const c = cards[i], j = nearest(i, p), d = j - p, cur = i === current;
    let x, y, wd, ht, op = 1;
    if (!L.mobile) {
      const px = L.vw - L.V - (cur ? S.hover.x * 24 : 0) + (1 - cw) * (L.V + 90);
      const py = L.vh / 2 - L.H / 2 + d * (L.vh / 2 + L.H / 2 + 40);
      if (cur) {
        const oc = clamp(o, -0.05, 1.05), o1 = clamp(oc, 0, 1);
        x = lerp(px, L.openL, oc) - S.cardLean.x * 22; y = lerp(py, L.openT, o1);
        wd = lerp(L.W, L.vw - L.openL - L.openR, o1); ht = lerp(L.H, L.vh - L.openT - L.openB, o1);
      } else { x = px; y = py; wd = L.W; ht = L.H; op = 1 - clamp(o * 2.5, 0, 1); }
    } else {
      x = L.sheetL + d * L.vw;
      const py = L.peekT + (1 - cw) * (L.peekH + 60);
      if (cur) { const oc = clamp(o, -0.05, 1.05); y = lerp(py, L.openT, oc) - S.cardLean.x * 22; wd = L.sheetW; ht = lerp(L.peekH, L.openH, clamp(oc, 0, 1)); }
      else { y = py; wd = L.sheetW; ht = L.peekH; op = 1 - clamp(o * 2.5, 0, 1); }
    }
    if (j !== i) op *= S.seam.x;
    if (cw <= 0.001) op = 0;
    const vis = Math.abs(d) < 1.6 && op > 0.01;
    if (c._vis !== vis) { c.style.visibility = vis ? 'visible' : 'hidden'; c._vis = vis; c.setAttribute('aria-hidden', String(!vis)); }
    if (!vis) continue;
    c.style.transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0)`;
    if (c._w !== Math.round(wd)) { c.style.width = Math.round(wd) + 'px'; c._w = Math.round(wd); }
    if (c._h !== Math.round(ht)) { c.style.height = Math.round(ht) + 'px'; c._h = Math.round(ht); }
    c.style.opacity = op.toFixed(3);
    const bo = cur ? clamp((o - 0.55) / 0.35, 0, 1) : 0;
    if (c._bo !== bo) {
      c._bo = bo;
      c.querySelector('.body').style.opacity = bo;
      c.querySelector('.eyebrow').style.opacity = bo;
      c.querySelector('.close').style.opacity = bo;
    }
    const openNow = cur && isOpen && o > 0.97;
    if (c._open !== openNow) { c.classList.toggle('is-open', openNow); c._open = openNow; }
  }

  const ca = smooth(clamp((w - 0.3) / 0.7, 0, 1));
  contactEl.style.opacity = ca.toFixed(3);
  contactEl.style.pointerEvents = ca > 0.5 ? 'auto' : 'none';

  requestAnimationFrame(frame);
}

/* ---------- boot ---------- */
layout();
addEventListener('resize', () => requestAnimationFrame(layout));
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => layout());
startBg();
const startI = ITEMS.findIndex((x) => x.slug === DATA.start);
if (startI >= 0) {
  awake = true; root.classList.add('awake'); S.wake.x = S.wake.t = 1;
  base = startI; S.pos.x = S.pos.t = startI; lastCenter = startI; current = startI;
  S.nameT.x = S.nameT.t = startI !== 0 ? 1 : 0;
  setTimeout(() => setOpen(true, 0, true), 60);
}
requestAnimationFrame(frame);
