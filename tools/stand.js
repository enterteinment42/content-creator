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
    // Обложка-заглушка с задержкой для проверок гонок: /stand-img/<цвет>?ms=<задержка>
    if (pth.startsWith('/stand-img/')) {
      const c = pth.split('/')[2], ms = +new URL(u).searchParams.get('ms') || 0;
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
        return r.respond({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: claudeQ.shift() }] }) });
      }
      return r.respond({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ ok: true, draftId: 'stand1' }) });
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
  });
  const shot = async (id, name) => { const b64 = await p.evaluate(id => document.getElementById(id).toDataURL('image/png').split(',')[1], id); fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(b64, 'base64')); };
  const saveDl = async name => { const b64 = await p.evaluate(() => __dl[0] && __dl[0].href.split(',')[1]); if (b64) fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(b64, 'base64')); };

  // ── Названия ───────────────────────────────────────────────
  const dt = await p.evaluate(() => ['NBA 2K26 for', 'Game for PS5', 'Wolfenstein® II: The New Colossus™ (CUSA07378)', 'Far Cry 6 PS4 & PS5'].map(s => [s, _displayTitle(s)]));
  ok('_displayTitle: висячий for', dt[0][1] === 'NBA 2K26' && dt[1][1] === 'Game', JSON.stringify(dt));
  const dangling = await p.evaluate(() => games.map(g => _displayTitle(g.title)).filter(t => /\s(for|and|of|the|&|-)$/i.test(t)));
  ok('_displayTitle: висячих хвостов по каталогу нет', dangling.length === 0, dangling.join(' | '));
  // HD из IGDB: low-ответ с дополнением (скин, пак, сезонный абонемент) — не наша игра; «EA Sports UFC 6» на «UFC 6» — наша
  const lm = await p.evaluate(() => [['Batman: Arkham Knight', 'Batman: Arkham Knight - Batman: Noel Skin'], ['UFC 6', 'EA Sports UFC 6'],
    ['Crash Bandicoot N. Sane Trilogy', 'Crash Bandicoot N. Sane Trilogy'], ['DOOM Soundtrack', 'DOOM Soundtrack Vol. 1'], ['Fallout 4', 'Fallout 4: Season Pass']].map(([q, m]) => _lowMatchOk(q, m)));
  ok('_lowMatchOk: дополнения не проходят, если их нет в запросе', lm.join() === 'false,true,true,true,false', lm.join());

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
    // г) экспорт перезагружает обложки; выбор, сделанный во время экспорта, не откатывается
    _stG[0].imgUrl = __slowImg('red', 1500); _stG[0].imgEl = await __img(__slowImg('red', 0)); window.__dl = [];
    downloadStory(); await __wait(150); _stPickImg(0); _pickerApply(__slowImg('blue', 0)); await __wait(2600);
    const d = __col(_stG[0].imgEl), dl = __dl.length;
    window._hdCoverUrl = hdBak;
    _stG.slice(0, 2).forEach((g, i) => Object.assign(g, { imgUrl: bak[i].u, imgEl: bak[i].e, _hdDone: bak[i].h })); _stRedrawCurrent();
    return { a, b, c, d, dl };
  });
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
    Object.assign(collageCovers[0], { img: bak.img, imgEl: bak.el, transform: bak.t }); renderCollageSlots(); redrawPreview();
    return { a, b, dl };
  });
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
  // /api/tg-post отправляет с parse_mode Markdown — значит в теле [название](url), а не HTML.
  await p.evaluate(() => sendPostToTG()); await sleep(500);
  const armed = (posted['/api/tg-post'] || []).length;
  await p.evaluate(() => sendPostToTG()); await sleep(1500);
  const tp = posted['/api/tg-post'] || [];
  ok('📤 в канал: первый клик взводит, второй шлёт ровно один запрос', armed === 0 && tp.length === 1, `${armed} → ${tp.length}`);
  if (tp[0]) {
    const b = JSON.parse(tp[0]);
    ok('📤 в канал: Markdown со ссылками ?game=, без HTML-тегов', /\]\(https:\/\/poigraem\.shop\/\?game=/.test(b.text) && !/<\/?[a-z][^>]*>/i.test(b.text), b.text.slice(0, 160));
    fs.writeFileSync(path.join(OUT, 'tg-post-body.md'), b.text);
  }
  ok('📤 в канал: тост об успехе', /Пост отправлен в канал/.test(await p.evaluate(() => __toast())), await p.evaluate(() => __toast()));

  // Лимит Telegram — по видимому тексту: адреса ссылок в 1024 подписи не входят (как у «🕐 В очередь бота»)
  const lim = await p.evaluate(() => {
    const box = document.getElementById('out-text'), bak = { html: box.innerHTML, img: _ccPostImg };
    _ccPostImg = 'data:image/jpeg;base64,AAAA';
    box.innerHTML = Array.from({ length: 10 }, (_, i) => `<a href="https://poigraem.shop/?game=1234567890123456${i}">Игра номер ${i}</a> ` + 'о'.repeat(70)).join('<br>');
    _updateOutCount(); const cnt = document.getElementById('out-count').textContent, vis = _outSerialize('visible').length, md = _outSerialize('md').length;
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
  await p.keyboard.press('Escape');
  ok('горячие клавиши: Esc закрывает пост', await p.evaluate(() => !document.getElementById('tg-modal').classList.contains('open')));

  ok('JS-ошибок нет', jsErr.length === 0, jsErr.slice(0, 5).join(' | '));
  const f = results.filter(r => !r.pass).length;
  console.log(`\nИТОГ: ${results.length - f}/${results.length} PASS. Рендеры: ${OUT}`);
  await br.close(); srv.close(); process.exit(f ? 1 : 0);
})().catch(e => { console.error('STAND CRASH', e); srv.close(); process.exit(2); });
