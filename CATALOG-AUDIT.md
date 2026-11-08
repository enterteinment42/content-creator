# Аудит каталога — 2026-11-08

Снапшот `api.poigraem.shop/db/snapshot`: **182 игр**. Скрипт: `node tools/catalog-audit.js` (перезапускаемый, ничего не меняет).
Обложки сверены той же логикой, что HD-апгрейд сторис и коллажа (`_hdCoverUrl`). Порог «мыльной» обложки — ширина
лёгкой обложки меньше 500px **и** HD из IGDB не нашёлся (иначе сторис и коллаж её заменят). Правки БД магазина — не здесь:
это список для Дениса (или запросом в Claude1).

## Сводка

| Проблема | Сколько |
|---|---|
| Битые названия | 1 |
| Капслок (часто официальное написание — решить) | 32 |
| Группы дублей | 3 |
| Без описания (короче 40 символов) | 0 |
| Чужая HD-обложка (IGDB нашёл другую игру или DLC) | 0 |
| Расхождение с IGDB, похожее на ту же игру | 2 |
| Мыльная обложка без HD | 16 |
| Обложка не грузится | 0 |
| Запросы к IGDB, не прошедшие и после повторов | 0 |

## Битые названия

«Как покажет content-creator» — результат `_displayTitle`: в постах и сторис уже так, в магазине — нет.

| id | Название в БД | Проблема | Как покажет content-creator |
|---|---|---|---|
| 1789042725405 | `GTA VI Ultimate` | издание без слова Edition | GTA VI Ultimate |

## Капслок

Многие — официальное написание издателя (EA SPORTS, TEKKEN, HITMAN, STAR WARS). Править только явные: «FARCRY», «TOM CLANCY'S…».

| id | Название в БД | Слова капслоком |
|---|---|---|
| 1789070206236 | `EA SPORTS FC™ 27` | SPORTS |
| 1781769211784.5508 | `EA SPORTS FC 26` | SPORTS |
| 1793797882744.0227 | `SAROS Digital Deluxe Edition` | SAROS |
| 1793797882745.7412 | `CONTROL Resonant Digital Deluxe Edition` | CONTROL |
| 1793797882754.7886 | `SILENT HILL: Townfall` | SILENT HILL |
| 1793797882757.4612 | `ASTRO BOT` | ASTRO |
| 1793797882761.6145 | `DEATH STRANDING 2: ON THE BEACH` | DEATH STRANDING BEACH |
| 1793797882764.981 | `PRAGMATA Deluxe Edition` | PRAGMATA |
| 1793797882767.0056 | `METAL GEAR SOLID Δ: SNAKE EATER Digital Deluxe Edition` | METAL GEAR SOLID SNAKE EATER |
| 1793797882772.1594 | `DARK SOULS™ III` | DARK SOULS™ |
| 1793797882773.0344 | `DARK SOULS™ III - Deluxe Edition` | DARK SOULS™ |
| 1793797882781.781 | `Assassin's Creed® Odyssey - GOLD EDITION` | GOLD EDITION |
| 1793797882791.9475 | `CONTROL Ultimate Edition` | CONTROL |
| 1793797882792.3247 | `TEKKEN 8 - Advanced Edition` | TEKKEN |
| 1793797882803.1526 | `HITMAN World of Assassination` | HITMAN |
| 1793797882805.571 | `SILENT HILL 2` | SILENT HILL |
| 1793797882806.3257 | `DARK SOULS™: REMASTERED` | DARK SOULS™ REMASTERED |
| 1793797882812.63 | `METAL GEAR SOLID: MASTER COLLECTION Vol.1` | METAL GEAR SOLID MASTER COLLECTION |
| 1793797882817.259 | `KINGDOM HEARTS HD 1.5 + 2.5 ReMIX` | KINGDOM HEARTS |
| 1793797882821.4722 | `DYNASTY WARRIORS: ORIGINS` | DYNASTY WARRIORS ORIGINS |
| 1793797882822.0847 | `DYNASTY WARRIORS: ORIGINS Digital Deluxe Edition` | DYNASTY WARRIORS ORIGINS |
| 1793797882833.7156 | `SILENT HILL f` | SILENT HILL |
| 1793797882834.138 | `FARCRY 6 Gold Edition` | FARCRY |
| 1793797882835.6514 | `TEKKEN 7 - Season Pass` | TEKKEN |
| 1793797882836.239 | `LEGO® CITY Undercover` | CITY |
| 1793797882849.0837 | `FINAL FANTASY® IX Digital Edition` | FINAL FANTASY® |
| 1793797882862.4607 | `HOT WHEELS UNLEASHED` | WHEELS UNLEASHED |
| 1793797882893.6965 | `XIII` | XIII |
| 1793797882894.5532 | `SUPERHOT ONE OF US BUNDLE` | SUPERHOT BUNDLE |
| 1793797882912.4749 | `SUPERHOT VR` | SUPERHOT |
| 1793797882913.061 | `POSTAL 4: No Regerts` | POSTAL |
| 1793797882915.0474 | `SUPERHOT` | SUPERHOT |

## Дубли (одинаковое очищенное название)

| Группа | id | Название в БД | Цена, ₽ |
|---|---|---|---|
| 1 | 1793797882769.1082 | `God of War Ragnarök` | 2430 |
| 1 | 1793797882770.8003 | `God of War Ragnarök` | 3130 |
| 2 | 1793797882825.821 | `Sniper Ghost Warrior Contracts 1 & 2 Double Pack` | 620 |
| 2 | 1793797882827.8203 | `Sniper Ghost Warrior Contracts 1 & 2 Double Pack` | 620 |
| 3 | 1793797882904.491 | `Poppy Playtime: Chapter 2` | 590 |
| 3 | 1793797882905.353 | `Poppy Playtime: Chapter 2` | 590 |

## Без описания

_нет_

## Чужие обложки

HD-апгрейд принял обложку, но IGDB нашёл другую игру, дополнение или скин — в сторис и коллаж уедет чужая картинка.

_нет_

**Расхождения, похожие на ту же игру** (полное название, подзаголовок главы, другое издание) — справочно, глазами при случае:

| id | Название | IGDB нашёл | Разбор |
|---|---|---|---|
| 1793797882748.8484 | UFC 6 Ultimate Edition | EA Sports UFC 6: Ultimate Edition (low) | издатель в начале названия |
| 1793797960748.3425 | UFC 4 Deluxe Edition | EA Sports UFC 4: Deluxe Edition (low) | издатель в начале названия |

## Мыльные обложки

| id | Название | Ширина, px | Почему нет HD | Предлагаемое |
|---|---|---|---|---|
| 1793797882751.5059 | Mortal Shell II: Devout Edition | 370 | «Mortal Shell II: Devout Edition» → не найдено; «Mortal Shell II: Devout» → не найдено | подобрать руками: вкладка PS Store пикера (нужен токен) или файл |
| 1793797882760.8005 | The Blood of Dawnwalker - Eclipse Edition | 370 | «The Blood of Dawnwalker - Eclipse Edition» → не найдено; «The Blood of Dawnwalker - Eclipse» → не найдено | подобрать руками: вкладка PS Store пикера (нужен токен) или файл |
| 1793797882779.7002 | Poppy Playtime: Chapter 5 | 264 | «Poppy Playtime: Chapter 5» → Poppy Playtime: Chapter 5 - Broken Things (low, не принят) | IGDB по «Poppy Playtime: Chapter 5» → Poppy Playtime: Chapter 5 - Broken Things (low) |
| 1793797882780.0935 | Batman: Arkham Knight | 370 | «Batman: Arkham Knight» → Batman: Arkham Knight - Batman: Noel Skin (low, не принят) | IGDB по «Batman: Arkham Knight» → Batman: Arkham Knight - Batman: Noel Skin (low) |
| 1793797882789.1018 | Wreckfest: Drive Hard. Die Last. | 370 | «Wreckfest: Drive Hard. Die Last.» → не найдено | подобрать руками: вкладка PS Store пикера (нужен токен) или файл |
| 1793797882812.63 | METAL GEAR SOLID: MASTER COLLECTION Vol.1 | 370 | «METAL GEAR SOLID: MASTER COLLECTION Vol.1» → не найдено; «METAL GEAR SOLID: MASTER» → Metal Gear Solid: Master Collection Version (low, не принят) | IGDB по «METAL GEAR SOLID: MASTER» → Metal Gear Solid: Master Collection Version (low) |
| 1793797882824.9263 | Poppy Playtime: Chapter 4 | 264 | «Poppy Playtime: Chapter 4» → Poppy Playtime: Chapter 4 - Safe Haven (low, не принят) | IGDB по «Poppy Playtime: Chapter 4» → Poppy Playtime: Chapter 4 - Safe Haven (low) |
| 1793797882860.4414 | Disney Epic Mickey: Rebrushed | 264 | «Disney Epic Mickey: Rebrushed» → Epic Mickey: Rebrushed (low, не принят) | IGDB по «Disney Epic Mickey: Rebrushed» → Epic Mickey: Rebrushed (low) |
| 1793797882856.9492 | Wolfenstein: Resistance Bundle | 370 | «Wolfenstein: Resistance Bundle» → не найдено; «Wolfenstein: Resistance» → не найдено | подобрать руками: вкладка PS Store пикера (нужен токен) или файл |
| 1793797882896.2178 | Arizona Sunshine VR 2 Deluxe Edition | 370 | «Arizona Sunshine VR 2 Deluxe Edition» → не найдено; «Arizona Sunshine VR 2» → Arizona Sunshine II (low, не принят) | IGDB по «Arizona Sunshine VR 2» → Arizona Sunshine II (low) |
| 1793797882903.321 | Poppy Playtime: Chapter 3 | 264 | «Poppy Playtime: Chapter 3» → Poppy Playtime: Chapter 3 - Deep Sleep (low, не принят) | IGDB по «Poppy Playtime: Chapter 3» → Poppy Playtime: Chapter 3 - Deep Sleep (low) |
| 1793797882904.491 | Poppy Playtime: Chapter 2 | 264 | «Poppy Playtime: Chapter 2» → Poppy Playtime: Chapter 2 - Fly in a Web (low, не принят) | IGDB по «Poppy Playtime: Chapter 2» → Poppy Playtime: Chapter 2 - Fly in a Web (low) |
| 1793797882905.353 | Poppy Playtime: Chapter 2 | 264 | «Poppy Playtime: Chapter 2» → Poppy Playtime: Chapter 2 - Fly in a Web (low, не принят) | IGDB по «Poppy Playtime: Chapter 2» → Poppy Playtime: Chapter 2 - Fly in a Web (low) |
| 1793797882906.656 | Metro Awakening | 264 | «Metro Awakening» → Metro Awakening VR (medium, не принят) | IGDB по «Metro Awakening» → Metro Awakening VR (medium) |
| 1793797882907.4807 | Metro Awakening + Arizona Sunshine 2 | 370 | «Metro Awakening Arizona Sunshine 2» → не найдено | подобрать руками: вкладка PS Store пикера (нужен токен) или файл |
| 1793797882910.6284 | VR Co-Apocalypse Bundle - Arizona Sunshine VR Remake + After the Fall | 370 | «VR Co-Apocalypse Bundle - Arizona Sunshine VR Remake After the Fall» → не найдено; «VR Co-Apocalypse» → не найдено | подобрать руками: вкладка PS Store пикера (нужен токен) или файл |

## Обложка не грузится

_нет_
