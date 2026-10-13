#!/usr/bin/env node
// Аудит каталога магазина глазами content-creator: битые названия, дубли, пустые описания,
// чужие и мыльные обложки. Ничего не меняет — пишет отчёт CATALOG-AUDIT.md в корень репо (или AUDIT_OUT).
//
// Запуск: node tools/catalog-audit.js   (зависимости — те же, что у стенда: cd tools && npm install)
// Как и стенд, данные качает Chrome, а не node (node до api.poigraem.shop не достаёт), журнал и Claude — заглушки.
// Обложки сверяются той же логикой, что HD-апгрейд сторис и коллажа (_hdCoverUrl): /igdb/cover по очищенному
// названию, ответ принимается тем же _hdAccept. Вкладку PS Store пикера аудит не трогает — там нужен админ-токен.
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const puppeteer = require('puppeteer-core');
const SRC = process.env.STAND_SRC || path.join(__dirname, '..', 'content-creator.html');
const OUT = process.env.AUDIT_OUT || path.join(__dirname, '..', 'CATALOG-AUDIT.md');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 8767, BLUR_W = 500; // уже 500px обложка на кадре 1080 растягивается больше чем вдвое — мыло видно глазом
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };
const srv = http.createServer((q, s) => { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); fs.createReadStream(SRC).pipe(s); }).listen(PORT);

(async () => {
  const br = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-web-security', '--user-data-dir=' + path.join(os.tmpdir(), 'cc-audit-profile')] });
  const p = await br.newPage();
  await p.setRequestInterception(true);
  p.on('request', r => {
    const u = r.url();
    if (!u.startsWith('https://api.poigraem.shop')) return r.continue();
    if (r.method() === 'OPTIONS') return r.respond({ status: 204, headers: CORS });
    // журнал самообучения и ИИ — заглушки: аудит не должен засорять ~/cc-journal
    if (/^\/(api\/|cc\/journal)/.test(new URL(u).pathname)) return r.respond({ status: 200, headers: CORS, contentType: 'application/json', body: '{"ok":true}' });
    r.continue();
  });
  await p.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle0', timeout: 90000 });
  await p.waitForFunction(() => typeof games !== 'undefined' && games.length > 50, { timeout: 60000 });

  const res = await p.evaluate(async BLUR_W => {
    const ACR = new Set(['NBA', 'NHL', 'MLB', 'NFL', 'UFC', 'WWE', 'FIFA', 'FC', 'EA', 'GTA', 'PS4', 'PS5', 'VR', 'VR2', 'PSVR', 'PSVR2', 'II', 'III', 'IV', 'VI', 'VII', 'VIII', 'XI', 'XV', 'XVI', 'DLC', 'HD', 'GOTY', 'LEGO', 'DOOM', 'MXGP', 'WRC', 'F1', 'RPG', 'TV', 'USA', 'UK', 'AI', 'DC', 'SD', 'XL', 'MX', 'GT', 'NBA2K', 'BIOHAZARD', 'RE', 'AC', 'DX', 'EX', 'HDR', 'PGA', 'TT', 'UNO', 'NEO', 'MMA', 'RTS']);
    const norm = s => String(s).toLowerCase().replace(/['’`]/g, '').replace(/[^a-zа-яё0-9]+/gi, ' ').trim();
    const words = s => norm(s).split(' ').filter(Boolean);
    // Сверка «наша игра ↔ что нашёл IGDB» без ложных тревог: римские цифры = арабские, слова издания с нашей стороны
    // не в счёт, сокращения и слитное написание сворачиваются («gta» = grand theft auto, «farcry» = far cry)
    const ROM = { i: '1', ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8', ix: '9', x: '10' };
    const wn = s => words(s).map(w => ROM[w] || w);
    const EDW = new Set(['edition', 'deluxe', 'ultimate', 'gold', 'standard', 'digital', 'premium', 'bundle', 'cross', 'gen', 'definitive', 'goty', 'complete', 'collection', 'the', 'of', 'a', 'and', 'game', 'year', 'remastered']);
    const fold = (miss, extra) => {
      for (const m of miss) for (let i = 0; i < extra.length; i++) for (let k = i + 2; k <= extra.length; k++) {
        const seg = extra.slice(i, k);
        if (seg.join('') === m || seg.map(w => w[0]).join('') === m) { miss.splice(miss.indexOf(m), 1); extra.splice(i, k - i); return fold(miss, extra); }
      }
    };
    const out = { n: games.length, titles: [], caps: [], dups: [], noDesc: [], covers: [] };

    // ── Названия ──
    for (const g of games) {
      const t = g.title || '', why = [];
      if (t !== t.trim()) why.push('пробел в начале/конце');
      if (/\s{2,}/.test(t)) why.push('двойной пробел');
      if (/\s(for|and|of|the|&|-|with)$/i.test(t.trim())) why.push('висячее слово в конце');
      if (/\bversion$/i.test(t.trim())) why.push('хвост «Version»');
      if (/\d\s+-\s+\d/.test(t)) why.push('«N - M» с пробелами вокруг дефиса');
      if (/\((CUSA|PPSA)\d+\)/i.test(t)) why.push('код PS Store в названии');
      const caps = t.split(/[\s:–—\-]+/).filter(w => /^[A-ZА-ЯЁ]{4,}$/.test(w.replace(/[®™:!?.,']/g, '')) && !ACR.has(w.replace(/[®™:!?.,']/g, '')));
      // капслок часто официальный (EA SPORTS, TEKKEN, HITMAN) — отдельным списком, решает человек
      if (caps.length) out.caps.push({ id: g.id, title: t, caps: caps.join(' ') });
      if (/\b(ultimate|deluxe|gold|premium|complete|definitive)\s*$/i.test(t.trim()) && !/digital deluxe\s*$/i.test(t.trim())) why.push('издание без слова Edition');
      if (why.length) out.titles.push({ id: g.id, title: t, why, fix: _displayTitle(t) });
    }

    // ── Дубли: одинаковое очищенное название ──
    const by = {};
    for (const g of games) (by[norm(_displayTitle(g.title))] = by[norm(_displayTitle(g.title))] || []).push(g);
    for (const k in by) if (by[k].length > 1) out.dups.push(by[k].map(g => ({ id: g.id, title: g.title, price: g.priceRUB })));

    // ── Описания ──
    for (const g of games) { const d = (g.description || '').trim(); if (d.length < 40) out.noDesc.push({ id: g.id, title: g.title, len: d.length }); }

    // ── Обложки: размер лёгкой обложки + что даст HD-апгрейд сторис/коллажа ──
    const imgW = url => new Promise(res => { if (!url) return res(0); const im = new Image(); im.crossOrigin = 'anonymous'; const t = setTimeout(() => res(-1), 20000); im.onload = () => { clearTimeout(t); res(im.naturalWidth); }; im.onerror = () => { clearTimeout(t); res(-1); }; im.src = url; });
    // IGDB режет частоту запросов: сбой/429/5xx — пауза и повтор, итог пишем в отчёт, а не выдаём за «не найдено»
    const igdb = async q => {
      let last = null;
      for (let a = 0; a < 4; a++) {
        try {
          const r = await fetch(`${API}/igdb/cover?name=${encodeURIComponent(q)}`), txt = await r.text();
          let j = null; try { j = JSON.parse(txt); } catch (e) {}
          if (r.ok && j && !j.error) return j;
          last = { error: (j && j.error) || ('HTTP ' + r.status + ' ' + txt.slice(0, 60)) };
        } catch (e) { last = { error: e.message }; }
        await new Promise(r => setTimeout(r, 1500 * (a + 1)));
      }
      return last;
    };
    const one = async g => {
      const dt = _displayTitle(g.title), src = g.icon || g.featuredImg || '';
      const q1 = _cleanConsoleTitle(dt), q2 = _cleanEditionTitle(dt), tries = [];
      let hd = null;
      for (const q of [q1, (q2 && q2 !== q1) ? q2 : null]) {
        if (!q) continue; const j = await igdb(q); tries.push({ q, conf: j && j.confidence, matched: j && j.matched, error: j && j.error, cover: !!(j && j.cover) });
        if (_hdAccept(q, j)) { hd ={ q, conf: j.confidence, matched: j.matched, cover: j.cover }; break; }
      }
      const w = await imgW(_safeImgUrl(_igdbOriginal(src)));
      // Чужая: HD принят, но найденная игра по словам не совпадает с нашей (лишние слова — другая игра/DLC/сборник)
      let alien = null;
      if (hd && hd.matched) {
        const our = wn(hd.q), their = wn(hd.matched);
        const extra = their.filter(x => !our.includes(x)), miss = our.filter(x => !their.includes(x) && !EDW.has(x));
        fold(miss, extra);
        if (miss.length || extra.length >= 2) alien = { extra, miss };
      }
      return { id: g.id, title: g.title, dt, src, w, hd, tries, alien };
    };
    const queue = [...games], res = [];
    await Promise.all(Array.from({ length: 2 }, async () => { while (queue.length) { const g = queue.shift(); res.push(await one(g)); } }));
    out.covers = res;
    return out;
  }, BLUR_W);

  await br.close(); srv.close();

  // ── Отчёт ──
  const date = process.env.AUDIT_DATE || new Date().toISOString().slice(0, 10);
  const cell = s => String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const tbl = (head, rows) => rows.length ? ['| ' + head.join(' | ') + ' |', '|' + head.map(() => '---').join('|') + '|', ...rows.map(r => '| ' + r.map(cell).join(' | ') + ' |')].join('\n') : '_нет_';
  const cv = res.covers;
  // Разбор расхождений: что из них правда чужая обложка, а что — та же игра под полным названием
  const EDW = /^(edition|deluxe|ultimate|gold|standard|digital|premium|bundle|cross|gen|definitive|complete|collection)$/;
  const DLC = /\b(skin|pack|costume|outfit|dlc|soundtrack|season pass|expansion|add-on|upgrade)\b/i;
  const kindOf = c => {
    const { extra, miss } = c.alien, m = c.hd.matched, ourN = c.hd.q.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (DLC.test(m)) return 'чужая: дополнение или скин';
    if (miss.length) return 'чужая: нет наших слов';
    if (extra.every(w => EDW.test(w))) return 'другое издание той же игры';
    const mN = m.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (mN.startsWith(ourN) && /^[:\-–]/.test(m.slice(c.hd.q.replace(/\s+$/, '').length).trim())) return 'подзаголовок той же игры';
    if (mN.endsWith(ourN.replace(/ (ultimate|deluxe|gold) edition$/, '')) || mN.includes(' ' + ourN)) return 'издатель в начале названия';
    return 'чужая: лишние слова';
  };
  cv.filter(c => c.alien).forEach(c => c.kind = kindOf(c));
  const alien = cv.filter(c => c.alien && c.kind.startsWith('чужая')), alienOk = cv.filter(c => c.alien && !c.kind.startsWith('чужая'));
  const blurry = cv.filter(c => !c.hd && c.w > 0 && c.w < BLUR_W);
  const broken = cv.filter(c => c.w <= 0);
  const ierr = cv.reduce((n, c) => n + c.tries.filter(t => t.error).length, 0);
  const candidate = c => {
    // кандидат — то, что выдал бы вкладке IGDB пикера второй запрос; если и он мимо — только руками
    const alt = c.tries.find(t => t.matched && (!c.hd || t.q !== c.hd.q));
    return alt ? `IGDB по «${alt.q}» → ${alt.matched} (${alt.conf})` : 'подобрать руками: вкладка PS Store пикера (нужен токен) или файл';
  };
  const md = `# Аудит каталога — ${date}

Снапшот \`api.poigraem.shop/db/snapshot\`: **${res.n} игр**. Скрипт: \`node tools/catalog-audit.js\` (перезапускаемый, ничего не меняет).
Обложки сверены той же логикой, что HD-апгрейд сторис и коллажа (\`_hdCoverUrl\`). Порог «мыльной» обложки — ширина
лёгкой обложки меньше ${BLUR_W}px **и** HD из IGDB не нашёлся (иначе сторис и коллаж её заменят). Правки БД магазина — не здесь:
это список для Дениса (или запросом в Claude1).

## Сводка

| Проблема | Сколько |
|---|---|
| Битые названия | ${res.titles.length} |
| Капслок (часто официальное написание — решить) | ${res.caps.length} |
| Группы дублей | ${res.dups.length} |
| Без описания (короче 40 символов) | ${res.noDesc.length} |
| Чужая HD-обложка (IGDB нашёл другую игру или DLC) | ${alien.length} |
| Расхождение с IGDB, похожее на ту же игру | ${alienOk.length} |
| Мыльная обложка без HD | ${blurry.length} |
| Обложка не грузится | ${broken.length} |
| Запросы к IGDB, не прошедшие и после повторов | ${ierr} |

## Битые названия

«Как покажет content-creator» — результат \`_displayTitle\`: в постах и сторис уже так, в магазине — нет.

${tbl(['id', 'Название в БД', 'Проблема', 'Как покажет content-creator'], res.titles.map(t => [t.id, '`' + t.title + '`', t.why.join('; '), t.fix]))}

## Капслок

Многие — официальное написание издателя (EA SPORTS, TEKKEN, HITMAN, STAR WARS). Править только явные: «FARCRY», «TOM CLANCY'S…».

${tbl(['id', 'Название в БД', 'Слова капслоком'], res.caps.map(c => [c.id, '`' + c.title + '`', c.caps]))}

## Дубли (одинаковое очищенное название)

${tbl(['Группа', 'id', 'Название в БД', 'Цена, ₽'], res.dups.flatMap((g, i) => g.map(x => [i + 1, x.id, '`' + x.title + '`', x.price])))}

## Без описания

${tbl(['id', 'Название', 'Длина описания'], res.noDesc.map(d => [d.id, d.title, d.len]))}

## Чужие обложки

HD-апгрейд принял обложку, но IGDB нашёл другую игру, дополнение или скин — в сторис и коллаж уедет чужая картинка.

${tbl(['id', 'Название', 'IGDB нашёл', 'Почему чужая', 'Предлагаемое'], alien.map(c => [c.id, c.dt, `${c.hd.matched} (${c.hd.conf})`, c.kind + ': ' + [...c.alien.miss.map(w => '−' + w), ...c.alien.extra.map(w => '+' + w)].join(' '), candidate(c)]))}

**Расхождения, похожие на ту же игру** (полное название, подзаголовок главы, другое издание) — справочно, глазами при случае:

${tbl(['id', 'Название', 'IGDB нашёл', 'Разбор'], alienOk.map(c => [c.id, c.dt, `${c.hd.matched} (${c.hd.conf})`, c.kind]))}

## Мыльные обложки

${tbl(['id', 'Название', 'Ширина, px', 'Почему нет HD', 'Предлагаемое'], blurry.map(c => [c.id, c.dt, c.w, c.tries.map(t => `«${t.q}» → ` + (t.error ? 'ошибка: ' + t.error : t.cover ? `${t.matched} (${t.conf}, не принят)` : 'не найдено')).join('; ') || 'не искали', candidate(c)]))}

## Обложка не грузится

${tbl(['id', 'Название', 'Адрес'], broken.map(c => [c.id, c.dt, c.src ? c.src.slice(0, 90) : '(пусто)']))}
`;
  fs.writeFileSync(OUT, md);
  console.log(`Отчёт: ${OUT}\nназвания ${res.titles.length}, дубли ${res.dups.length}, без описания ${res.noDesc.length}, чужие ${alien.length}, мыльные ${blurry.length}, не грузятся ${broken.length}`);
  fs.writeFileSync(path.join(os.tmpdir(), 'cc-catalog-audit.json'), JSON.stringify(res, null, 1));
})().catch(e => { console.error('AUDIT CRASH', e); srv.close(); process.exit(2); });
