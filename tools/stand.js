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
    if (/^\/(api\/(claude|tg-post|cc-queue)|cc\/journal)/.test(pth)) {
      (posted[pth] = posted[pth] || []).push(r.postData() || '');
      // Claude сломан нарочно: пост обязан собираться из описаний снапшота и без него
      if (pth === '/api/claude') return r.respond({ status: 500, headers: CORS, contentType: 'application/json', body: '{"error":"stub"}' });
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
  });
  const shot = async (id, name) => { const b64 = await p.evaluate(id => document.getElementById(id).toDataURL('image/png').split(',')[1], id); fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(b64, 'base64')); };
  const saveDl = async name => { const b64 = await p.evaluate(() => __dl[0] && __dl[0].href.split(',')[1]); if (b64) fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(b64, 'base64')); };

  // ── Названия ───────────────────────────────────────────────
  const dt = await p.evaluate(() => ['NBA 2K26 for', 'Game for PS5', 'Wolfenstein® II: The New Colossus™ (CUSA07378)', 'Far Cry 6 PS4 & PS5'].map(s => [s, _displayTitle(s)]));
  ok('_displayTitle: висячий for', dt[0][1] === 'NBA 2K26' && dt[1][1] === 'Game', JSON.stringify(dt));
  const dangling = await p.evaluate(() => games.map(g => _displayTitle(g.title)).filter(t => /\s(for|and|of|the|&|-)$/i.test(t)));
  ok('_displayTitle: висячих хвостов по каталогу нет', dangling.length === 0, dangling.join(' | '));

  // ── Сторис ─────────────────────────────────────────────────
  await p.evaluate(() => __sel(6)); await p.evaluate(() => openStory());
  const t46 = await p.evaluate(() => __toast());
  ok('аудит 46: тост про первые 5', /доступны первые 5 игр \(в кадре одновременно до 3\)/.test(t46), t46);
  await sleep(15000); // HD-обложки из IGDB
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
               // левая кромка в нижней трети — там «Постер» затемняет, а «Диагональ» кладёт клин
               edge: __diff(__crop(off, 0, .7, .03, floor - .02), __crop(on, 0, .7, .03, floor - .02)),
               safe: __diff(__crop(off, .1, floor + .03, .9, 1), __crop(on, .1, floor + .03, .9, 1)) };
    }, t);
    // qr — справочно: свечение у края до середины кода не дотягивалось и до правки, падать здесь нечему
    ok(`неон во весь кадр (${t}): кромка над зоной TG и видна под затемнением`, r.safe < 1 && r.edge > 20, JSON.stringify(r));
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
  await p.evaluate(() => { _stSetFit('cover'); closeStory(); });

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
  await p.evaluate(() => closeCollage());

  const html = fs.readFileSync(SRC, 'utf8');
  const dbl = html.match(/<[^>]*style="[^"]*display:\s*none[^"]*display:\s*none[^"]*"[^>]*>/g) || [];
  ok('аудит 46: нет двойного display:none в разметке', dbl.length === 0, dbl.map(s => s.slice(0, 80)).join(' | '));

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

  ok('JS-ошибок нет', jsErr.length === 0, jsErr.slice(0, 5).join(' | '));
  const f = results.filter(r => !r.pass).length;
  console.log(`\nИТОГ: ${results.length - f}/${results.length} PASS. Рендеры: ${OUT}`);
  await br.close(); srv.close(); process.exit(f ? 1 : 0);
})().catch(e => { console.error('STAND CRASH', e); srv.close(); process.exit(2); });
