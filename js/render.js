'use strict';
// Построение SVG сцены из документа. Все размеры — в метрах.

const C = {
  asphalt: '#a5a8ac', curb: '#5f6368', walk: '#e8e1d1', walkEdge: '#b0a690',
  lawn: '#b9dc95', lawnEdge: '#88b968', median: '#5cb85c',
  building: '#efe2cf', buildingEdge: '#7d6a52', bike: '#d9917f',
  mark: '#ffffff', yellow: '#f5c400', ink: '#263238',
};

// Категории для панели «Слои»
const LAYERS = [
  ['bg', 'Подложка'],
  ['road', 'Дороги и тротуары'],
  ['green', 'Озеленение'],
  ['build', 'Здания'],
  ['mark', 'Разметка и парковки'],
  ['equip', 'Светофоры и опоры'],
  ['signs', 'Дорожные знаки'],
  ['annot', 'Подписи и размеры'],
];

function layerOf(o) {
  switch (o.type) {
    case 'road': case 'path': case 'roundabout': case 'pocket': case 'ramp': return 'road';
    case 'area': return o.kind === 'building' ? 'build' : o.kind === 'green' ? 'green' : 'road';
    case 'tree': return 'green';
    case 'marking': case 'crosswalk': case 'parking': return 'mark';
    case 'light': case 'pole': case 'fence': return 'equip';
    case 'sign': return 'signs';
    default: return 'annot';
  }
}

// Порядок отрисовки (снизу вверх)
// pgreen/pwalk — газон и тротуар вокруг колец и карманов, поверх обычных тротуаров дорог
const BUCKETS = ['base', 'rgreen', 'rwalk', 'pgreen', 'pwalk', 'rcurb', 'drive', 'asphalt', 'rmark', 'patch', 'mark', 'build', 'equip', 'annot', 'signs'];

const MARK_STYLES = {
  '1.1': { l: '1.1 Сплошная', s: [{ o: 0, w: 0.1 }] },
  '1.2': { l: '1.2 Край проезжей части', s: [{ o: 0, w: 0.2 }] },
  '1.3': { l: '1.3 Двойная сплошная', s: [{ o: -0.1, w: 0.1 }, { o: 0.1, w: 0.1 }] },
  '1.4': { l: '1.4 Жёлтая (запрет остановки)', s: [{ o: 0, w: 0.1, y: 1 }] },
  '1.5': { l: '1.5 Прерывистая', s: [{ o: 0, w: 0.1, dash: '3 6' }] },
  '1.6': { l: '1.6 Линия приближения', s: [{ o: 0, w: 0.1, dash: '6 2' }] },
  '1.7': { l: '1.7 Короткий штрих (на перекрёстке)', s: [{ o: 0, w: 0.1, dash: '0.5 0.5' }] },
  '1.10': { l: '1.10 Жёлтая прерывистая (запрет стоянки)', s: [{ o: 0, w: 0.1, y: 1, dash: '1 1' }] },
  '1.11': { l: '1.11 Сплошная + прерывистая', s: [{ o: -0.1, w: 0.1 }, { o: 0.1, w: 0.1, dash: '3 3' }] },
  '1.12': { l: '1.12 Стоп-линия', s: [{ o: 0, w: 0.4 }] },
  '1.17': { l: '1.17 Остановка маршрутных ТС (зигзаг)', s: [{ o: 0, w: 0.1, y: 1, zig: [0.5, 1.5] }] },
};

const FENCE_KINDS = { ped: 'Пешеходное ограждение', barrier: 'Барьерное ограждение', fence: 'Забор' };

const R = (() => {
  const f = n => Math.round(n * 100) / 100;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function pd(pts, closed) {
    if (!pts.length) return '';
    let s = 'M' + f(pts[0][0]) + ' ' + f(pts[0][1]);
    for (let i = 1; i < pts.length; i++) s += 'L' + f(pts[i][0]) + ' ' + f(pts[i][1]);
    return closed ? s + 'Z' : s;
  }
  const stroke = (pts, w, col, extra = '') =>
    pts.length < 2 ? '' : `<path d="${pd(pts)}" fill="none" stroke="${col}" stroke-width="${f(w)}" stroke-linejoin="round" ${extra}/>`;
  const fill = (pts, col, extra = '') => `<path d="${pd(pts, true)}" fill="${col}" ${extra}/>`;
  const idA = o => `data-id="${o.id}"`;
  // Цвет подписи, читаемый на заданной заливке
  function inkFor(hex) {
    const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || '');
    if (!m) return C.ink;
    const [r, g, b] = m.slice(1).map(h => parseInt(h, 16) / 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.45 ? '#fff' : C.ink;
  }
  const hit = (pts, ctx, o, closed) => ctx.exporting || pts.length < 2 ? '' :
    `<path d="${pd(pts, closed)}" fill="none" stroke="rgba(0,0,0,0)" stroke-width="${f(Math.max(0.6, 10 / ctx.k))}" ${idA(o)}/>`;

  function text(x, y, str, size, col, rot, extra = '') {
    const lines = String(str).split('\n');
    const y0 = y - (lines.length - 1) * size * 0.6;
    const tr = rot ? ` transform="rotate(${f(rot)} ${f(x)} ${f(y)})"` : '';
    const tsp = lines.map((l, i) => `<tspan x="${f(x)}" y="${f(y0 + i * size * 1.2)}">${esc(l)}</tspan>`).join('');
    return `<text font-family="Arial, sans-serif" font-size="${f(size)}" fill="${col}" text-anchor="middle" dominant-baseline="central"${tr} ${extra}>${tsp}</text>`;
  }

  function markLine(out, pts, style, extra = '') {
    const st = MARK_STYLES[style];
    if (!st || pts.length < 2) return;
    for (const s of st.s) {
      let p = s.o ? G.offset(pts, s.o) : pts;
      if (s.zig) p = zigzag(p, s.zig[0], s.zig[1]);
      out.push(stroke(p, s.w, s.y ? C.yellow : C.mark, (s.dash ? `stroke-dasharray="${s.dash}" ` : '') + extra));
    }
  }

  // Зигзаг вдоль ломаной: размах amp в каждую сторону, период per
  function zigzag(pts, amp, per) {
    const L = G.length(pts), n = Math.max(2, Math.round(2 * L / per));
    const out = [];
    for (let k = 0; k <= n; k++) {
      const q = along(pts, L * k / n);
      out.push(G.add(q.p, G.mul(G.perp(q.dir), k % 2 ? amp : -amp)));
    }
    return out;
  }

  const RENDER = {};

  RENDER.road = (o, B, ctx) => {
    const c = roadCenter(o);
    if (c.length < 2) return;
    const m = roadMetrics(o), id = idA(o), gap = +o.greenStrip || 0;
    for (const [sg, sw, edge] of [[1, +o.sidewalkR || 0, m.pos], [-1, +o.sidewalkL || 0, m.neg]]) {
      if (gap > 0) B.rgreen.push(stroke(G.offset(c, edge + sg * gap / 2), gap + 0.05, C.lawn, id));
      if (sw > 0) {
        B.rgreen.push(stroke(G.offset(c, edge + sg * (gap + sw)), 0.12, C.walkEdge));
        B.rwalk.push(stroke(G.offset(c, edge + sg * (gap + sw / 2)), sw, C.walk, id));
      }
    }
    const cc = G.offset(c, (m.pos + m.neg) / 2);
    B.rcurb.push(stroke(cc, m.W + 0.3, C.curb, id));
    B.asphalt.push(stroke(cc, m.W, C.asphalt, id));

    const total = G.length(c);
    const mc = G.slice(c, +o.trimStart || 0, total - (+o.trimEnd || 0));
    if (mc.length < 2) return;
    const med = +o.median || 0, lw = +o.laneW || 3.5;
    if (med > 0) {
      B.rmark.push(stroke(mc, med + 0.3, C.curb, id));
      B.rmark.push(stroke(mc, Math.max(0.05, med - 0.1), C.median, id));
    } else {
      const cs = { double: '1.3', single: '1.1', dashed: '1.5' }[o.centerLine];
      if (cs && o.lanesF > 0 && o.lanesB > 0) markLine(B.rmark, mc, cs);
    }
    const ls = { dashed: '1.5', solid: '1.1' }[o.laneLine];
    if (ls) {
      for (let i = 1; i < o.lanesF; i++) markLine(B.rmark, G.offset(mc, med / 2 + i * lw), ls);
      for (let i = 1; i < o.lanesB; i++) markLine(B.rmark, G.offset(mc, -(med / 2 + i * lw)), ls);
    }
    if (o.edgeLine) {
      markLine(B.rmark, G.offset(mc, m.pos - 0.3), '1.2');
      markLine(B.rmark, G.offset(mc, m.neg + 0.3), '1.2');
    }
  };

  RENDER.path = (o, B, ctx) => {
    const c = o.smooth ? G.catmull(o.points, false) : o.points;
    if (c.length < 2) return;
    const w = +o.width || 2, id = idA(o);
    if (o.kind === 'drive') {
      B.rcurb.push(stroke(c, w + 0.3, C.curb, id));
      B.drive.push(stroke(c, w, C.asphalt, id));
    } else {
      B.base.push(stroke(c, w + 0.16, C.walkEdge, id));
      B.base.push(stroke(c, w, o.kind === 'bike' ? C.bike : C.walk, id));
    }
  };

  RENDER.area = (o, B, ctx) => {
    if (o.points.length < 3) return;
    const fl = G.fillet(o.points, +o.radius || 0, o.round, o.radii);
    const id = idA(o), col = o.color;
    if (o.kind === 'building') {
      const fc = col || C.building;
      B.build.push(fill(fl.pts, fc, `stroke="${C.buildingEdge}" stroke-width="0.15" stroke-linejoin="round" ${id}`));
      const lbl = [o.label, o.floors ? o.floors + ' эт.' : ''].filter(Boolean).join('\n');
      if (lbl) { const p = G.centroid(fl.pts); B.build.push(text(p[0], p[1], lbl, +o.labelSize || 2, inkFor(fc), 0, id)); }
    } else if (o.kind === 'green') {
      B.base.push(fill(fl.pts, col || C.lawn, `stroke="${C.lawnEdge}" stroke-width="0.1" ${id}`));
    } else if (o.kind === 'sidewalk') {
      B.base.push(fill(fl.pts, col || C.walk, `stroke="${C.walkEdge}" stroke-width="0.1" ${id}`));
    } else {
      B.patch.push(fill(fl.pts, col || C.asphalt, id));
      for (const a of fl.arcs) B.patch.push(stroke(a, 0.15, C.curb, 'stroke-linecap="round"'));
      if (o.label) { const p = G.centroid(fl.pts); B.patch.push(text(p[0], p[1], o.label, +o.labelSize || 2, '#fff', 0, id)); }
    }
  };

  // Кольцевой перекрёсток: дороги, чья ось пересекает кольцо, примыкают к нему со скруглёнными бордюрами
  RENDER.roundabout = (o, B, ctx) => {
    const g = ringGeom(o, ctx.doc), id = idA(o), O = g.O;
    const ringW = Math.min(Math.max(1, +o.ringW || 7), g.R - 1), Ri = g.R - ringW;
    const gw = Math.max(0, +o.green || 0), ww = Math.max(0, +o.walk || 0);
    // Обход кольца идёт по возрастанию угла, поэтому «наружу» — отрицательный сдвиг
    for (const c of g.curbs) {
      if (gw > 0) B.pgreen.push(stroke(G.offset(c, -gw / 2), gw + 0.05, C.lawn, id));
      if (ww > 0) {
        B.pgreen.push(stroke(G.offset(c, -(gw + ww)), 0.12, C.walkEdge));
        B.pwalk.push(stroke(G.offset(c, -(gw + ww / 2)), ww, C.walk, id));
      }
    }
    B.patch.push(fill(g.poly, C.asphalt, id));
    for (const c of g.curbs) B.patch.push(stroke(c, 0.15, C.curb, 'stroke-linecap="round"'));
    const circ = r => G.arc(O, r, 0, 2 * Math.PI);
    if (o.island === 'asphalt') {
      // Островок, обозначенный разметкой (мини-кольцо)
      B.mark.push(fill(circ(Ri), '#ffffff', `fill-opacity="0.35" stroke="${C.mark}" stroke-width="0.15" ${id}`));
    } else {
      const ap = Math.min(Math.max(0, +o.apron || 0), Ri - 0.5);
      if (ap > 0) B.patch.push(fill(circ(Ri), '#c9c2b4', `stroke="${C.curb}" stroke-width="0.15" ${id}`));
      B.patch.push(fill(circ(Ri - ap), o.island === 'sidewalk' ? C.walk : C.lawn, `stroke="${C.curb}" stroke-width="0.15" ${id}`));
    }
    const lanes = Math.max(1, Math.round(+o.lanes || 1));
    for (let k = 1; k < lanes; k++) markLine(B.mark, circ(Ri + ringW * k / lanes), '1.5', id);
  };

  // Заездной карман: остановка или парковка вдоль бордюра (места — справа по ходу a→b)
  RENDER.pocket = (o, B, ctx) => {
    const g = pocketGeom(o);
    if (!g) return;
    const id = idA(o), gw = Math.max(0, +o.green || 0), ww = Math.max(0, +o.walk || 0);
    if (gw > 0) B.pgreen.push(stroke(G.offset(g.curb, gw / 2), gw + 0.05, C.lawn, id));
    if (ww > 0) {
      B.pgreen.push(stroke(G.offset(g.curb, gw + ww), 0.12, C.walkEdge));
      B.pwalk.push(stroke(G.offset(g.curb, gw + ww / 2), ww, C.walk, id));
    }
    B.patch.push(fill(g.poly, C.asphalt, id));
    B.patch.push(stroke(g.curb, 0.15, C.curb, 'stroke-linecap="round"'));
    if (o.kind === 'parking') {
      RENDER.parking(Object.assign({}, o, { points: [g.a, g.b], side: 'right' }), B, ctx);
      return;
    }
    if (o.zig) markLine(B.mark, [g.at(0, g.D - 0.75), g.at(g.L, g.D - 0.75)], '1.17', id);
    if (o.pavilion && ww >= 1.2) {
      const h = Math.min(2, ww - 0.4), d0 = g.D + gw + (ww - h) / 2, len = Math.min(6, g.L * 0.6), s0 = (g.L - len) / 2;
      B.equip.push(fill([g.at(s0, d0), g.at(s0 + len, d0), g.at(s0 + len, d0 + h), g.at(s0, d0 + h)], '#cfd8dc', `stroke="#546e7a" stroke-width="0.08" ${id}`));
    }
  };

  RENDER.fence = (o, B, ctx) => {
    const c = o.points;
    if (c.length < 2) return;
    const step = Math.max(0.5, +o.step || 2.5), L = G.length(c);
    let out;
    if (o.kind === 'barrier') out = stroke(G.offset(c, 0.12), 0.07, '#455a64') + stroke(G.offset(c, -0.12), 0.07, '#455a64');
    else out = stroke(c, o.kind === 'fence' ? 0.14 : 0.08, o.kind === 'fence' ? '#6d4c41' : '#37474f');
    const n = Math.max(1, Math.round(L / step));
    for (let k = 0; k <= n; k++) {
      const p = along(c, L * k / n).p;
      out += o.kind === 'ped'
        ? `<circle cx="${f(p[0])}" cy="${f(p[1])}" r="0.11" fill="#37474f"/>`
        : `<rect x="${f(p[0] - 0.12)}" y="${f(p[1] - 0.12)}" width="0.24" height="0.24" fill="${o.kind === 'fence' ? '#6d4c41' : '#263238'}"/>`;
    }
    B.equip.push(`<g ${idA(o)}>${out}</g>`);
    B.equip.push(hit(c, ctx, o));
  };

  // Пандус (бордюрный съезд): x — к проезжей части (0 — бордюр), y — вдоль бордюра
  RENDER.ramp = (o, B) => {
    const p = o.points[0], w = Math.max(0.5, +o.width || 2), d = Math.max(0.3, +o.depth || 1.5), hw = w / 2;
    let s = `<path d="M${f(-d)} ${f(-hw)}L0 ${f(-hw - d)}V${f(hw + d)}L${f(-d)} ${f(hw)}Z" fill="#e3ddd0" stroke="#8d8270" stroke-width="0.05"/>`;
    s += `<rect x="${f(-d)}" y="${f(-hw)}" width="${f(d)}" height="${f(w)}" fill="#cfc8ba" stroke="#8d8270" stroke-width="0.05"/>`;
    const tw = o.tactile ? Math.min(0.6, d * 0.4) : 0;
    if (tw) s += `<rect x="${f(-tw)}" y="${f(-hw)}" width="${f(tw)}" height="${f(w)}" fill="${C.yellow}" fill-opacity="0.9"/>`;
    // Стрелка уклона — вниз, к проезжей части
    const x0 = -d * 0.85, x1 = -tw - 0.12;
    if (x1 - x0 > 0.3) s += `<path d="M${f(x0)} 0H${f(x1 - 0.2)}" stroke="#5d4037" stroke-width="0.06"/><path d="M${f(x1)} 0L${f(x1 - 0.25)} -0.13V0.13Z" fill="#5d4037"/>`;
    B.mark.push(`<g transform="translate(${f(p[0])} ${f(p[1])}) rotate(${f(+o.rot || 0)})" ${idA(o)}>${s}</g>`);
  };

  RENDER.marking = (o, B, ctx) => {
    const c = o.smooth ? G.catmull(o.points, false) : o.points;
    markLine(B.mark, c, o.style, idA(o));
    B.mark.push(hit(c, ctx, o));
  };

  RENDER.crosswalk = (o, B, ctx) => {
    const [a, b] = o.points;
    if (!b) return;
    const L = G.dist(a, b);
    if (L < 0.3) return;
    const u = G.norm(G.sub(b, a)), n = G.perp(u), W = +o.width || 4, id = idA(o);
    const q = (s, h) => G.add(G.add(a, G.mul(u, s)), G.mul(n, h));
    const rect = (s0, s1) => [q(s0, -W / 2), q(s1, -W / 2), q(s1, W / 2), q(s0, W / 2)];
    B.mark.push(fill(rect(0, L), o.style === 'yellow' ? C.yellow : 'rgba(0,0,0,0)', id));
    const N = Math.max(1, Math.floor((L + 0.6) / 1.0));
    const s0 = (L - (N * 1.0 - 0.6)) / 2;
    let st = '';
    for (let i = 0; i < N; i++) st += pd(rect(s0 + i, s0 + i + 0.4), true);
    B.mark.push(`<path d="${st}" fill="${C.mark}" ${id}/>`);
  };

  RENDER.parking = (o, B, ctx) => {
    const g = parkingGeom(o);
    if (!g) return;
    const id = idA(o);
    if (o.highlight) B.mark.push(fill(g.outline, o.hlColor || '#2f80ed', `fill-opacity="0.25" ${id}`));
    else B.mark.push(fill(g.outline, 'rgba(0,0,0,0)', id));
    for (const l of g.lines) B.mark.push(stroke(l, 0.1, C.mark, id));
    const mgn = Math.min(+o.mgn || 0, g.count);
    if (mgn > 0) {
      // Разметка 1.24.3 «Инвалиды»: читается со стороны проезда, верх символа — к бордюру
      const sz = Math.min(+o.stallW || 2.5, +o.stallL || 5) * 0.6;
      const rot = Math.atan2(-g.dir[0], g.dir[1]) * 180 / Math.PI;
      for (let i = 0; i < mgn; i++) {
        const p = g.centers[i];
        B.mark.push(`<g transform="translate(${f(p[0])} ${f(p[1])}) rotate(${f(rot)}) scale(${f(sz)}) translate(-0.5 -0.5)" ${id}>${wheelchairSvg('#fff')}</g>`);
      }
    }
    if (o.numbered) {
      const sz = Math.min(+o.stallW || 2.5, +o.stallL || 5) * 0.4;
      g.centers.forEach((p, i) => {
        if (i < mgn) p = G.add(p, G.mul(g.along, (+o.stallL || 5) * 0.36));
        B.mark.push(text(p[0], p[1], (+o.startNum || 1) + i, sz, '#123a7a', 0, `font-weight="bold" ${id}`));
      });
    }
  };

  // Стойка со знаками: points[0] — место установки, points[1] — низ пакета знаков
  RENDER.sign = (o, B) => {
    const [p, q] = o.points;
    const s = +o.size || 2.5, gap = 0.06;
    const items = (o.items || []).filter(it => SIGN_LIB[it.code]);
    const H = items.reduce((h, it) => h + SIGN_LIB[it.code].h + gap, 0) - (items.length ? gap : 0);
    let out = `<path d="M${f(p[0])} ${f(p[1])}L${f(q[0])} ${f(q[1])}" stroke="#37474f" stroke-width="${f(0.04 * s)}"/>`;
    // Плоскость знака на стойке и направление, куда он обращён
    out += `<g transform="translate(${f(p[0])} ${f(p[1])}) rotate(${f(+o.rot || 0)}) scale(${f(s * 0.3)})"><path d="M0 -0.7V0.7" stroke="#1a1a1a" stroke-width="0.22"/><path d="M0.2 -0.35L0.75 0L0.2 0.35Z" fill="#1a1a1a"/><circle r="0.2" fill="#fff" stroke="#1a1a1a" stroke-width="0.08"/></g>`;
    let y = q[1] - H * s;
    for (const it of items) {
      const def = SIGN_LIB[it.code];
      out += `<g transform="translate(${f(q[0] - s / 2)} ${f(y)}) scale(${f(s)})">${def.draw(Object.assign({ text: def.text }, it))}</g>`;
      y += (def.h + gap) * s;
    }
    B.signs.push(`<g ${idA(o)}>${out}</g>`);
  };

  const LIGHT_BODY = {
    vehicle: '<rect x="-0.3" y="-0.8" width="0.6" height="1.6" rx="0.1" fill="#263238"/><circle cy="-0.5" r="0.19" fill="#e53935"/><circle r="0.19" fill="#fbc02d"/><circle cy="0.5" r="0.19" fill="#43a047"/>',
    pedestrian: '<rect x="-0.3" y="-0.55" width="0.6" height="1.1" rx="0.08" fill="#263238"/><circle cy="-0.26" r="0.19" fill="#e53935"/><circle cy="0.26" r="0.19" fill="#43a047"/>',
  };
  const tr = (p, rot, s) => `transform="translate(${f(p[0])} ${f(p[1])}) rotate(${f(rot || 0)}) scale(${s})"`;

  RENDER.light = (o, B) => {
    const body = LIGHT_BODY[o.kind] || LIGHT_BODY.vehicle;
    B.equip.push(`<g ${tr(o.points[0], o.rot, +o.size || 1.5)} ${idA(o)}>${body}<path d="M0.38 -0.22L0.7 0L0.38 0.22Z" fill="#263238"/></g>`);
  };

  const TREE = (() => {
    const k = 9, r = 0.8;
    let s = '';
    for (let i = 0; i <= k; i++) {
      const a = i / k * 2 * Math.PI, x = f(r * Math.cos(a)), y = f(r * Math.sin(a));
      s += i ? `A0.34 0.34 0 0 1 ${x} ${y}` : `M${x} ${y}`;
    }
    return s + 'Z';
  })();

  RENDER.tree = (o, B) => {
    B.equip.push(`<g ${tr(o.points[0], 0, +o.r || 2.5)} ${idA(o)}><path d="${TREE}" fill="#8bc34a" fill-opacity="0.9" stroke="#558b2f" stroke-width="0.05"/><circle r="0.08" fill="#6d4c41"/></g>`);
  };

  RENDER.pole = (o, B) => {
    B.equip.push(`<g ${tr(o.points[0], o.rot, +o.size || 1)} ${idA(o)}><line x1="0" y1="0" x2="1" y2="0" stroke="#37474f" stroke-width="0.1"/><ellipse cx="1.05" rx="0.25" ry="0.14" fill="#ffd54f" stroke="#37474f" stroke-width="0.05"/><circle r="0.25" fill="#fff" stroke="#37474f" stroke-width="0.08"/><circle r="0.08" fill="#37474f"/></g>`);
  };

  RENDER.text = (o, B) => {
    const p = o.points[0];
    B.annot.push(text(p[0], p[1], o.text || ' ', +o.size || 2, o.color || C.ink, +o.rot || 0, idA(o)));
  };

  RENDER.dim = (o, B, ctx) => {
    const [a, b] = o.points;
    if (!b) return;
    const L = G.dist(a, b);
    if (L < 0.01) return;
    const u = G.norm(G.sub(b, a)), n = G.perp(u), off = +o.offset || 0, s = +o.size || 1, sg = off < 0 ? -1 : 1;
    const A = G.add(a, G.mul(n, off)), Bp = G.add(b, G.mul(n, off)), id = idA(o), w = 0.05 * s;
    let out = '';
    if (Math.abs(off) > 0.01) {
      out += stroke([a, G.add(A, G.mul(n, sg * 0.4 * s))], w, C.ink);
      out += stroke([b, G.add(Bp, G.mul(n, sg * 0.4 * s))], w, C.ink);
    }
    out += stroke([G.sub(A, G.mul(u, 0.4 * s)), G.add(Bp, G.mul(u, 0.4 * s))], w, C.ink);
    const t = G.mul(G.norm(G.add(u, n)), 0.3 * s);
    out += stroke([G.sub(A, t), G.add(A, t)], w * 2, C.ink) + stroke([G.sub(Bp, t), G.add(Bp, t)], w * 2, C.ink);
    let ang = Math.atan2(u[1], u[0]) * 180 / Math.PI;
    let tn = G.mul(n, sg);
    if (ang > 90 || ang < -90) ang += 180;
    const mid = G.add(G.lerp(A, Bp, 0.5), G.mul(tn, 0.6 * s));
    out += text(mid[0], mid[1], L.toFixed(2).replace('.', ',') + ' м', 0.9 * s, C.ink, ang);
    B.annot.push(`<g ${id}>${out}</g>`);
    B.annot.push(hit([A, Bp], ctx, o));
  };

  function render(doc, ctx) {
    ctx = Object.assign({ doc }, ctx);
    const B = {};
    for (const k of BUCKETS) B[k] = [];
    for (const o of doc.objects) {
      if (o.hidden || !doc.layers[layerOf(o)]) continue;
      const fn = RENDER[o.type];
      if (fn) fn(o, B, ctx);
    }
    return BUCKETS.map(k => B[k].join('')).join('');
  }

  // Отрисовка одного объекта (для предпросмотра при рисовании)
  function renderOne(o, ctx) {
    const B = {};
    for (const k of BUCKETS) B[k] = [];
    const fn = RENDER[o.type];
    if (fn) fn(o, B, ctx);
    return BUCKETS.map(k => B[k].join('')).join('');
  }

  function bg(doc, exporting) {
    const b = doc.bg;
    if (!b || !b.visible || !doc.layers.bg) return '';
    const h = b.width * b.natH / b.natW;
    const ev = b.locked || exporting ? 'style="pointer-events:none"' : 'data-id="__bg"';
    return `<image href="${b.src}" x="${f(b.x)}" y="${f(b.y)}" width="${f(b.width)}" height="${f(h)}" opacity="${b.opacity}" preserveAspectRatio="none" ${ev}/>`;
  }

  return { render, renderOne, bg, pd, f, esc };
})();

// ---- Общие геометрические вычисления объектов ----

function roadCenter(o) {
  const pts = G.dedupe(o.points);
  if (o.smooth) return G.dedupe(G.catmull(pts, false));
  const cr = +(o.curbR ?? 8);
  if (!(cr > 0)) return pts;
  // Ось скругляется так, чтобы внутренний бордюр шёл по радиусу cr,
  // а все полосы, газоны и тротуары стали концентрическими дугами
  const m = roadMetrics(o), gap = +o.greenStrip || 0;
  return G.roundPolyline(pts, (i, turn) => {
    const curb = turn > 0 ? m.pos : -m.neg, sw = +(turn > 0 ? o.sidewalkR : o.sidewalkL) || 0;
    const inner = curb + (sw > 0 ? gap + sw : gap);
    return Math.max(cr + curb, inner + 0.3);
  });
}

function roadMetrics(o) {
  const lw = +o.laneW || 3.5, med = +o.median || 0;
  const pos = med / 2 + (+o.lanesF || 0) * lw;
  const neg = -(med / 2 + (+o.lanesB || 0) * lw);
  return { pos, neg, W: pos - neg };
}

// Точка и направление на расстоянии s от начала ломаной
function along(pts, s) {
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], l = G.dist(a, b);
    if (acc + l >= s || i === pts.length - 1) {
      const t = l ? Math.max(0, Math.min(1, (s - acc) / l)) : 0;
      return { p: G.lerp(a, b, t), dir: G.norm(G.sub(b, a)) };
    }
    acc += l;
  }
  return { p: pts[0], dir: [1, 0] };
}

// Примыкания дорог к кольцу: где ось дороги пересекает наружную кромку кольца
function ringArms(o, doc) {
  const O = o.points[0], R = +o.R || 20, arms = [];
  if (!doc) return arms;
  for (const r of doc.objects) {
    if (r.type !== 'road' || r.hidden || r.points.length < 2) continue;
    const c = roadCenter(r), n = c.length;
    if (n < 2) continue;
    // Концы чуть продлеваются: дорога, доведённая до кромки, тоже считается примыканием
    const ext = [G.add(c[0], G.mul(G.norm(G.sub(c[0], c[1])), 2)), ...c, G.add(c[n - 1], G.mul(G.norm(G.sub(c[n - 1], c[n - 2])), 2))];
    const m = roadMetrics(r);
    for (let i = 1; i < ext.length; i++) {
      const a = ext[i - 1], d = G.sub(ext[i], a);
      for (const t of G.lineCircle(a, d, O, R)) {
        if (t < 0 || t >= 1) continue;
        const X = G.add(a, G.mul(d, t)), u = G.norm(d), out = G.dot(u, G.sub(X, O));
        if (Math.abs(out) < 1e-6) continue;
        arms.push({ X, d: G.mul(u, Math.sign(out)), n: G.perp(u), m, ang: Math.atan2(X[1] - O[1], X[0] - O[0]) });
      }
    }
  }
  return arms.sort((a, b) => a.ang - b.ang);
}

// Контур проезжей части кольца с примыканиями. curbs — участки бордюра между рукавами
function ringGeom(o, doc) {
  const O = o.points[0], R = +o.R || 20, rf = Math.max(0, +o.entryR || 0);
  const arms = ringArms(o, doc);
  if (!arms.length) {
    const c = G.arc(O, R, 0, 2 * Math.PI);
    return { O, R, poly: c, curbs: [c], arms };
  }
  // Точка на кромке рукава со стороны w (кромка идёт вдоль a.d)
  const edgeP = (a, w) => G.add(a.X, G.mul(a.n, G.dot(a.n, w) > 0 ? a.m.pos : a.m.neg));
  // Кромка рукава со стороны w сходит на кольцо дугой радиуса rf
  const corner = (a, w, rf) => {
    const P0 = edgeP(a, w);
    if (rf > 0) {
      const C0 = G.add(P0, G.mul(w, rf)), ts = G.lineCircle(C0, a.d, O, R + rf);
      if (ts.length) {
        const C = G.add(C0, G.mul(a.d, ts[1])), Tl = G.add(P0, G.mul(a.d, ts[1]));
        const Tr = G.add(O, G.mul(G.sub(C, O), R / (R + rf)));
        const a1 = Math.atan2(Tl[1] - C[1], Tl[0] - C[0]);
        let da = Math.atan2(Tr[1] - C[1], Tr[0] - C[0]) - a1;
        while (da > Math.PI) da -= 2 * Math.PI;
        while (da < -Math.PI) da += 2 * Math.PI;
        return { ring: Tr, arc: G.arc(C, rf, a1, da) };
      }
    }
    const ts = G.lineCircle(P0, a.d, O, R);
    const T = ts.length ? G.add(P0, G.mul(a.d, ts[1])) : P0;
    return { ring: T, arc: [T] };
  };
  const angOf = p => Math.atan2(p[1] - O[1], p[0] - O[0]);
  const N = arms.length;
  const poly = [], curbs = [];
  for (let i = 0; i < N; i++) {
    const a = arms[i], b = arms[(i + 1) % N], wa = G.perp(a.d), wb = G.mul(G.perp(b.d), -1);
    let gap = b.ang - a.ang;
    while (gap <= 0) gap += 2 * Math.PI;
    // Между близкими рукавами скругления не помещаются — радиус уменьшается
    let piece = null;
    for (const k of [1, 0.6, 0.35, 0.15, 0]) {
      const A = corner(a, wa, rf * k), Bc = corner(b, wb, rf * k);
      const a0 = angOf(A.ring);
      let span = angOf(Bc.ring) - a0;
      while (span <= 0) span += 2 * Math.PI;
      if (span < gap) {
        piece = [...A.arc, ...G.arc(O, R, a0, span), ...Bc.arc.slice().reverse()];
        break;
      }
      if (N === 1) break;
    }
    if (!piece) {
      // Кромки соседних рукавов пересекаются до кольца — угол между ними, скруглённый как обычный
      const Q = G.lineX(edgeP(a, wa), a.d, edgeP(b, wb), b.d);
      if (!Q) continue;
      piece = G.dist(Q, O) > R && rf > 0
        ? G.roundPolyline([G.add(Q, G.mul(a.d, 200)), Q, G.add(Q, G.mul(b.d, 200))], () => rf).slice(1, -1)
        : [Q];
    }
    piece = G.dedupe(piece);
    curbs.push(piece);
    poly.push(...piece);
  }
  return { O, R, poly: G.dedupe(poly), curbs, arms };
}

// Глубина кармана: для парковки — по расстановке мест
function pocketDepth(o) {
  if (o.kind !== 'parking') return Math.max(0.5, +o.depth || 3);
  const ang = +o.angle || 0;
  return ang === 0 ? (+o.stallW || 2.5) : (+o.stallL || 5) * Math.sin(ang * Math.PI / 180);
}

// Карман: points — начало и конец площадки на кромке проезжей части, карман справа по ходу
function pocketGeom(o) {
  const [a, b] = o.points;
  if (!b) return null;
  const L = G.dist(a, b);
  if (L < 0.5) return null;
  const u = G.norm(G.sub(b, a)), n = G.perp(u), D = pocketDepth(o);
  const t1 = Math.max(0, +o.taperIn || 0), t2 = Math.max(0, +o.taperOut || 0), r = Math.max(0, +o.radius || 0), ext = Math.max(3, r);
  const at = (s, h) => G.add(G.add(a, G.mul(u, s)), G.mul(n, h));
  const raw = [at(-t1 - ext, 0), at(-t1, 0), at(0, D), at(L, D), at(L + t2, 0), at(L + t2 + ext, 0)];
  const curb = r > 0 ? G.roundPolyline(raw, () => r) : raw;
  return { a, b, u, n, L, D, at, curb, poly: [...curb, at(L + t2 + ext, -0.4), at(-t1 - ext, -0.4)] };
}

function parkingGeom(o) {
  const [a, b] = o.points;
  if (!b) return null;
  const L = G.dist(a, b);
  if (L < 0.5) return null;
  const u = G.norm(G.sub(b, a));
  const n = o.side === 'left' ? G.mul(G.perp(u), -1) : G.perp(u);
  const W = +o.stallW || 2.5, SL = +o.stallL || 5, ang = +o.angle || 0;
  const at = (s, d, h) => G.add(G.add(a, G.mul(u, s)), G.mul(d, h));
  const lines = [], centers = [];
  let N, outline, dir = n;
  if (ang === 0) {
    N = Math.floor(L / SL + 1e-6);
    for (let i = 0; i <= N; i++) lines.push([at(i * SL, n, 0), at(i * SL, n, W)]);
    for (let i = 0; i < N; i++) centers.push(at(i * SL + SL / 2, n, W / 2));
    if (N > 0) lines.push([at(0, n, W), at(N * SL, n, W)]);
    outline = [at(0, n, 0), at(N * SL, n, 0), at(N * SL, n, W), at(0, n, W)];
  } else {
    const th = ang * Math.PI / 180, sn = Math.sin(th), cs = Math.cos(th);
    const d = G.add(G.mul(u, cs), G.mul(n, sn)), pitch = W / sn;
    dir = d;
    N = Math.max(0, Math.floor((L - SL * cs) / pitch + 1e-6));
    for (let i = 0; i <= N; i++) lines.push([at(i * pitch, n, 0), at(i * pitch, d, SL)]);
    for (let i = 0; i < N; i++) centers.push(G.add(at(i * pitch + pitch / 2, n, 0), G.mul(d, SL / 2)));
    outline = [at(0, n, 0), at(N * pitch, n, 0), at(N * pitch, d, SL), at(0, d, SL)];
  }
  // dir — «вглубь» места (для ориентации символов), along — вдоль длинной стороны места
  return { lines, centers, outline, count: N, dir, along: ang === 0 ? u : dir };
}
