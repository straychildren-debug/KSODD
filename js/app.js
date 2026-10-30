'use strict';
// Редактор: состояние, инструменты, мышь/клавиатура, панели, файлы.

const $ = s => document.querySelector(s);
const svg = $('#canvas'), gWorld = $('#world'), gGrid = $('#grid'), gBg = $('#bglayer'),
  gScene = $('#scene'), gPreview = $('#preview'), gHandles = $('#handles');
const clone = o => JSON.parse(JSON.stringify(o));
const fmt = (n, d = 2) => (+n).toFixed(d).replace('.', ',');
const uid = () => 'o' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const SNAP_STEP = 0.5;

// ---------- Параметры новых объектов (по инструменту) ----------
const DEFAULTS = {
  road: { name: '', lanesF: 1, lanesB: 1, laneW: 3.5, median: 0, centerLine: 'single', laneLine: 'dashed', edgeLine: false, greenStrip: 1.5, sidewalkR: 2.25, sidewalkL: 2.25, curbR: 8, smooth: false, trimStart: 0, trimEnd: 0 },
  sidewalk: { width: 2.25, smooth: false },
  drive: { width: 6, smooth: false },
  building: { label: '', floors: '', labelSize: 2, round: 'none', radius: 0 },
  green: { label: '', round: 'none', radius: 0 },
  plaza: { label: '', round: 'none', radius: 0 },
  asphalt: { label: '', labelSize: 2, round: 'none', radius: 0 },
  junction: { label: '', labelSize: 2, round: 'inner', radius: 8 },
  roundabout: { R: 20, ringW: 7, lanes: 2, island: 'green', apron: 2, entryR: 12, green: 1.5, walk: 3 },
  busstop: { kind: 'bus', depth: 3, taperIn: 15, taperOut: 15, radius: 15, green: 1.5, walk: 2.25, zig: true, pavilion: true },
  pocket: { kind: 'parking', taperIn: 5, taperOut: 5, radius: 3, green: 1.5, walk: 2.25, angle: 0, stallW: 2.5, stallL: 6, numbered: false, startNum: 1, highlight: false, hlColor: '#2f80ed', mgn: 0 },
  fence: { kind: 'ped', step: 2.5 },
  ramp: { width: 2, depth: 1.5, tactile: true, rot: 0 },
  tree: { r: 2.5 },
  marking: { style: '1.1', smooth: false },
  crosswalk: { width: 4, style: 'white' },
  parking: { side: 'right', angle: 90, stallW: 2.5, stallL: 5, numbered: false, startNum: 1, highlight: true, hlColor: '#2f80ed', mgn: 0 },
  sign: { size: 3, rot: 90 },
  tlight: { size: 1.5, rot: 0 },
  plight: { size: 1.5, rot: 0 },
  pole: { size: 1, rot: 0 },
  text: { text: 'Текст', size: 2, rot: 0, color: '#263238' },
  dim: { offset: 2, size: 1 },
};

const HINT_POLY = 'Щёлкайте точки. Двойной щелчок / Enter / правая кнопка — завершить, Backspace — убрать точку, Esc — отмена, Alt — без привязки.';
const HINT_POLYGON = 'Протяните мышью — прямоугольник, или щёлкайте вершины многоугольника. Двойной щелчок / Enter — завершить, Esc — отмена.';

const TOOLS = {
  select: { l: 'Выбор', i: 'cursor', key: 'v', hint: 'Щелчок — выбрать (Shift — добавить), рамка — выбрать несколько, перетаскивание — переместить. Двойной щелчок по линии — добавить вершину, правый щелчок по вершине — удалить. Угол прямоугольника тянет размер (Ctrl — только вершину). Рамка: квадраты — масштаб, кружок — поворот. Ctrl+щелчок — объект внутри группы. Q/E — поворот, стрелки — сдвиг.' },
  pan: { l: 'Рука', i: 'hand', key: 'h', hint: 'Перетаскивайте холст. Колесо мыши — масштаб. Также работает средняя кнопка или пробел.' },
  road: { l: 'Дорога', i: 'road', key: 'r', mode: 'poly', min: 2, make: p => ({ type: 'road', points: p }), hint: 'Щёлкайте точки оси дороги. Полосы «прямого» направления — справа по ходу рисования. Конец оси прилипает к оси другой дороги. ' + HINT_POLY },
  sidewalk: { l: 'Тротуар', i: 'walk', mode: 'poly', min: 2, make: p => ({ type: 'path', kind: 'sidewalk', points: p }), hint: 'Тротуар или дорожка по оси. ' + HINT_POLY },
  drive: { l: 'Проезд', i: 'drive', mode: 'poly', min: 2, make: p => ({ type: 'path', kind: 'drive', points: p }), hint: 'Внутриквартальный проезд / заезд. Начните внутри проезжей части дороги. ' + HINT_POLY },
  junction: { l: 'Перекрёсток', i: 'junction', key: 'j', mode: 'pick', make: p => ({ type: 'area', kind: 'asphalt', points: p }), hint: 'Щёлкните рядом с пересечением двух дорог — появится площадка перекрёстка со скруглёнными бордюрами, скрывающая разметку внутри.' },
  roundabout: { l: 'Кольцо', i: 'ring', key: 'k', mode: 'point', make: p => ({ type: 'roundabout', points: [ringCenter(p)] }), hint: 'Щёлкните на пересечении дорог — кольцо встанет в центр перекрёстка (или в любое место). Дороги, ось которых пересекает кольцо, примыкают к нему сами; радиусы и ширины — в свойствах.' },
  busstop: { l: 'Остановка', i: 'bus', mode: 'two', make: p => Object.assign({ type: 'pocket', kind: 'bus' }, pocketSnap(p)), hint: 'Протяните вдоль бордюра от начала до конца посадочной площадки — заездной карман с отгонами построится сам. Отгоны, ширина, разметка 1.17 — в свойствах.' },
  pocket: { l: 'Карман', i: 'pocket', mode: 'two', make: p => Object.assign({ type: 'pocket', kind: 'parking' }, pocketSnap(p)), hint: 'Протяните вдоль бордюра — парковочный карман с разметкой мест. Расстановка (вдоль, 45°, 60°, 90°) и размеры мест — в свойствах.' },
  building: { l: 'Здание', i: 'building', key: 'b', mode: 'polygon', min: 3, make: p => ({ type: 'area', kind: 'building', points: p }), hint: HINT_POLYGON },
  green: { l: 'Газон', i: 'green', key: 'g', mode: 'polygon', min: 3, make: p => ({ type: 'area', kind: 'green', points: p }), hint: HINT_POLYGON },
  plaza: { l: 'Площадка', i: 'plaza', mode: 'polygon', min: 3, make: p => ({ type: 'area', kind: 'sidewalk', points: p }), hint: 'Мощёная площадка / широкий тротуар. ' + HINT_POLYGON },
  asphalt: { l: 'Асфальт', i: 'asphalt', mode: 'polygon', min: 3, make: p => ({ type: 'area', kind: 'asphalt', points: p }), hint: 'Асфальтовая площадка (стоянка, расширение). Рисуется поверх разметки дорог. ' + HINT_POLYGON },
  tree: { l: 'Дерево', i: 'tree', mode: 'point', make: p => ({ type: 'tree', points: [p] }), hint: 'Щёлкайте, чтобы посадить деревья.' },
  marking: { l: 'Линия', i: 'line', key: 'm', mode: 'poly', min: 2, make: p => ({ type: 'marking', points: p }), hint: 'Линия разметки (тип — в свойствах: 1.1, 1.3, 1.5, стоп-линия 1.12, жёлтая 1.4 …). ' + HINT_POLY },
  crosswalk: { l: 'Переход', i: 'zebra', key: 'c', mode: 'two', make: p => ({ type: 'crosswalk', points: p }), hint: 'Щелчок по дороге — переход на всю ширину проезжей части. Или протяните от бордюра до бордюра.' },
  parking: { l: 'Парковка', i: 'parking', key: 'p', mode: 'two', make: p => ({ type: 'parking', points: p }), hint: 'Протяните вдоль бордюра — места строятся справа по ходу (сторона, угол и размеры — в свойствах).' },
  tlight: { l: 'Светофор', i: 'tlight', key: 'l', mode: 'point', make: p => ({ type: 'light', kind: 'vehicle', points: [p] }), hint: 'Щёлкните, чтобы поставить светофор. Треугольник показывает, куда он светит; Q/E или ручка — поворот.' },
  plight: { l: 'Пешеходный', i: 'plight', mode: 'point', make: p => ({ type: 'light', kind: 'pedestrian', points: [p] }), hint: 'Пешеходный светофор. Q/E или ручка — поворот.' },
  pole: { l: 'Опора', i: 'pole', mode: 'point', make: p => ({ type: 'pole', points: [p] }), hint: 'Опора освещения.' },
  fence: { l: 'Ограждение', i: 'fence', mode: 'poly', min: 2, make: p => ({ type: 'fence', points: p }), hint: 'Пешеходное или барьерное ограждение, забор (тип — в свойствах). ' + HINT_POLY },
  ramp: { l: 'Пандус', i: 'ramp', mode: 'point', make: p => ({ type: 'ramp', points: [p], rot: rampRot(p) }), hint: 'Щёлкните на тротуаре у бордюра — пандус развернётся к ближайшей дороге. Q/E или ручка — поворот.' },
  sign: {
    l: 'Знак', i: 'sign', key: 's', mode: 'point',
    make: p => ({ type: 'sign', points: [p, [p[0], p[1] - (+state.defaults.sign.size || 2.5) * 1.2]], items: signItems(state.signPick) }),
    hint: 'Выберите знак в панели справа и щёлкните место установки стойки. Пока стойка выделена, щелчок по знаку в панели добавляет его на эту стойку. Пакет знаков можно отодвинуть за ручку; Q/E — направление.',
  },
  text: { l: 'Текст', i: 'text', key: 't', mode: 'point', make: p => ({ type: 'text', points: [p] }), hint: 'Щёлкните, чтобы добавить подпись; текст — в свойствах справа.' },
  dim: { l: 'Размер', i: 'dim', key: 'd', mode: 'two', make: p => ({ type: 'dim', points: p }), hint: 'Протяните между двумя точками — размерная линия в метрах.' },
  calibrate: { l: 'Калибровка', i: 'ruler', mode: 'two', hint: 'Протяните между двумя точками на подложке с известным расстоянием (например, по ширине дороги или длине здания), затем введите его в метрах.' },
};

const RIBBON = [
  ['Файл', [{ act: 'new', l: 'Новая', i: 'new' }, { act: 'open', l: 'Открыть', i: 'open' }, { act: 'save', l: 'Сохранить', i: 'save' }, { act: 'export', l: 'Экспорт', i: 'export' }, { act: 'demo', l: 'Пример', i: 'demo' }]],
  ['Правка', [{ tool: 'select' }, { tool: 'pan' }, { act: 'undo', l: 'Отменить', i: 'undo' }, { act: 'redo', l: 'Вернуть', i: 'redo' }, { act: 'copy', l: 'Копировать', i: 'copy' }, { act: 'paste', l: 'Вставить', i: 'paste' }, { act: 'delete', l: 'Удалить', i: 'trash' }]],
  ['Дорога', [{ tool: 'road' }, { tool: 'junction' }, { tool: 'roundabout' }, { tool: 'sidewalk' }, { tool: 'drive' }, { tool: 'busstop' }, { tool: 'pocket' }]],
  ['Территория', [{ tool: 'building' }, { tool: 'green' }, { tool: 'plaza' }, { tool: 'asphalt' }, { tool: 'tree' }]],
  ['Разметка', [{ tool: 'marking' }, { tool: 'crosswalk' }, { tool: 'parking' }]],
  ['Оборудование', [{ tool: 'tlight' }, { tool: 'plight' }, { tool: 'pole' }, { tool: 'fence' }, { tool: 'ramp' }]],
  ['Знаки', [{ tool: 'sign' }]],
  ['Оформление', [{ tool: 'text' }, { tool: 'dim' }]],
  ['Подложка', [{ act: 'bgLoad', l: 'Загрузить', i: 'image' }, { tool: 'calibrate' }]],
  ['Вид', [{ act: 'fit', l: 'Показать всё', i: 'fit' }, { toggle: 'snap', l: 'Привязка', i: 'magnet' }, { toggle: 'grid', l: 'Сетка', i: 'grid' }]],
];

const ICONS = {
  cursor: '<path d="M5 3l14 8-6 1.5L9.5 19z"/>',
  hand: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12m0-7.5a1.5 1.5 0 0 1 3 0V12m0-6a1.5 1.5 0 0 1 3 0v8c0 4-2.5 7-6.5 7S5 18 4 15l-1.5-3.5a1.4 1.4 0 0 1 2.4-1.4L8 13"/>',
  road: '<path d="M8 2L5 22M16 2l3 20M12 3v3M12 10v4M12 18v3"/>',
  walk: '<rect x="3" y="6" width="18" height="12" rx="1"/><path d="M3 12h18M9 6v6M15 12v6"/>',
  drive: '<path d="M5 21c0-8 4-12 14-14M10 21c0-5 3-8 9-9"/>',
  junction: '<path d="M9 2v5a2 2 0 0 1-2 2H2M15 2v5a2 2 0 0 0 2 2h5M9 22v-5a2 2 0 0 0-2-2H2M15 22v-5a2 2 0 0 1 2-2h5"/>',
  building: '<path d="M4 21V7l8-4 8 4v14H4zM9 21v-5h6v5M8 10h2M14 10h2"/>',
  green: '<path d="M3 20h18M6 20c0-4 1-7 3-9M12 20c0-6 1-10 3-13M18 20c0-3-1-6-3-8"/>',
  plaza: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
  asphalt: '<path d="M3 17l4-10h10l4 10z" fill="currentColor" fill-opacity=".25"/>',
  tree: '<circle cx="12" cy="10" r="6"/><path d="M12 16v6"/>',
  line: '<path d="M3 20L21 4" stroke-dasharray="3 3"/>',
  zebra: '<path d="M6 4v16M10 4v16M14 4v16M18 4v16" stroke-width="2.5"/>',
  parking: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 17V7h4a3 3 0 0 1 0 6H9"/>',
  tlight: '<rect x="8" y="2" width="8" height="16" rx="2"/><circle cx="12" cy="6" r="1.4"/><circle cx="12" cy="10" r="1.4"/><circle cx="12" cy="14" r="1.4"/><path d="M12 18v4"/>',
  plight: '<rect x="8" y="4" width="8" height="12" rx="2"/><circle cx="12" cy="8" r="1.4"/><circle cx="12" cy="12" r="1.4"/><path d="M12 16v6"/>',
  pole: '<path d="M8 22V6a3 3 0 0 1 3-3h6M17 3v3"/>',
  text: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
  sign: '<path d="M12 2.5l8 13.5H4zM12 16v6M12 8v3.5"/>',
  dim: '<path d="M3 12h18M3 8v8M21 8v8M6 10l-3 2 3 2M18 10l3 2-3 2"/>',
  ruler: '<path d="M3 17L17 3l4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 17l-5-5-9 8"/>',
  new: '<path d="M6 2h8l5 5v15H6zM14 2v5h5"/>',
  open: '<path d="M3 7V5a1 1 0 0 1 1-1h5l2 2h8a1 1 0 0 1 1 1v2M3 7h18l-2 13H5z"/>',
  save: '<path d="M5 3h11l4 4v14H4V4a1 1 0 0 1 1-1zM8 3v6h8V3M8 21v-7h8v7"/>',
  export: '<path d="M12 3v12M7 8l5-5 5 5M4 15v5h16v-5"/>',
  demo: '<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>',
  undo: '<path d="M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3"/>',
  redo: '<path d="M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M5 7l1 14h12l1-14M9 7V4h6v3"/>',
  fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  magnet: '<path d="M6 3v8a6 6 0 0 0 12 0V3h-4v8a2 2 0 0 1-4 0V3z"/>',
  grid: '<path d="M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18"/>',
  ring: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 1v3M12 20v3M1 12h3M20 12h3"/>',
  bus: '<rect x="5" y="3" width="14" height="15" rx="2"/><path d="M5 11h14M8 18v3M16 18v3"/><circle cx="8.5" cy="14.5" r="1"/><circle cx="15.5" cy="14.5" r="1"/>',
  pocket: '<path d="M2 8h4l3 5h6l3-5h4"/><path d="M2 18h20" stroke-dasharray="3 3"/>',
  fence: '<path d="M3 15h18M3 10h18M5 6v14M12 6v14M19 6v14"/>',
  ramp: '<path d="M2 19h20M4 19l8-8h8"/><path d="M14 5h5v5"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  paste: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h6"/>',
};

// Кнопки выравнивания нескольких объектов: [режим, подсказка, значок]
const ALIGN_BTNS = [
  ['left', 'По левому краю', '<path d="M4 3v18"/><rect x="7" y="6" width="12" height="4"/><rect x="7" y="14" width="7" height="4"/>'],
  ['hcenter', 'По центру (по горизонтали)', '<path d="M12 3v18"/><rect x="5" y="6" width="14" height="4"/><rect x="8" y="14" width="8" height="4"/>'],
  ['right', 'По правому краю', '<path d="M20 3v18"/><rect x="5" y="6" width="12" height="4"/><rect x="10" y="14" width="7" height="4"/>'],
  ['top', 'По верхнему краю', '<path d="M3 4h18"/><rect x="6" y="7" width="4" height="12"/><rect x="14" y="7" width="4" height="7"/>'],
  ['vcenter', 'По центру (по вертикали)', '<path d="M3 12h18"/><rect x="6" y="5" width="4" height="14"/><rect x="14" y="8" width="4" height="8"/>'],
  ['bottom', 'По нижнему краю', '<path d="M3 20h18"/><rect x="6" y="5" width="4" height="12"/><rect x="14" y="10" width="4" height="7"/>'],
  ['distH', 'Распределить по горизонтали', '<path d="M3 3v18M21 3v18"/><rect x="6" y="8" width="3" height="8"/><rect x="10.5" y="6" width="3" height="12"/><rect x="15" y="9" width="3" height="6"/>'],
  ['distV', 'Распределить по вертикали', '<path d="M3 3h18M3 21h18"/><rect x="8" y="6" width="8" height="3"/><rect x="6" y="10.5" width="12" height="3"/><rect x="9" y="15" width="6" height="3"/>'],
];

// ---------- Свойства объектов ----------
const num = (k, l, step = 0.1, min = 0) => ({ k, l, t: 'num', step, min });
// Быстрые цвета: [цвет, подсказка]
const AREA_SWATCHES = {
  building: [['#efe2cf', 'Жилое (по умолчанию)'], ['#f6d2b0', 'Жилое многоэтажное'], ['#d7e3f4', 'Общественное, офисы'], ['#f4c7c7', 'Торговое'], ['#fbeeb0', 'Школа, детский сад'], ['#d5ecd0', 'Медицина, спорт'], ['#dcdcdc', 'Нежилое, гаражи'], ['#b9a68f', 'Промышленное']],
  green: [['#b9dc95', 'Газон'], ['#8fc56a', 'Парк, сквер'], ['#d7ebbf', 'Пустырь']],
  sidewalk: [['#e8e1d1', 'Плитка'], ['#d9d4cc', 'Бетон'], ['#e9c9b5', 'Цветная плитка']],
  asphalt: [['#a5a8ac', 'Асфальт'], ['#8d9095', 'Тёмный асфальт'], ['#c4c6c9', 'Светлое покрытие']],
};
const PARKING_SWATCHES = [['#2f80ed', 'Обычная'], ['#9b51e0', 'Платная'], ['#f2994a', 'Платная (оранжевая)'], ['#27ae60', 'Бесплатная'], ['#eb5757', 'Запрет / резерв'], ['#f2c94c', 'Для МГН']];

const ROUND_OPTS =[['none', 'нет'], ['all', 'все углы'], ['inner', 'внутренние (перекрёсток)'], ['outer', 'внешние']];
const PROPS = {
  road: [
    { k: 'name', l: 'Название улицы', t: 'text' },
    { h: 'Проезжая часть' },
    num('lanesF', 'Полос в прямом направлении (справа)', 1), num('lanesB', 'Полос в обратном направлении (слева)', 1),
    num('laneW', 'Ширина полосы, м', 0.25, 2), num('median', 'Разделительная полоса, м', 0.5),
    { h: 'Разметка' },
    { k: 'centerLine', l: 'Осевая', t: 'sel', o: [['double', '1.3 двойная сплошная'], ['single', '1.1 сплошная'], ['dashed', '1.5 прерывистая'], ['none', 'нет']] },
    { k: 'laneLine', l: 'Между полосами', t: 'sel', o: [['dashed', '1.5 прерывистая'], ['solid', '1.1 сплошная'], ['none', 'нет']] },
    { k: 'edgeLine', l: 'Краевая линия 1.2', t: 'chk' },
    num('trimStart', 'Без разметки в начале, м', 0.5), num('trimEnd', 'Без разметки в конце, м', 0.5),
    { h: 'Обустройство' },
    num('greenStrip', 'Газон у бордюра, м', 0.5), num('sidewalkR', 'Тротуар справа, м', 0.25), num('sidewalkL', 'Тротуар слева, м', 0.25),
    num('curbR', 'Радиус бордюра на изгибах, м (0 — острый угол)', 1),
    { k: 'smooth', l: 'Плавная ось (сглаживание)', t: 'chk' },
    { btn: 'Развернуть направление', fn: o => o.points.reverse() },
    { info: o => { const m = roadMetrics(o); return `Длина оси: ${fmt(G.length(roadCenter(o)), 1)} м<br>Ширина проезжей части: ${fmt(m.W)} м<br>Вершин: ${o.points.length}`; } },
  ],
  path: [
    { k: 'kind', l: 'Тип', t: 'sel', o: [['sidewalk', 'Тротуар'], ['bike', 'Велодорожка'], ['drive', 'Проезд (асфальт)']] },
    num('width', 'Ширина, м', 0.25, 0.5),
    { k: 'smooth', l: 'Плавная линия', t: 'chk' },
    { info: o => `Длина: ${fmt(G.length(o.points), 1)} м` },
  ],
  area: [
    { k: 'kind', l: 'Тип', t: 'sel', o: [['building', 'Здание'], ['green', 'Газон'], ['sidewalk', 'Площадка (плитка)'], ['asphalt', 'Асфальт / перекрёсток']] },
    { k: 'color', l: 'Цвет заливки', t: 'colorPick', sw: o => AREA_SWATCHES[o.kind] || [] },
    { k: 'label', l: 'Подпись', t: 'area' },
    { k: 'floors', l: 'Этажность', t: 'text', when: o => o.kind === 'building' },
    num('labelSize', 'Размер подписи, м', 0.5, 0.5),
    { h: 'Углы' },
    { k: 'round', l: 'Скругление', t: 'sel', o: ROUND_OPTS },
    num('radius', 'Радиус скругления, м', 0.5),
    { custom: o => cornerRadiiHtml(o) },
    { info: o => `Площадь: ${fmt(Math.abs(G.area(o.points)), 1)} м²<br>Периметр: ${fmt(G.length([...o.points, o.points[0]]), 1)} м` },
  ],
  roundabout: [
    { h: 'Кольцо' },
    num('R', 'Наружный радиус кольца, м', 0.5, 6),
    num('ringW', 'Ширина проезжей части кольца, м', 0.25, 3),
    num('lanes', 'Полос на кольце', 1, 1),
    { k: 'island', l: 'Центральный островок', t: 'sel', o: [['green', 'газон'], ['sidewalk', 'мощение'], ['asphalt', 'разметкой (мини-кольцо)']] },
    num('apron', 'Укреплённая полоса у островка (для грузовых), м', 0.25, 0),
    { h: 'Примыкания и обустройство' },
    num('entryR', 'Радиус бордюра на въездах и выездах, м', 0.5, 0),
    num('green', 'Газон вокруг кольца, м', 0.5, 0),
    num('walk', 'Тротуар вокруг кольца, м', 0.25, 0),
    { note: 'Дороги, ось которых пересекает кольцо, примыкают к нему сами: бордюры скругляются, разметка внутри кольца скрывается. Доведите оси дорог до центра кольца.' },
    { info: o => `Радиус островка: ${fmt(Math.max(0, (+o.R || 20) - (+o.ringW || 7)))} м<br>Примыканий дорог: ${ringArms(o, state.doc).length}` },
  ],
  pocket: [
    { k: 'kind', l: 'Назначение', t: 'sel', o: [['bus', 'Остановка общественного транспорта'], ['parking', 'Парковочный карман']] },
    { ...num('depth', 'Ширина кармана, м', 0.25, 1), when: o => o.kind === 'bus' },
    num('taperIn', 'Отгон на въезде, м', 0.5, 0), num('taperOut', 'Отгон на выезде, м', 0.5, 0),
    num('radius', 'Радиус скругления бордюра, м', 0.5, 0),
    num('green', 'Газон за карманом, м', 0.25, 0), num('walk', 'Тротуар за карманом, м', 0.25, 0),
    { k: 'zig', l: 'Разметка 1.17 (место остановки)', t: 'chk', when: o => o.kind === 'bus' },
    { k: 'pavilion', l: 'Павильон ожидания', t: 'chk', when: o => o.kind === 'bus' },
    { note: 'Типовые размеры остановки: ширина 3 м, отгоны 15–20 м, площадка 20 м на один автобус.', when: o => o.kind === 'bus' },
    { h: 'Места', when: o => o.kind === 'parking' },
    { k: 'angle', l: 'Расстановка', t: 'sel', n: 1, o: [['0', 'параллельно (вдоль)'], ['45', 'под углом 45°'], ['60', 'под углом 60°'], ['90', 'перпендикулярно (90°)']], when: o => o.kind === 'parking' },
    { ...num('stallW', 'Ширина места, м', 0.1, 1.5), when: o => o.kind === 'parking' },
    { ...num('stallL', 'Длина места, м', 0.1, 2), when: o => o.kind === 'parking' },
    { k: 'highlight', l: 'Подсветить зону', t: 'chk', when: o => o.kind === 'parking' },
    { k: 'hlColor', l: 'Цвет подсветки', t: 'colorPick', sw: () => PARKING_SWATCHES, when: o => o.kind === 'parking' && o.highlight },
    { k: 'numbered', l: 'Нумеровать места', t: 'chk', when: o => o.kind === 'parking' },
    { ...num('startNum', 'Первый номер', 1, 0), when: o => o.kind === 'parking' },
    { ...num('mgn', 'Мест для МГН (разметка 1.24.3)', 1, 0), when: o => o.kind === 'parking' },
    { info: o => {
      const g = pocketGeom(o);
      if (!g) return '';
      const n = o.kind === 'parking' ? (parkingGeom(Object.assign({}, o, { points: [g.a, g.b], side: 'right' })) || { count: 0 }).count : 0;
      return `Длина площадки: ${fmt(g.L, 1)} м<br>С отгонами: ${fmt(g.L + (+o.taperIn || 0) + (+o.taperOut || 0), 1)} м<br>Ширина кармана: ${fmt(g.D)} м` + (o.kind === 'parking' ? `<br>Машино-мест: <b>${n}</b>` : '');
    } },
  ],
  fence: [
    { k: 'kind', l: 'Тип', t: 'sel', o: Object.entries(FENCE_KINDS) },
    num('step', 'Шаг стоек, м', 0.5, 0.5),
    { info: o => `Длина: ${fmt(G.length(o.points), 1)} м` },
  ],
  ramp: [
    num('width', 'Ширина съезда, м', 0.25, 0.9), num('depth', 'Длина пандуса, м', 0.25, 0.5),
    num('rot', 'Направление (к проезжей части), °', 15, -360),
    { k: 'tactile', l: 'Тактильная предупреждающая полоса', t: 'chk' },
  ],
  marking: [
    { k: 'style', l: 'Вид разметки', t: 'sel', o: Object.entries(MARK_STYLES).map(([k, v]) => [k, v.l]) },
    { k: 'smooth', l: 'Плавная линия', t: 'chk' },
    { info: o => `Длина: ${fmt(G.length(o.points), 1)} м` },
  ],
  crosswalk: [
    num('width', 'Ширина перехода, м', 0.5, 1),
    { k: 'style', l: 'Вид', t: 'sel', o: [['white', '1.14.1 «зебра» белая'], ['yellow', '1.14.1 бело-жёлтая']] },
    { info: o => `Длина перехода: ${fmt(G.dist(o.points[0], o.points[1]))} м` },
  ],
  parking: [
    { k: 'side', l: 'Места по ходу линии', t: 'sel', o: [['right', 'справа'], ['left', 'слева']] },
    { k: 'angle', l: 'Расстановка', t: 'sel', n: 1, o: [['90', 'перпендикулярно (90°)'], ['60', 'под углом 60°'], ['45', 'под углом 45°'], ['0', 'параллельно (вдоль)']] },
    num('stallW', 'Ширина места, м', 0.1, 1.5), num('stallL', 'Длина места, м', 0.1, 2),
    { k: 'highlight', l: 'Подсветить зону', t: 'chk' },
    { k: 'hlColor', l: 'Цвет подсветки', t: 'colorPick', sw: () => PARKING_SWATCHES, when: o => o.highlight },
    { k: 'numbered', l: 'Нумеровать места', t: 'chk' },
    num('startNum', 'Первый номер', 1, 0),
    num('mgn', 'Мест для МГН (разметка 1.24.3)', 1, 0),
    { note: 'Типовые размеры: 2,5 × 5,0 м; вдоль бордюра 2,5 × 6,0 м; для МГН 3,6 × 6,0 м.' },
    { info: o => { const g = parkingGeom(o); return `Машино-мест: <b>${g ? g.count : 0}</b><br>Длина ряда: ${fmt(G.dist(o.points[0], o.points[1]), 1)} м`; } },
  ],
  light: [
    { k: 'kind', l: 'Тип', t: 'sel', o: [['vehicle', 'Транспортный (Т.1)'], ['pedestrian', 'Пешеходный (П.1)']] },
    num('size', 'Размер значка', 0.25, 0.25), num('rot', 'Поворот, °', 15, -360),
  ],
  sign: [
    num('size', 'Размер знака на схеме, м', 0.25, 0.5),
    num('rot', 'Направление знака, °', 15, -360),
    { custom: o => signStackHtml(o) },
  ],
  tree: [num('r', 'Радиус кроны, м', 0.5, 0.5)],
  pole: [num('size', 'Размер значка', 0.25, 0.25), num('rot', 'Поворот, °', 15, -360)],
  text: [
    { k: 'text', l: 'Текст', t: 'area' }, num('size', 'Высота, м', 0.5, 0.2), num('rot', 'Поворот, °', 15, -360),
    { k: 'color', l: 'Цвет', t: 'color' },
  ],
  dim: [
    num('offset', 'Отступ размерной линии, м', 0.5, -1000), num('size', 'Размер текста', 0.25, 0.25),
    { info: o => `Расстояние: ${fmt(G.dist(o.points[0], o.points[1]))} м` },
  ],
};

const TYPE_NAMES = { roundabout: 'Кольцевой перекрёсток', ramp: 'Пандус', road: 'Дорога', crosswalk: 'Пешеходный переход', tree: 'Дерево', pole: 'Опора освещения', dim: 'Размер' };

// Палитра знаков. mode: pick — выбрать знак для новой стойки, add — добавить на выделенную стойку
function signPaletteHtml(mode) {
  const sets = `<div class="spgroup">Наборы на одну стойку</div><div class="spsets">${SIGN_SETS.map((s, i) => {
    const on = mode === 'pick' && state.signPick === 'set:' + i;
    return `<button class="spset ${on ? 'on' : ''}" data-s${mode}="set:${i}" title="${R.esc(s.n)}">${signSetThumb(s, 22)}<span>${s.n}</span></button>`;
  }).join('')}</div>`;
  return sets + SIGN_GROUPS.map(([g, codes]) => `<div class="spgroup">${g}</div><div class="spal">${codes.map(c => {
    const on = mode === 'pick' && state.signPick === c;
    return `<button class="spbtn ${on ? 'on' : ''}" data-s${mode}="${c}" title="${c === 'txt' ? '' : c + ' '}${SIGN_LIB[c].n}">${signThumb(c)}<span>${c === 'txt' ? 'текст' : c}</span></button>`;
  }).join('')}</div>`).join('');
}

function signStackHtml(o) {
  const rows = (o.items || []).map((it, i) => {
    const def = SIGN_LIB[it.code];
    if (!def) return '';
    const txt = def.text !== undefined
      ? (it.code === 'txt'
        ? `<textarea data-stext="${i}" rows="2">${R.esc(it.text ?? def.text)}</textarea>`
        : `<input type="text" data-stext="${i}" value="${R.esc(it.text ?? def.text)}">`)
      : '';
    const flip = def.flip ? `<label class="pf chk"><input type="checkbox" data-sflip="${i}" ${it.flip ? 'checked' : ''}><span>Стрелка вправо</span></label>` : '';
    return `<div class="srow"><div class="sthumb">${signThumb(it.code, it, 30)}</div><div class="sbody"><div class="sname"><b>${it.code === 'txt' ? '' : it.code}</b> ${def.n}</div>${txt}${flip}</div>
      <div class="sacts"><button data-sact="up" data-si="${i}" title="Выше">▲</button><button data-sact="down" data-si="${i}" title="Ниже">▼</button><button data-sact="del" data-si="${i}" title="Убрать">✕</button></div></div>`;
  }).join('');
  return `<div class="ph">Знаки на стойке (сверху вниз)</div>${rows || '<div class="help">Стойка пустая — добавьте знак из палитры.</div>'}
    <div class="ph">Добавить на стойку</div>${signPaletteHtml('add')}`;
}
const KIND_NAMES = { sidewalk: 'Тротуар', bike: 'Велодорожка', drive: 'Проезд', building: 'Здание', green: 'Газон', asphalt: 'Асфальт' };
const SWATCH = { road: C.asphalt, path: C.walk, building: C.building, green: C.lawn, sidewalk: C.walk, asphalt: C.asphalt, tree: '#8bc34a', marking: '#fff', crosswalk: '#fff', parking: 'rgba(47,128,237,.5)', light: '#263238', pole: '#fff', text: '#263238', dim: '#263238', sign: SC.blue, roundabout: C.asphalt, pocket: C.asphalt, fence: '#37474f', ramp: '#cfc8ba' };

function objLabel(o) {
  switch (o.type) {
    case 'road': return o.name ? 'Дорога: ' + o.name : 'Дорога';
    case 'path': return KIND_NAMES[o.kind] || 'Тротуар';
    case 'area':
      if (o.kind === 'sidewalk') return 'Площадка' + (o.label ? ': ' + o.label : '');
      if (o.kind === 'asphalt' && o.round === 'inner') return 'Перекрёсток';
      return (KIND_NAMES[o.kind] || 'Площадь') + (o.label ? ': ' + o.label.split('\n')[0] : '');
    case 'marking': return 'Разметка ' + o.style;
    case 'parking': { const g = parkingGeom(o); return `Парковка (${g ? g.count : 0} м/м)`; }
    case 'light': return o.kind === 'pedestrian' ? 'Светофор пешеходный' : 'Светофор';
    case 'text': return 'Текст: ' + (o.text || '').split('\n')[0];
    case 'pocket': {
      if (o.kind === 'bus') return 'Остановка (заездной карман)';
      const g = pocketGeom(o), pg = g && parkingGeom(Object.assign({}, o, { points: [g.a, g.b], side: 'right' }));
      return `Парковочный карман (${pg ? pg.count : 0} м/м)`;
    }
    case 'fence': return FENCE_KINDS[o.kind] || 'Ограждение';
    case 'sign': return 'Знаки: ' + ((o.items || []).map(i => i.code === 'txt' ? 'текст' : i.code).join(', ') || '—');
    default: return TYPE_NAMES[o.type] || o.type;
  }
}

function toolOf(o) {
  switch (o.type) {
    case 'path': return o.kind === 'drive' ? 'drive' : 'sidewalk';
    case 'area': return o.kind === 'sidewalk' ? 'plaza' : o.kind === 'asphalt' ? (o.round === 'inner' ? 'junction' : 'asphalt') : o.kind;
    case 'light': return o.kind === 'pedestrian' ? 'plight' : 'tlight';
    case 'pocket': return o.kind === 'bus' ? 'busstop' : 'pocket';
    default: return o.type;
  }
}

// ---------- Состояние ----------
function newDoc() {
  return { version: 1, name: 'Новая схема', objects: [], bg: null, layers: Object.fromEntries(LAYERS.map(l => [l[0], true])) };
}

const state = {
  doc: newDoc(),
  view: { tx: 0, ty: 0, k: 6 },
  tool: 'select',
  sel: [],
  drawing: null,
  drag: null,
  down: null,
  cursor: null,
  snapInfo: null,
  opts: { snap: true, grid: true },
  undo: [], redo: [],
  defaults: clone(DEFAULTS),
  signPick: '6.4',
  space: false,
  lastW: null, overCanvas: false, pasteInPlace: false,
  edit: null,
};
const doc = () => state.doc;
const getObj = id => state.doc.objects.find(o => o.id === id);

// ---------- История ----------
function snapshot() {
  return { objects: JSON.stringify(state.doc.objects), bg: state.doc.bg ? { ...state.doc.bg } : null };
}
function pushUndo(s) {
  state.undo.push(s);
  if (state.undo.length > 200) state.undo.shift();
  state.redo = [];
}
const checkpoint = () => pushUndo(snapshot());
function restore(s) {
  const bgChanged = (s.bg && s.bg.src) !== (state.doc.bg && state.doc.bg.src);
  state.doc.objects = JSON.parse(s.objects);
  state.doc.bg = s.bg ? { ...s.bg } : null;
  state.sel = state.sel.filter(getObj);
  changed({ bg: true, props: true });
  if (bgChanged) renderBg();
}
function undo() {
  if (!state.undo.length) return toast('Нечего отменять');
  state.redo.push(snapshot());
  restore(state.undo.pop());
}
function redo() {
  if (!state.redo.length) return;
  state.undo.push(snapshot());
  restore(state.redo.pop());
}

// ---------- Отрисовка ----------
let raf = 0;
const dirty = { scene: false, overlay: false, list: false, props: false, bg: false };
function schedule(parts) {
  Object.assign(dirty, parts);
  if (!raf) raf = requestAnimationFrame(flush);
}
function flush() {
  raf = 0;
  if (dirty.bg) renderBg();
  if (dirty.scene) gScene.innerHTML = R.render(state.doc, { k: state.view.k });
  if (dirty.overlay) renderOverlay();
  if (dirty.list) renderList();
  if (dirty.props) renderProps();
  for (const k in dirty) dirty[k] = false;
}
let saveTimer = 0;
function changed(extra = {}) {
  schedule({ scene: true, overlay: true, list: true, ...extra });
  clearTimeout(saveTimer);
  saveTimer = setTimeout(autosave, 600);
}
function renderBg() {
  const b = state.doc.bg;
  gBg.innerHTML = R.bg(state.doc, false);
  if (b && b.visible) gBg.firstChild && gBg.firstChild.setAttribute('opacity', b.opacity);
}

function applyView() {
  const v = state.view;
  gWorld.setAttribute('transform', `translate(${v.tx} ${v.ty}) scale(${v.k})`);
  renderGrid();
  renderScaleBar();
  $('#stZoom').textContent = `1 м = ${v.k >= 10 ? Math.round(v.k) : fmt(v.k, 1)} px`;
  schedule({ scene: true, overlay: true });
}

function renderGrid() {
  if (!state.opts.grid) { gGrid.innerHTML = ''; return; }
  const r = svg.getBoundingClientRect(), v = state.view, k = v.k;
  const x0 = -v.tx / k, y0 = -v.ty / k, x1 = x0 + r.width / k, y1 = y0 + r.height / k;
  const steps = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000];
  const st = steps.find(s => s * k >= 14) || 2000, major = st * 5;
  let minor = '', maj = '';
  const line = (a, b, c, d) => `M${a} ${b}L${c} ${d}`;
  for (let x = Math.ceil(x0 / st) * st; x <= x1; x += st) {
    const s = line(+x.toFixed(3), y0, +x.toFixed(3), y1);
    if (Math.abs(x / major - Math.round(x / major)) < 1e-6) maj += s; else minor += s;
  }
  for (let y = Math.ceil(y0 / st) * st; y <= y1; y += st) {
    const s = line(x0, +y.toFixed(3), x1, +y.toFixed(3));
    if (Math.abs(y / major - Math.round(y / major)) < 1e-6) maj += s; else minor += s;
  }
  gGrid.innerHTML = `<path d="${minor}" stroke="#eef1f4" stroke-width="1" vector-effect="non-scaling-stroke"/><path d="${maj}" stroke="#dde2e8" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
}

function renderScaleBar() {
  const k = state.view.k;
  const nice = [0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
  const m = nice.find(n => n * k >= 80) || 5000;
  $('#scalebar').innerHTML = `<div class="bar" style="width:${Math.round(m * k)}px"><i></i><i></i><i></i><i></i></div><div class="lbl"><span>0</span><span>${String(m).replace('.', ',')} м</span></div>`;
}

const HS = '#1e6fd9';
function renderOverlay() {
  const k = state.view.k, px = v => v / k;
  let s = '', h = '';
  const dash = `stroke-dasharray="${px(6)} ${px(4)}"`;
  const outline = (pts, closed) => `<path d="${R.pd(pts, closed)}" fill="none" stroke="${HS}" stroke-width="1.5" vector-effect="non-scaling-stroke" ${dash}/>`;

  for (const id of state.sel) {
    const o = getObj(id);
    if (!o) continue;
    if (o.points.length === 1) {
      const rad = o.type === 'tree' ? +o.r || 2.5 : o.type === 'text' ? (+o.size || 2) * 1.2 : o.type === 'roundabout' ? +o.R || 20
        : o.type === 'ramp' ? (+o.width || 2) / 2 + (+o.depth || 1.5) : (+o.size || 1.5) * 1.05;
      s += `<circle cx="${o.points[0][0]}" cy="${o.points[0][1]}" r="${Math.max(rad, px(10))}" fill="none" stroke="${HS}" stroke-width="1.5" vector-effect="non-scaling-stroke" ${dash}/>`;
    } else {
      s += outline(o.type === 'road' ? roadCenter(o) : o.points, o.type === 'area');
    }
  }
  if (state.sel.length && state.sel.length <= 3) {
    for (const id of state.sel) {
      const o = getObj(id);
      if (!o) continue;
      o.points.forEach((p, i) => {
        h += `<circle data-handle="${o.id}:${i}" cx="${p[0]}" cy="${p[1]}" r="${px(5)}" fill="#fff" stroke="${HS}" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`;
      });
      if ('rot' in o) {
        const p = o.points[0], a = (+o.rot || 0) * Math.PI / 180, L = px(38);
        const q = [p[0] + Math.cos(a) * L, p[1] + Math.sin(a) * L];
        h += `<path d="M${p[0]} ${p[1]}L${q[0]} ${q[1]}" stroke="${HS}" stroke-width="1" vector-effect="non-scaling-stroke" pointer-events="none"/>`;
        h += `<circle class="rot" data-handle="${o.id}:rot" cx="${q[0]}" cy="${q[1]}" r="${px(5)}" fill="${HS}" stroke="#fff" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`;
      }
    }
  }
  // Номера скругляемых углов площадки — для полей «Радиусы отдельных углов»
  if (state.sel.length === 1) {
    const o = getObj(state.sel[0]);
    const idx = o && o.type === 'area' ? roundedCorners(o) : [];
    if (idx.length && idx.length <= MAX_CORNERS) {
      const P = o.points, N = P.length;
      idx.forEach((i, n) => {
        // Номер — по биссектрисе угла, там, где проходит скругление
        const p = P[i], bis = G.add(G.norm(G.sub(P[(i + N - 1) % N], p)), G.norm(G.sub(P[(i + 1) % N], p)));
        const q = G.add(p, G.mul(G.norm(bis), px(20)));
        s += `<circle cx="${q[0]}" cy="${q[1]}" r="${px(8)}" fill="${HS}"/><text x="${q[0]}" y="${q[1]}" font-size="${px(11)}" fill="#fff" text-anchor="middle" dominant-baseline="central" font-family="Arial" font-weight="bold">${n + 1}</text>`;
      });
    }
  }
  // Рамка вокруг выделения: квадраты — масштаб, кружок сверху — поворот
  const fb = frameBox();
  if (fb) {
    const pad = px(10), x0 = fb.x0 - pad, y0 = fb.y0 - pad, x1 = fb.x1 + pad, y1 = fb.y1 + pad, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, hs = px(4);
    s += `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="none" stroke="${HS}" stroke-width="1" stroke-opacity="0.55" vector-effect="non-scaling-stroke"/>`;
    const pos = { nw: [x0, y0], n: [cx, y0], ne: [x1, y0], e: [x1, cy], se: [x1, y1], s: [cx, y1], sw: [x0, y1], w: [x0, cy] };
    for (const [k, q] of Object.entries(pos)) {
      if ((k === 'n' || k === 's') && fb.y1 - fb.y0 < 0.01) continue;
      if ((k === 'e' || k === 'w') && fb.x1 - fb.x0 < 0.01) continue;
      h += `<rect class="fr fr-${k}" data-handle="__frame:${k}" x="${q[0] - hs}" y="${q[1] - hs}" width="${2 * hs}" height="${2 * hs}" fill="#fff" stroke="${HS}" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`;
    }
    const ry = y0 - px(26);
    h += `<path d="M${cx} ${y0}L${cx} ${ry}" stroke="${HS}" stroke-width="1" vector-effect="non-scaling-stroke" pointer-events="none"/>`;
    h += `<circle class="rot" data-handle="__frame:rot" cx="${cx}" cy="${ry}" r="${px(5)}" fill="${HS}" stroke="#fff" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`;
  }

  // Предпросмотр рисования
  const T = TOOLS[state.tool], D = state.drawing, cur = state.cursor;
  if (T && T.mode && T.mode !== 'pick' && cur && !state.drag) {
    const pts = D ? [...D.points, cur] : [cur];
    const defs = clone(state.defaults[state.tool] || {});
    let tmp = null;
    if (T.mode === 'point' && !D) tmp = T.make(cur);
    else if (T.make && pts.length >= 2 && !(T.mode === 'polygon' && pts.length < 3)) tmp = T.make(pts);
    if (tmp) s += `<g opacity="0.7">${R.renderOne(Object.assign({ id: '__tmp' }, defs, tmp), { k, exporting: true, doc: state.doc })}</g>`;
    if (D && pts.length >= 2) {
      s += outline(pts, T.mode === 'polygon' && pts.length > 2);
      for (const p of D.points) s += `<circle cx="${p[0]}" cy="${p[1]}" r="${px(3.5)}" fill="${HS}"/>`;
      const a = pts[pts.length - 2], b = cur, mid = G.lerp(a, b, 0.5);
      s += `<text x="${mid[0]}" y="${mid[1] - px(8)}" font-size="${px(12)}" fill="${HS}" text-anchor="middle" font-family="Arial" paint-order="stroke" stroke="#fff" stroke-width="${px(3)}">${fmt(G.dist(a, b))} м</text>`;
    }
  }
  if (state.snapInfo && T && T.mode) {
    const p = state.snapInfo.p, r = px(6);
    s += state.snapInfo.kind === 'vertex'
      ? `<rect x="${p[0] - r}" y="${p[1] - r}" width="${2 * r}" height="${2 * r}" fill="none" stroke="#e53935" stroke-width="2" vector-effect="non-scaling-stroke"/>`
      : `<path d="M${p[0] - r} ${p[1] - r}L${p[0] + r} ${p[1] + r}M${p[0] - r} ${p[1] + r}L${p[0] + r} ${p[1] - r}" stroke="#e53935" stroke-width="2" vector-effect="non-scaling-stroke"/>`;
  }
  if (state.drag && state.drag.kind === 'rubber') {
    const { a, b } = state.drag;
    s += `<rect x="${Math.min(a[0], b[0])}" y="${Math.min(a[1], b[1])}" width="${Math.abs(a[0] - b[0])}" height="${Math.abs(a[1] - b[1])}" fill="rgba(30,111,217,.08)" stroke="${HS}" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
  }
  gPreview.innerHTML = s;
  gHandles.innerHTML = h;
}

// ---------- Панель слоёв и список объектов ----------
function renderLayers() {
  $('#layers').innerHTML = LAYERS.map(([k, l]) => `<label><input type="checkbox" data-layer="${k}" ${state.doc.layers[k] ? 'checked' : ''}> ${l}</label>`).join('');
}
$('#layers').addEventListener('change', e => {
  const k = e.target.dataset.layer;
  if (!k) return;
  state.doc.layers[k] = e.target.checked;
  changed({ bg: k === 'bg' });
});

function renderList() {
  const objs = state.doc.objects;
  $('#objCount').textContent = objs.length ? `(${objs.length})` : '';
  $('#objlist').innerHTML = objs.length ? objs.slice().reverse().map(o => {
    const sw = SWATCH[o.type === 'area' || o.type === 'path' ? o.kind : o.type] || '#ccc';
    return `<div class="obj ${state.sel.includes(o.id) ? 'sel' : ''} ${o.hidden ? 'hid' : ''}" data-oid="${o.id}"><span class="sw" style="background:${sw}"></span>${o.group ? '<span class="grp" title="В группе">⧉</span>' : ''}<span class="nm">${R.esc(objLabel(o))}</span><button class="eye" title="Скрыть / показать">${o.hidden ? '◌' : '●'}</button></div>`;
  }).join('') : '<div class="help" style="padding:8px 10px">Пока пусто. Выберите инструмент на ленте или нажмите «Пример».</div>';
}
$('#objlist').addEventListener('click', e => {
  const row = e.target.closest('[data-oid]');
  if (!row) return;
  const o = getObj(row.dataset.oid);
  if (e.target.classList.contains('eye')) {
    checkpoint();
    o.hidden = !o.hidden;
    changed();
    return;
  }
  if (e.shiftKey) toggleSel(o.id); else setSel([o.id]);
});

// ---------- Свойства ----------
function fieldHtml(f, o) {
  if (f.when && !f.when(o)) return '';
  if (f.custom) return f.custom(o);
  if (f.h) return `<div class="ph">${f.h}</div>`;
  if (f.note) return `<div class="help">${f.note}</div>`;
  if (f.info) return `<div class="pinfo" data-info="1">${f.info(o)}</div>`;
  if (f.btn) return `<div class="pbtns"><button class="btn" data-btn="${R.esc(f.btn)}">${f.btn}</button></div>`;
  const v = o[f.k] ?? '';
  switch (f.t) {
    case 'chk': return `<label class="pf chk"><input type="checkbox" data-k="${f.k}" ${v ? 'checked' : ''}><span>${f.l}</span></label>`;
    case 'sel': return `<label class="pf"><span>${f.l}</span><select data-k="${f.k}">${f.o.map(([val, l]) => `<option value="${val}" ${String(v) === val ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`;
    case 'num': return `<label class="pf"><span>${f.l}</span><input type="number" data-k="${f.k}" value="${v}" step="${f.step}" min="${f.min}"></label>`;
    case 'area': return `<label class="pf"><span>${f.l}</span><textarea data-k="${f.k}" rows="2">${R.esc(v)}</textarea></label>`;
    case 'color': return `<label class="pf"><span>${f.l}</span><input type="color" data-k="${f.k}" value="${v || '#263238'}"></label>`;
    case 'colorPick': {
      const sw = f.sw(o), cur = v || (sw[0] && sw[0][0]) || '#cccccc';
      return `<div class="pf"><span>${f.l}</span><div class="swatches">${sw.map(([c, t]) =>
        `<button class="swatch ${cur.toLowerCase() === c ? 'on' : ''}" data-swk="${f.k}" data-swv="${c}" title="${t}" style="background:${c}"></button>`).join('')}
        <input type="color" data-k="${f.k}" value="${cur}" title="Свой цвет"></div></div>`;
    }
    default: return `<label class="pf"><span>${f.l}</span><input type="text" data-k="${f.k}" value="${R.esc(v)}"></label>`;
  }
}

function renderProps() {
  const el = $('#props');
  if (state.sel.length === 0 && state.tool === 'sign') {
    $('#propTitle').textContent = 'Дорожные знаки';
    el.innerHTML = `<div class="help" style="margin-bottom:6px">Выберите знак и щёлкните на схеме место установки стойки. Таблички и другие знаки добавляются на выделенную стойку.</div>${signPaletteHtml('pick')}`;
    return;
  }
  if (state.sel.length === 0) { $('#propTitle').textContent = 'Схема'; el.innerHTML = docPanel(); return; }
  const common = `<div class="pbtns"><button class="btn" data-act="duplicate">Дублировать</button><button class="btn" data-act="copy">Копировать</button><button class="btn" data-act="front">Наверх</button><button class="btn" data-act="back">Вниз</button><button class="btn danger" data-act="delete">Удалить</button></div>`;
  if (state.sel.length > 1) {
    const objs = state.sel.map(getObj).filter(Boolean);
    const grouped = objs.some(o => o.group);
    const oneGroup = grouped && objs.every(o => o.group === objs[0].group);
    $('#propTitle').textContent = oneGroup ? 'Группа' : 'Свойства';
    el.innerHTML = `<div class="pinfo">${oneGroup ? 'Объектов в группе' : 'Выбрано объектов'}: ${objs.length}</div>
      <div class="ph">Выравнивание</div>
      <div class="aligns">${ALIGN_BTNS.map(([m, t, ic]) => `<button class="abtn" data-act="align:${m}" title="${t}"><svg viewBox="0 0 24 24">${ic}</svg></button>`).join('')}</div>
      <div class="ph">Группа</div>
      <div class="pbtns">${oneGroup ? '' : '<button class="btn" data-act="group">Сгруппировать</button>'}${grouped ? '<button class="btn" data-act="ungroup">Разгруппировать</button>' : ''}</div>
      ${common}
      <div class="help" style="margin-top:10px">Рамка: квадраты — масштаб (<kbd>Shift</kbd> — непропорционально, <kbd>Ctrl</kbd> — от центра), кружок — поворот. <kbd>Q</kbd>/<kbd>E</kbd> — повернуть, стрелки — сдвинуть, <kbd>Ctrl+G</kbd> — сгруппировать.</div>`;
    return;
  }
  const o = getObj(state.sel[0]);
  $('#propTitle').textContent = objLabel(o);
  el.innerHTML = (PROPS[o.type] || []).map(f => fieldHtml(f, o)).join('') +
    (o.group ? '<div class="pbtns"><button class="btn" data-act="ungroup">Убрать из группы</button></div>' : '') + common;
}

// Поля радиусов отдельных скругляемых углов площадки (номера углов видны на схеме)
const MAX_CORNERS = 16;
function roundedCorners(o) {
  return G.filletCorners(o.points, o.round).map((w, i) => w ? i : -1).filter(i => i >= 0);
}
function cornerRadiiHtml(o) {
  const idx = roundedCorners(o);
  if (!idx.length || idx.length > MAX_CORNERS) return '';
  return `<div class="pf"><span>Радиусы отдельных углов, м (пусто — общий)</span><div class="radii">${idx.map((i, n) =>
    `<label><b>${n + 1}</b><input type="number" data-rad="${i}" step="0.5" min="0" value="${o.radii && o.radii[i] != null ? o.radii[i] : ''}" placeholder="${+o.radius || 0}"></label>`).join('')}</div></div>`;
}

function refreshInfo() {
  const o = state.sel.length === 1 && getObj(state.sel[0]);
  if (!o) return;
  const infos = (PROPS[o.type] || []).filter(f => f.info);
  document.querySelectorAll('#props [data-info]').forEach((el, i) => { if (infos[i]) el.innerHTML = infos[i].info(o); });
  $('#propTitle').textContent = objLabel(o);
}

function docPanel() {
  const b = state.doc.bg;
  const bgHtml = b ? `
    <label class="pf"><span>Прозрачность подложки</span><input type="range" min="0.05" max="1" step="0.05" data-bg="opacity" value="${b.opacity}"></label>
    <label class="pf"><span>Ширина подложки, м</span><input type="number" step="1" min="1" data-bg="width" value="${+b.width.toFixed(2)}"></label>
    <label class="pf chk"><input type="checkbox" data-bg="visible" ${b.visible ? 'checked' : ''}><span>Показывать</span></label>
    <label class="pf chk"><input type="checkbox" data-bg="locked" ${b.locked ? 'checked' : ''}><span>Закрепить (не двигать мышью)</span></label>
    <div class="pbtns"><button class="btn" data-act="calibrate">Калибровать масштаб</button><button class="btn danger" data-act="bgRemove">Убрать</button></div>`
    : `<div class="help">Загрузите скриншот карты или план участка и обведите его. Масштаб задаётся по двум точкам с известным расстоянием.</div>
       <div class="pbtns"><button class="btn primary" data-act="bgLoad">Загрузить подложку</button></div>`;
  return `
    <label class="pf"><span>Название схемы</span><input type="text" data-doc="name" value="${R.esc(state.doc.name)}"></label>
    <div class="ph">Подложка</div>${bgHtml}
    <div class="ph">Подсказки</div>
    <div class="help"><ul>
      <li>Единицы — метры, сетка привязки 0,5 м (<kbd>Alt</kbd> — без привязки).</li>
      <li>Нарисуйте дороги, затем инструментом <b>Перекрёсток</b> щёлкните на их пересечении.</li>
      <li>Колесо — масштаб, средняя кнопка или <kbd>Пробел</kbd> — сдвиг холста.</li>
      <li><kbd>Ctrl+Z</kbd>/<kbd>Ctrl+Y</kbd> — отмена/возврат, <kbd>Ctrl+D</kbd> — дублировать, <kbd>Del</kbd> — удалить, <kbd>Ctrl+S</kbd> — сохранить.</li>
      <li><kbd>Ctrl+C</kbd>/<kbd>Ctrl+V</kbd> — копировать и вставить под курсор, в том числе в другую схему; <kbd>Ctrl+Shift+V</kbd> — на те же координаты. <kbd>Ctrl+G</kbd> — сгруппировать.</li>
      <li>Вокруг выделения — рамка: квадраты меняют масштаб (<kbd>Shift</kbd> — непропорционально, <kbd>Ctrl</kbd> — от центра), кружок сверху поворачивает.</li>
      <li>Горячие клавиши инструментов: <kbd>V</kbd> выбор, <kbd>R</kbd> дорога, <kbd>J</kbd> перекрёсток, <kbd>K</kbd> кольцо, <kbd>B</kbd> здание, <kbd>G</kbd> газон, <kbd>M</kbd> разметка, <kbd>C</kbd> переход, <kbd>P</kbd> парковка, <kbd>L</kbd> светофор, <kbd>T</kbd> текст, <kbd>D</kbd> размер.</li>
      <li>Схема автоматически сохраняется в браузере; для обмена используйте «Сохранить».</li>
    </ul></div>`;
}

function readField(el) {
  const k = el.dataset.k;
  if (el.type === 'checkbox') return el.checked;
  if (el.type === 'number') { const v = parseFloat(el.value); return isNaN(v) ? 0 : v; }
  const f = state.sel.length === 1 && (PROPS[getObj(state.sel[0]).type] || []).find(x => x.k === k);
  if (f && f.n) return +el.value;
  return el.value;
}

function applyField(el) {
  const o = getObj(state.sel[0]);
  if (!o) return;
  const k = el.dataset.k, v = readField(el);
  if (o.type === 'pocket' && k === 'kind') {
    // Остановка и парковочный карман — разные наборы параметров
    const keep = { id: o.id, type: o.type, points: o.points, group: o.group, green: o.green, walk: o.walk };
    for (const key of Object.keys(o)) delete o[key];
    Object.assign(o, clone(state.defaults[v === 'bus' ? 'busstop' : 'pocket']), keep, { kind: v });
    if (!keep.group) delete o.group;
  } else if (o.type === 'light' && k === 'kind' || o.type === 'area' && k === 'kind' || o.type === 'path' && k === 'kind') {
    o[k] = v;
  } else {
    o[k] = v;
    const d = state.defaults[toolOf(o)];
    if (d && k in d && !['name', 'label', 'floors', 'text', 'color'].includes(k)) d[k] = v;
  }
  changed();
  refreshInfo();
}

const props = $('#props');
// Серия правок одного поля — один шаг отмены
props.addEventListener('focusout', () => { state.edit = null; });
props.addEventListener('input', e => {
  const el = e.target;
  if (!el.matches('input[type=text],input[type=number],textarea,input[type=range],input[type=color]')) return;
  if (!state.edit || state.edit.el !== el) { checkpoint(); state.edit = { el }; }
  if (el.dataset.k) applyField(el);
  else if (el.dataset.stext) {
    const o = getObj(state.sel[0]);
    o.items[+el.dataset.stext].text = el.value;
    changed();
  }
  else if (el.dataset.rad !== undefined) {
    const o = getObj(state.sel[0]), i = +el.dataset.rad;
    o.radii = o.radii || {};
    if (el.value === '') delete o.radii[i];
    else o.radii[i] = Math.max(0, parseFloat(el.value) || 0);
    changed();
  }
  else if (el.dataset.bg) applyBg(el);
  else if (el.dataset.doc) { state.doc[el.dataset.doc] = el.value; changed(); }
});
props.addEventListener('change', e => {
  const el = e.target;
  if (el.matches('input[type=color]')) { schedule({ props: true }); return; }
  if (el.matches('select,input[type=checkbox]')) {
    checkpoint();
    if (el.dataset.k) { applyField(el); schedule({ props: true }); }
    else if (el.dataset.sflip) { getObj(state.sel[0]).items[+el.dataset.sflip].flip = el.checked; changed(); }
    else if (el.dataset.bg) applyBg(el);
  }
});
props.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.act) return action(b.dataset.act);
  if (b.dataset.swk) {
    const o = getObj(state.sel[0]);
    if (!o) return;
    checkpoint();
    o[b.dataset.swk] = b.dataset.swv;
    changed({ props: true });
    return;
  }
  if (b.dataset.spick) {
    state.signPick = b.dataset.spick;
    document.querySelectorAll('#props [data-spick]').forEach(x => x.classList.toggle('on', x === b));
    return;
  }
  if (b.dataset.sadd || b.dataset.sact) {
    const o = getObj(state.sel[0]);
    if (!o || o.type !== 'sign') return;
    checkpoint();
    if (b.dataset.sadd) o.items.push(...signItems(b.dataset.sadd));
    else {
      const i = +b.dataset.si, it = o.items;
      if (b.dataset.sact === 'del') it.splice(i, 1);
      else {
        const j = b.dataset.sact === 'up' ? i - 1 : i + 1;
        if (j >= 0 && j < it.length) [it[i], it[j]] = [it[j], it[i]];
      }
    }
    changed({ props: true });
    return;
  }
  if (b.dataset.btn) {
    const o = getObj(state.sel[0]);
    const f = (PROPS[o.type] || []).find(x => x.btn === b.dataset.btn);
    if (f) { checkpoint(); f.fn(o); changed({ props: true }); }
  }
});

function applyBg(el) {
  const b = state.doc.bg;
  if (!b) return;
  const k = el.dataset.bg;
  if (el.type === 'checkbox') b[k] = el.checked;
  else if (k === 'width') {
    const w = parseFloat(el.value);
    if (w > 0) b.width = w;
  } else b[k] = parseFloat(el.value);
  if (k === 'opacity' && gBg.firstChild) gBg.firstChild.setAttribute('opacity', b.opacity);
  else renderBg();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(autosave, 600);
}

// ---------- Выделение ----------
function setSel(ids) {
  state.sel = ids.filter(getObj);
  schedule({ overlay: true, list: true, props: true });
}
function toggleSel(id) {
  setSel(state.sel.includes(id) ? state.sel.filter(x => x !== id) : [...state.sel, id]);
}

// ---------- Инструменты ----------
function setTool(t) {
  state.tool = t;
  state.drawing = null;
  state.snapInfo = null;
  document.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === t));
  svg.className.baseVal = 'tool-' + t;
  $('#stHint').textContent = TOOLS[t].hint || '';
  if (t === 'calibrate' && !state.doc.bg) toast('Сначала загрузите подложку');
  schedule({ overlay: true, props: true });
}

function createObj(tool, pts) {
  const T = TOOLS[tool];
  const o = Object.assign({ id: uid() }, clone(state.defaults[tool] || {}), T.make(pts));
  checkpoint();
  state.doc.objects.push(o);
  state.sel = [o.id];
  changed({ props: true });
  return o;
}

function finishDrawing() {
  const D = state.drawing;
  if (!D) return;
  const T = TOOLS[D.tool];
  const pts = G.dedupe(D.points, 0.05);
  state.drawing = null;
  if (T.mode === 'polygon' && pts.length > 3 && G.dist(pts[0], pts[pts.length - 1]) < 0.05) pts.pop();
  if (pts.length >= (T.min || 2)) createObj(D.tool, pts);
  schedule({ overlay: true });
}

function finishTwo(p) {
  const D = state.drawing;
  state.drawing = null;
  if (!D) return;
  const a = D.points[0];
  if (G.dist(a, p) < 0.3) { schedule({ overlay: true }); return; }
  if (D.tool === 'calibrate') calibrate(a, p);
  else createObj(D.tool, [a, p]);
  schedule({ overlay: true });
}

function calibrate(a, b) {
  const bg = state.doc.bg;
  if (!bg) return toast('Сначала загрузите подложку');
  const d0 = G.dist(a, b);
  const s = prompt(`Измерено на подложке: ${fmt(d0)} м.\nВведите реальное расстояние между точками, м:`, fmt(d0));
  if (s == null) return;
  const real = parseFloat(String(s).replace(',', '.'));
  if (!(real > 0)) return toast('Неверное число');
  const f = real / d0;
  checkpoint();
  bg.x = a[0] + (bg.x - a[0]) * f;
  bg.y = a[1] + (bg.y - a[1]) * f;
  bg.width *= f;
  renderBg();
  changed({ props: true });
  toast(`Масштаб подложки изменён в ${fmt(f, 3)} раза`);
}

// Привязка: вершины → ось дороги → сетка
function snapPt(w, e, ex) {
  state.snapInfo = null;
  if (e && e.altKey) return w.slice();
  const tol = 10 / state.view.k;
  let best = null, bd = tol;
  for (const o of state.doc.objects) {
    if (o.hidden) continue;
    o.points.forEach((p, i) => {
      if (ex && ex.id === o.id && ex.idx === i) return;
      const d = G.dist(p, w);
      if (d < bd) { bd = d; best = p; }
    });
  }
  if (state.drawing) for (const p of state.drawing.points) { const d = G.dist(p, w); if (d < bd) { bd = d; best = p; } }
  if (best) { state.snapInfo = { p: best, kind: 'vertex' }; return best.slice(); }
  for (const o of state.doc.objects) {
    if (o.type !== 'road' || o.hidden || (ex && ex.id === o.id) || o.points.length < 2) continue;
    const pr = G.project(roadCenter(o), w);
    if (pr && pr.d < bd) { bd = pr.d; best = pr.p; }
  }
  if (best) { state.snapInfo = { p: best, kind: 'axis' }; return best.slice(); }
  if (state.opts.snap) return [Math.round(w[0] / SNAP_STEP) * SNAP_STEP, Math.round(w[1] / SNAP_STEP) * SNAP_STEP];
  return w.slice();
}

// Переход на всю ширину проезжей части в точке щелчка
function autoCrosswalk(w) {
  let best = null;
  for (const o of state.doc.objects) {
    if (o.type !== 'road' || o.hidden || o.points.length < 2) continue;
    const pr = G.project(roadCenter(o), w), m = roadMetrics(o), n = G.perp(pr.dir);
    const off = G.dot(G.sub(w, pr.p), n);
    if (off < m.neg - 0.5 || off > m.pos + 0.5) continue;
    if (!best || pr.d < best.pr.d) best = { pr, m, n };
  }
  if (!best) return null;
  const { pr, m, n } = best;
  return [G.add(pr.p, G.mul(n, m.neg)), G.add(pr.p, G.mul(n, m.pos))];
}

// ---------- Автоматический перекрёсток ----------
function roadExt(o) {
  const c = roadCenter(o), n = c.length, E = 80;
  const d0 = G.norm(G.sub(c[0], c[1])), d1 = G.norm(G.sub(c[n - 1], c[n - 2]));
  const pts = [G.add(c[0], G.mul(d0, E)), ...c, G.add(c[n - 1], G.mul(d1, E))];
  return { o, pts, cum: G.cumulative(pts), E, total: G.length(c), m: roadMetrics(o) };
}

function roadCrossings(A, B) {
  const res = [];
  for (let i = 1; i < A.pts.length; i++) for (let j = 1; j < B.pts.length; j++) {
    const x = G.segX(A.pts[i - 1], A.pts[i], B.pts[j - 1], B.pts[j]);
    if (!x) continue;
    const sA = A.cum[i - 1] + x.t * (A.cum[i] - A.cum[i - 1]) - A.E;
    const sB = B.cum[j - 1] + x.u * (B.cum[j] - B.cum[j - 1]) - B.E;
    if (sA < -20 || sA > A.total + 20 || sB < -20 || sB > B.total + 20) continue;
    res.push({ p: x.p, A, B, sA, sB, uA: G.norm(G.sub(A.pts[i], A.pts[i - 1])), uB: G.norm(G.sub(B.pts[j], B.pts[j - 1])) });
  }
  return res;
}

function junctionPolygon(X, r) {
  if (Math.abs(G.cross(X.uA, X.uB)) < 0.25) return null;
  const P = X.p;
  const roads = [{ e: X.A, u: X.uA, s: X.sA }, { e: X.B, u: X.uB, s: X.sB }];
  const arms = [];
  roads.forEach((Rd, ri) => {
    const O = roads[1 - ri], nR = G.perp(Rd.u), nO = G.perp(O.u);
    for (const sg of [1, -1]) {
      const d = G.mul(Rd.u, sg), dn = G.dot(d, nO);
      let reach = 0;
      for (const e of [O.e.m.pos, O.e.m.neg]) for (const off of [Rd.e.m.pos, Rd.e.m.neg]) {
        const t = (e - off * G.dot(nR, nO)) / dn;
        if (t > reach) reach = t;
      }
      const avail = sg > 0 ? Rd.e.total - Rd.s : Rd.s;
      if (avail <= reach + 0.5) continue;
      arms.push({ ri, d, n: nR, m: Rd.e.m, L: Math.min(reach + r + 2, avail), ang: Math.atan2(d[1], d[0]) });
    }
  });
  if (arms.length < 2 || new Set(arms.map(a => a.ri)).size < 2) return null;
  arms.sort((a, b) => a.ang - b.ang);
  // Сторона рукава: +1 — к следующему рукаву (по возрастанию угла), −1 — к предыдущему
  const side = (a, dir) => G.dot(a.n, G.mul(G.perp(a.d), dir)) > 0 ? a.m.pos : a.m.neg;
  const pts = [];
  arms.forEach((a, i) => {
    const b = arms[(i + 1) % arms.length];
    const end = G.add(P, G.mul(a.d, a.L));
    pts.push(G.add(end, G.mul(a.n, side(a, -1))), G.add(end, G.mul(a.n, side(a, 1))));
    if (b.ri !== a.ri) {
      const q = G.lineX(G.add(P, G.mul(a.n, side(a, 1))), a.d, G.add(P, G.mul(b.n, side(b, -1))), b.d);
      if (q) pts.push(q);
    }
  });
  return pts;
}

function findJunction(w) {
  const roads = state.doc.objects.filter(o => o.type === 'road' && !o.hidden && o.points.length >= 2).map(roadExt);
  let best = null;
  for (let i = 0; i < roads.length; i++) for (let j = i + 1; j < roads.length; j++) {
    for (const X of roadCrossings(roads[i], roads[j])) {
      const d = G.dist(X.p, w);
      if (!best || d < best.d) best = { X, d };
    }
  }
  return best && best.d < Math.max(30, 80 / state.view.k) ? best.X : null;
}

function makeJunctionAt(w) {
  const X = findJunction(w);
  if (!X) { toast('Рядом нет пересечения двух дорог'); return null; }
  const r = +state.defaults.junction.radius || 8;
  const pts = junctionPolygon(X, r);
  if (!pts) { toast('Не удалось построить перекрёсток (дороги почти параллельны?)'); return null; }
  return createObj('junction', pts.map(p => [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100]));
}

// ---------- Мышь ----------
function toWorld(e) {
  const r = svg.getBoundingClientRect(), v = state.view;
  return [(e.clientX - r.left - v.tx) / v.k, (e.clientY - r.top - v.ty) / v.k];
}

svg.addEventListener('pointerdown', e => {
  const w = toWorld(e);
  state.down = { x: e.clientX, y: e.clientY, w, button: e.button };
  svg.setPointerCapture(e.pointerId);
  if (e.button === 1 || state.tool === 'pan' || (state.space && e.button === 0)) {
    e.preventDefault();
    state.drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, tx: state.view.tx, ty: state.view.ty };
    svg.classList.add('panning');
    return;
  }
  const T = TOOLS[state.tool];
  if (e.button === 2) {
    if (state.drawing) { if (T.mode === 'two') state.drawing = null; else finishDrawing(); schedule({ overlay: true }); return; }
    const hd = e.target.closest('[data-handle]');
    if (hd) deleteVertex(hd.dataset.handle);
    return;
  }
  if (e.button !== 0) return;
  if (state.tool === 'select') return selectDown(e, w);
  const p = snapPt(w, e);
  state.down.p = p;
  if (T.mode === 'point') {
    const o = createObj(state.tool, p);
    if (o.type === 'text') setTimeout(() => { const el = $('#props [data-k=text]'); if (el) { el.focus(); el.select(); } }, 30);
  } else if (T.mode === 'pick') {
    makeJunctionAt(w);
  } else if (T.mode === 'two' && !state.drawing) {
    state.drawing = { tool: state.tool, points: [p], fresh: true };
  }
});

// Четырёхугольник с прямыми углами
function isRect(pts) {
  if (pts.length !== 4) return false;
  for (let i = 0; i < 4; i++) {
    const a = G.norm(G.sub(pts[(i + 1) % 4], pts[i])), b = G.norm(G.sub(pts[(i + 3) % 4], pts[i]));
    if (Math.abs(G.dot(a, b)) > 0.02) return false;
  }
  return true;
}

// Прямоугольник после перетаскивания угла idx в точку p: противоположный угол неподвижен, поворот сохраняется
function resizeRect(orig, idx, p) {
  const A = orig[(idx + 2) % 4], e1 = G.norm(G.sub(orig[1], orig[0])), e2 = G.norm(G.sub(orig[3], orig[0]));
  const D0 = G.sub(orig[idx], A), D = G.sub(p, A);
  const a0 = G.dot(D0, e1), b0 = G.dot(D0, e2);
  let a = G.dot(D, e1), b = G.dot(D, e2);
  const MIN = 0.5;
  if (Math.abs(a) < MIN) a = MIN * (Math.sign(a) || Math.sign(a0));
  if (Math.abs(b) < MIN) b = MIN * (Math.sign(b) || Math.sign(b0));
  return orig.map(q => {
    const v = G.sub(q, A);
    return G.add(A, G.add(G.mul(e1, G.dot(v, e1) / a0 * a), G.mul(e2, G.dot(v, e2) / b0 * b)));
  });
}

function selectDown(e, w) {
  const hd = e.target.closest('[data-handle]');
  if (hd) {
    const [id, idx] = hd.dataset.handle.split(':');
    if (id === '__frame') {
      state.drag = { kind: 'xform', h: idx, box: frameBox(), start: w, orig: new Map(state.sel.map(i => {
        const o = getObj(i);
        return [i, { points: clone(o.points), rot: +o.rot || 0, R: +o.R || 0, r: +o.r || 0 }];
      })) };
      return;
    }
    const o = getObj(id);
    // Угол прямоугольной площадки тянет весь прямоугольник; Ctrl — свободная правка вершины
    if (idx !== 'rot' && o.type === 'area' && !(e.ctrlKey || e.metaKey) && isRect(o.points)) {
      state.drag = { kind: 'resize', id, idx: +idx, orig: clone(o.points) };
      return;
    }
    state.drag = idx === 'rot' ? { kind: 'rotate', id } : { kind: 'vertex', id, idx: +idx };
    return;
  }
  const t = e.target.closest('[data-id]');
  if (t) {
    const id = t.dataset.id;
    if (id === '__bg') {
      if (!e.shiftKey) setSel([]);
      state.drag = { kind: 'bg', start: w, orig: [state.doc.bg.x, state.doc.bg.y] };
      return;
    }
    // Щелчок выделяет всю группу; Ctrl+щелчок — только этот объект
    const ids = e.ctrlKey || e.metaKey ? [id] : expandGroups([id]);
    if (e.shiftKey) {
      const all = ids.every(i => state.sel.includes(i));
      setSel(all ? state.sel.filter(i => !ids.includes(i)) : [...new Set([...state.sel, ...ids])]);
      return;
    }
    if (!state.sel.includes(id)) setSel(ids);
    state.drag = { kind: 'move', start: w, orig: new Map(state.sel.map(i => [i, clone(getObj(i).points)])) };
    return;
  }
  if (!e.shiftKey) setSel([]);
  state.drag = { kind: 'rubber', a: w, b: w, add: e.shiftKey };
}

function beginMove(d) {
  if (!d.moved) { checkpoint(); d.moved = true; }
}

svg.addEventListener('pointermove', e => {
  const w = toWorld(e);
  state.lastW = w;
  state.overCanvas = true;
  $('#stCoords').textContent = `X: ${fmt(w[0])}  Y: ${fmt(-w[1])} м`;
  const d = state.drag;
  if (d) {
    switch (d.kind) {
      case 'pan':
        state.view.tx = d.tx + e.clientX - d.sx;
        state.view.ty = d.ty + e.clientY - d.sy;
        applyView();
        break;
      case 'move': {
        let dv = G.sub(w, d.start);
        if (state.opts.snap && !e.altKey) dv = dv.map(v => Math.round(v / SNAP_STEP) * SNAP_STEP);
        if (!d.moved && !dv[0] && !dv[1]) return;
        beginMove(d);
        for (const [id, pts] of d.orig) { const o = getObj(id); if (o) o.points = pts.map(p => G.add(p, dv)); }
        changed();
        break;
      }
      case 'vertex': {
        const o = getObj(d.id);
        if (!o) return;
        const p = snapPt(w, e, { id: d.id, idx: d.idx });
        beginMove(d);
        o.points[d.idx] = p;
        changed();
        break;
      }
      case 'resize': {
        const o = getObj(d.id);
        if (!o) return;
        const pts = resizeRect(d.orig, d.idx, snapPt(w, e, { id: d.id, idx: d.idx }));
        if (!pts) return;
        beginMove(d);
        o.points = pts;
        changed();
        break;
      }
      case 'xform': {
        if (!d.box) return;
        const b = d.box, cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
        let xf, rot = 0, k = null, label;
        if (d.h === 'rot') {
          let a = (Math.atan2(w[1] - cy, w[0] - cx) - Math.atan2(d.start[1] - cy, d.start[0] - cx)) * 180 / Math.PI;
          a = e.shiftKey ? Math.round(a) : Math.round(a / 15) * 15;
          while (a > 180) a -= 360;
          while (a <= -180) a += 360;
          const t = a * Math.PI / 180, cs = Math.cos(t), sn = Math.sin(t);
          xf = p => [cx + (p[0] - cx) * cs - (p[1] - cy) * sn, cy + (p[0] - cx) * sn + (p[1] - cy) * cs];
          rot = a;
          label = `Поворот: ${a}°`;
        } else {
          const hx = d.h.includes('w') ? -1 : d.h.includes('e') ? 1 : 0, hy = d.h.includes('n') ? -1 : d.h.includes('s') ? 1 : 0;
          const fromC = e.ctrlKey || e.metaKey;
          const ax = fromC ? cx : hx < 0 ? b.x1 : b.x0, ay = fromC ? cy : hy < 0 ? b.y1 : b.y0;
          const Hx = hx < 0 ? b.x0 : b.x1, Hy = hy < 0 ? b.y0 : b.y1;
          const q = state.opts.snap && !e.altKey ? w.map(v => Math.round(v / SNAP_STEP) * SNAP_STEP) : w;
          const lim = v => Math.abs(v) < 0.02 ? (v < 0 ? -0.02 : 0.02) : v;
          const okX = hx && Math.abs(Hx - ax) > 1e-6, okY = hy && Math.abs(Hy - ay) > 1e-6;
          let sx = okX ? lim((q[0] - ax) / (Hx - ax)) : 1, sy = okY ? lim((q[1] - ay) / (Hy - ay)) : 1;
          // Угловые квадраты — пропорционально (Shift — свободно)
          if (hx && hy && !e.shiftKey) {
            const s = !okY || (okX && Math.abs(sx) > Math.abs(sy)) ? sx : sy;
            if (okX) sx = s;
            if (okY) sy = s;
          }
          xf = p => [ax + (p[0] - ax) * sx, ay + (p[1] - ay) * sy];
          k = Math.max(Math.abs(okX ? sx : 0), Math.abs(okY ? sy : 0)) || 1;
          label = `Масштаб: ${Math.round(sx * 100)}% × ${Math.round(sy * 100)}%`;
        }
        beginMove(d);
        for (const [id, g] of d.orig) {
          const o = getObj(id);
          if (!o) continue;
          o.points = g.points.map(xf);
          if (rot && 'rot' in o) o.rot = (g.rot + rot) % 360;
          if (k != null && o.type === 'roundabout') o.R = Math.round(g.R * k * 100) / 100;
          if (k != null && o.type === 'tree') o.r = Math.round(g.r * k * 100) / 100;
        }
        $('#stHint').textContent = label;
        changed();
        break;
      }
      case 'rotate': {
        const o = getObj(d.id);
        if (!o) return;
        let a = Math.atan2(w[1] - o.points[0][1], w[0] - o.points[0][0]) * 180 / Math.PI;
        a = e.shiftKey ? Math.round(a) : Math.round(a / 15) * 15;
        beginMove(d);
        o.rot = a;
        changed();
        break;
      }
      case 'bg': {
        const bg = state.doc.bg;
        beginMove(d);
        bg.x = d.orig[0] + w[0] - d.start[0];
        bg.y = d.orig[1] + w[1] - d.start[1];
        renderBg();
        break;
      }
      case 'rubber':
        d.b = w;
        schedule({ overlay: true });
        break;
    }
    return;
  }
  const T = TOOLS[state.tool];
  if (T.mode && T.mode !== 'pick') {
    state.cursor = snapPt(w, e);
    schedule({ overlay: true });
  }
});

svg.addEventListener('pointerup', e => {
  const down = state.down;
  state.down = null;
  try { svg.releasePointerCapture(e.pointerId); } catch (_) { /* уже отпущен */ }
  svg.classList.remove('panning');
  const d = state.drag;
  if (d) {
    state.drag = null;
    if (d.kind === 'rubber') {
      const x0 = Math.min(d.a[0], d.b[0]), x1 = Math.max(d.a[0], d.b[0]), y0 = Math.min(d.a[1], d.b[1]), y1 = Math.max(d.a[1], d.b[1]);
      if (x1 - x0 > 0.01 || y1 - y0 > 0.01) {
        const ids = expandGroups(state.doc.objects.filter(o => !o.hidden && state.doc.layers[layerOf(o)] && o.points.every(p => p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1)).map(o => o.id));
        setSel(d.add ? [...new Set([...state.sel, ...ids])] : ids);
      }
      schedule({ overlay: true });
    } else if (d.moved) {
      if (d.kind === 'xform') $('#stHint').textContent = TOOLS[state.tool].hint || '';
      schedule({ props: true });
      if (d.kind === 'bg') { clearTimeout(saveTimer); saveTimer = setTimeout(autosave, 600); }
    }
    return;
  }
  if (!down || down.button !== 0) return;
  const T = TOOLS[state.tool];
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6;
  if (T.mode === 'poly' || T.mode === 'polygon') {
    if (moved && T.mode === 'polygon' && !state.drawing) {
      const a = down.p, b = snapPt(toWorld(e), e);
      if (Math.abs(a[0] - b[0]) > 0.3 && Math.abs(a[1] - b[1]) > 0.3) createObj(state.tool, [a, [b[0], a[1]], b, [a[0], b[1]]]);
    } else {
      if (!state.drawing) state.drawing = { tool: state.tool, points: [] };
      state.drawing.points.push(down.p);
    }
    schedule({ overlay: true });
  } else if (T.mode === 'two' && state.drawing) {
    const D = state.drawing;
    if (moved) finishTwo(snapPt(toWorld(e), e));
    else if (D.fresh) {
      D.fresh = false;
      if (state.tool === 'crosswalk') {
        const pts = autoCrosswalk(down.w);
        if (pts) { state.drawing = null; createObj('crosswalk', pts); }
      }
      schedule({ overlay: true });
    } else finishTwo(down.p);
  }
});

svg.addEventListener('dblclick', e => {
  const T = TOOLS[state.tool];
  if (T.mode === 'poly' || T.mode === 'polygon') { finishDrawing(); return; }
  if (state.tool !== 'select' || state.sel.length !== 1) return;
  const o = getObj(state.sel[0]);
  if (!['road', 'path', 'area', 'marking', 'fence'].includes(o.type)) return;
  const w = toWorld(e);
  const pr = G.project(o.points, w, o.type === 'area');
  if (!pr || pr.d > 12 / state.view.k + 1) return;
  checkpoint();
  o.points.splice(pr.i + 1, 0, pr.p);
  shiftRadii(o, pr.i + 1, 1);
  changed();
});

function deleteVertex(handle) {
  const [id, idx] = handle.split(':');
  const o = getObj(id);
  if (!o || idx === 'rot') return;
  const min = o.type === 'area' ? 3 : 2;
  if (!['road', 'path', 'area', 'marking', 'fence'].includes(o.type) || o.points.length <= min) return toast('Нельзя удалить: слишком мало вершин');
  checkpoint();
  o.points.splice(+idx, 1);
  shiftRadii(o, +idx, -1);
  changed({ props: true });
}

// Сдвиг номеров вершин в radii после вставки (delta = 1) или удаления (delta = −1) вершины j
function shiftRadii(o, j, delta) {
  if (!o.radii) return;
  const r = {};
  for (const [key, v] of Object.entries(o.radii)) {
    const i = +key;
    if (delta < 0 && i === j) continue;
    r[(delta > 0 ? i >= j : i > j) ? i + delta : i] = v;
  }
  o.radii = r;
}

svg.addEventListener('contextmenu', e => e.preventDefault());
svg.addEventListener('pointerleave', () => { state.overCanvas = false; if (!state.drag) { state.cursor = null; state.snapInfo = null; schedule({ overlay: true }); } });

svg.addEventListener('wheel', e => {
  e.preventDefault();
  const r = svg.getBoundingClientRect(), v = state.view;
  const mx = e.clientX - r.left, my = e.clientY - r.top;
  const k2 = Math.min(400, Math.max(0.05, v.k * Math.exp(-e.deltaY * 0.0015)));
  v.tx = mx - (mx - v.tx) * k2 / v.k;
  v.ty = my - (my - v.ty) * k2 / v.k;
  v.k = k2;
  applyView();
}, { passive: false });

window.addEventListener('resize', applyView);

// ---------- Клавиатура ----------
window.addEventListener('keydown', e => {
  if (e.target.closest('input,textarea,select')) {
    if (e.key === 'Escape') e.target.blur();
    return;
  }
  const ctrl = e.ctrlKey || e.metaKey, k = e.key.toLowerCase(), code = e.code;
  if (ctrl) {
    if (code === 'KeyZ' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if (code === 'KeyY' || (code === 'KeyZ' && e.shiftKey)) { e.preventDefault(); redo(); }
    else if (code === 'KeyD') { e.preventDefault(); action('duplicate'); }
    else if (code === 'KeyS') { e.preventDefault(); action('save'); }
    else if (code === 'KeyO') { e.preventDefault(); action('open'); }
    else if (code === 'KeyA') { e.preventDefault(); setSel(state.doc.objects.filter(o => !o.hidden).map(o => o.id)); }
    else if (code === 'KeyC' && state.sel.length) { e.preventDefault(); action('copy'); }
    else if (code === 'KeyX' && state.sel.length) { e.preventDefault(); action('cut'); }
    else if (code === 'KeyV') state.pasteInPlace = e.shiftKey; // вставку выполняет событие paste
    else if (code === 'KeyG') { e.preventDefault(); action(e.shiftKey ? 'ungroup' : 'group'); }
    return;
  }
  if (e.key === ' ') { state.space = true; svg.classList.add('panning'); e.preventDefault(); return; }
  if (e.key === 'Escape') {
    if (state.drawing) state.drawing = null;
    else if (state.sel.length) setSel([]);
    else if (state.tool !== 'select') setTool('select');
    schedule({ overlay: true });
    return;
  }
  if (e.key === 'Enter') { finishDrawing(); return; }
  if (e.key === 'Backspace' && state.drawing) {
    state.drawing.points.pop();
    if (!state.drawing.points.length) state.drawing = null;
    schedule({ overlay: true });
    return;
  }
  if (e.key === 'Delete' || e.key === 'Backspace') { action('delete'); return; }
  if (e.key.startsWith('Arrow') && state.sel.length) {
    e.preventDefault();
    const s = e.shiftKey ? 1 : 0.1;
    const dv = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, -s], ArrowDown: [0, s] }[e.key];
    checkpoint();
    for (const id of state.sel) { const o = getObj(id); o.points = o.points.map(p => G.add(p, dv)); }
    changed();
    return;
  }
  if (code === 'KeyQ' || code === 'KeyE') { rotateSel((code === 'KeyQ' ? -1 : 1) * (e.shiftKey ? 1 : 15)); return; }
  const byKey = { KeyV: 'select', KeyH: 'pan', KeyR: 'road', KeyJ: 'junction', KeyK: 'roundabout', KeyB: 'building', KeyG: 'green', KeyM: 'marking', KeyC: 'crosswalk', KeyP: 'parking', KeyL: 'tlight', KeyT: 'text', KeyD: 'dim', KeyS: 'sign' };
  if (byKey[code]) setTool(byKey[code]);
});
window.addEventListener('keyup', e => {
  if (e.key === ' ') { state.space = false; svg.classList.remove('panning'); }
});

function rotateSel(deg) {
  const objs = state.sel.map(getObj).filter(Boolean);
  if (!objs.length) return;
  checkpoint();
  if (objs.length === 1 && (objs[0].points.length === 1 || objs[0].type === 'sign')) {
    if ('rot' in objs[0]) objs[0].rot = ((+objs[0].rot || 0) + deg) % 360;
  } else {
    const all = objs.flatMap(o => o.points);
    const c = G.mul(all.reduce((m, p) => G.add(m, p), [0, 0]), 1 / all.length);
    const a = deg * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a);
    for (const o of objs) {
      o.points = o.points.map(p => { const v = G.sub(p, c); return [c[0] + v[0] * cs - v[1] * sn, c[1] + v[0] * sn + v[1] * cs]; });
      if ('rot' in o) o.rot = ((+o.rot || 0) + deg) % 360;
    }
  }
  changed({ props: true });
}

// ---------- Группы, выравнивание ----------
function expandGroups(ids) {
  const gs = new Set(ids.map(getObj).filter(o => o && o.group).map(o => o.group));
  if (!gs.size) return ids;
  return [...new Set([...ids, ...state.doc.objects.filter(o => gs.has(o.group)).map(o => o.id)])];
}

// Габарит объекта: по вершинам, у кольца и дерева — с радиусом
function objBox(o) {
  const b = G.bbox(o.points);
  const r = o.type === 'roundabout' ? +o.R || 20 : o.type === 'tree' ? +o.r || 2.5 : 0;
  return { x0: b.x0 - r, y0: b.y0 - r, x1: b.x1 + r, y1: b.y1 + r };
}
function unionBox(objs) {
  return objs.map(objBox).reduce((a, b) => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) }));
}

// Рамка масштаба и поворота — для выделения, у которого есть размер
const FRAMELESS = new Set(['sign', 'light', 'pole', 'text', 'tree', 'crosswalk', 'dim', 'ramp']);
function frameBox() {
  if (state.tool !== 'select' || !state.sel.length) return null;
  const objs = state.sel.map(getObj).filter(Boolean);
  if (!objs.length || (objs.length === 1 && FRAMELESS.has(objs[0].type))) return null;
  const b = unionBox(objs);
  return b.x1 - b.x0 < 0.01 && b.y1 - b.y0 < 0.01 ? null : b;
}

// Выравнивание и распределение; объекты одной группы двигаются вместе
function alignSel(mode) {
  const map = new Map();
  for (const o of state.sel.map(getObj).filter(Boolean)) {
    const key = o.group || o.id;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(o);
  }
  const us = [...map.values()].map(objs => ({ objs, b: unionBox(objs) }));
  const dist = mode.startsWith('dist');
  if (us.length < (dist ? 3 : 2)) return toast(dist ? 'Для распределения выделите не меньше трёх объектов' : 'Выделите два или больше объектов');
  const horiz = ['left', 'hcenter', 'right', 'distH'].includes(mode);
  const c = u => horiz ? (u.b.x0 + u.b.x1) / 2 : (u.b.y0 + u.b.y1) / 2;
  const move = (u, d) => { const dv = horiz ? [d, 0] : [0, d]; for (const o of u.objs) o.points = o.points.map(p => G.add(p, dv)); };
  const B = unionBox(us.flatMap(u => u.objs));
  checkpoint();
  if (dist) {
    us.sort((a, b) => c(a) - c(b));
    const c0 = c(us[0]), c1 = c(us[us.length - 1]);
    us.forEach((u, i) => move(u, c0 + (c1 - c0) * i / (us.length - 1) - c(u)));
  } else {
    for (const u of us) {
      move(u, { left: B.x0 - u.b.x0, hcenter: (B.x0 + B.x1) / 2 - c(u), right: B.x1 - u.b.x1, top: B.y0 - u.b.y0, vcenter: (B.y0 + B.y1) / 2 - c(u), bottom: B.y1 - u.b.y1 }[mode]);
    }
  }
  changed();
}

// ---------- Буфер обмена (работает между схемами и вкладками) ----------
const CLIP_KEY = 'ksodd.clipboard';
function copySel() {
  const objs = state.doc.objects.filter(o => state.sel.includes(o.id));
  if (!objs.length) return false;
  const txt = JSON.stringify({ ksodd: 'objects', objects: objs });
  try { localStorage.setItem(CLIP_KEY, txt); } catch (_) { /* хранилище недоступно */ }
  try { navigator.clipboard.writeText(txt).catch(() => {}); } catch (_) { /* нет доступа к буферу */ }
  return objs.length;
}
function parseClip(txt) {
  try {
    const d = JSON.parse(txt);
    if (d && d.ksodd === 'objects' && Array.isArray(d.objects)) {
      const objs = d.objects.filter(o => o && o.type && Array.isArray(o.points) && o.points.length);
      return objs.length ? objs : null;
    }
  } catch (_) { /* не наши данные */ }
  return null;
}
function localClip() {
  try { return parseClip(localStorage.getItem(CLIP_KEY) || ''); } catch (_) { return null; }
}
function viewCenter() {
  const r = svg.getBoundingClientRect(), v = state.view;
  return [(r.width / 2 - v.tx) / v.k, (r.height / 2 - v.ty) / v.k];
}
// Копии объектов со сдвигом dv: новые id, свои группы
function insertCopies(src, dv) {
  const gmap = {};
  const out = src.map(o => {
    const c = clone(o);
    c.id = uid();
    if (c.group) c.group = gmap[c.group] || (gmap[c.group] = uid());
    c.points = c.points.map(p => G.add(p, dv));
    return c;
  });
  checkpoint();
  state.doc.objects.push(...out);
  state.sel = out.map(c => c.id);
  changed({ props: true });
  return out;
}
// Вставка под курсор (или в центр экрана); inPlace — на те же координаты
function pasteObjs(objs, inPlace) {
  if (!objs) return toast('Буфер пуст — сначала скопируйте объекты (Ctrl+C)');
  let dv = [0, 0];
  if (!inPlace) {
    const b = unionBox(objs), t = state.overCanvas && state.lastW ? state.lastW : viewCenter();
    dv = [t[0] - (b.x0 + b.x1) / 2, t[1] - (b.y0 + b.y1) / 2];
    if (state.opts.snap) dv = dv.map(v => Math.round(v / SNAP_STEP) * SNAP_STEP);
  }
  if (state.tool !== 'select') setTool('select');
  insertCopies(objs, dv);
  toast(`Вставлено объектов: ${objs.length}`);
}
window.addEventListener('paste', e => {
  if (e.target.closest && e.target.closest('input,textarea,select')) return;
  const objs = parseClip(e.clipboardData ? e.clipboardData.getData('text/plain') : '') || localClip();
  e.preventDefault();
  pasteObjs(objs, state.pasteInPlace);
  state.pasteInPlace = false;
});

// ---------- Помощники инструментов ----------
// Кольцо встаёт в точку пересечения дорог, если щёлкнули рядом с ним
function ringCenter(p) {
  const X = findJunction(p);
  return X && G.dist(X.p, p) < Math.max(+state.defaults.roundabout.R || 20, 15) ? X.p.map(v => Math.round(v * 100) / 100) : p;
}

// Карман прилипает к кромке ближайшей дороги; точки упорядочиваются так, чтобы карман был справа по ходу
function pocketSnap(pts) {
  const [a, b] = pts, mid = G.lerp(a, b, 0.5);
  let best = null;
  for (const r of state.doc.objects) {
    if (r.type !== 'road' || r.hidden || r.points.length < 2) continue;
    const c = roadCenter(r), pr = G.project(c, mid), m = roadMetrics(r), n = G.perp(pr.dir);
    const off = G.dot(G.sub(mid, pr.p), n), side = off >= 0 ? 1 : -1, edge = side > 0 ? m.pos : m.neg;
    const de = Math.abs(off - edge);
    if (de < 10 && (!best || de < best.de)) best = { r, c, side, edge, de, n };
  }
  if (!best) return { points: [a.slice(), b.slice()] };
  const on = p => { const q = G.project(best.c, p); return G.add(q.p, G.mul(G.perp(q.dir), best.edge)); };
  let A = on(a), Bp = on(b);
  if (G.dot(G.perp(G.sub(Bp, A)), G.mul(best.n, best.side)) < 0) [A, Bp] = [Bp, A];
  const r = best.r;
  return { points: [A, Bp], green: +r.greenStrip || 0, walk: +(best.side > 0 ? r.sidewalkR : r.sidewalkL) || 0 };
}

// Пандус смотрит на ось ближайшей дороги
function rampRot(p) {
  let best = null;
  for (const r of state.doc.objects) {
    if (r.type !== 'road' || r.hidden || r.points.length < 2) continue;
    const pr = G.project(roadCenter(r), p);
    if (!best || pr.d < best.d) best = pr;
  }
  if (!best || best.d < 0.01 || best.d > 40) return +state.defaults.ramp.rot || 0;
  const v = G.sub(best.p, p);
  return Math.round(Math.atan2(v[1], v[0]) * 180 / Math.PI);
}

// ---------- Действия ----------
function action(a) {
  if (a.startsWith('align:')) return alignSel(a.slice(6));
  switch (a) {
    case 'copy': {
      const n = copySel();
      if (n) toast(`Скопировано объектов: ${n}. Вставка — Ctrl+V, в том числе в другую схему`);
      break;
    }
    case 'cut':
      if (!copySel()) return;
      action('delete');
      toast('Вырезано. Вставка — Ctrl+V');
      break;
    case 'paste': pasteObjs(localClip(), false); break;
    case 'group': {
      const objs = state.sel.map(getObj).filter(Boolean);
      if (objs.length < 2) return toast('Выделите несколько объектов');
      checkpoint();
      const g = uid();
      objs.forEach(o => { o.group = g; });
      changed({ props: true });
      toast('Объекты сгруппированы');
      break;
    }
    case 'ungroup': {
      const objs = state.sel.map(getObj).filter(o => o && o.group);
      if (!objs.length) return;
      checkpoint();
      objs.forEach(o => { delete o.group; });
      changed({ props: true });
      toast('Группа расформирована');
      break;
    }
    case 'new':
      if (state.doc.objects.length && !confirm('Начать новую схему? Несохранённые изменения будут потеряны.')) return;
      state.doc = newDoc(); state.undo = []; state.redo = []; state.sel = [];
      renderLayers(); renderBg(); fitView(); changed({ props: true });
      break;
    case 'open': $('#fileOpen').click(); break;
    case 'save': saveFile(); break;
    case 'export': openExport(); break;
    case 'demo':
      if (state.doc.objects.length && !confirm('Заменить текущую схему примером?')) return;
      buildDemo();
      break;
    case 'undo': undo(); break;
    case 'redo': redo(); break;
    case 'delete':
      if (!state.sel.length) return;
      checkpoint();
      state.doc.objects = state.doc.objects.filter(o => !state.sel.includes(o.id));
      state.sel = [];
      changed({ props: true });
      break;
    case 'duplicate':
      if (!state.sel.length) return;
      insertCopies(state.doc.objects.filter(o => state.sel.includes(o.id)), [2, 2]);
      break;
    case 'front': case 'back': {
      checkpoint();
      const sel = state.doc.objects.filter(o => state.sel.includes(o.id));
      const rest = state.doc.objects.filter(o => !state.sel.includes(o.id));
      state.doc.objects = a === 'front' ? [...rest, ...sel] : [...sel, ...rest];
      changed();
      break;
    }
    case 'fit': fitView(); break;
    case 'bgLoad': $('#fileBg').click(); break;
    case 'bgRemove':
      checkpoint();
      state.doc.bg = null;
      renderBg(); changed({ props: true });
      break;
    case 'calibrate': setTool('calibrate'); break;
  }
}

function fitView() {
  const pts = state.doc.objects.flatMap(o => o.points);
  const b = state.doc.bg;
  if (b && b.visible) pts.push([b.x, b.y], [b.x + b.width, b.y + b.width * b.natH / b.natW]);
  const r = svg.getBoundingClientRect();
  if (!pts.length) { state.view = { k: 6, tx: r.width / 2, ty: r.height / 2 }; applyView(); return; }
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const x0 = Math.min(...xs) - 15, x1 = Math.max(...xs) + 15, y0 = Math.min(...ys) - 15, y1 = Math.max(...ys) + 15;
  const k = Math.min(r.width / (x1 - x0), r.height / (y1 - y0), 60);
  state.view = { k, tx: r.width / 2 - (x0 + x1) / 2 * k, ty: r.height / 2 - (y0 + y1) / 2 * k };
  applyView();
}

// ---------- Файлы ----------
function download(name, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
const safeName = () => (state.doc.name || 'схема').replace(/[\\/:*?"<>|]+/g, '_');

function saveFile() {
  download(safeName() + '.ksodd.json', new Blob([JSON.stringify(state.doc)], { type: 'application/json' }));
  toast('Схема сохранена в файл');
}

function loadDoc(d) {
  if (!d || !Array.isArray(d.objects)) throw new Error('bad');
  const base = newDoc();
  state.doc = { ...base, ...d, layers: { ...base.layers, ...(d.layers || {}) } };
  for (const o of state.doc.objects) if (o.type === 'road' && o.curbR === undefined) o.curbR = DEFAULTS.road.curbR;
  state.sel = []; state.undo = []; state.redo = []; state.drawing = null;
  renderLayers(); renderBg(); changed({ props: true });
}

$('#fileOpen').addEventListener('change', e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  f.text().then(t => { loadDoc(JSON.parse(t)); fitView(); toast('Схема открыта: ' + f.name); })
    .catch(() => toast('Не удалось открыть файл — это не схема КСОДД'));
});

$('#fileBg').addEventListener('change', e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    const img = new Image();
    img.onload = () => {
      const r = svg.getBoundingClientRect(), v = state.view;
      const width = Math.min(400, r.width / v.k * 0.8);
      const cx = (r.width / 2 - v.tx) / v.k, cy = (r.height / 2 - v.ty) / v.k;
      checkpoint();
      state.doc.bg = { src: rd.result, natW: img.naturalWidth, natH: img.naturalHeight, width, x: cx - width / 2, y: cy - width * img.naturalHeight / img.naturalWidth / 2, opacity: 0.6, visible: true, locked: false };
      state.doc.layers.bg = true;
      renderLayers(); renderBg(); changed({ props: true });
      setTool('calibrate');
      toast('Подложка загружена. Протяните линию по известному размеру, чтобы задать масштаб');
    };
    img.src = rd.result;
  };
  rd.readAsDataURL(f);
});

function autosave() {
  try {
    localStorage.setItem('ksodd.autosave', JSON.stringify(state.doc));
  } catch (_) {
    try { localStorage.setItem('ksodd.autosave', JSON.stringify({ ...state.doc, bg: null })); } catch (__) { /* хранилище недоступно */ }
  }
}

// ---------- Экспорт ----------
function exportBox(withBg) {
  let bb = null;
  try { const b = gScene.getBBox(); if (b.width || b.height) bb = { x0: b.x, y0: b.y, x1: b.x + b.width, y1: b.y + b.height }; } catch (_) { /* пустая сцена */ }
  const g = state.doc.bg;
  if (withBg && g && g.visible) {
    const h = g.width * g.natH / g.natW;
    const gb = { x0: g.x, y0: g.y, x1: g.x + g.width, y1: g.y + h };
    bb = bb ? { x0: Math.min(bb.x0, gb.x0), y0: Math.min(bb.y0, gb.y0), x1: Math.max(bb.x1, gb.x1), y1: Math.max(bb.y1, gb.y1) } : gb;
  }
  if (!bb) return null;
  const m = 5;
  return { x: bb.x0 - m, y: bb.y0 - m, w: bb.x1 - bb.x0 + 2 * m, h: bb.y1 - bb.y0 + 2 * m };
}

function exportSvg(scale, withBg, white) {
  const bb = exportBox(withBg);
  if (!bb) return null;
  const mmPerM = 1000 / scale;
  const body = (white ? `<rect x="${bb.x}" y="${bb.y}" width="${bb.w}" height="${bb.h}" fill="#ffffff"/>` : '') +
    (withBg ? R.bg(state.doc, true) : '') + R.render(state.doc, { k: 1, exporting: true });
  return { bb, mmPerM, svg: `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bb.x} ${bb.y} ${bb.w} ${bb.h}" width="${(bb.w * mmPerM).toFixed(1)}mm" height="${(bb.h * mmPerM).toFixed(1)}mm">${body}</svg>` };
}

function openExport() {
  if (!state.doc.objects.length && !state.doc.bg) return toast('Схема пуста');
  $('#exBg').checked = !!(state.doc.bg && state.doc.bg.visible);
  updateExportInfo();
  $('#exportDlg').showModal();
}
function updateExportInfo() {
  const scale = +$('#exScale').value, dpi = +$('#exDpi').value;
  const bb = exportBox($('#exBg').checked);
  if (!bb) return;
  const mm = 1000 / scale, px = mm / 25.4 * dpi;
  $('#exInfo').textContent = `Участок ${fmt(bb.w, 0)} × ${fmt(bb.h, 0)} м → лист ${fmt(bb.w * mm, 0)} × ${fmt(bb.h * mm, 0)} мм, PNG ${Math.round(bb.w * px)} × ${Math.round(bb.h * px)} px`;
}
['#exScale', '#exDpi', '#exBg'].forEach(s => $(s).addEventListener('change', updateExportInfo));

$('#exSvg').addEventListener('click', () => {
  const r = exportSvg(+$('#exScale').value, $('#exBg').checked, $('#exWhite').checked);
  if (r) download(safeName() + '.svg', new Blob([r.svg], { type: 'image/svg+xml' }));
});

$('#exPng').addEventListener('click', () => {
  const scale = +$('#exScale').value, dpi = +$('#exDpi').value;
  const r = exportSvg(scale, $('#exBg').checked, $('#exWhite').checked);
  if (!r) return;
  let pxPerM = r.mmPerM / 25.4 * dpi;
  const maxSide = 16000;
  if (Math.max(r.bb.w, r.bb.h) * pxPerM > maxSide) { pxPerM = maxSide / Math.max(r.bb.w, r.bb.h); toast('Изображение слишком большое — разрешение уменьшено'); }
  const W = Math.round(r.bb.w * pxPerM), H = Math.round(r.bb.h * pxPerM);
  const img = new Image();
  const url = URL.createObjectURL(new Blob([r.svg], { type: 'image/svg+xml' }));
  img.onload = () => {
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    cv.getContext('2d').drawImage(img, 0, 0, W, H);
    URL.revokeObjectURL(url);
    cv.toBlob(b => download(safeName() + '.png', b), 'image/png');
  };
  img.onerror = () => toast('Ошибка экспорта PNG');
  img.src = url;
});

// ---------- Уведомления ----------
let toastTimer = 0;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

// ---------- Лента ----------
function buildRibbon() {
  const icon = n => `<svg viewBox="0 0 24 24">${ICONS[n] || ''}</svg>`;
  $('#ribbon').innerHTML = RIBBON.map(([title, items]) => `<div class="rgroup"><div class="ritems">${items.map(it => {
    if (it.tool) { const T = TOOLS[it.tool]; return `<button class="rbtn" data-tool="${it.tool}" title="${R.esc(T.l + (T.key ? ' (' + T.key.toUpperCase() + ')' : ''))}">${icon(T.i)}<span>${T.l}</span></button>`; }
    if (it.toggle) return `<button class="rbtn ${state.opts[it.toggle] ? 'active' : ''}" data-toggle="${it.toggle}">${icon(it.i)}<span>${it.l}</span></button>`;
    return `<button class="rbtn" data-act="${it.act}">${icon(it.i)}<span>${it.l}</span></button>`;
  }).join('')}</div><div class="rtitle">${title}</div></div>`).join('');
}
$('#ribbon').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.tool) setTool(b.dataset.tool);
  else if (b.dataset.act) action(b.dataset.act);
  else if (b.dataset.toggle) {
    const k = b.dataset.toggle;
    state.opts[k] = !state.opts[k];
    b.classList.toggle('active', state.opts[k]);
    if (k === 'grid') renderGrid();
  }
});

// ---------- Пример ----------
function buildDemo() {
  const D = state.defaults;
  const mk = (tool, pts, extra = {}) => Object.assign({ id: uid() }, clone(D[tool] || {}), TOOLS[tool].make(pts), extra);
  const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const O = [];
  // Зелень и площадки (нижний слой)
  O.push(mk('green', rect(-125, -85, -5, -6)), mk('green', rect(5, -85, 125, -6)), mk('green', rect(-125, 6, -5, 85)), mk('green', rect(5, 6, 125, 85)));
  // Дороги
  const A = mk('road', [[-125, 0], [125, 0]], { name: 'ул. Ленина', lanesF: 2, lanesB: 2, centerLine: 'double', greenStrip: 2, sidewalkR: 3, sidewalkL: 3, trimStart: 0, trimEnd: 0 });
  const B = mk('road', [[0, -85], [0, 85]], { name: 'пр. Мира' });
  O.push(A, B);
  // Проезд к стоянке и стоянка
  O.push(mk('drive', [[2, 38], [24, 38]]));
  O.push(mk('asphalt', [[22, 22], [72, 22], [72, 58], [22, 58]], { round: 'all', radius: 3 }));
  O.push(mk('parking', [[24, 24], [70, 24]], { numbered: true, mgn: 2, hlColor: '#9b51e0' }));
  O.push(mk('parking', [[70, 56], [24, 56]], { numbered: true, startNum: 19, hlColor: '#9b51e0' }));
  O.push(mk('parking', [[-100, -7], [-40, -7]], { angle: 0, stallL: 6, side: 'right', numbered: false }));
  // Здания
  O.push(mk('building', rect(-72, -60, -26, -24), { label: 'ул. Ленина, 12', floors: '9' }));
  O.push(mk('building', [[22, -62], [64, -62], [64, -24], [50, -24], [50, -44], [22, -44]], { label: 'Школа № 5', floors: '3', color: '#fbeeb0' }));
  O.push(mk('building', rect(-66, 26, -22, 52), { label: 'ТЦ «Мира»', floors: '2', color: '#f4c7c7' }));
  O.push(mk('plaza', rect(-66, 17, -22, 26)));
  // Деревья вдоль газонов
  for (let x = -116; x <= 116; x += 12) if (Math.abs(x) > 26) O.push(mk('tree', [x, -8], { r: 2 }), mk('tree', [x, 8], { r: 2 }));
  for (let y = -78; y <= 78; y += 12) if (Math.abs(y) > 28) O.push(mk('tree', [-4.25, y], { r: 1.6 }), mk('tree', [4.25, y], { r: 1.6 }));
  // Разметка: стоп-линии
  O.push(mk('marking', [[-18, 0.2], [-18, 7]], { style: '1.12' }), mk('marking', [[18, -7], [18, -0.2]], { style: '1.12' }));
  O.push(mk('marking', [[-3.5, -20], [-0.2, -20]], { style: '1.12' }), mk('marking', [[0.2, 20], [3.5, 20]], { style: '1.12' }));
  // Жёлтая линия запрета остановки у школы
  O.push(mk('marking', [[22, -6.9], [64, -6.9]], { style: '1.4' }));
  // Светофоры
  O.push(mk('tlight', [-19, 11], { rot: 180 }), mk('tlight', [19, -11], { rot: 0 }), mk('tlight', [-7.5, -21], { rot: -90 }), mk('tlight', [7.5, 21], { rot: 90 }));
  O.push(mk('plight', [-15, -10], { rot: 90 }), mk('plight', [15, 10], { rot: -90 }));
  // Опоры освещения
  for (const x of [-60, -36, 36, 60]) O.push(mk('pole', [x, -9.2], { rot: 90 }), mk('pole', [x, 9.2], { rot: -90 }));
  // Подписи и размеры
  O.push(mk('text', [-95, -14], { text: 'ул. Ленина', size: 3 }), mk('text', [-12, -70], { text: 'пр. Мира', size: 3, rot: -90 }));
  O.push(mk('text', [47, 66], { text: 'Платная стоянка, 36 м/м', size: 2.5 }));
  O.push(mk('dim', [[100, -7], [100, 7]], { offset: -3 }));
  // Знаки
  const sign = (p, q, rot, codes) => mk('sign', p, { points: [p, q], rot, items: codes.map(c => typeof c === 'string' ? { code: c } : c) });
  O.push(sign([-38, -10.5], [-38, -17], 0, ['6.4', '8.6.1', { code: '8.2.2', text: '60 м' }]));
  O.push(sign([65, -10.5], [70, -15], 0, ['3.27', { code: '8.2.2', text: '42 м' }]));
  O.push(sign([7, 33], [12, 30], 90, signItems('set:1')));
  O.push(sign([16, 42.5], [16, 47], 0, ['2.4']));
  O.push(sign([-6.5, -15], [-11, -19], -90, ['5.19.1']));
  O.push(sign([6.5, -17.5], [11, -21], -90, ['5.19.2']));

  checkpoint();
  state.doc = newDoc();
  state.doc.name = 'Пример: перекрёсток ул. Ленина и пр. Мира';
  state.doc.objects = O;
  // Перекрёсток и переходы — теми же функциями, что и инструменты
  const X = roadCrossings(roadExt(A), roadExt(B))[0];
  const jp = X && junctionPolygon(X, 8);
  if (jp) O.splice(O.indexOf(B) + 1, 0, mk('junction', jp));
  for (const p of [[-14, 3], [14, -3], [-2, -16], [2, 16]]) {
    const pts = autoCrosswalk(p);
    if (pts) O.push(mk('crosswalk', pts));
  }
  state.sel = [];
  renderLayers(); renderBg(); fitView(); changed({ props: true });
}

// ---------- Запуск ----------
buildRibbon();
renderLayers();
setTool('select');
(() => {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem('ksodd.autosave') || 'null'); } catch (_) { /* нет сохранения */ }
  if (saved && saved.objects && (saved.objects.length || saved.bg)) {
    try { loadDoc(saved); requestAnimationFrame(fitView); toast('Восстановлена последняя схема'); return; } catch (_) { /* повреждено */ }
  }
  renderBg();
  requestAnimationFrame(fitView);
  changed({ props: true });
})();
