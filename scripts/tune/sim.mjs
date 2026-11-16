// Offline tuning of the trackpad swipe detector against synthetic macOS-like gestures.
let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const FIRE = 34;
function makeDetector(P) {
  const mk = () => ({ dir: 0, acc: 0, consumed: false, m: 0, peak: 0, decayed: false, low: Infinity, rises: 0, lastFire: -1e9, firedAt: 0 });
  let G = mk(), lastAt = -1e9, steps = 0;
  const reset = () => { const lf = G.lastFire; G = mk(); G.lastFire = lf; };
  return {
    feed(raw, now) {
      if (now - lastAt > 110) reset();
      lastAt = now;
      const a = Math.abs(raw), s = Math.sign(raw);
      if (s && G.dir && s !== G.dir && a > 3) reset();
      if (s && a > 0.5) G.dir = s;
      if (G.consumed) {
        const prevM = G.m;
        G.m = G.m ? G.m * (1 - P.alpha) + a * P.alpha : a;
        if (!G.decayed) {
          G.peak = Math.max(G.peak, G.m);
          if (G.m < G.peak * P.decay && now - G.firedAt > P.minDecayMs) { G.decayed = true; G.low = G.m; }
          return;
        }
        G.rises = G.m > prevM + P.riseEps ? G.rises + 1 : 0;
        if (G.m < G.low) G.low = G.m;
        const fresh = now - G.firedAt > P.minGap && G.rises >= P.rises && G.m > Math.max(P.absMin, G.low * P.mult);
        if (!fresh) return;
        const d = G.dir; reset(); G.dir = d;
      }
      G.acc += raw;
      if (Math.abs(G.acc) >= FIRE && now - G.lastFire > 150) {
        Object.assign(G, { consumed: true, m: a, peak: a, decayed: false, low: Infinity, rises: 0, acc: 0, lastFire: now, firedAt: now });
        steps++;
      }
    },
    get steps() { return steps; },
  };
}
// one gesture: finger ramp then momentum; returns [[t, delta]]
function gesture(t0, peak, hz, tauMs, jit, rampMs = 50) {
  const dt = 1000 / hz, out = []; let t = t0;
  const k = 120 / hz;   // deltas scale with frame length
  for (let x = 0; x < rampMs; x += dt) { out.push([t, peak * k * (0.15 + 0.85 * x / rampMs)]); t += dt; }
  let v = peak * k;
  while (v > 0.6) { out.push([t, Math.max(0, v * (1 - jit + rnd() * 2 * jit))]); v *= Math.exp(-dt / tauMs); t += dt; }
  return out;
}
function run(P, events) { const D = makeDetector(P); for (const [t, d] of events) if (d >= 0.5) D.feed(d, t); return D.steps; }
function cases() {
  const C = [];
  for (const hz of [60, 120]) for (const tau of [180, 450]) for (const jit of [0.15, 0.45]) {
    for (const peak of [6, 12, 20, 35, 55]) C.push({ name: `single p${peak} ${hz}Hz tau${tau} j${jit}`, want: 1, ev: gesture(0, peak, hz, tau, jit) });
    for (const at of [250, 450, 800, 1300]) for (const p2 of [6, 10, 18, 30]) {
      const g1 = gesture(0, 30, hz, tau, jit).filter(([t]) => t < at);
      C.push({ name: `double second@${at} p${p2} ${hz}Hz tau${tau} j${jit}`, want: 2, ev: g1.concat(gesture(at, p2, hz, tau, jit)) });
    }
  }
  return C;
}
const C = cases();
function score(P) {
  let extra = 0, missed = 0; const fails = [];
  for (const c of C) { const s = run(P, c.ev); if (s > c.want) { extra++; fails.push('EXTRA ' + c.name + ' got ' + s); } if (s < c.want) { missed++; fails.push('MISS ' + c.name + ' got ' + s); } }
  return { extra, missed, fails };
}
const cur = { alpha: 0.6, decay: 0.5, minDecayMs: 80, riseEps: 0.5, rises: 1, absMin: 2, mult: 2, minGap: 150 };  // values in site.js
const r0 = score(cur); console.log('current: extra', r0.extra, 'missed', r0.missed, 'of', C.length);
let best = null;
for (const alpha of [0.3, 0.45, 0.6]) for (const decay of [0.5, 0.6, 0.7]) for (const riseEps of [0.1, 0.25, 0.5]) for (const rises of [1, 2, 3]) for (const absMin of [2, 3, 4, 6]) for (const mult of [1.4, 1.7, 2, 2.5]) for (const minGap of [150, 200, 260]) {
  const P = { alpha, decay, minDecayMs: 80, riseEps, rises, absMin, mult, minGap };
  const r = score(P); const cost = r.extra * 3 + r.missed;
  if (!best || cost < best.cost) best = { cost, P, r };
}
console.log('best', JSON.stringify(best.P), 'extra', best.r.extra, 'missed', best.r.missed);
console.log(best.r.fails.slice(0, 25).join('\n'));
