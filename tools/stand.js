#!/usr/bin/env node
// Стенд content-creator: headless Chrome на живом снапшоте и живых обложках; Claude, отправка в канал,
// очередь бота и журнал — заглушки (ничего не публикуется, запросы записываются для проверок).
//
// Установка (один раз):  cd tools && npm install
// Запуск:                node tools/stand.js
// Рендеры и экспорт — в %TEMP%/cc-stand (или STAND_OUT), Chrome — системный (или CHROME).
//
// Живые данные качает сам Chrome, а не node: на машине Дениса node до api.poigraem.shop не достаёт
// (таймаут), поэтому CORS снят флагом запуска. Цена этого — таинт канваса стенд не ловит.
// Первой стоит проверка «смена шаблона меняет кадр»: если она провалена, остальным результатам верить нельзя
// (так было в сессии 66 — заглушки без CORS дали ровную картину «не работает ничего»).
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const puppeteer = require('puppeteer-core');
const SRC = process.env.STAND_SRC || path.join(__dirname, '..', 'content-creator.html'); // STAND_SRC — прогнать другую версию файла
const OUT = process.env.STAND_OUT || path.join(os.tmpdir(), 'cc-stand'); fs.mkdirSync(OUT, { recursive: true });
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 8765;
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };
const results = []; const ok = (name, pass, info = '') => { results.push({ name, pass, info }); console.log((pass ? 'PASS ' : 'FAIL ') + name + (info ? ' — ' + info : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const posted = {};
const claudeQ = [];   // ответы-заглушки Claude по очереди (текст модели); очередь пуста — 500
const igdbCover = []; // какие названия приложение искало в IGDB за HD-обложкой
let tgPostFail = false; // /api/tg-post отвечает как упавший nginx: 502 и HTML вместо JSON
let tgPostFmt = null;   // /api/tg-post сообщает, каким parse_mode ушёл пост (новый бэкенд — 'html'; старый поля не знает)
// Проверка, которую нельзя провести на текущем каталоге (нет двойников PS4/PS5) — не FAIL, а пропуск с причиной
const skipped = []; const skip = (name, why) => { skipped.push(name); console.log('SKIP ' + name + ' — ' + why); };

const srv = http.createServer((q, s) => { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); fs.createReadStream(SRC).pipe(s); }).listen(PORT);

(async () => {
  const br = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-web-security', '--user-data-dir=' + path.join(OUT, '.profile')] });
  const p = await br.newPage(); await p.setViewport({ width: 1400, height: 1000 });
  const jsErr = []; p.on('pageerror', e => jsErr.push(e.message));
  await p.setRequestInterception(true);
  p.on('request', r => {
    const u = r.url();
    if (!u.startsWith('https://api.poigraem.shop')) return r.continue();
    if (r.method() === 'OPTIONS') return r.respond({ status: 204, headers: CORS });
    const pth = new URL(u).pathname;
    if (pth === '/igdb/cover') igdbCover.push(new URL(u).searchParams.get('name'));
    // Обложка-заглушка с задержкой для проверок гонок: /stand-img/<цвет>?ms=<задержка>; цвет fail — 404
    if (pth.startsWith('/stand-img/')) {
      const c = pth.split('/')[2], ms = +new URL(u).searchParams.get('ms') || 0;
      if (c === 'fail') return void setTimeout(() => r.respond({ status: 404, headers: CORS, contentType: 'text/plain', body: 'no' }).catch(() => {}), ms);
      return void setTimeout(() => r.respond({ status: 200, headers: CORS, contentType: 'image/svg+xml',
        body: `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="${c}"/></svg>` }).catch(() => {}), ms);
    }
    if (pth === '/api/tg-post' && tgPostFail) {
      (posted[pth] = posted[pth] || []).push(r.postData() || '');
      return r.respond({ status: 502, headers: CORS, contentType: 'text/html', body: '<html><body>502 Bad Gateway</body></html>' });
    }
    if (/^\/(api\/(claude|tg-post|cc-queue)|cc\/journal)/.test(pth)) {
      (posted[pth] = posted[pth] || []).push(r.postData() || '');
      // Claude сломан нарочно: пост обязан собираться из описаний снапшота и без него.
      // Проверки Б-1/Б-2 кладут в claudeQ ответ модели на один запрос.
      if (pth === '/api/claude') {
        if (!claudeQ.length) return r.respond({ status: 500, headers: CORS, contentType: 'application/json', body: '{"error":"stub"}' });
        const it = claudeQ.shift(), text = typeof it === 'function' ? it(JSON.parse(r.postData() || '{}')) : it; // функция — ответ по тексту запроса
        return r.respond({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text }] }) });
      }
      return r.respond({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(Object.assign({ ok: true, draftId: 'stand1' }, pth === '/api/tg-post' && tgPostFmt ? { format: tgPostFmt } : {})) });
    }
    r.continue();
  });
  await p.evaluateOnNewDocument(() => {
    localStorage.setItem('cc_admin_token', 'stand-token');
    let s = 12345; Math.random = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296); // зерно и id — воспроизводимо
    window.__dl = []; const oc = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { if (this.download) { window.__dl.push({ name: this.download, href: this.href }); return; } return oc.call(this); };
  });
  await p.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle0', timeout: 90000 });
  await p.waitForFunction(() => typeof games !== 'undefined' && games.length > 50, { timeout: 60000 });
  const nGames = await p.evaluate(() => games.length); ok('снапшот загружен', nGames > 50, nGames + ' игр');

  await p.evaluate(() => {
    // __snapS — кадр, уменьшенный в 6 раз: после «Целиком» Chrome рисует первый кадр с рябью пересэмплирования
    // (до ~5% пикселей, глазом не видно), на уменьшенном она усредняется, а настоящая разница остаётся
    window.__snapS = id => { const c = document.getElementById(id), k = document.createElement('canvas'); k.width = Math.round(c.width / 6); k.height = Math.round(c.height / 6); const x = k.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(c, 0, 0, k.width, k.height); return { w: k.width, h: k.height, d: x.getImageData(0, 0, k.width, k.height).data.slice() }; };
    window.__snapC = (c, w, h) => { const k = document.createElement('canvas'); k.width = w || c.width; k.height = h || c.height; const x = k.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(c, 0, 0, k.width, k.height); return { w: k.width, h: k.height, d: x.getImageData(0, 0, k.width, k.height).data.slice() }; };
    window.__snap = id => __snapC(document.getElementById(id));
    window.__crop = (a, fx0, fy0, fx1, fy1) => { const x0 = Math.round(a.w * fx0), y0 = Math.round(a.h * fy0), w = Math.round(a.w * fx1) - x0, h = Math.round(a.h * fy1) - y0, d = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) d.set(a.d.subarray(((y0 + y) * a.w + x0) * 4, ((y0 + y) * a.w + x0 + w) * 4), y * w * 4); return { w, h, d }; };
    window.__diff = (a, b) => { if (a.w !== b.w || a.h !== b.h) return 100; let n = 0; for (let i = 0; i < a.d.length; i += 4) if (Math.abs(a.d[i] - b.d[i]) + Math.abs(a.d[i + 1] - b.d[i + 1]) + Math.abs(a.d[i + 2] - b.d[i + 2]) > 24) n++; return +(100 * n / (a.d.length / 4)).toFixed(2); };
    window.__toast = () => document.getElementById('toast').textContent;
    window.__sel = n => { games.forEach(g => g._sel = false); const pick = games.filter(g => g.priceRUB && g.description).slice(0, n); pick.forEach(g => g._sel = true); return pick.map(g => g.title); };
    window.__img = async href => { const im = new Image(); im.src = href; await im.decode(); return im; };
    // n — каждый раз новый адрес: из кэша картинка приехала бы сразу, и гонки бы не было
    let n = 0; window.__slowImg = (c, ms) => `https://api.poigraem.shop/stand-img/${c}?ms=${ms}&n=${++n}`;
    window.__col = im => ((im && im.src || '').match(/stand-img\/(\w+)/) || [])[1] || null; // цвет заглушки в imgEl
    window.__wait = ms => new Promise(r => setTimeout(r, ms));
    // Своя реализация normalizeKey магазина (js/utils.js:287) — эталон, с которым сверяется копия в приложении
    window.__nk = s => String(s || '').replace(/[‘’‚‛′‵`]/g, "'").replace(/[™®©]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
    window.__enc = s => encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
    // Двойники из живого каталога: группы игр с одним названием и разными платформами (у каждой цена и описание).
    // Без хардкода конкретных игр — каталог меняется раз в две недели. __tw — первая пара, __tw2 — вторая (если есть)
    window.__twGroups = () => { const by = {}; games.forEach(g => { if (!g._custom && g.id != null && g._platform && g.priceRUB && g.description) (by[__nk(_displayTitle(g.title))] = by[__nk(_displayTitle(g.title))] || []).push(g); });
      return Object.values(by).map(l => l.filter((g, i) => l.findIndex(x => x._platform === g._platform) === i)).filter(l => l.length > 1).map(l => l.slice(0, 2)); };
  });
  // Пары двойников живого каталога: от них зависят проверки ссылок t/p, метки платформы, QR и батча
  const twN = await p.evaluate(() => { const gr = __twGroups(); window.__tw = gr[0] || []; window.__tw2 = gr[1] || []; return gr.length; });
  const TW = twN > 0;
  if (!TW) console.log('ВНИМАНИЕ: в каталоге нет двойников PS4/PS5 — проверки с двойниками будут пропущены');
  // jsQR — декодер QR в странице: сверяем, что код на картинке читается и ведёт ровно туда, куда ссылка в посте
  await p.addScriptTag({ content: fs.readFileSync(require.resolve('jsqr/dist/jsQR.js'), 'utf8') });
  const shot = async (id, name) => { const b64 = await p.evaluate(id => document.getElementById(id).toDataURL('image/png').split(',')[1], id); fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(b64, 'base64')); };
  const saveDl = async name => { const b64 = await p.evaluate(() => __dl[0] && __dl[0].href.split(',')[1]); if (b64) fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(b64, 'base64')); };

  // ── Названия ───────────────────────────────────────────────
  const dt = await p.evaluate(() => ['NBA 2K26 for', 'Game for PS5', 'Wolfenstein® II: The New Colossus™ (CUSA07378)', 'Far Cry 6 PS4 & PS5'].map(s => [s, _displayTitle(s)]));
  ok('_displayTitle: висячий for', dt[0][1] === 'NBA 2K26' && dt[1][1] === 'Game', JSON.stringify(dt));
  const dangling = await p.evaluate(() => games.map(g => _displayTitle(g.title)).filter(t => /\s(for|and|of|the|&|-)$/i.test(t)));
  ok('_displayTitle: висячих хвостов по каталогу нет', dangling.length === 0, dangling.join(' | '));
  // HD из IGDB: low-ответ с дополнением (скин, пак, сезонный абонемент) — не наша игра; «EA Sports UFC 6» на «UFC 6» — наша
  const lm = await p.evaluate(() => [['Batman: Arkham Knight', 'Batman: Arkham Knight - Batman: Noel Skin'], ['UFC 6', 'EA Sports UFC 6'],
    ['Crash Bandicoot N. Sane Trilogy', 'Crash Bandicoot N. Sane Trilogy'], ['DOOM Soundtrack', 'DOOM Soundtrack Vol. 1'], ['Fallout 4', 'Fallout 4: Season Pass'], ['Game X', 'Game X Add-On: Y']].map(([q, m]) => _lowMatchOk(q, m)));
  ok('_lowMatchOk: дополнения не проходят, если их нет в запросе', lm.join() === 'false,true,true,true,false,false', lm.join());
  // ответ модели строкой — не описания по буквам
  const abi = await p.evaluate(() => JSON.stringify([_aiByIndex('Отличная игра'), _aiByIndex(['a', 'b']), _aiByIndex(null)]));
  ok('_aiByIndex: строка → пусто, массив → нумерация с 1', abi === '[{},{"1":"a","2":"b"},{}]', abi);
  // Ссылка на игру переживает замену каталога: кроме id — t (normalizeKey названия, как js/utils.js:287 магазина) и p (платформа)
  const nk = await p.evaluate(() => typeof _normKey === 'function' ? ['Gran Turismo™ 7 ', 'Tony Hawk’s™ Pro   Skater', 'DOOM 3: VR Edition', 'It`s ‘X’'].map(_normKey) : null);
  ok('normalizeKey как в магазине: ™®© прочь, кривые апострофы → \', пробелы схлопнуты, нижний регистр',
    JSON.stringify(nk) === JSON.stringify(['gran turismo 7', "tony hawk's pro skater", 'doom 3: vr edition', "it's 'x'"]), JSON.stringify(nk));
  if (TW) {
    const gu = await p.evaluate(() => __tw.map(g => {
      const u = new URL(_stGameUrl(g)); return { id: String(g.id), game: u.searchParams.get('game'), t: u.searchParams.get('t'), p: u.searchParams.get('p'), plat: g._platform, nk: __nk(g.title), raw: _stGameUrl(g) }; }));
    ok('ссылка на игру: ?game=<id>&t=<normalizeKey>&p=<платформа> (пара двойников из каталога)', gu.length === 2 && gu.every(x => x.game === x.id && x.t === x.nk && x.p === x.plat)
      && gu[0].p !== gu[1].p && gu[0].t === gu[1].t && gu.every(x => !/[()' ]/.test(x.raw)), JSON.stringify(gu.map(x => x.raw)));
  } else skip('ссылка на игру у пары двойников', 'нет двойников');
  // По всему каталогу: t — эталонный normalizeKey (__nk, не копия приложения), ( ) ' и пробел закодированы — иначе Markdown-ссылка [..](url) рвётся на «)»
  const guAll = await p.evaluate(() => games.filter(g => g.id != null).map(g => { const raw = _stGameUrl(g), u = new URL(raw);
    return (u.searchParams.get('t') === __nk(g.title) && u.searchParams.get('p') === (g._platform || null) && !/[()' ]/.test(raw)) ? null : raw; }).filter(Boolean));
  ok('ссылки всего каталога: t и p раскодируются верно, ( ) \' и пробел закодированы', guAll.length === 0, guAll.slice(0, 3).join(' | '));
  // Ссылка не берётся из чужого поля url (оно может прийти в снапшоте); готовый ключ сервера g.key — берётся; кэш адреса сбрасывается при смене данных
  const gk = await p.evaluate(() => {
    const src = games.find(g => g.id != null && !g._custom), g = { ...src, url: 'https://evil.example/' };
    const a = _stGameUrl(g); const k = { ...src, key: 'ключ сервера' }; const b = _stGameUrl(k);
    const c = { ...src }; const c1 = _stGameUrl(c); c.id = 'NEWID'; const c2 = _stGameUrl(c);
    return { a, b, c1, c2, src: _stGameUrl(src) };
  });
  ok('ссылка: поле url игры не подменяет адрес, g.key сервера идёт в t, кэш сбрасывается при смене id',
    gk.a === gk.src && gk.a.startsWith('https://poigraem.shop/?game=') && /[?&]t=%D0%BA%D0%BB%D1%8E%D1%87%20%D1%81%D0%B5%D1%80%D0%B2%D0%B5%D1%80%D0%B0(&|$)/.test(gk.b)
    && gk.c1 === gk.src && /[?&]game=NEWID&/.test(gk.c2), JSON.stringify(gk));
  // Markdown для канала (пока сервер не подтвердил HTML): текст экранирован, [ ] в метке — круглые, «)» и пробел в адресе закодированы;
  // _mdLinksToHtml экранирует кавычку в href
  const mdq = await p.evaluate(() => {
    const d = document.createElement('div'); d.innerHTML = '<a href="https://x.example/?a=1&amp;b=(2) 3">Игра [X]_y</a> текст_с*звёздой';
    return { md: typeof _escMd === 'function' ? _outSerialize('md', d) : null, html: _mdLinksToHtml('[x](https://a.example/?q="y)') };
  });
  ok('Markdown для канала: экранирование текста, [ ] в метке, «)» и пробел в адресе; кавычка в href из шапки',
    mdq.md === '[Игра (X)_y](https://x.example/?a=1&b=%282%29%203) текст\\_с\\*звёздой' && mdq.html.includes('href="https://a.example/?q=&quot;y"'), JSON.stringify(mdq));

  // ── Сторис ─────────────────────────────────────────────────
  await p.evaluate(() => __sel(6)); await p.evaluate(() => openStory());
  const t46 = await p.evaluate(() => __toast());
  ok('аудит 46: тост про первые 5', /доступны первые 5 игр \(в кадре одновременно до 3\)/.test(t46), t46);
  await sleep(15000); // HD-обложки из IGDB
  // Б-4: в кадре до 3 игр — HD из IGDB ищется только для них, 4-я и 5-я остаются на лёгкой обложке
  const hd = await p.evaluate(asked => {
    const q = t => [_cleanConsoleTitle(t), _cleanEditionTitle(t)];
    return { n: _stG.length, top: _stG.slice(0, 3).map(g => !!g._hdDone), rest: _stG.slice(3).map(g => !!g._hdDone),
             restAsked: _stG.slice(3).filter(g => q(g.title).some(x => x && asked.includes(x))).map(g => g.title), asked: asked.length };
  }, igdbCover);
  ok('Б-4: HD из IGDB только у первых 3 слотов', hd.n === 5 && hd.top.every(Boolean) && !hd.rest.some(Boolean) && !hd.restAsked.length, JSON.stringify(hd));
  await p.evaluate(() => _stSetMode('templates'));
  const ctl = await p.evaluate(() => { _stSetTpl('poster'); const a = __snap('st-canvas'); _stSetTpl('neon'); const b = __snap('st-canvas'); return __diff(a, b); });
  ok('КОНТРОЛЬ: смена шаблона меняет кадр', ctl > 5, ctl + '%');
  if (ctl <= 5) console.log('!!! контроль провален — результатам ниже верить нельзя');
  const noise = await p.evaluate(() => _ST_TPLS.map(t => { _stSetTpl(t.id); const a = __snap('st-canvas'); _stRenderTemplate(); return t.id + ':' + __diff(a, __snap('st-canvas')); }));
  ok('повторная отрисовка совпадает попиксельно', noise.every(s => s.endsWith(':0')), noise.join(' '));

  // Неон и «Целиком» во всех шаблонах, 1 и 3 игры
  const tpls = await p.evaluate(() => _ST_TPLS.map(t => t.id));
  for (const n of [1, 3]) {
    await p.evaluate(n => stSetGameCount(n), n);
    for (const t of tpls) {
      const r = await p.evaluate(t => {
        _stSetFit('cover'); _stSetNeon(false); _stSetTpl(t); const base = __snap('st-canvas'), baseS = __snapS('st-canvas');
        _stSetNeon(true); const neon = __snap('st-canvas');
        _stSetNeonColor('#ff2bd6'); const pink = __snap('st-canvas'); _stSetNeonColor('#00dcc3');
        _stSetNeon(false); _stSetFit('contain'); const cont = __snap('st-canvas'); _stSetFit('cover');
        return { neon: __diff(base, neon), color: __diff(neon, pink), fit: __diff(base, cont), back: __diff(baseS, __snapS('st-canvas')) };
      }, t);
      // «Веер»: карточка 3:4 как обложка — «Целиком» почти не меняет кадр; «Неон»: свечение встроено, кнопка меняет только цвет.
      // Порог отката 0.75: у «Веера» с крупной детальной обложкой рябь доходит до ~0.6 и на уменьшенном кадре
      const pass = r.back < 0.75 && r.color > 0.2 && (t === 'neon' || r.neon > 0.2) && r.fit > (t === 'fan' || t === 'neon' ? 0.5 : 5);
      ok(`сторис n=${n} ${t}: неон, цвет, «Целиком», откат`, pass, JSON.stringify(r));
      await p.evaluate(() => { _stSetNeon(true); _stSetFit('contain'); }); await shot('st-canvas', `story-n${n}-${t}-neon-contain`);
      await p.evaluate(() => { _stSetNeon(false); _stSetFit('cover'); }); await shot('st-canvas', `story-n${n}-${t}-plain`);
    }
  }
  const neonMulti = await p.evaluate(() => { _stSetTpl('neon'); stSetGameCount(1); const a = __snap('st-canvas'); stSetGameCount(3); return __diff(a, __snap('st-canvas')); });
  ok('аудит 46: «Неон» n=3 показывает мини-обложки', neonMulti > 1, neonMulti + '%');

  // Неон обложки во весь кадр: под QR, а не поверх; нижняя кромка — над безопасной зоной TG
  for (const t of ['poster', 'diag', 'horizon']) {
    const r = await p.evaluate(t => {
      stSetGameCount(1); _stSetPlatform('tg'); _stSetFit('cover'); _stSetTpl(t); _stSetNeon(false); const off = __snap('st-canvas');
      _stSetNeon(true); const on = __snap('st-canvas'); _stSetNeon(false);
      const ch = off.h, floor = 1 - _stSafeB(ch) / ch;
      // QR — правый нижний угол над безопасной зоной; берём его середину, без кромки
      return { qr: __diff(__crop(off, .87, floor - .12, .95, floor - .04), __crop(on, .87, floor - .12, .95, floor - .04)),
               // левая кромка у самого низа — там «Постер» и «Горизонт» затемняют, а «Диагональ» кладёт клин
               edge: __diff(__crop(off, 0, floor - .12, .03, floor - .02), __crop(on, 0, floor - .12, .03, floor - .02)),
               safe: __diff(__crop(off, .1, floor + .03, .9, 1), __crop(on, .1, floor + .03, .9, 1)) };
    }, t);
    // qr — справочно: свечение у края до середины кода не дотягивалось и до правки, падать здесь нечему
    ok(`неон во весь кадр (${t}): кромка над зоной TG и видна под затемнением`, r.safe < 1 && r.edge > 20, JSON.stringify(r));
  }

  // Нижние карточки «Карточек» и «Героя» доходят до края кадра — их рамку над зоной TG не поднимаем
  for (const t of ['cards', 'hero']) {
    const r = await p.evaluate(t => {
      stSetGameCount(3); _stSetPlatform('tg'); _stSetFit('cover'); _stSetTpl(t); _stSetNeon(false); const off = __snap('st-canvas');
      _stSetNeon(true); const on = __snap('st-canvas'); _stSetNeon(false);
      // левая кромка внутри зоны TG: рамка нижней карточки обязана туда доходить
      return { inSafe: __diff(__crop(off, 0, .9, .03, .99), __crop(on, 0, .9, .03, .99)) };
    }, t);
    ok(`неон нижней карточки (${t}, n=3): рамка доходит до низа`, r.inSafe > 20, JSON.stringify(r));
  }

  // Экспорт сторис
  await p.evaluate(() => { stSetGameCount(3); window.__dl = []; _stSetTpl('fan'); _stSetNeon(true); _stSetFit('contain'); downloadStory(); });
  await p.waitForFunction(() => __dl.length > 0, { timeout: 30000 }).catch(() => {});
  const stDl = await p.evaluate(async () => { const d = __dl[0]; if (!d) return null; const im = await __img(d.href); return { w: im.naturalWidth, h: im.naturalHeight }; });
  ok('экспорт сторис 1080×1920', stDl && stDl.w === 1080 && stDl.h === 1920, JSON.stringify(stDl)); await saveDl('export-story-fan');

  // Пресеты бренда: свежий пресет без неона гасит неон, включённый другим пресетом; старый (без _v) — не трогает
  const brand = await p.evaluate(() => {
    const late = [...BRAND_KEYS_LATE], pr = window.prompt;
    late.forEach(k => localStorage.removeItem(k)); _stNeonOn = false; _stNeonColor = CC_NEON_DEFAULT;
    window.prompt = () => 'stand-plain'; brandSaveCurrent();
    _stSetNeon(true); _stSetNeonColor('#ff2bd6'); window.prompt = () => 'stand-pink'; brandSaveCurrent();
    brandApply('stand-plain'); const fresh = { neon: _stNeonOn, color: _stNeonColor };
    brandApply('stand-pink'); const pink = { neon: _stNeonOn, color: _stNeonColor };
    const all = _brandList(); all['stand-old'] = { tg_header: 'old' }; localStorage.setItem('cc_brand_presets', JSON.stringify(all));
    brandApply('stand-old'); const old = { neon: _stNeonOn, color: _stNeonColor };
    const rest = _brandList(); ['stand-plain', 'stand-pink', 'stand-old'].forEach(n => delete rest[n]); localStorage.setItem('cc_brand_presets', JSON.stringify(rest));
    window.prompt = pr; _stSetNeon(false); _stSetNeonColor(CC_NEON_DEFAULT);
    return { fresh, pink, old };
  });
  ok('пресет бренда: свежий без неона гасит неон и цвет', !brand.fresh.neon && brand.fresh.color === '#00dcc3', JSON.stringify(brand.fresh));
  ok('пресет бренда: пресет с неоном его включает', brand.pink.neon && brand.pink.color === '#ff2bd6', JSON.stringify(brand.pink));
  ok('пресет бренда: старый пресет неон не сбрасывает', brand.old.neon && brand.old.color === '#ff2bd6', JSON.stringify(brand.old));
  await p.evaluate(() => _stSetFit('cover'));

  // QR на карточку игры: код в правом нижнем углу над зоной TG, чёрно-белый (сканируемый), а не пустое место
  const qr = await p.evaluate(async () => {
    stSetGameCount(1); _stSetPlatform('tg'); _stSetNeon(false); _stSetTpl('poster');
    _stSetQrOn(false); const off = __snap('st-canvas');
    _stSetQrOn(true); await _stQrEnsure(_stG.slice(0, 1)); _stRenderTemplate(); const on = __snap('st-canvas');
    // середина кода по геометрии _stCornerQr — без белой подложки и фона вокруг
    const cw = on.w, ch = on.h, s = Math.round(Math.min(cw, ch) * .115), pd = Math.round(Math.min(cw, ch) * .03), x0 = cw - pd - s, y0 = _stFloor(ch) - pd - s;
    const box = [(x0 + s * .15) / cw, (y0 + s * .15) / ch, (x0 + s * .85) / cw, (y0 + s * .85) / ch], c = __crop(on, ...box);
    let dk = 0, lt = 0; for (let i = 0; i < c.d.length; i += 4) { const l = (c.d[i] + c.d[i + 1] + c.d[i + 2]) / 3; if (l < 70) dk++; else if (l > 190) lt++; }
    const pct = n => Math.round(100 * n / (c.d.length / 4));
    return { diff: __diff(__crop(off, ...box), c), dark: pct(dk), light: pct(lt), miss: _stQrMissing(_stG.slice(0, 1)) };
  });
  // и чёрного, и белого заметно: пустая белая подложка без кода не пройдёт (проверено на копии без drawImage)
  ok('QR на сторис: код в углу над зоной TG, чёрно-белый', qr.miss === 0 && qr.diff > 30 && qr.dark > 15 && qr.light > 15 && qr.dark + qr.light > 70, JSON.stringify(qr)); await shot('st-canvas', 'story-qr-poster');

  // Авто-контраст: заголовок на светлой обложке тёмный, на тёмной — белый; «Затемнение» и полоса под заголовком учтены
  const lc = await p.evaluate(async () => {
    const mk = async (h, paint) => { const c = document.createElement('canvas'); c.width = 40; c.height = h; paint(c.getContext('2d')); return __img(c.toDataURL()); };
    const white = await mk(60, x => { x.fillStyle = '#f4f4f4'; x.fillRect(0, 0, 40, 60); });
    const black = await mk(60, x => { x.fillStyle = '#101010'; x.fillRect(0, 0, 40, 60); });
    const band = await mk(100, x => { x.fillStyle = '#101010'; x.fillRect(0, 0, 40, 100); x.fillStyle = '#f4f4f4'; x.fillRect(0, 36, 40, 16); });
    const bak = [_stImgFilter, _stImgFilterAmt];
    _stImgFilter = 'none'; const r = { white: _stTextIsDark(white), black: _stTextIsDark(black), band: _stTextIsDark(band, .36, .52), bandWhole: _stTextIsDark(band) };
    _stImgFilter = 'dark'; _stImgFilterAmt = 1; r.whiteDarkened = _stTextIsDark(white);
    [_stImgFilter, _stImgFilterAmt] = bak; return r;
  });
  ok('авто-контраст: светлая → тёмный текст, тёмная → белый, затемнение и полоса учтены', lc.white && !lc.black && lc.band && !lc.bandWhole && !lc.whiteDarkened, JSON.stringify(lc));

  // Шрифт: Oswald вшит и рисует кириллицу (без него канвас молча берёт запасной шрифт).
  // Признак — ширина строки не зависит от запасного шрифта: «Oswald, serif» = «Oswald, monospace».
  // Сравнивать с одним запасным нельзя: кириллица в monospace случайно почти той же ширины (286 против 290).
  const fo = await p.evaluate(async () => {
    await document.fonts.load("700 40px 'Oswald'", 'СКИДКА'); await document.fonts.load("700 40px 'Oswald'", 'SALE');
    const x = document.createElement('canvas').getContext('2d'), w = (f, s) => { x.font = f; return Math.round(x.measureText(s).width); };
    const m = s => [w(`700 40px 'Oswald', serif`, s), w(`700 40px 'Oswald', monospace`, s), w('700 40px serif', s)];
    return { cyr: m('СКИДКА НЕДЕЛИ'), lat: m('BIG SALE NOW') };
  });
  const osw = ([a, b, fb]) => a === b && Math.abs(a - fb) > 10;
  ok('шрифт Oswald рисует кириллицу и латиницу', osw(fo.cyr) && osw(fo.lat), JSON.stringify(fo));

  // Б-1: ответ модели для сторис маппится по номеру игры, а не по точному названию (ключи вразнобой)
  await p.evaluate(() => { stSetGameCount(3); window.__stDescBak = _stG.map(g => g.description); _stG.forEach(g => g.description = ''); _stShortDescs = {}; });
  claudeQ.push(JSON.stringify({ 3: 'КОРОТКО-3', 1: 'КОРОТКО-1', 2: 'КОРОТКО-2' }));
  await p.evaluate(() => _stGenShortDescs());
  const sd = await p.evaluate(() => _stG.slice(0, 3).map(g => _stShortDescs[g.title] || null));
  ok('Б-1 сторис: короткие описания — по номеру игры', sd.join() === 'КОРОТКО-1,КОРОТКО-2,КОРОТКО-3', JSON.stringify(sd));
  claudeQ.push('```json\n' + JSON.stringify({ 2: 'ПОДРОБНО-2', 1: 'ПОДРОБНО-1', 3: 'ПОДРОБНО-3' }) + '\n```');
  await p.evaluate(() => _stGenCaption());
  const cap = await p.evaluate(() => { const b = _stCapText.split('\n\n'); return b.length === 3 ? b.map((s, i) => s.includes(_stG[i].title) && s.includes('ПОДРОБНО-' + (i + 1))) : [_stCapText]; });
  ok('Б-1 сторис: текст к сторис — описание под своей игрой', cap.length === 3 && cap.every(x => x === true), JSON.stringify(cap));
  // Потери и странные ответы модели в сторис: честный «⚠️ без описания», массив вместо объекта, объект вместо строки
  claudeQ.push(JSON.stringify({ 1: 'КОРОТКО-1' }));
  await p.evaluate(() => { _stShortDescs = {}; return _stGenShortDescs(); });
  const sd7 = await p.evaluate(() => __toast());
  ok('сторис: потеряны короткие описания → «⚠️ … без описания: 2»', /⚠️.*без описания: 2/.test(sd7), sd7);
  claudeQ.push(JSON.stringify(['МАССИВ-1', 'МАССИВ-2', 'МАССИВ-3']));
  const sd9 = await p.evaluate(async () => { _stShortDescs = {}; await _stGenShortDescs(); return _stG.slice(0, 3).map(g => _stShortDescs[g.title] || null); });
  ok('сторис: ответ массивом раскладывается по играм без сдвига', sd9.join() === 'МАССИВ-1,МАССИВ-2,МАССИВ-3', JSON.stringify(sd9));
  claudeQ.push('Вот описания: не JSON');
  const cp7 = await p.evaluate(async () => { await _stGenCaption(); return __toast(); });
  ok('текст к сторис: битый JSON → «⚠️ … без описания: 3»', /⚠️.*без описания: 3/.test(cp7), cp7);
  claudeQ.push(JSON.stringify({ 1: { text: 'объект' }, 2: 'ПОДРОБНО-2', 3: 'ПОДРОБНО-3' }));
  const cp8 = await p.evaluate(async () => { await _stGenCaption(); return { obj: _stCapText.includes('[object Object]'), toast: __toast() }; });
  ok('текст к сторис: объект вместо строки не уходит как [object Object]', !cp8.obj && /без описания: 1/.test(cp8.toast), JSON.stringify(cp8));
  await p.evaluate(() => { _stG.forEach((g, i) => g.description = __stDescBak[i]); _stShortDescs = {}; _stCapText = ''; _stRenderTemplate(); });

  // Б-3: URL обложки с апострофом не ломает клик в пикере (раньше URL жил в onclick-атрибуте)
  const pk = await p.evaluate(async () => {
    const url = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='30' height='40'><rect width='30' height='40' fill='red'/></svg>";
    const fake = { id: 'stand-fake', title: "Stand'Test Q", icon: url, priceRUB: 1 }; games.push(fake);
    const bak = { u: _stG[0].imgUrl, e: _stG[0].imgEl, r: _stG[0]._replaced };
    _stPickImg(0); _pickerRenderStore("Stand'Test");
    const cells = document.querySelectorAll('#cc-picker-grid > div'); if (cells[0]) cells[0].click();
    const got = _stG[0].imgUrl, open = document.getElementById('cc-img-picker').style.display;
    await new Promise(r => setTimeout(r, 500)); // onload пикера пишет imgEl асинхронно — ждём, потом откатываем
    games.splice(games.indexOf(fake), 1); _closePicker(); Object.assign(_stG[0], { imgUrl: bak.u, imgEl: bak.e, _replaced: bak.r }); _stRedrawCurrent();
    return { n: cells.length, applied: got === url, open };
  });
  ok('Б-3 пикер: обложка с апострофом в URL ставится кликом', pk.n === 1 && pk.applied && pk.open === 'none', JSON.stringify(pk));

  // Гонки загрузки обложек в сторис: поздно доехавшая картинка не перетирает выбранную позже
  const sr = await p.evaluate(async () => {
    const bak = _stG.slice(0, 2).map(g => ({ u: g.imgUrl, e: g.imgEl, h: g._hdDone })), hdBak = window._hdCoverUrl;
    // а) исходная обложка грузится долго, человек за это время выбрал другую
    _stG[0].imgUrl = __slowImg('red', 1500); _stLoadImgs(); _stPickImg(0); _pickerApply(__slowImg('blue', 0)); await __wait(2200);
    const a = __col(_stG[0].imgEl);
    // б) выбранная в пикере грузится долго, а человек уже открыл пикер другого слота
    _stPickImg(0); _pickerApply(__slowImg('green', 1000)); _stPickImg(1); await __wait(1600); _closePicker();
    const b = [__col(_stG[0].imgEl), __col(_stG[1].imgEl)];
    // в) HD из IGDB найден и грузится долго, человек выбрал свою обложку
    window._hdCoverUrl = async () => __slowImg('red', 1500); _stG[0]._hdDone = false;
    _stUpgradeSlotHD(0); await __wait(100); _stPickImg(0); _pickerApply(__slowImg('blue', 0)); await __wait(2000);
    const c = __col(_stG[0].imgEl);
    // в2) HD найден, но не загрузился, а лёгкая обложка ещё ехала — слот не должен остаться пустым
    window._hdCoverUrl = async () => __slowImg('fail', 0); _stG[0]._hdDone = false;
    _stG[0].imgUrl = __slowImg('red', 800); _stG[0].imgEl = null; _stLoadImgs(); _stUpgradeSlotHD(0); await __wait(1400);
    const c2 = __col(_stG[0].imgEl);
    // г) экспорт перезагружает обложки; выбор, сделанный во время экспорта, не откатывается
    _stG[0].imgUrl = __slowImg('red', 1500); _stG[0].imgEl = await __img(__slowImg('red', 0)); window.__dl = [];
    downloadStory(); await __wait(150); _stPickImg(0); _pickerApply(__slowImg('blue', 0)); await __wait(2600);
    const d = __col(_stG[0].imgEl), dl = __dl.length;
    window._hdCoverUrl = hdBak;
    _stG.slice(0, 2).forEach((g, i) => Object.assign(g, { imgUrl: bak[i].u, imgEl: bak[i].e, _hdDone: bak[i].h })); _stRedrawCurrent();
    return { a, b, c, c2, d, dl };
  });
  ok('сторис: HD не загрузился — в слоте остаётся лёгкая обложка', sr.c2 === 'red', String(sr.c2));
  ok('гонка сторис: поздняя исходная обложка не перетирает выбранную', sr.a === 'blue', JSON.stringify(sr));
  ok('гонка пикера: обложка уходит в свой слот, а не в открытый позже', sr.b[0] === 'green' && sr.b[1] !== 'green', JSON.stringify(sr.b));
  ok('гонка сторис: поздний HD не перетирает выбранную обложку', sr.c === 'blue', String(sr.c));
  ok('экспорт сторис: выбор во время экспорта не откатывается', sr.d === 'blue' && sr.dl === 1, JSON.stringify(sr));

  // Батч: сторис на каждую выбранную игру, по файлу на игру; после батча кадр пользователя на месте
  const bt = await p.evaluate(async () => {
    const before = { g: _stG, n: _stGameCount }; const sel = __sel(3); window.__dl = [];
    await downloadStoryBatch();
    const files = []; for (const d of __dl) { const im = await __img(d.href); files.push({ name: d.name, w: im.naturalWidth, h: im.naturalHeight }); }
    return { files, want: sel.map(t => 'story-' + _slugify(_displayTitle(t)) + '.png'), distinct: new Set(__dl.map(d => d.href)).size, restored: _stG === before.g && _stGameCount === before.n };
  });
  ok('батч-сторис: по PNG 1080×1920 на игру, имена по играм, кадр восстановлен',
    bt.files.length === 3 && bt.files.every((f, i) => f.w === 1080 && f.h === 1920 && f.name === bt.want[i]) && bt.distinct === 3 && bt.restored, JSON.stringify(bt));
  await saveDl('export-story-batch-1');

  // Батч идёт десятки секунд: окно сторис живёт своей жизнью — превью на месте, заново открытая сторис не затирается,
  // сбой рендера одной сторис не оставляет мёртвое превью и выключенную кнопку
  const bt2 = await p.evaluate(async () => {
    const el = document.getElementById('st-canvas'); __sel(2); window.__dl = [];
    const run = downloadStoryBatch(); await __wait(300);
    const mid = _stCanvas === el, fresh = _stG.slice(); _stG = fresh; // как будто сторис открыли заново
    await run; const keptNew = _stG === fresh;
    const orig = _stRenderTemplate; let n = 0;
    window._stRenderTemplate = function () { if (_stCanvas !== el && n++ === 0) throw new Error('stand'); return orig.apply(this, arguments); };
    let thrown = null; try { await downloadStoryBatch(); } catch (e) { thrown = e.message; }
    window._stRenderTemplate = orig;
    return { mid, keptNew, thrown, canvasBack: _stCanvas === el, btn: !document.getElementById('st-batch-btn').disabled, files: __dl.length };
  });
  ok('батч-сторис: превью и заново открытая сторис живы, сбой рендера не ломает окно',
    bt2.mid && bt2.keptNew && bt2.canvasBack && bt2.btn, JSON.stringify(bt2));
  await p.evaluate(() => _stRedrawCurrent());

  // Esc при открытом пикере обложек закрывает пикер, а не окно под ним
  await p.evaluate(() => _stPickImg(0)); await p.keyboard.press('Escape');
  const escP = await p.evaluate(() => ({ picker: document.getElementById('cc-img-picker').style.display, story: document.getElementById('story-modal').classList.contains('open') }));
  ok('Esc при открытом пикере закрывает пикер, сторис остаётся', escP.picker === 'none' && escP.story, JSON.stringify(escP));
  await p.evaluate(() => { _closePicker(); document.getElementById('story-modal').classList.add('open'); });

  // Горячие клавиши редактора (UX-15): Delete, Ctrl+Z, Ctrl+Y; в поле ввода Delete элементы не трогает; Esc закрывает окно
  await p.evaluate(() => { _stSetMode('editor'); _stEls = []; _stUndoStack = []; _stRedoStack = []; stAddSticker(); _stSel = _stEls.length - 1; document.activeElement && document.activeElement.blur(); });
  const nEl = () => p.evaluate(() => _stEls.length), chord = async k => { await p.keyboard.down('Control'); await p.keyboard.press(k); await p.keyboard.up('Control'); };
  const hk = { added: await nEl() };
  await p.keyboard.press('Delete'); hk.del = await nEl();
  await chord('z'); hk.undo = await nEl();
  await chord('y'); hk.redo = await nEl();
  // поле — своё, временное: поля боковой панели редактора рисуются по выделению, а скрытое поле фокус не берёт
  await chord('z'); await p.evaluate(() => { _stSel = _stEls.length - 1; const i = document.createElement('input'); i.id = 'stand-inp'; document.getElementById('st-editor-panel').appendChild(i); i.focus(); });
  await p.keyboard.press('Delete'); hk.inInput = await nEl(); hk.focused = await p.evaluate(() => document.activeElement.id);
  await p.evaluate(() => { document.getElementById('stand-inp').remove(); _stEls = []; _stSel = -1; _stUndoStack = []; _stRedoStack = []; _stSetMode('templates'); });
  await p.keyboard.press('Escape'); hk.escClosed = await p.evaluate(() => !document.getElementById('story-modal').classList.contains('open'));
  ok('горячие клавиши: Delete, Ctrl+Z, Ctrl+Y, ввод не задет, Esc закрывает сторис',
    hk.added === 1 && hk.del === 0 && hk.undo === 1 && hk.redo === 0 && hk.inInput === 1 && hk.focused === 'stand-inp' && hk.escClosed, JSON.stringify(hk));
  await p.evaluate(() => { if (document.getElementById('story-modal').classList.contains('open')) closeStory(); });

  // ── Коллаж ─────────────────────────────────────────────────
  await p.evaluate(() => { __sel(5); openCollage(); }); await sleep(8000);
  const cl = await p.evaluate(() => { redrawPreview(); const a = __snap('coll-canvas'), aS = __snapS('coll-canvas'); _collSetNeon(true); const b = __snap('coll-canvas'); _collSetNeon(false); _collSetFit('contain'); const c = __snap('coll-canvas'); _collSetFit('cover'); return { neon: __diff(a, b), fit: __diff(a, c), back: __diff(aS, __snapS('coll-canvas')) }; });
  ok('коллаж: неон и «Целиком» меняют кадр, откат точный', cl.neon > 0.2 && cl.fit > 0.2 && cl.back < 0.5, JSON.stringify(cl));
  await p.evaluate(() => { _collSetNeon(true); _collSetFit('contain'); redrawPreview(); }); await shot('coll-canvas', 'collage-neon-contain');
  await p.evaluate(() => { _collSetNeon(false); _collSetFit('cover'); redrawPreview(); });

  // Сдвиг кадра в экспорте — как на экране (раньше в PNG обложка уезжала вдвое меньше)
  await p.evaluate(() => { initT(0); collageCovers[0].transform.ox = 40; collageCovers[0].transform.oy = 25; redrawPreview(); window.__dl = []; downloadCollage(); });
  await p.waitForFunction(() => __dl.length > 0, { timeout: 30000 }).catch(() => {});
  const shift = await p.evaluate(async () => {
    const c = document.getElementById('coll-canvas'), cell = _previewCells[0], im = await __img(__dl[0].href);
    const fx0 = (cell.x + 6) / c.width, fy0 = (cell.y + 6) / c.height, fx1 = (cell.x + cell.w - 6) / c.width, fy1 = (cell.y + cell.h - 6) / c.height;
    const prev = __crop(__snapC(c), fx0, fy0, fx1, fy1), exp = __crop(__snapC(im, c.width, c.height), fx0, fy0, fx1, fy1);
    // для сравнения — как выглядел бы экспорт со старой ошибкой (сдвиг вдвое меньше)
    collageCovers[0].transform.ox = 20; collageCovers[0].transform.oy = 12.5; redrawPreview(); const half = __crop(__snapC(c), fx0, fy0, fx1, fy1);
    collageCovers[0].transform.ox = 0; collageCovers[0].transform.oy = 0; redrawPreview();
    return { exportVsScreen: __diff(prev, exp), oldBugVsScreen: __diff(prev, half) };
  });
  ok('коллаж: сдвиг обложки в PNG как на экране', shift.exportVsScreen < shift.oldBugVsScreen / 3, JSON.stringify(shift)); await saveDl('export-collage-shift');

  for (const fmt of await p.evaluate(() => Object.keys(_COLLAGE_FORMATS))) {
    await p.evaluate(f => { window.__dl = []; downloadCollageFormat(f); }, fmt);
    await p.waitForFunction(() => __dl.length > 0, { timeout: 30000 }).catch(() => {});
    const r = await p.evaluate(async f => { const d = __dl[0]; if (!d) return null; const im = await __img(d.href); return { w: im.naturalWidth, h: im.naturalHeight, want: [_COLLAGE_FORMATS[f].w, _COLLAGE_FORMATS[f].h] }; }, fmt);
    ok(`экспорт коллажа ${fmt}`, r && r.w === r.want[0] && r.h === r.want[1], JSON.stringify(r)); await saveDl(`export-collage-${fmt}`);
  }
  // Гонки загрузки обложек в коллаже — как у сторис
  const cr = await p.evaluate(async () => {
    const c0 = collageCovers[0], bak = { img: c0.img, el: c0.imgEl, t: c0.transform };
    // а) исходная или HD грузится долго, человек выбрал обложку в пикере
    c0.img = __slowImg('red', 1500); loadImgEl(0, c0.img); collagePickImg(0); _pickerApply(__slowImg('blue', 0)); await __wait(2200);
    const a = __col(collageCovers[0].imgEl);
    // б) экспорт перезагружает обложки; выбор во время экспорта не откатывается
    collageCovers[0].img = __slowImg('red', 1500); collageCovers[0].imgEl = await __img(__slowImg('red', 0)); window.__dl = [];
    downloadCollage(); await __wait(150); collagePickImg(0); _pickerApply(__slowImg('blue', 0)); await __wait(2600);
    const b = __col(collageCovers[0].imgEl), dl = __dl.length;
    // в) обложку выбрали и сразу переставили слоты, пока она грузилась — она доезжает в новый слот
    const bak1 = { img: collageCovers[1].img, el: collageCovers[1].imgEl, t: collageCovers[1].transform };
    collagePickImg(0); _pickerApply(__slowImg('green', 800)); swapSlots(0, 1); await __wait(1400);
    const c = [__col(collageCovers[0].imgEl), __col(collageCovers[1].imgEl)];
    swapSlots(0, 1);
    Object.assign(collageCovers[0], { img: bak.img, imgEl: bak.el, transform: bak.t });
    Object.assign(collageCovers[1], { img: bak1.img, imgEl: bak1.el, transform: bak1.t }); renderCollageSlots(); redrawPreview();
    return { a, b, c, dl };
  });
  ok('коллаж: обложка, переставленная во время загрузки, доезжает в свой новый слот', cr.c[1] === 'green' && cr.c[0] !== 'green', JSON.stringify(cr.c));
  ok('гонка коллажа: поздняя обложка не перетирает выбранную', cr.a === 'blue', JSON.stringify(cr));
  ok('экспорт коллажа: выбор во время экспорта не откатывается', cr.b === 'blue' && cr.dl === 1, JSON.stringify(cr));

  await p.keyboard.press('Escape');
  ok('горячие клавиши: Esc закрывает коллаж', await p.evaluate(() => !document.getElementById('coll-modal').classList.contains('open')));
  await p.evaluate(() => { if (document.getElementById('coll-modal').classList.contains('open')) closeCollage(); });

  const html = fs.readFileSync(SRC, 'utf8');
  const dbl = html.match(/<[^>]*style="[^"]*display:\s*none[^"]*display:\s*none[^"]*"[^>]*>/g) || [];
  ok('аудит 46: нет двойного display:none в разметке', dbl.length === 0, dbl.map(s => s.slice(0, 80)).join(' | '));
  ok('подсказка TG/VK не врёт, что влияет только на текст', !/Влияет только на кнопку/.test(html));

  // ── Пост → очередь бота (М1) ──────────────────────────────
  await p.evaluate(() => { __sel(3); openTGPost(); generateAIPost(); });
  await p.waitForFunction(() => document.getElementById('out-panel').style.display !== 'none', { timeout: 30000 }).catch(() => {});
  await p.evaluate(() => queuePostToBot()); await sleep(1500); await p.evaluate(() => { try { jFlush(); } catch (e) {} }); await sleep(1500);
  const q = posted['/api/cc-queue'] || [];
  ok('М1: ровно один запрос в /api/cc-queue', q.length === 1, q.length + ' шт.');
  if (q[0]) {
    const body = JSON.parse(q[0]);
    const tags = [...new Set((body.text.match(/<\/?([a-z-]+)/gi) || []).map(t => t.replace(/[<\/]/g, '').toLowerCase()))];
    const allowed = ['b', 'strong', 'i', 'em', 'u', 'ins', 's', 'strike', 'del', 'a', 'code', 'pre', 'blockquote', 'tg-spoiler', 'span'];
    ok('М1: в HTML только теги, которые понимает Telegram', tags.every(t => allowed.includes(t)), tags.join(','));
    ok('М1: ссылки на ?game= в HTML', /<a href="https:\/\/poigraem\.shop\/\?game=/.test(body.text));
    const bare = body.text.replace(/<[^>]+>/g, '').match(/[<>]|&(?!(amp|lt|gt|quot|#\d+);)/g);
    ok('М1: нет неэкранированных < > &', !bare, bare ? bare.join('') : '');
    fs.writeFileSync(path.join(OUT, 'm1-queue-body.html'), body.text);
  }
  ok('М1: тост об успехе', /Черновик в боте/.test(await p.evaluate(() => __toast())));
  ok('М1: журнал получил tg_queue', /tg_queue/.test((posted['/cc/journal'] || []).join('\n')));

  // ── «📤 Отправить в канал» ───────────────────────────────
  // Публикация необратима: первый клик только взводит кнопку, второй шлёт ровно один запрос.
  // Пока сервер не подтвердил HTML (TG_POST_HTML = false) — legacy Markdown без format, ссылки игр с t и p.
  await p.evaluate(() => sendPostToTG()); await sleep(500);
  const armed = (posted['/api/tg-post'] || []).length;
  await p.evaluate(() => sendPostToTG()); await sleep(1500);
  const tp = posted['/api/tg-post'] || [];
  ok('📤 в канал: первый клик взводит, второй шлёт ровно один запрос', armed === 0 && tp.length === 1, `${armed} → ${tp.length}`);
  if (tp[0]) {
    const b = JSON.parse(tp[0]);
    const mdLinks = (b.text.match(/\]\(https:\/\/poigraem\.shop\/\?game=[^)\s]*\)/g) || []);
    ok('📤 в канал (HTML не включён): Markdown без format, ссылки ?game=&t=, без HTML-тегов и служебной разметки',
      b.format === undefined && mdLinks.length > 0 && mdLinks.every(l => /^\]\(https:\/\/poigraem\.shop\/\?game=[^&)]+&t=[^&)\s]+(&p=[^&)\s]+)?\)$/.test(l))
      && !/<\/?[a-z][^>]*>/i.test(b.text) && !/🔄|class=|data-gi/.test(b.text), JSON.stringify({ format: b.format, link: mdLinks[0], head: b.text.slice(0, 160) }));
    fs.writeFileSync(path.join(OUT, 'tg-post-body.md'), b.text);
  }
  ok('📤 в канал: тост об успехе', /Пост отправлен в канал/.test(await p.evaluate(() => __toast())), await p.evaluate(() => __toast()));

  // HTML включён (TG_POST_HTML = true): format:'html'; сервер не подтвердил формат — громкое предупреждение, подтвердил — обычный успех.
  // Дальше стенд работает в этом режиме — так будет после подтверждения сервера.
  const fmtCase = async fmt => { tgPostFmt = fmt; const n0 = (posted['/api/tg-post'] || []).length;
    await p.evaluate(() => { TG_POST_HTML = true; _tgDisarmSend(); sendPostToTG(); return sendPostToTG(); }); await sleep(800);
    return { n: (posted['/api/tg-post'] || []).length - n0, toast: await p.evaluate(() => __toast()) }; };
  const fNo = await fmtCase(null), fOk = await fmtCase('html');
  ok('📤 в канал (HTML): сервер без format → предупреждение «не HTML», с format html → обычный успех',
    fNo.n === 1 && /Сервер отправил не HTML/.test(fNo.toast) && fOk.n === 1 && /^✅ Пост отправлен в канал/.test(fOk.toast), JSON.stringify({ fNo, fOk }));
  const tpH = (posted['/api/tg-post'] || []).slice(-1);
  if (tpH[0]) {
    const b = JSON.parse(tpH[0]);
    const tags = [...new Set((b.text.match(/<\/?([a-z-]+)/gi) || []).map(t => t.replace(/[<\/]/g, '').toLowerCase()))];
    const allowed = ['b', 'strong', 'i', 'em', 'u', 'ins', 's', 'strike', 'del', 'a', 'code', 'pre', 'blockquote', 'tg-spoiler'];
    const bare = b.text.replace(/<[^>]+>/g, '').match(/[<>]|&(?!(amp|lt|gt|quot|#\d+);)/g);
    const hrefs = (b.text.match(/<a href="[^"]*">/g) || []).filter(h => h.includes('?game=')); // ссылки игр; шапка и подвал — свои
    ok('📤 в канал: format html, теги Telegram, ссылки ?game=&amp;t=, нет неэкранированных & < > и служебной разметки',
      b.format === 'html' && tags.every(t => allowed.includes(t)) && hrefs.length > 0 && hrefs.every(h => /^<a href="https:\/\/poigraem\.shop\/\?game=[^"&]+&amp;t=[^"&]+(&amp;p=[^"&]+)?">$/.test(h))
      && !bare && !/🔄|class=|data-gi|contenteditable/.test(b.text),
      JSON.stringify({ format: b.format, tags, bare, href: hrefs[0], head: b.text.slice(0, 120) }));
    fs.writeFileSync(path.join(OUT, 'tg-post-body.html'), b.text);
  }

  // Лимит Telegram — по видимому тексту: адреса ссылок в 1024 подписи не входят (как у «🕐 В очередь бота»)
  const lim = await p.evaluate(() => {
    const box = document.getElementById('out-text'), bak = { html: box.innerHTML, img: _ccPostImg };
    _ccPostImg = 'data:image/jpeg;base64,AAAA';
    box.innerHTML = Array.from({ length: 10 }, (_, i) => `<a href="https://poigraem.shop/?game=1234567890123456${i}">Игра номер ${i}</a> ` + 'о'.repeat(70)).join('<br>');
    _updateOutCount(); const cnt = document.getElementById('out-count').textContent, vis = _outSerialize('visible').length, md = _outSerialize('html').length;
    _tgDisarmSend(); sendPostToTG(); const armed = _tgSendArmed; _tgDisarmSend();
    box.innerHTML = bak.html; _ccPostImg = bak.img; _updateOutCount();
    return { vis, md, cnt, armed };
  });
  ok('лимит TG: считается видимый текст, адреса ссылок не в счёт', lim.vis <= 1024 && lim.md > 1024 && lim.armed && lim.cnt.startsWith(lim.vis.toLocaleString('ru') + ' /'), JSON.stringify(lim));
  // 502 от nginx с HTML вместо JSON — в тосте код ответа, а не «Unexpected token»
  tgPostFail = true;
  await p.evaluate(() => { _tgDisarmSend(); sendPostToTG(); sendPostToTG(); }); await sleep(1500); tgPostFail = false;
  const t502 = await p.evaluate(() => __toast());
  ok('📤 в канал: HTML-ответ 502 → в тосте HTTP 502', /HTTP 502/.test(t502), t502);

  // ── Б-1/Б-2: описания от модели в посте ───────────────────
  // Ключи-индексы вразнобой → описание под своей игрой; потерянные ключи и битый JSON — честный «⚠️ без описания: N»
  const aiPost = async reply => {
    const nq = (posted['/api/claude'] || []).length; claudeQ.push(reply);
    return p.evaluate(async nq => {
      const titles = __sel(3), sel = games.filter(g => g._sel), bak = sel.map(g => g.description); sel.forEach(g => g.description = '');
      await generateAIPost(); sel.forEach((g, i) => g.description = bak[i]);
      const t = document.getElementById('out-text').innerText;
      const pos = titles.map((s, i) => [t.indexOf(_displayTitle(s)), t.indexOf('ОПИС-' + (i + 1))]);
      return { mapped: pos.every(([a, b], i) => a >= 0 && b > a && (i === pos.length - 1 || b < pos[i + 1][0])), pos,
               status: document.getElementById('gen-status').textContent, toast: __toast() };
    }, nq).then(r => Object.assign(r, { asked: (posted['/api/claude'] || []).length - nq }));
  };
  const a1 = await aiPost(JSON.stringify({ 2: 'ОПИС-2', 3: 'ОПИС-3', 1: 'ОПИС-1' }));
  ok('Б-1 пост: описание от модели — под своей игрой', a1.asked === 1 && a1.mapped && /✅ Пост готов \(3 игр\)/.test(a1.toast), JSON.stringify(a1));
  const a2 = await aiPost(JSON.stringify({ 1: 'ОПИС-1' }));
  ok('Б-2 пост: потеряны ключи → «⚠️ … 2 игр без описания»', /⚠️ Пост готов, но 2 игр без описания/.test(a2.toast) && /без описания: 2/.test(a2.status), JSON.stringify(a2));
  const a3 = await aiPost('Вот описания: не JSON');
  ok('Б-2 пост: битый JSON → «⚠️ … 3 игр без описания»', /⚠️ Пост готов, но 3 игр без описания/.test(a3.toast), JSON.stringify(a3));
  const a4 = await aiPost(JSON.stringify(['ОПИС-1', 'ОПИС-2', 'ОПИС-3']));
  ok('пост: ответ модели массивом раскладывается по играм без сдвига', a4.mapped && /✅ Пост готов \(3 игр\)/.test(a4.toast), JSON.stringify(a4));
  ok('Б-1 пост: заглушка Claude израсходована', claudeQ.length === 0, claudeQ.length + ' в очереди');

  // ── Перегенерация поста ──────────────────────────────────
  // «🔄 Заново» — ИИ переписывает ВСЕ описания, даже те, что есть в базе (раньше пост молча собирался из базы заново)
  const nClaude = () => (posted['/api/claude'] || []).length;
  let nq = nClaude(); claudeQ.push(JSON.stringify({ 1: 'НОВОЕ-1', 2: 'НОВОЕ-2', 3: 'НОВОЕ-3' }));
  const rg = await p.evaluate(async () => {
    __sel(3); const sel = games.filter(g => g._sel); await generateAIPost();
    const r = regenPost(); await (r && r.then ? r : new Promise(res => setTimeout(res, 3000)));
    const t = document.getElementById('out-text').innerText;
    return { all: [1, 2, 3].every(i => t.includes('НОВОЕ-' + i)), hasDesc: sel.every(g => g.description), toast: __toast(),
             facts: sel.map(g => g.description.slice(0, 30)) };
  });
  const rgBody = nClaude() > nq ? JSON.parse(posted['/api/claude'].slice(-1)[0]).messages[0].content : '';
  ok('«🔄 Заново»: ИИ переписывает описания всех игр, даже из базы', nClaude() - nq === 1 && rg.all && rg.hasDesc, JSON.stringify({ asked: nClaude() - nq, ...rg }));
  ok('«🔄 Заново»: описание из базы уходит модели подсказкой', rg.facts.every(f => rgBody.includes(f)), rgBody.slice(0, 200));
  claudeQ.length = 0;

  // 🔄 у одной игры: меняется только её абзац, ручная правка в чужом абзаце живёт; двойной клик — один запрос
  nq = nClaude(); claudeQ.push(JSON.stringify({ 1: 'ОДНА-2' }));
  const one = await p.evaluate(async () => {
    const box = document.getElementById('out-text');
    const w = document.createTreeWalker(box, NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) if (n.nodeValue.includes('НОВОЕ-3')) n.nodeValue = n.nodeValue.replace('НОВОЕ-3', 'НОВОЕ-3 РУЧНАЯ-ПРАВКА');
    const btns = box.querySelectorAll('.cc-regen'); if (btns.length !== 3) return { btns: btns.length };
    const a = regenGameDesc(btns[1]), b = regenGameDesc(btns[1]); await Promise.all([a, b]);
    const t = box.innerText;
    return { btns: btns.length, t: t.slice(0, 400), ok: t.includes('ОДНА-2') && !t.includes('НОВОЕ-2') && t.includes('НОВОЕ-1') && t.includes('НОВОЕ-3 РУЧНАЯ-ПРАВКА') };
  });
  ok('🔄 игры: меняется только её абзац, правка в другом сохранена', one.ok && nClaude() - nq === 1, JSON.stringify({ asked: nClaude() - nq, ...one }));
  claudeQ.length = 0;

  // Кнопки 🔄 и служебная разметка не попадают ни в один вывод
  nq = (posted['/api/cc-queue'] || []).length; const nt = (posted['/api/tg-post'] || []).length;
  const outs = await p.evaluate(async () => {
    let clip = null; window.ClipboardItem = class { constructor(o) { this.o = o; } };
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { write: async items => { clip = items[0].o; }, writeText: async t => { clip = { 'text/plain': new Blob([t]) }; } } });
    copyOut(); await new Promise(r => setTimeout(r, 200));
    const res = {}; for (const m of ['plain', 'visible', 'html', 'mdraw']) res[m] = _outSerialize(m);
    if (clip) { res.clipPlain = await clip['text/plain'].text(); res.clipHtml = clip['text/html'] ? await clip['text/html'].text() : ''; }
    _updateOutCount(); res.count = document.getElementById('out-count').textContent; res.bot = _ccPostBot;
    _tgDisarmSend(); await queuePostToBot(); sendPostToTG(); await sendPostToTG();
    return res;
  });
  outs.queue = ((posted['/api/cc-queue'] || []).slice(nq)[0] || ''); outs.tg = ((posted['/api/tg-post'] || []).slice(nt)[0] || '');
  const dirty = Object.entries(outs).filter(([k, v]) => /🔄|cc-regen|cc-desc|data-gi|contenteditable/.test(String(v))).map(([k]) => k);
  ok('🔄 и служебная разметка не попадают в вывод (копия, канал, очередь, журнал, счётчик)', dirty.length === 0 && outs.clipHtml && outs.queue && outs.tg, dirty.join(',') || JSON.stringify({ clip: !!outs.clipHtml, q: !!outs.queue, tg: !!outs.tg }));

  // Стёртый абзац игры — предупреждение, без запроса и без пересборки
  nq = nClaude();
  const gone = await p.evaluate(async () => {
    const box = document.getElementById('out-text'), d = box.querySelector('.cc-desc'), btn = box.querySelector('.cc-regen');
    if (!d || !btn) return { miss: true };
    d.remove(); const before = box.innerHTML; await regenGameDesc(btn);
    return { same: box.innerHTML === before, toast: __toast() };
  });
  ok('🔄 игры: стёртый абзац → предупреждение, текст не тронут', gone.same && /не найден/.test(gone.toast) && nClaude() === nq, JSON.stringify(gone));

  // «✂️ Сжать ИИ» пересобирает текст — кнопки 🔄 возвращаются и работают
  await p.evaluate(async () => { __sel(3); await generateAIPost(); });
  // Модель «сжимает» ровно то, что ей прислали: адреса ссылок она видеть не должна (метки L1…), а в посте они восстанавливаются точно
  let shPrompt = '';
  claudeQ.push(body => { shPrompt = body.messages[0].content; return shPrompt.slice(shPrompt.indexOf('Пост:\n') + 6).replace(/(руб\.)\n[^\n]*/g, '$1\nСЖАТО'); });
  nq = nClaude();
  const sh = await p.evaluate(async () => { await aiShrinkPost(); const box = document.getElementById('out-text');
    const want = _ccPostGames.map(g => _stGameUrl(g)), got = [...box.querySelectorAll('a')].map(a => a.getAttribute('href'));
    return { btns: box.querySelectorAll('.cc-regen').length, descs: box.querySelectorAll('.cc-desc').length, hrefs: want.every(u => got.includes(u)), t: box.innerText.slice(0, 300) }; });
  ok('«✂️ Сжать»: модель не видит адресов ссылок, адреса в посте восстановлены точно', shPrompt && !/poigraem\.shop|t\.me/.test(shPrompt) && /\]\(L1\)/.test(shPrompt) && sh.hrefs, JSON.stringify({ hrefs: sh.hrefs, prompt: shPrompt.slice(-200) }));
  claudeQ.push(JSON.stringify({ 1: 'ПОСЛЕ-СЖАТИЯ' }));
  const sh2 = await p.evaluate(async () => { const b = document.querySelector('#out-text .cc-regen'); if (b) await regenGameDesc(b); return document.getElementById('out-text').innerText.includes('ПОСЛЕ-СЖАТИЯ'); });
  ok('«✂️ Сжать» не теряет 🔄: кнопки на месте и работают', sh.btns === 3 && sh.descs === 3 && sh2, JSON.stringify({ ...sh, regen: sh2 }));
  claudeQ.length = 0;
  // Модель пишет метки вольно — «(L 1)», «(l2)» — ссылки всё равно восстанавливаются; свой текст «размер (L2)» не мешает; текст «[тут](подробнее)», набранный
  // человеком, остаётся текстом (метки ставятся только настоящим <a>); потерянная ссылка или лишняя метка — пост не трогаем
  const echo = f => body => f(body.messages[0].content.slice(body.messages[0].content.indexOf('Пост:\n') + 6));
  const shCase = async (f, extra) => { claudeQ.push(echo(f)); return p.evaluate(async extra => {
    __sel(3); await generateAIPost(); const box = document.getElementById('out-text');
    if (extra) box.appendChild(document.createTextNode(extra));
    const want = _ccPostGames.map(g => _stGameUrl(g)), before = box.innerHTML; let err = 0;
    const je = window.jError; window.jError = function (k) { if (k === 'shrink_links') err++; return je.apply(this, arguments); };
    try { await aiShrinkPost(); } finally { window.jError = je; }
    const hrefs = [...box.querySelectorAll('a')].map(a => a.getAttribute('href'));
    return { same: box.innerHTML === before, links: want.every(u => hrefs.includes(u)), bad: hrefs.filter(h => /^L\d|^l\d|подробнее/.test(h)), txt: box.innerText.includes('[тут](подробнее)'),
      left: /\]\(\s*[Ll]\s*\d+\s*\)/.test(box.innerText), err, toast: __toast() };
  }, extra || ''); };
  const shLoose = await shCase(t => t.replace('](L1)', '](L 1)').replace('](L2)', '](l2)'), ' [тут](подробнее) размер (L2)');
  ok('«✂️ Сжать»: метки «(L 1)», «(l2)» восстанавливаются; набранный «[тут](подробнее)» остаётся текстом',
    /Сжато/.test(shLoose.toast) && shLoose.links && !shLoose.bad.length && shLoose.txt && !shLoose.left && !shLoose.err, JSON.stringify(shLoose));
  const shLost = await shCase(t => t.replace(/\[([^\]]+)\]\(L2\)/, '$1'));
  const shExtra = await shCase(t => t + '\n[лишняя](L9)');
  ok('«✂️ Сжать»: потерянная ссылка или чужая метка — предупреждение, пост не изменён, ошибка в журнал',
    shLost.same && /потеряла ссылки/.test(shLost.toast) && shLost.err === 1 && shExtra.same && shExtra.err === 1, JSON.stringify({ shLost, shExtra }));
  claudeQ.length = 0;

  // Enter внутри описания делит абзац на части с одним data-gi — 🔄 заменяет его целиком, без хвоста старого текста;
  // версия ИИ для журнала обновляется в этом абзаце (иначе текст модели засчитался бы правкой человека)
  claudeQ.push(JSON.stringify({ 1: 'ЦЕЛИКОМ-1' }));
  const split = await p.evaluate(async () => {
    __sel(3); await generateAIPost(); const box = document.getElementById('out-text');
    const s = box.querySelector('.cc-desc[data-gi="0"]'), tail = s.cloneNode(); tail.textContent = 'ХВОСТ-СТАРОГО';
    const div = document.createElement('div'); div.appendChild(tail); s.after(div);
    await regenGameDesc(box.querySelector('.cc-regen[data-gi="0"]'));
    return { t: box.innerText.slice(0, 200), noTail: !box.innerText.includes('ХВОСТ-СТАРОГО'), has: box.innerText.includes('ЦЕЛИКОМ-1'), bot: _ccPostBot.includes('ЦЕЛИКОМ-1') };
  });
  ok('🔄 игры: абзац, разбитый Enter, заменяется целиком; версия ИИ обновлена', split.noTail && split.has && split.bot, JSON.stringify(split));

  // Сбой «Заново» (Claude 500) не прячет прежний пост
  const fail = await p.evaluate(async () => { const before = _outSerialize('plain'); await regenPost();
    return { shown: document.getElementById('out-panel').style.display !== 'none', same: _outSerialize('plain') === before }; });
  ok('«🔄 Заново»: при ошибке прежний пост остаётся на экране', fail.shown && fail.same, JSON.stringify(fail));

  // 🔄 игры в полёте, а пост пересобрали — ответ не вставляется в новый пост
  claudeQ.push(JSON.stringify({ 1: 'ОПОЗДАВШЕЕ' }));
  const late = await p.evaluate(async () => {
    const box = document.getElementById('out-text'), a = regenGameDesc(box.querySelector('.cc-regen[data-gi="1"]'));
    await generateAIPost(); await a; return { late: box.innerText.includes('ОПОЗДАВШЕЕ'), toast: __toast() };
  });
  ok('🔄 игры: ответ после пересборки поста отброшен, без ложного «стёрт»', !late.late && /пересобран/.test(late.toast), JSON.stringify(late));
  claudeQ.length = 0;
  await p.evaluate(() => { try { jFlush(); } catch (e) {} }); await sleep(1500);
  ok('🔄 игры: журнал получил событие post_game', /post_game/.test((posted['/cc/journal'] || []).join('\n')));
  await p.keyboard.press('Escape');
  ok('горячие клавиши: Esc закрывает пост', await p.evaluate(() => !document.getElementById('tg-modal').classList.contains('open')));

  // ── Метка платформы у двойников (PS4 и PS4/PS5 — разные товары, а _displayTitle платформу вырезает) ──
  // Заглушки — только чтобы на версии без метки проверки честно падали, а не роняли стенд
  const plStubs = () => p.evaluate(() => { if (typeof _platTag !== 'function') { window._platTag = () => ''; window._stSetPlat = () => {}; window._collSetPlat = () => {}; window._wrapTitle = (x, t, tag, w, n) => _wrapLines(x, t, w, n); } if (typeof _stDK !== 'function') window._stDK = g => g.title; });
  await plStubs();
  const pl = await p.evaluate(() => {
    const key = g => String(_displayTitle(g.title) || '').replace(/[™®©]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
    const by = {}; games.forEach(g => { if (g._platform) (by[key(g)] = by[key(g)] || new Set()).add(g._platform); });
    const twins = games.filter(g => g._platform && by[key(g)].size > 1);
    filtered = [...games]; renderTable();
    const badges = [...document.querySelectorAll('#game-tbody tr')].map(r => (r.querySelector('.td-title .plat-badge') || {}).textContent || '');
    const want = games.map(g => g._platform || '');
    const tags = typeof _platTag === 'function' ? games.map(g => _platTag(g)) : [];
    return { twins: [...new Set(twins.map(g => _displayTitle(g.title)))], nPlat: want.filter(Boolean).length,
             table: badges.join() === want.join(), tags: tags.length === games.length && tags.every((t, i) => t === (twins.includes(games[i]) ? games[i]._platform : '')) };
  });
  ok('метка: в таблице плашка платформы у всех игр с платформой', pl.nPlat > 50 && pl.table, JSON.stringify({ nPlat: pl.nPlat, table: pl.table }));
  // Метка ставится ровно тем, у кого в каталоге есть двойник (tags сверяет с независимым расчётом выше)
  if (TW) ok('метка: двойник — та же игра под другой платформой', pl.tags && pl.twins.length > 0, JSON.stringify(pl.twins));
  else skip('метка: двойник — та же игра под другой платформой', 'нет двойников');

  if (!TW) skip('метка платформы в посте, сторис, QR, батче и коллаже (блок двойников)', 'нет двойников');
  else {
  // Пост: метка ровно у двойников; переживает 🔄 одной игры и «Заново»; уходит в канал, очередь и копию
  const lab = await p.evaluate(() => {
    window.__single = games.find(g => g._platform && g.priceRUB && g.description && !games.some(x => x !== g && _displayTitle(x.title) === _displayTitle(g.title)));
    games.forEach(g => g._sel = false); [...__tw, __single].forEach(g => g._sel = true);
    window.__lab = g => `${_displayTitle(g.title)} (${g._platform})`;
    return { tw: __tw.map(__lab), single: _displayTitle(__single.title) };
  });
  const postHas = () => p.evaluate(() => { const t = document.getElementById('out-text').innerText;
    return { tw: __tw.every(g => t.includes(__lab(g))), single: t.includes(_displayTitle(__single.title)) && !t.includes(_displayTitle(__single.title) + ' (') }; });
  await p.evaluate(async () => { openTGPost(); await generateAIPost(); });
  const lp1 = await postHas();
  ok('метка в посте: у двойников «Название (PS4)», у одиночки нет', lab.tw.length === 2 && lp1.tw && lp1.single, JSON.stringify({ ...lab, ...lp1 }));
  nq = nClaude(); claudeQ.push(JSON.stringify({ 1: 'ПЛАТ-ОДНА' }));
  await p.evaluate(async () => { await regenGameDesc(document.querySelector(`#out-text .cc-regen[data-gi="${_ccPostGames.indexOf(__tw[0])}"]`)); });
  const lp2 = await postHas(), oneBody = nClaude() > nq ? JSON.parse(posted['/api/claude'].slice(-1)[0]).messages[0].content : '';
  claudeQ.push(JSON.stringify({ 1: 'ПЛАТ-1', 2: 'ПЛАТ-2', 3: 'ПЛАТ-3' }));
  await p.evaluate(() => regenPost());
  const lp3 = await postHas(), regenOk = await p.evaluate(() => document.getElementById('out-text').innerText.includes('ПЛАТ-3'));
  ok('метка в посте переживает 🔄 игры и «Заново»; в промпт идёт название с платформой',
    lp2.tw && lp2.single && lp3.tw && lp3.single && regenOk && oneBody.includes(lab.tw[0]), JSON.stringify({ lp2, lp3, regenOk, prompt: oneBody.slice(-120) }));
  claudeQ.length = 0;
  nq = (posted['/api/cc-queue'] || []).length; const ntp = (posted['/api/tg-post'] || []).length;
  const lo = await p.evaluate(async () => { const plain = _outSerialize('plain'); _tgDisarmSend(); await queuePostToBot(); sendPostToTG(); await sendPostToTG(); return plain; });
  const lq = JSON.parse((posted['/api/cc-queue'] || []).slice(nq)[0] || '{"text":""}').text, lt = JSON.parse((posted['/api/tg-post'] || []).slice(ntp)[0] || '{"text":""}').text;
  ok('метка в посте уходит в копию, очередь бота и канал', lab.tw.every(s => lo.includes(s) && lq.includes(s) && lt.includes(s)), JSON.stringify({ q: lq.slice(0, 120), tg: lt.slice(0, 120) }));
  // Ссылки двойников различаются платформой: в HTML канала и очереди — &amp;p=, в копии — голый &p=
  const twQ = await p.evaluate(() => __tw.map(g => ({ t: __enc(__nk(g.title)), pp: __enc(g._platform) })));
  const twL = twQ.map(({ t, pp }) => ({ pp, tg: lt.includes(`&amp;t=${t}&amp;p=${pp}"`), q: lq.includes(`&amp;t=${t}&amp;p=${pp}"`), copy: lo.includes(`&t=${t}&p=${pp})`) }));
  ok('ссылки двойников в посте различаются p= в канале, очереди и копии', twL.length === 2 && twL[0].pp !== twL[1].pp && twL.every(x => x.tg && x.q && x.copy), JSON.stringify(twL));
  await p.keyboard.press('Escape');

  // Название с меткой на картинке: не влезает — режется название, метка остаётся целой
  const wt = await p.evaluate(() => {
    const x = document.createElement('canvas').getContext('2d'); x.font = "600 40px 'Noto Sans',sans-serif";
    const ls = _wrapTitle(x, 'Очень длинное название игры, которое никак не помещается в две строки карточки', 'PS4/PS5', 300, 2);
    return { ls, w: ls.map(l => Math.round(x.measureText(l).width)), short: _wrapTitle(x, 'GT 7', 'PS4', 300, 2), none: _wrapTitle(x, 'GT 7', '', 300, 2), narrow: _wrapTitle(x, 'Gran Turismo 7', 'PS4/PS5', 150, 2) };
  });
  ok('метка на картинке: длинное название режется, метка цела, ширина в пределах',
    wt.ls.length === 2 && wt.ls[1].endsWith('(PS4/PS5)') && wt.ls.join(' ').includes('…') && wt.w.every(w => w <= 300) && wt.short.join(' ') === 'GT 7 (PS4)' && wt.none.join(' ') === 'GT 7' && wt.narrow.length === 2 && wt.narrow[1] === '(PS4/PS5)', JSON.stringify(wt));

  // Сторис: метка у двойника на картинке во всех шаблонах; переключатель её убирает; у одиночки кадр не меняется.
  // Запись fillText — какие строки шаблон реально нарисовал (метка не обрезана «…» на конце)
  await p.evaluate(() => { window.__ft = []; const o = CanvasRenderingContext2D.prototype.fillText; window.__ftOrig = o;
    CanvasRenderingContext2D.prototype.fillText = function (s) { if (window.__ftOn) __ft.push(String(s)); return o.apply(this, arguments); }; });
  const drawn = (fn) => p.evaluate(fn => { __ft = []; __ftOn = true; try { (0, eval)(fn)(); } finally { __ftOn = false; } return __ft.slice(); }, fn.toString());
  await p.evaluate(() => { games.forEach(g => g._sel = false); // третья игра — из второй пары двойников, иначе любая после пары (слот 0 обязан быть двойником)
    [...__tw, __tw2[0] || games.slice(Math.max(...__tw.map(g => games.indexOf(g))) + 1).find(g => g.priceRUB && g.description)].filter(Boolean).forEach(g => g._sel = true); openStory(); });
  await sleep(8000);
  const stPl = [];
  for (const n of [1, 2, 3]) {
    await p.evaluate(n => { _stSetMode('templates'); stSetGameCount(n); }, n);
    for (const t of tpls) {
      const r = await p.evaluate(t => { _stSetNeon(false); _stSetFit('cover'); _stSetTpl(t); _stSetPlat(false); const off = __snap('st-canvas'); _stSetPlat(true); const on = __snap('st-canvas'); return __diff(off, on); }, t);
      const txt = await drawn(() => _stRenderTemplate());
      const tagged = txt.some(s => /\((PS4|PS5|PS4\/PS5)\)$/.test(s)), cut = txt.some(s => /\((PS4|PS5)[^)]*…$|\(PS4\/…$/.test(s));
      stPl.push({ n, t, diff: r, tagged, cut });
      if (n === 3) await shot('st-canvas', `story-plat-n3-${t}`);
    }
  }
  const stBad = stPl.filter(x => !(x.diff > 0 && x.tagged && !x.cut));
  ok('метка в сторис: у двойника во всех шаблонах n=1..3, цела, переключатель её убирает', stPl.length && !stBad.length, JSON.stringify(stBad.length ? stBad : stPl.length));
  // QR со ссылкой t/p: декодируется (jsQR) и совпадает со ссылкой поста — у обоих двойников и у игры с самой длинной
  // ссылкой каталога, на минимальном размере ST_QR_MIN. Плюс настоящий угловой код «Постера» из кадра 1080×1920.
  // Шаблон, число игр и переключатель QR (с cc_qr_on) после проверки возвращаются как были — следующие проверки от неё не зависят
  const qd = await p.evaluate(async () => {
    const prev = { tpl: _stTplId, n: _stGameCount, on: _stQrOn, ls: localStorage.getItem('cc_qr_on') };
    try {
    const dec = (src, s) => { const k = document.createElement('canvas'); k.width = k.height = s; const x = k.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, s, s);
      const r = jsQR(x.getImageData(0, 0, s, s).data, s, s); return r ? r.data : null; };
    const longest = games.filter(g => g.id != null).sort((a, b) => _stGameUrl(b).length - _stGameUrl(a).length)[0];
    const out = [];
    for (const g of [...__tw, longest]) {
      const u = _stGameUrl(g); await _stQrEnsure([g]); const rec = _stQrCache[_stQrSrc(u)];
      out.push({ u, len: u.length, ok: !!(rec && rec.img) && dec(rec.img, ST_QR_MIN) === u });
    }
    // Слоты сторис несут title после _displayTitle и без _platform: их адрес обязан совпадать с адресом записи каталога
    const post = g => _stGameUrl(games.find(x => x.id === g.id));
    const slots = _stG.filter(g => g.id != null).map(g => ({ st: _stGameUrl(g), post: post(g) }));
    // Угловой код в реальном кадре: главная игра — первый двойник
    stSetGameCount(1); _stSetTpl('poster'); _stSetQrOn(true); await _stQrEnsure(_stG.slice(0, 1)); _stRenderTemplate();
    const c = document.getElementById('st-canvas'), k = document.createElement('canvas'); k.width = Math.round(c.width * .35); k.height = Math.round(c.height * .3);
    k.getContext('2d').drawImage(c, c.width - k.width, _stFloor(c.height) - k.height, k.width, k.height, 0, 0, k.width, k.height);
    const r = jsQR(k.getContext('2d').getImageData(0, 0, k.width, k.height).data, k.width, k.height);
    return { codes: out, slots, frame: { got: r ? r.data : null, want: post(_stG[0]) } };
    } finally {
      _stQrOn = prev.on; if (prev.ls === null) localStorage.removeItem('cc_qr_on'); else localStorage.setItem('cc_qr_on', prev.ls);
      stSetGameCount(prev.n); _stSetTpl(prev.tpl); _stRenderTemplate();
      window.__qrRestored = { tpl: _stTplId === prev.tpl, n: _stGameCount === prev.n, on: _stQrOn === prev.on, ls: localStorage.getItem('cc_qr_on') === prev.ls };
    }
  });
  const qrR = await p.evaluate(() => window.__qrRestored);
  ok('QR: ссылка t/p читается на ST_QR_MIN и совпадает со ссылкой поста (двойники, самая длинная ссылка, слоты и кадр «Постера»)',
    qd.codes.length === 3 && qd.codes.every(x => x.ok) && /[?&]t=/.test(qd.codes[0].u) && /&p=/.test(qd.frame.want) && qd.frame.got === qd.frame.want
    && qd.slots.length >= 2 && qd.slots.every(s => s.st === s.post), JSON.stringify(qd));
  ok('QR-проверка вернула шаблон, число игр и переключатель QR', qrR && Object.values(qrR).every(Boolean), JSON.stringify(qrR));
  // Каталог обновился и id сменились (замена каталога): открытая сторис пересчитывает адреса слотов, QR-элемент и подпись
  const rl = await p.evaluate(async () => {
    stSetGameCount(1); _stActiveSlot = 0; stAddQR(); await _stGenCaption();
    const old = _stGameUrl(_stG[0]), oldId = _stG[0].id, bak = games;
    // «новый импорт»: те же игры с новыми id и новой ценой, а старый id слота достался другой игре
    games = games.map(g => g.id != null && !g._custom ? { ...g, id: g.id + 7, priceRUB: g.priceRUB ? g.priceRUB + 1 : g.priceRUB } : g);
    const other = games.find(g => g.id != null && !g._custom && _gameMatchKey(g) !== _stG[0]._mk); games = [{ ...other, id: oldId }, ...games];
    const oldPrice = _stG[0].priceRUB;
    const src = (typeof loadSnapshot === 'function' ? loadSnapshot.toString() : '');
    if (typeof _stRelinkSlots === 'function') _stRelinkSlots();
    const neu = _stGameUrl(_stG[0]), qr = _stEls.filter(e => e.type === 'qr').map(e => e.gameUrl);
    const r = { old, neu, idNew: _stG[0].id === oldId + 7, price: _stG[0].priceRUB === oldPrice + 1, qr, cap: _stCapText.includes(neu) && !_stCapText.includes(old), wired: /_stRelinkSlots\(\)/.test(src) };
    games = bak; if (typeof _stRelinkSlots === 'function') _stRelinkSlots();
    _stEls = _stEls.filter(e => e.type !== 'qr'); _stRenderTemplate();
    r.back = _stGameUrl(_stG[0]) === old && _stG[0].priceRUB === oldPrice; return r;
  });
  ok('замена каталога: адрес, цена, QR-элемент и подпись открытой сторис — по новому id той же игры (старый id у чужой — не берём), loadSnapshot это вызывает',
    rl.neu !== rl.old && rl.idNew && rl.price && rl.qr.length === 1 && rl.qr[0] === rl.neu && rl.cap && rl.wired && rl.back, JSON.stringify(rl));
  // «]» в названии не обрывает ссылку в подписи к сторис
  const brk = await p.evaluate(async () => { const t = _stG[0].title; _stG[0].title = 'Rayman [Legends]'; stSetGameCount(1); await _stGenCaption();
    const cap = _stCapText, html = _mdLinksToHtml(cap); _stG[0].title = t; return { cap: cap.slice(0, 120), link: /<a href="https:\/\/poigraem\.shop\/\?game=[^"]+">[^<]*Rayman \(Legends\)/.test(html) }; });
  ok('подпись к сторис: «[ ]» в названии не ломает ссылку', brk.link, JSON.stringify(brk));
  const stCap = await p.evaluate(async () => { stSetGameCount(2); await _stGenCaption(); return _stCapText; });
  ok('метка в тексте к сторис у двойников', lab.tw.every(s => stCap.includes(s)), stCap.slice(0, 160));
  // Короткие описания двойников не затирают друг друга (ключ — название с платформой)
  claudeQ.push(JSON.stringify({ 1: 'КОР-А', 2: 'КОР-Б' }));
  const twD = await p.evaluate(async () => { stSetGameCount(2); _stShortDescs = {}; await _stGenShortDescs(); const r = _stG.slice(0, 2).map(g => _stShortDescs[_stDK(g)] || null); _stShortDescs = {}; _stRenderTemplate(); return r; });
  ok('короткие описания двойников в сторис — у каждого своё', twD.join() === 'КОР-А,КОР-Б', JSON.stringify(twD));
  claudeQ.length = 0;
  // Батч: у двойников разные имена файлов
  const twB = await p.evaluate(async () => { window.__dl = []; await downloadStoryBatch(); return { names: __dl.map(d => d.name), sfx: __tw.map(g => '-' + g._platform.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.png') }; });
  ok('батч-сторис: у двойников разные имена файлов, с платформой', twB.names.length === 3 && new Set(twB.names).size === 3 && twB.sfx.every(s => twB.names.some(n => n.endsWith(s))), JSON.stringify(twB));
  // Пресет бренда помнит переключатель метки
  const twP = await p.evaluate(() => { const pr = window.prompt; _stSetPlat(false); _collSetPlat(false); window.prompt = () => 'stand-plat'; brandSaveCurrent(); window.prompt = pr;
    _stSetPlat(true); _collSetPlat(true); brandApply('stand-plat'); const r = { st: _stPlatOn, cl: _collPlatOn };
    const all = _brandList(); delete all['stand-plat']; localStorage.setItem('cc_brand_presets', JSON.stringify(all)); _stSetPlat(true); _collSetPlat(true); return r; });
  ok('пресет бренда сохраняет и возвращает переключатели метки', twP.st === false && twP.cl === false, JSON.stringify(twP));
  await p.evaluate(() => { _stSetMode('templates'); _stSetPlat(true); closeStory(); games.forEach(g => g._sel = false); games.filter(g => g._platform && g.priceRUB && !_platTag(g)).slice(0, 3).forEach(g => g._sel = true); openStory(); });
  await sleep(8000);
  const stSingle = await p.evaluate(() => _ST_TPLS.map(t => { stSetGameCount(3); _stSetTpl(t.id); _stSetPlat(false); const a = __snap('st-canvas'); _stSetPlat(true); const b = __snap('st-canvas'); _stSetPlat(false); const c = __snap('st-canvas'); _stSetPlat(true); return { t: t.id, onOff: __diff(a, b), stable: __diff(a, c) }; }));
  ok('метка в сторис: у игр без двойника переключатель кадр не меняет', stSingle.every(x => x.stable === 0 && x.onOff === 0), JSON.stringify(stSingle.filter(x => x.onOff || x.stable)));
  await p.evaluate(() => closeStory());

  // Коллаж «Карточки»: метка у двойника, переключатель её убирает; у одиночек кадр не меняется
  const collPl = async pick => {
    await p.evaluate(pick => { games.forEach(g => g._sel = false); (0, eval)(pick)().forEach(g => g._sel = true); openCollage(); setCollageMode('cards'); }, pick.toString());
    await sleep(6000);
    return p.evaluate(() => { _collSetPlat(false); redrawPreview(); const a = __snap('coll-canvas'); __ft = []; __ftOn = true; _collSetPlat(true); __ftOn = false;
      const b = __snap('coll-canvas'); const txt = __ft.slice(); _collSetPlat(false); const c = __snap('coll-canvas'); _collSetPlat(true);
      const res = { onOff: __diff(a, b), stable: __diff(a, c), tagged: txt.some(s => /\((PS4|PS5|PS4\/PS5)\)$/.test(s)) }; return res; });
  };
  const cTw = await collPl(() => [...__tw, ...__tw2]);
  await shot('coll-canvas', 'collage-plat-cards');
  await p.evaluate(() => closeCollage());
  const cSi = await collPl(() => games.filter(g => g._platform && g.priceRUB && !_platTag(g)).slice(0, 4));
  await p.evaluate(() => { setCollageMode('covers'); closeCollage(); });
  ok('метка в коллаже: у двойника есть, переключатель убирает; у одиночек кадр не меняется',
    cTw.onOff > 0 && cTw.tagged && cTw.stable === 0 && cSi.onOff === 0 && cSi.stable === 0, JSON.stringify({ cTw, cSi }));
  await p.evaluate(() => { CanvasRenderingContext2D.prototype.fillText = __ftOrig; });
  } // блок двойников

  // Переключатели переживают перезагрузку страницы и пишут событие в журнал
  await p.evaluate(() => { _stSetPlat(false); _collSetPlat(false); try { jFlush(); } catch (e) {} }); await sleep(1500);
  const plJ = (posted['/cc/journal'] || []).join('\n');
  ok('метка: переключение пишется в журнал (storyPlat, collagePlat)', /storyPlat/.test(plJ) && /collagePlat/.test(plJ));
  await p.reload({ waitUntil: 'networkidle0', timeout: 90000 });
  await p.waitForFunction(() => typeof games !== 'undefined' && games.length > 50, { timeout: 60000 });
  await plStubs();
  const plR = await p.evaluate(() => { games.forEach(g => g._sel = false); games.filter(g => g.priceRUB).slice(0, 2).forEach(g => g._sel = true); openStory(); const st = document.getElementById('st-plat-on')?.checked; closeStory();
    openCollage(); const cl = document.getElementById('coll-plat-on')?.checked; closeCollage();
    const v = s => { try { return (0, eval)(s); } catch (e) { return 'нет'; } };
    const r = { st: v('_stPlatOn'), cl: v('_collPlatOn'), stBox: st, clBox: cl }; _stSetPlat(true); _collSetPlat(true); return r; });
  ok('метка: выключенные переключатели переживают перезагрузку', plR.st === false && plR.cl === false && plR.stBox === false && plR.clBox === false, JSON.stringify(plR));

  ok('JS-ошибок нет', jsErr.length === 0, jsErr.slice(0, 5).join(' | '));
  const f = results.filter(r => !r.pass).length;
  console.log(`\nИТОГ: ${results.length - f}/${results.length} PASS` + (skipped.length ? `, пропущено ${skipped.length} (нет данных в каталоге)` : '') + `. Рендеры: ${OUT}`);
  await br.close(); srv.close(); process.exit(f ? 1 : 0);
})().catch(e => { console.error('STAND CRASH', e); srv.close(); process.exit(2); });
