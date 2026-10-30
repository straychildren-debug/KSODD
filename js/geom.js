'use strict';
// Геометрия. Мировые координаты в метрах, ось Y направлена вниз (как в SVG).
const G = (() => {
  const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const mul = (a, s) => [a[0] * s, a[1] * s];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
  const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
  const len = a => Math.hypot(a[0], a[1]);
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const norm = a => { const l = len(a); return l > 1e-9 ? [a[0] / l, a[1] / l] : [1, 0]; };
  // Нормаль «вправо» по ходу движения (на экране с осью Y вниз)
  const perp = a => [-a[1], a[0]];
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

  function dedupe(pts, eps = 1e-4) {
    const out = [];
    for (const p of pts) if (!out.length || dist(out[out.length - 1], p) > eps) out.push(p);
    return out;
  }

  // Сглаживание Катмулла-Рома через заданные точки
  function catmull(pts, closed) {
    const n = pts.length;
    if (n < 3) return pts.slice();
    const get = i => closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))];
    const out = [];
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
      const seg = Math.max(4, Math.min(48, Math.ceil(dist(p1, p2) / 0.75)));
      for (let s = 0; s < seg; s++) {
        const t = s / seg, t2 = t * t, t3 = t2 * t;
        const f = k => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
        out.push([f(0), f(1)]);
      }
    }
    if (!closed) out.push(pts[n - 1].slice());
    return out;
  }

  // Параллельный сдвиг ломаной на d (положительное — вправо по ходу)
  function offset(pts, d) {
    pts = dedupe(pts);
    const n = pts.length;
    if (n < 2 || !d) return pts.slice();
    const out = [];
    for (let i = 0; i < n; i++) {
      let nr;
      if (i === 0) nr = perp(norm(sub(pts[1], pts[0])));
      else if (i === n - 1) nr = perp(norm(sub(pts[n - 1], pts[n - 2])));
      else {
        const n1 = perp(norm(sub(pts[i], pts[i - 1]))), n2 = perp(norm(sub(pts[i + 1], pts[i])));
        const m = norm(add(n1, n2));
        nr = mul(m, 1 / Math.max(dot(m, n1), 0.25));
      }
      out.push(add(pts[i], mul(nr, d)));
    }
    return out;
  }

  function length(pts) {
    let s = 0;
    for (let i = 1; i < pts.length; i++) s += dist(pts[i - 1], pts[i]);
    return s;
  }

  function cumulative(pts) {
    const c = [0];
    for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + dist(pts[i - 1], pts[i]));
    return c;
  }

  // Участок ломаной между длинами s0 и s1 от начала
  function slice(pts, s0, s1) {
    if (s1 <= s0) return [];
    const out = [];
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], l = dist(a, b), e = acc + l;
      if (e >= s0 && acc <= s1) {
        if (!out.length) out.push(lerp(a, b, l ? Math.max(0, (s0 - acc) / l) : 0));
        if (e <= s1) out.push(b.slice());
        else { out.push(lerp(a, b, (s1 - acc) / l)); break; }
      }
      acc = e;
    }
    return dedupe(out);
  }

  // Ближайшая точка на ломаной
  function project(pts, p, closed) {
    let best = null, acc = 0;
    const n = pts.length, last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const a = pts[i], b = pts[(i + 1) % n], ab = sub(b, a), l2 = dot(ab, ab), l = Math.sqrt(l2);
      let t = l2 ? dot(sub(p, a), ab) / l2 : 0;
      t = Math.max(0, Math.min(1, t));
      const q = add(a, mul(ab, t)), d = dist(p, q);
      if (!best || d < best.d) best = { p: q, d, i, t, s: acc + l * t, dir: norm(ab) };
      acc += l;
    }
    return best;
  }

  function segX(a, b, c, d) {
    const r = sub(b, a), s = sub(d, c), den = cross(r, s);
    if (Math.abs(den) < 1e-12) return null;
    const ca = sub(c, a), t = cross(ca, s) / den, u = cross(ca, r) / den;
    if (t < 0 || t > 1 || u < 0 || u > 1) return null;
    return { t, u, p: add(a, mul(r, t)) };
  }

  function lineX(p, d, q, e) {
    const den = cross(d, e);
    if (Math.abs(den) < 1e-9) return null;
    return add(p, mul(d, cross(sub(q, p), e) / den));
  }

  function area(pts) {
    let s = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      s += a[0] * b[1] - b[0] * a[1];
    }
    return s / 2;
  }

  function centroid(pts) {
    const A = area(pts);
    if (Math.abs(A) < 1e-9) {
      const s = pts.reduce((m, p) => add(m, p), [0, 0]);
      return mul(s, 1 / pts.length);
    }
    let cx = 0, cy = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], c = a[0] * b[1] - b[0] * a[1];
      cx += (a[0] + b[0]) * c; cy += (a[1] + b[1]) * c;
    }
    return [cx / (6 * A), cy / (6 * A)];
  }

  function inPoly(p, pts) {
    let ins = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[i], b = pts[j];
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) ins = !ins;
    }
    return ins;
  }

  // Вершины многоугольника, которые скругляются в режиме mode: none | all | inner (вогнутые) | outer (выпуклые)
  function filletCorners(pts, mode) {
    const n = pts.length;
    if (!mode || mode === 'none' || n < 3) return pts.map(() => false);
    const sgn = Math.sign(area(pts)) || 1;
    return pts.map((P, i) => {
      const A = pts[(i - 1 + n) % n], B = pts[(i + 1) % n];
      const c = cross(sub(P, A), sub(B, P));
      if (Math.abs(c) < 1e-9) return false;
      const convex = Math.sign(c) === sgn;
      return mode === 'all' || (mode === 'inner' && !convex) || (mode === 'outer' && convex);
    });
  }

  // Скругление углов многоугольника. radii — свои радиусы отдельных вершин { индекс: радиус }
  function fillet(pts, radius, mode, radii) {
    const n = pts.length;
    const want = filletCorners(pts, mode);
    if (!want.some(Boolean)) return { pts: pts.slice(), arcs: [] };
    const out = [], arcs = [];
    for (let i = 0; i < n; i++) {
      const P = pts[i];
      const rad = radii && radii[i] != null && radii[i] !== '' ? +radii[i] : radius;
      if (!want[i] || !(rad > 0)) { out.push(P); continue; }
      const ia = (i - 1 + n) % n, ib = (i + 1) % n, A = pts[ia], B = pts[ib];
      const u = norm(sub(A, P)), v = norm(sub(B, P));
      const th = Math.acos(Math.max(-1, Math.min(1, dot(u, v))));
      if (th < 1e-3 || th > Math.PI - 1e-3) { out.push(P); continue; }
      const lim = Math.min(dist(P, A) * (want[ia] ? 0.5 : 0.98), dist(P, B) * (want[ib] ? 0.5 : 0.98));
      let t = rad / Math.tan(th / 2), r = rad;
      if (t > lim) { t = lim; r = t * Math.tan(th / 2); }
      const T1 = add(P, mul(u, t)), T2 = add(P, mul(v, t));
      const O = add(P, mul(norm(add(u, v)), r / Math.sin(th / 2)));
      const a1 = Math.atan2(T1[1] - O[1], T1[0] - O[0]);
      let da = Math.atan2(T2[1] - O[1], T2[0] - O[0]) - a1;
      while (da > Math.PI) da -= 2 * Math.PI;
      while (da < -Math.PI) da += 2 * Math.PI;
      const steps = Math.max(4, Math.ceil(Math.abs(da) / (Math.PI / 24)));
      const arc = [];
      for (let k = 0; k <= steps; k++) {
        const a = a1 + da * k / steps;
        arc.push([O[0] + r * Math.cos(a), O[1] + r * Math.sin(a)]);
      }
      out.push(...arc);
      arcs.push(arc);
    }
    return { pts: out, arcs };
  }

  // Скругление изломов открытой ломаной дугами. radius(i, turn) — радиус в вершине i,
  // turn > 0 — поворот вправо по ходу.
  function roundPolyline(pts, radius) {
    const n = pts.length;
    if (n < 3) return pts.slice();
    const out = [pts[0]];
    for (let i = 1; i < n - 1; i++) {
      const P = pts[i], A = pts[i - 1], B = pts[i + 1];
      const u = norm(sub(A, P)), v = norm(sub(B, P));
      const th = Math.acos(Math.max(-1, Math.min(1, dot(u, v))));
      const turn = cross(sub(P, A), sub(B, P));
      const r0 = radius(i, turn);
      if (!(r0 > 0) || th < 1e-3 || th > Math.PI - 1e-3) { out.push(P); continue; }
      const lim = Math.min(dist(P, A) * (i > 1 ? 0.5 : 0.98), dist(P, B) * (i < n - 2 ? 0.5 : 0.98));
      let t = r0 / Math.tan(th / 2), r = r0;
      if (t > lim) { t = lim; r = t * Math.tan(th / 2); }
      const T1 = add(P, mul(u, t)), T2 = add(P, mul(v, t));
      const O = add(P, mul(norm(add(u, v)), r / Math.sin(th / 2)));
      const a1 = Math.atan2(T1[1] - O[1], T1[0] - O[0]);
      let da = Math.atan2(T2[1] - O[1], T2[0] - O[0]) - a1;
      while (da > Math.PI) da -= 2 * Math.PI;
      while (da < -Math.PI) da += 2 * Math.PI;
      const steps = Math.max(6, Math.ceil(Math.abs(da) / (Math.PI / 48)));
      for (let k = 0; k <= steps; k++) {
        const a = a1 + da * k / steps;
        out.push([O[0] + r * Math.cos(a), O[1] + r * Math.sin(a)]);
      }
    }
    out.push(pts[n - 1]);
    return dedupe(out);
  }

  // Дуга окружности (центр O, радиус r) от угла a1 на угол da, шаг не крупнее step
  function arc(O, r, a1, da, step = Math.PI / 48) {
    const n = Math.max(2, Math.ceil(Math.abs(da) / step));
    const out = [];
    for (let k = 0; k <= n; k++) {
      const a = a1 + da * k / n;
      out.push([O[0] + r * Math.cos(a), O[1] + r * Math.sin(a)]);
    }
    return out;
  }

  // Параметры t пересечения прямой p + t·d с окружностью (O, r), по возрастанию
  function lineCircle(p, d, O, r) {
    const f = sub(p, O), A = dot(d, d), B = 2 * dot(f, d), Cq = dot(f, f) - r * r;
    const D = B * B - 4 * A * Cq;
    if (D < 0 || A < 1e-12) return [];
    const s = Math.sqrt(D);
    return [(-B - s) / (2 * A), (-B + s) / (2 * A)];
  }

  // Ограничивающий прямоугольник набора точек
  function bbox(pts) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pts) {
      if (p[0] < x0) x0 = p[0];
      if (p[0] > x1) x1 = p[0];
      if (p[1] < y0) y0 = p[1];
      if (p[1] > y1) y1 = p[1];
    }
    return { x0, y0, x1, y1 };
  }

  return { add, sub, mul, dot, cross, len, dist, norm, perp, lerp, dedupe, catmull, offset, roundPolyline, length, cumulative, slice, project, segX, lineX, area, centroid, inPoly, filletCorners, fillet, arc, lineCircle, bbox };
})();
