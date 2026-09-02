#!/usr/bin/env node
// Разбор журнала самообучения content-creator (методика — скилл bot-selflearn-log).
// Смысл извлекается ПОСТФАКТУМ: в рантайме пишется только сырьё, вся классификация здесь,
// поэтому таксономию можно менять и прогонять заново по всей накопленной истории.
//
// Запуск на VPS:   node journal-report.js ~/cc-journal
// Локально:        node tools/journal-report.js path/to/dir-or-file.jsonl
// Ограничить период: node journal-report.js ~/cc-journal 2026-09

const fs = require('fs');
const path = require('path');

const target = process.argv[2] || path.join(require('os').homedir(), 'cc-journal');
const monthFilter = process.argv[3] || null;

function readEvents(t) {
  const files = fs.statSync(t).isDirectory()
    ? fs.readdirSync(t).filter(f => f.endsWith('.jsonl')).sort().map(f => path.join(t, f))
    : [t];
  const out = [];
  for (const f of files) {
    if (monthFilter && !path.basename(f).startsWith(monthFilter)) continue;
    for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try { out.push(JSON.parse(line)); } catch (e) { /* битая строка — пропускаем, отчёт важнее */ }
    }
  }
  return out.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
}

const ev = readEvents(target);
if (!ev.length) { console.log('Журнал пуст: ' + target); process.exit(0); }

const of = n => ev.filter(e => e.event === n);
const count = (list, key) => {
  const m = {};
  for (const e of list) { const k = typeof key === 'function' ? key(e) : e[key]; if (k === undefined || k === null) continue; (Array.isArray(k) ? k : [k]).forEach(x => m[x] = (m[x] || 0) + 1); }
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
};
const med = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const table = (rows, limit = 15) => rows.slice(0, limit).map(([k, v]) => '  ' + String(v).padStart(5) + '  ' + k).join('\n') || '  (нет)';
const h = t => '\n\n=== ' + t + ' ' + '='.repeat(Math.max(0, 66 - t.length));

console.log('Журнал: ' + target);
console.log('Событий: ' + ev.length + ' · период ' + ev[0].ts.slice(0, 16) + ' … ' + ev[ev.length - 1].ts.slice(0, 16));
console.log('Устройства: ' + count(ev, 'device').map(([k, v]) => k + ' ' + v).join(', '));
console.log('Цепочек (работ над артефактом): ' + new Set(ev.map(e => e.chainId).filter(Boolean)).size);

console.log(h('ЧЕМ ПОЛЬЗУЮСЬ'));
console.log(table(count(of('used'), 'feature'), 40));

// Функции, о которых журнал знает, но которые ни разу не встретились — кандидаты
// на удаление или на «спрятать поглубже». Список ведётся вручную: он и есть
// перечень того, что инструмент вообще умеет.
// (копирование и экспорты сюда не входят — они пишутся событием published, см. раздел ниже)
const KNOWN = ['openTGPost', 'openCollage', 'openStory', 'openCustomItem', 'collageMode', 'collageBgStyle',
  'storyMode', 'storyPlatform', 'storyBgStyle', 'cardStyle', 'storyGameCount', 'storyReorder', 'slotBg', 'descOn',
  'logoPos', 'logoShape', 'logoUrl', 'templateToEditor', 'brandSave', 'brandApply', 'brandDelete',
  'customItemAdd', 'customItemRemove', 'pickerSearch', 'clearCover', 'swapSlots', 'sort', 'deselectAll', 'onlySelected'];
const usedSet = new Set(of('used').map(e => e.feature));
console.log('\nНи разу не использовано: ' + (KNOWN.filter(f => !usedSet.has(f)).join(', ') || '— всё в ходу'));

console.log(h('ЧТО ДОХОДИТ ДО РЕЗУЛЬТАТА'));
console.log(table(count(of('published'), 'kind'), 20));
const rej = of('rejected');
console.log('\nБрошено/отвергнуто: ' + rej.length);
console.log(table(count(rej, e => (e.kind || e.mode || '?') + ' · ' + (e.reason || '?')), 10));
const dm = of('published').map(e => e.decisionMin).filter(x => typeof x === 'number');
if (dm.length) console.log('\nВремя от открытия до результата: медиана ' + med(dm) + ' мин, максимум ' + Math.max(...dm) + ' мин');

console.log(h('ЧТО ПЕРЕПИСЫВАЮ ЗА ИИ'));
const modes = [...new Set(of('generated').map(e => e.mode))];
for (const m of modes) {
  const gen = of('generated').filter(e => e.mode === m);
  const eds = of('edited').filter(e => e.mode === m);
  const shares = eds.map(e => e.editSharePct).filter(x => typeof x === 'number');
  const passes = gen.map(e => e.aiPasses).filter(x => typeof x === 'number');
  console.log('\n' + m + ': генераций ' + gen.length + ', правок ' + eds.length +
    (shares.length ? ', переписано медианой ' + med(shares) + '% (макс ' + Math.max(...shares) + '%)' : ', правок текста не было') +
    (passes.length ? ', заходов до решения макс ' + Math.max(...passes) : ''));
  const lost = gen.reduce((s, e) => s + (e.lost || 0), 0);
  if (lost) console.log('  игр осталось без описания: ' + lost + ' — ' + [...new Set(gen.flatMap(e => e.lostTitles || []))].slice(0, 8).join(', '));
  const worst = eds.filter(e => typeof e.editSharePct === 'number').sort((a, b) => b.editSharePct - a.editSharePct)[0];
  if (worst) console.log('  сильнее всего переписано (' + worst.editSharePct + '%): «' + String(worst.botBefore || '').slice(0, 90) + '…» → «' + String(worst.edited || '').slice(0, 90) + '…»');
}

console.log(h('ШАБЛОНЫ И ЭЛЕМЕНТЫ'));
console.log('Шаблон в экспорте:');
console.log(table(count(of('published').filter(e => e.tpl), 'tpl')));
console.log('\nПеребор шаблонов (что смотрят, но не берут):');
console.log(table(count(of('tpl_switch'), 'to')));
console.log('\nЭлементы канваса:');
console.log(table(count(of('el_add'), 'type')));
const delT = count(of('el_delete'), 'type');
if (delT.length) console.log('\nУдаляют:\n' + table(delT));
console.log('\nОтмен (Ctrl+Z): ' + of('undo').length + (of('undo').length ? '\n' + table(count(of('undo'), 'selType')) : ''));

console.log(h('ЧТО ПРАВЛЮ ПОСТОЯННО (дефолты-кандидаты)'));
const props = of('prop_change');
const byProp = {};
for (const e of props) {
  const k = (e.elType || '?') + ' · ' + e.key;
  (byProp[k] = byProp[k] || []).push(e);
}
const propRows = Object.entries(byProp).sort((a, b) => b[1].length - a[1].length).slice(0, 15);
if (!propRows.length) console.log('  (нет)');
for (const [k, list] of propRows) {
  const froms = [...new Set(list.map(e => e.from))].slice(0, 3).join('/');
  const tos = [...new Set(list.map(e => e.to))].slice(0, 3).join('/');
  const clicks = list.map(e => e.n || 1);
  console.log('  ' + String(list.length).padStart(4) + '  ' + k + ': ' + froms + ' → ' + tos + ' (шевелений за раз: медиана ' + med(clicks) + ')');
}

console.log(h('ОБЛОЖКИ'));
console.log('HD найдено: ' + of('hd_ok').length + ', деградировало до мыла: ' + of('hd_miss').length);
if (of('hd_miss').length) {
  console.log('\nИгры без HD-обложки (кандидаты на ручную правку названия в БД):');
  console.log(table(count(of('hd_miss'), 'title'), 20));
  console.log('\nПочему не прошло:');
  console.log(table(count(of('hd_miss'), 'confidence')));
}
console.log('\nОбложку меняли руками: ' + of('cover_replace').length + (of('cover_replace').length ? '\nОткуда брали:\n' + table(count(of('cover_replace'), 'source')) + '\nУ каких игр:\n' + table(count(of('cover_replace'), 'title'), 10) : ''));

console.log(h('ИГРЫ И ПОИСК'));
console.log('Чаще всего попадают в контент:');
console.log(table(count(of('published'), 'titles'), 20));
const prices = of('used').filter(e => e.feature && e.feature.startsWith('open') && Array.isArray(e.prices)).flatMap(e => e.prices);
if (prices.length) console.log('\nЦены выбранных: медиана ' + med(prices) + ' ₽, разброс ' + Math.min(...prices) + '–' + Math.max(...prices) + ' ₽');
const searches = of('search');
if (searches.length) {
  console.log('\nПоиски: ' + searches.length + ', из них без результата ' + searches.filter(e => !e.found).length);
  const empty = searches.filter(e => !e.found);
  if (empty.length) console.log('Искали и не нашли:\n' + table(count(empty, 'q'), 10));
}

console.log(h('СБОИ'));
const errs = of('error');
console.log('Ошибок: ' + errs.length);
console.log(table(count(errs, 'stage'), 20));
for (const st of [...new Set(errs.map(e => e.stage))].slice(0, 5)) {
  const e = errs.filter(x => x.stage === st).slice(-1)[0];
  console.log('  последняя «' + st + '»: ' + String(e.message || '').slice(0, 120));
}
console.log('');
