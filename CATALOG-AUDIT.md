# Аудит каталога — 2026-10-11

Снапшот `api.poigraem.shop/db/snapshot`: **167 игр**. Скрипт: `node tools/catalog-audit.js` (перезапускаемый, ничего не меняет).
Обложки сверены той же логикой, что HD-апгрейд сторис и коллажа (`_hdCoverUrl`). Порог «мыльной» обложки — ширина
лёгкой обложки меньше 500px **и** HD из IGDB не нашёлся (иначе сторис и коллаж её заменят). Правки БД магазина — не здесь:
это список для Дениса (или запросом в Claude1).

## Сводка

| Проблема | Сколько |
|---|---|
| Битые названия | 5 |
| Капслок (часто официальное написание — решить) | 16 |
| Группы дублей | 6 |
| Без описания (короче 40 символов) | 0 |
| Чужая HD-обложка (IGDB нашёл другую игру или DLC) | 2 |
| Расхождение с IGDB, похожее на ту же игру | 6 |
| Мыльная обложка без HD | 3 |
| Обложка не грузится | 0 |
| Запросы к IGDB, не прошедшие и после повторов | 0 |

## Битые названия

«Как покажет content-creator» — результат `_displayTitle`: в постах и сторис уже так, в магазине — нет.

| id | Название в БД | Проблема | Как покажет content-creator |
|---|---|---|---|
| 1789042725405 | `GTA VI Ultimate` | издание без слова Edition | GTA VI Ultimate |
| 1790412131504.252 | `Gran Turismo™ 7 ` | пробел в начале/конце | Gran Turismo 7 |
| 1790412131539.9172 | `Wreckfest Version` | хвост «Version» | Wreckfest |
| 1790412131568.3044 | `Tony Hawk's™ Pro Skater™ 1 - 4 - Standard Edition Bundle` | «N - M» с пробелами вокруг дефиса | Tony Hawk's Pro Skater 1 - 4 - Standard Edition Bundle |
| 1790412131587.9622 | `Anno 1800™ Console Edition - Deluxe` | издание без слова Edition | Anno 1800 Console Edition - Deluxe |

## Капслок

Многие — официальное написание издателя (EA SPORTS, TEKKEN, HITMAN, STAR WARS). Править только явные: «FARCRY», «TOM CLANCY'S…».

| id | Название в БД | Слова капслоком |
|---|---|---|
| 1789070206236 | `EA SPORTS FC™ 27` | SPORTS |
| 1787079632481 | `EA SPORTS FC™ 27 Ultimate Edition PS4 & PS5` | SPORTS |
| 1781769211784.5508 | `EA SPORTS FC 26` | SPORTS |
| 1790412131553.9438 | `REMATCH` | REMATCH |
| 1790412131559.191 | `FARCRY 6 Game of the Year Edition` | FARCRY |
| 1790412131562.173 | `NASCAR 25` | NASCAR |
| 1790412131573.9954 | `STAR WARS™ Battlefront Classic Collection` | STAR WARS™ |
| 1790412131577.6816 | `CODE VEIN II Deluxe Edition` | CODE VEIN |
| 1790412131582.5024 | `LEGO® CITY Undercover` | CITY |
| 1790412131613.1152 | `DRAGON BALL XENOVERSE` | DRAGON BALL XENOVERSE |
| 1790412131615.6038 | `TEKKEN 7 - Originals Edition` | TEKKEN |
| 1790412131627.5488 | `TOM CLANCY'S THE DIVISION` | CLANCY'S DIVISION |
| 1790412131628.7024 | `XCOM® 2` | XCOM® |
| 1790412131648.4573 | `HITMAN World of Assassination Part One` | HITMAN |
| 1790412131652.0352 | `AFTERLIFE VR` | AFTERLIFE |
| 1790412131658.2532 | `SPACE RIFT - Episode 1` | SPACE RIFT |

## Дубли (одинаковое очищенное название)

| Группа | id | Название в БД | Цена, ₽ |
|---|---|---|---|
| 1 | 1790412131504.252 | `Gran Turismo™ 7 ` | 2580 |
| 1 | 1790412131505.9182 | `Gran Turismo™ 7` | 2430 |
| 2 | 1790412131509.8198 | `Mount & Blade II: Bannerlord` | 2120 |
| 2 | 1790412131510.191 | `Mount & Blade II: Bannerlord` | 2120 |
| 3 | 1790412131543.9453 | `The Elder Scrolls IV: Oblivion Remastered` | 3160 |
| 3 | 1790412131548.6743 | `The Elder Scrolls IV: Oblivion Remastered` | 3160 |
| 4 | 1790412131621.1167 | `Battlefield™ 2042` | 1040 |
| 4 | 1790412131622.874 | `Battlefield™ 2042` | 350 |
| 5 | 1790412131637.166 | `DOOM 3: VR Edition` | 730 |
| 5 | 1790412131656.448 | `DOOM 3: VR Edition` | 730 |
| 6 | 1790412131641.7349 | `Medieval Dynasty` | 1510 |
| 6 | 1790412131643.595 | `Medieval Dynasty` | 1330 |

## Без описания

_нет_

## Чужие обложки

HD-апгрейд принял обложку, но IGDB нашёл другую игру, дополнение или скин — в сторис и коллаж уедет чужая картинка.

| id | Название | IGDB нашёл | Почему чужая | Предлагаемое |
|---|---|---|---|---|
| 1790412131517.5786 | The Forest | The Forest of Doom (medium) | чужая: лишние слова: +of +doom | подобрать руками: вкладка PS Store пикера (нужен токен) или файл |
| 1790412131535.6997 | Batman: Arkham Knight | Batman: Arkham Knight - Batman: Noel Skin (low) | чужая: дополнение или скин: +noel +skin | подобрать руками: вкладка PS Store пикера (нужен токен) или файл |

**Расхождения, похожие на ту же игру** (полное название, подзаголовок главы, другое издание) — справочно, глазами при случае:

| id | Название | IGDB нашёл | Разбор |
|---|---|---|---|
| 1790412131518.5198 | Poppy Playtime: Chapter 5 | Poppy Playtime: Chapter 5 - Broken Things (low) | подзаголовок той же игры |
| 1790412131527.164 | UFC 6 Ultimate Edition | EA Sports UFC 6: Ultimate Edition (low) | издатель в начале названия |
| 1790412131552.7083 | Poppy Playtime: Chapter 4 | Poppy Playtime: Chapter 4 - Safe Haven (low) | подзаголовок той же игры |
| 1790412131555.6316 | Poppy Playtime: Chapter 3 | Poppy Playtime: Chapter 3 - Deep Sleep (low) | подзаголовок той же игры |
| 1790412131557.9028 | Poppy Playtime: Chapter 2 | Poppy Playtime: Chapter 2 - Fly in a Web (low) | подзаголовок той же игры |
| 1790412131567.304 | Tony Hawk's Pro Skater 3 + 4 - Cross-Gen Edition | Tony Hawk's Pro Skater 3 + 4: Digital Deluxe Edition (low) | другое издание той же игры |

## Мыльные обложки

| id | Название | Ширина, px | Почему нет HD | Предлагаемое |
|---|---|---|---|---|
| 1790412131568.3044 | Tony Hawk's Pro Skater 1 - 4 - Standard Edition Bundle | 264 | «Tony Hawk's Pro Skater 1 - 4 - Standard Edition Bundle» → не найдено; «Tony Hawk's Pro Skater 1 - 4» → не найдено | подобрать руками: вкладка PS Store пикера (нужен токен) или файл |
| 1790412131585.5042 | Poppy Playtime: Chapter 1 | 264 | «Poppy Playtime: Chapter 1» → Poppy Playtime (low, не принят) | IGDB по «Poppy Playtime: Chapter 1» → Poppy Playtime (low) |
| 1790412131655.1501 | British Horror Bundle | 370 | «British Horror Bundle» → не найдено; «British Horror» → не найдено | подобрать руками: вкладка PS Store пикера (нужен токен) или файл |

## Обложка не грузится

_нет_
