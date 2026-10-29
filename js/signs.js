'use strict';
// Каталог дорожных знаков (ГОСТ Р 52290-2004), упрощённые векторные изображения.
// Каждый знак рисуется в единичной рамке: ширина 1, высота h (в долях ширины).

const SC = { red: '#d52b1e', blue: '#1a5fb4', yellow: '#ffcc00', black: '#1a1a1a', white: '#ffffff' };

// Символ «инвалид» (для 8.17 и разметки 1.24.3), рамка 1×1
function wheelchairSvg(col) {
  return `<g fill="none" stroke="${col}" stroke-width="0.075" stroke-linecap="round" stroke-linejoin="round"><path d="M0.62 0.66A0.2 0.2 0 1 1 0.36 0.47"/><path d="M0.46 0.3V0.54H0.66L0.75 0.8M0.46 0.41H0.62"/></g><circle cx="0.47" cy="0.16" r="0.075" fill="${col}"/>`;
}

const SIGN_LIB = (() => {
  const t = (x, y, s, fs, col = SC.black, extra = '') =>
    `<text x="${x}" y="${y}" font-family="Arial, sans-serif" font-size="${fs}" font-weight="bold" fill="${col}" text-anchor="middle" dominant-baseline="central" ${extra}>${String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</text>`;

  // Текст таблички с подбором размера; поддерживает перенос строк «\n»
  function plateText(str, cx, cy, maxW, maxH, maxFs = 0.3) {
    const lines = String(str || '').split('\n');
    const longest = Math.max(1, ...lines.map(l => l.length));
    const fs = Math.min(maxFs, maxH / lines.length / 1.15, maxW / (longest * 0.56));
    const y0 = cy - (lines.length - 1) * fs * 0.575;
    return lines.map((l, i) => t(cx, +(y0 + i * fs * 1.15).toFixed(3), l, +fs.toFixed(3))).join('');
  }

  const plate = h => `<rect x="0.015" y="0.015" width="0.97" height="${h - 0.03}" rx="0.05" fill="#fff" stroke="${SC.black}" stroke-width="0.03"/>`;
  const head = (x, y, dx, dy) => { // наконечник стрелки в точке (x,y), направление (dx,dy)
    const s = 0.07, px = -dy, py = dx;
    return `<path d="M${x} ${y}L${x - dx * s * 1.4 + px * s} ${y - dy * s * 1.4 + py * s}L${x - dx * s * 1.4 - px * s} ${y - dy * s * 1.4 - py * s}Z" fill="${SC.black}"/>`;
  };
  const vArrow = (x, y0, y1, up, down) =>
    `<path d="M${x} ${y0 + (up ? 0.08 : 0)}V${y1 - (down ? 0.08 : 0)}" stroke="${SC.black}" stroke-width="0.035"/>` + (up ? head(x, y0, 0, -1) : '') + (down ? head(x, y1, 0, 1) : '');
  const hArrow = (x0, x1, y, left, right) =>
    `<path d="M${x0 + (left ? 0.08 : 0)} ${y}H${x1 - (right ? 0.08 : 0)}" stroke="${SC.black}" stroke-width="0.035"/>` + (left ? head(x0, y, -1, 0) : '') + (right ? head(x1, y, 1, 0) : '');

  const oct = r => {
    let d = '';
    for (let i = 0; i < 8; i++) {
      const a = (22.5 + 45 * i) * Math.PI / 180;
      d += (i ? 'L' : 'M') + (0.5 + r * Math.cos(a)).toFixed(4) + ' ' + (0.5 + r * Math.sin(a)).toFixed(4);
    }
    return d + 'Z';
  };

  const prohib = inner => `<circle cx="0.5" cy="0.5" r="0.5" fill="#fff"/><circle cx="0.5" cy="0.5" r="0.48" fill="${SC.red}"/><circle cx="0.5" cy="0.5" r="0.37" fill="${SC.blue}"/>${inner}`;
  const slash = `<path d="M0.238 0.238L0.762 0.762" stroke="${SC.red}" stroke-width="0.1"/>`;
  const bar = x => `<rect x="${x}" y="0.29" width="0.06" height="0.42" fill="#fff"/>`;

  // Пешеход, идущий влево (5.19.1); для 5.19.2 — зеркально
  const walker = `<circle cx="0.45" cy="0.33" r="0.05" fill="${SC.black}"/><path d="M0.46 0.39L0.5 0.55M0.5 0.55L0.57 0.7M0.5 0.55L0.42 0.7M0.475 0.44L0.55 0.51M0.475 0.44L0.4 0.5" stroke="${SC.black}" stroke-width="0.055" stroke-linecap="round" fill="none"/>`;
  const zebra = [0, 1, 2, 3].map(i => `<rect x="${(0.29 + i * 0.12).toFixed(2)}" y="0.73" width="0.07" height="0.05" fill="${SC.black}"/>`).join('');
  const crossing = mirror => `<rect width="1" height="1" rx="0.06" fill="${SC.blue}"/><path d="M0.5 0.13L0.89 0.83H0.11Z" fill="#fff" stroke="#fff" stroke-width="0.04" stroke-linejoin="round"/>${zebra}<g ${mirror ? 'transform="translate(1 0) scale(-1 1)"' : ''}>${walker}</g>`;

  // Знаки зон 5.27–5.30: «ЗОНА» и символ; знаки конца зоны — серые с полосами
  const zone = (inner, end) => `<rect x="0.015" y="0.015" width="0.97" height="1.27" rx="0.06" fill="#fff" stroke="${SC.black}" stroke-width="0.03"/>${t(0.5, 0.2, 'ЗОНА', 0.23)}<g transform="translate(0.14 0.42) scale(0.72)">${inner}</g>` +
    (end ? `<rect x="0.03" y="0.03" width="0.94" height="1.24" rx="0.05" fill="#fff" fill-opacity="0.55"/><path d="M0.12 1.2L0.88 0.1M0.17 1.24L0.93 0.14M0.07 1.16L0.83 0.06" stroke="${SC.black}" stroke-width="0.025"/>` : '');
  const parkP = `<rect width="1" height="1" rx="0.08" fill="${SC.blue}"/>${t(0.5, 0.53, 'P', 0.78, '#fff')}`;

  const car = `<rect x="0.24" y="0.09" width="0.52" height="0.2" rx="0.06" fill="${SC.black}"/><rect x="0.33" y="0.12" width="0.08" height="0.14" rx="0.02" fill="#fff"/><rect x="0.58" y="0.12" width="0.08" height="0.14" rx="0.02" fill="#fff"/>`;

  return {
    '2.1': { n: 'Главная дорога', h: 1, draw: () => `<path d="M0.5 0L1 0.5L0.5 1L0 0.5Z" fill="#fff" stroke="${SC.black}" stroke-width="0.02"/><path d="M0.5 0.19L0.81 0.5L0.5 0.81L0.19 0.5Z" fill="${SC.yellow}" stroke="${SC.black}" stroke-width="0.015"/>` },
    '2.4': { n: 'Уступите дорогу', h: 0.9, draw: () => `<path d="M0.03 0.04H0.97L0.5 0.86Z" fill="${SC.red}" stroke="${SC.red}" stroke-width="0.05" stroke-linejoin="round"/><path d="M0.21 0.145H0.79L0.5 0.65Z" fill="#fff"/>` },
    '2.5': { n: 'Движение без остановки запрещено', h: 1, draw: () => `<path d="${oct(0.53)}" fill="#fff"/><path d="${oct(0.5)}" fill="${SC.red}"/>${t(0.5, 0.52, 'STOP', 0.27, '#fff')}` },
    '3.27': { n: 'Остановка запрещена', h: 1, draw: () => prohib(`<path d="M0.238 0.238L0.762 0.762M0.762 0.238L0.238 0.762" stroke="${SC.red}" stroke-width="0.1"/>`) },
    '3.28': { n: 'Стоянка запрещена', h: 1, draw: () => prohib(slash) },
    '3.29': { n: 'Стоянка запрещена по нечётным числам', h: 1, draw: () => prohib(bar(0.47) + slash) },
    '3.30': { n: 'Стоянка запрещена по чётным числам', h: 1, draw: () => prohib(bar(0.41) + bar(0.53) + slash) },
    '5.19.1': { n: 'Пешеходный переход (справа)', h: 1, draw: () => crossing(false) },
    '5.19.2': { n: 'Пешеходный переход (слева)', h: 1, draw: () => crossing(true) },
    '5.27': { n: 'Зона с ограничением стоянки', h: 1.3, draw: () => zone(prohib(slash)) },
    '5.28': { n: 'Конец зоны с ограничением стоянки', h: 1.3, draw: () => zone(prohib(slash), true) },
    '5.29': { n: 'Зона регулируемой стоянки (платной)', h: 1.3, draw: () => zone(parkP) },
    '5.30': { n: 'Конец зоны регулируемой стоянки', h: 1.3, draw: () => zone(parkP, true) },
    '6.4': { n: 'Парковка (парковочное место)', h: 1, draw: () => `<rect width="1" height="1" rx="0.08" fill="#fff"/><rect x="0.03" y="0.03" width="0.94" height="0.94" rx="0.06" fill="${SC.blue}"/>${t(0.5, 0.53, 'P', 0.78, '#fff')}` },
    '8.1.1': { n: 'Расстояние до объекта', h: 0.5, text: '150 м', draw: it => plate(0.5) + plateText(it.text, 0.5, 0.25, 0.85, 0.34) },
    '8.2.1': { n: 'Зона действия', h: 0.5, text: '50 м', draw: it => plate(0.5) + vArrow(0.12, 0.08, 0.42, true, true) + vArrow(0.88, 0.08, 0.42, true, true) + plateText(it.text, 0.5, 0.25, 0.6, 0.34) },
    '8.2.2': { n: 'Зона действия (протяжённость)', h: 0.5, text: '20 м', draw: it => plate(0.5) + vArrow(0.2, 0.07, 0.43, true, false) + plateText(it.text, 0.6, 0.25, 0.62, 0.34) },
    '8.2.3': { n: 'Зона действия (конец зоны)', h: 0.5, draw: () => plate(0.5) + vArrow(0.5, 0.07, 0.43, false, true) },
    '8.2.4': { n: 'Зона действия (вы в зоне)', h: 0.5, draw: () => plate(0.5) + vArrow(0.5, 0.07, 0.43, true, true) },
    '8.2.5': { n: 'Зона действия (в одну сторону)', h: 0.5, text: '15 м', flip: true, draw: it => plate(0.5) + hArrow(0.1, 0.9, 0.36, !it.flip, !!it.flip) + plateText(it.text, 0.5, 0.17, 0.8, 0.2, 0.2) },
    '8.2.6': { n: 'Зона действия (в обе стороны)', h: 0.5, text: '15 м', draw: it => plate(0.5) + hArrow(0.1, 0.9, 0.36, true, true) + plateText(it.text, 0.5, 0.17, 0.8, 0.2, 0.2) },
    '8.5.4': { n: 'Время действия', h: 0.5, text: '8.00–20.00', draw: it => plate(0.5) + plateText(it.text, 0.5, 0.25, 0.88, 0.36) },
    '8.6.1': { n: 'Способ постановки ТС (вдоль тротуара)', h: 0.5, draw: () => plate(0.5) + car + `<path d="M0.08 0.39H0.92" stroke="${SC.black}" stroke-width="0.06"/>` },
    '8.8': { n: 'Платные услуги', h: 0.5, text: 'Платные\nуслуги', draw: it => plate(0.5) + plateText(it.text, 0.5, 0.25, 0.88, 0.38) },
    '8.17': { n: 'Инвалиды', h: 0.75, draw: () => plate(0.75) + `<g transform="translate(0.18 0.03) scale(0.68)">${wheelchairSvg(SC.black)}</g>` },
    'txt': { n: 'Табличка с текстом', h: 0.5, text: 'Текст', draw: it => plate(0.5) + plateText(it.text, 0.5, 0.25, 0.88, 0.38) },
  };
})();

const SIGN_GROUPS = [
  ['Приоритета', ['2.1', '2.4', '2.5']],
  ['Запрещающие', ['3.27', '3.28', '3.29', '3.30']],
  ['Особых предписаний', ['5.19.1', '5.19.2', '5.27', '5.28', '5.29', '5.30']],
  ['Информационные', ['6.4']],
  ['Таблички', ['8.1.1', '8.2.1', '8.2.2', '8.2.3', '8.2.4', '8.2.5', '8.2.6', '8.5.4', '8.6.1', '8.8', '8.17', 'txt']],
];

// Готовые наборы знаков на одну стойку
const SIGN_SETS = [
  { n: 'Платная парковка', items: ['6.4', '8.8'] },
  { n: 'Платная, время работы', items: ['6.4', '8.8', '8.5.4'] },
  { n: 'Платная, номер зоны', items: ['6.4', '8.8', { code: 'txt', text: '№ 1234' }] },
  { n: 'Платная, вдоль тротуара', items: ['6.4', '8.8', '8.6.1'] },
  { n: 'Начало зоны платной парковки', items: ['5.29', '8.8'] },
  { n: 'Конец зоны платной парковки', items: ['5.30'] },
  { n: 'Парковка для МГН', items: ['6.4', '8.17'] },
];

// Элементы для установки: код знака или «set:N» — набор
function signItems(pick) {
  if (String(pick).startsWith('set:')) {
    const s = SIGN_SETS[+pick.slice(4)];
    return s ? s.items.map(c => typeof c === 'string' ? { code: c } : { ...c }) : [];
  }
  return [{ code: pick }];
}

// Мини-изображение набора: знаки столбиком
function signSetThumb(set, px = 30) {
  const items = signItems('set:' + SIGN_SETS.indexOf(set));
  let y = 0, body = '';
  for (const it of items) {
    const s = SIGN_LIB[it.code];
    body += `<g transform="translate(0 ${y})">${s.draw(Object.assign({ text: s.text }, it))}</g>`;
    y += s.h + 0.06;
  }
  const h = y - 0.06;
  return `<svg viewBox="-0.05 -0.05 1.1 ${h + 0.1}" width="${px}" height="${Math.round(px * (h + 0.1) / 1.1)}">${body}</svg>`;
}

// Мини-изображение знака для палитры
function signThumb(code, it, px = 36) {
  const s = SIGN_LIB[code];
  if (!s) return '';
  const item = Object.assign({ code, text: s.text }, it || {});
  return `<svg viewBox="-0.05 -0.05 1.1 ${s.h + 0.1}" width="${px}" height="${Math.round(px * (s.h + 0.1) / 1.1)}">${s.draw(item)}</svg>`;
}
