# Аудит каталога — 2026-10-13

Снапшот `api.poigraem.shop/db/snapshot`: **300 игр**. Скрипт: `node tools/catalog-audit.js` (перезапускаемый, ничего не меняет).
Обложки сверены той же логикой, что HD-апгрейд сторис и коллажа (`_hdCoverUrl`). Порог «мыльной» обложки — ширина
лёгкой обложки меньше 500px **и** HD из IGDB не нашёлся (иначе сторис и коллаж её заменят). Правки БД магазина — не здесь:
это список для Дениса (или запросом в Claude1).

## Сводка

| Проблема | Сколько |
|---|---|
| Битые названия | 6 |
| Капслок (часто официальное написание — решить) | 49 |
| Группы дублей | 4 |
| Без описания (короче 40 символов) | 95 |
| Чужая HD-обложка (IGDB нашёл другую игру или DLC) | 0 |
| Расхождение с IGDB, похожее на ту же игру | 4 |
| Мыльная обложка без HD | 10 |
| Обложка не грузится | 0 |
| Запросы к IGDB, не прошедшие и после повторов | 0 |

## Битые названия

«Как покажет content-creator» — результат `_displayTitle`: в постах и сторис уже так, в магазине — нет.

| id | Название в БД | Проблема | Как покажет content-creator |
|---|---|---|---|
| 1789042725405 | `GTA VI Ultimate` | издание без слова Edition | GTA VI Ultimate |
| 1791790396598.1545 | `Hogwarts Legacy Version` | хвост «Version» | Hogwarts Legacy |
| 1791790396643.9941 | `Hogwarts Legacy Version` | хвост «Version» | Hogwarts Legacy |
| 1791790396658.3806 | `Wolfenstein® II: The New Colossus™ (CUSA07378)` | код PS Store в названии | Wolfenstein II: The New Colossus |
| 1791790396776.12 | `Monster Hunter Rise + Sunbreak Deluxe` | издание без слова Edition | Monster Hunter Rise + Sunbreak Deluxe |
| 1791790396828.0425 | `Sonic Colours: Ultimate` | издание без слова Edition | Sonic Colours: Ultimate |

## Капслок

Многие — официальное написание издателя (EA SPORTS, TEKKEN, HITMAN, STAR WARS). Править только явные: «FARCRY», «TOM CLANCY'S…».

| id | Название в БД | Слова капслоком |
|---|---|---|
| 1789070206236 | `EA SPORTS FC™ 27` | SPORTS |
| 1781769211784.5508 | `EA SPORTS FC 26` | SPORTS |
| 1791790396582.8687 | `UNCHARTED 4: A Thief’s End & UNCHARTED: The Lost Legacy Digital Bundle` | UNCHARTED UNCHARTED |
| 1791790396594.7725 | `TEKKEN 8` | TEKKEN |
| 1791790396595.9812 | `DEATH STRANDING 2: ON THE BEACH Digital Deluxe Edition` | DEATH STRANDING BEACH |
| 1791790396604.1213 | `Resident Evil 3 RACCOON CITY EDITION` | RACCOON CITY EDITION |
| 1791790396610.6062 | `SAROS` | SAROS |
| 1791790396611.3147 | `RESIDENT EVIL 7 biohazard Gold Edition` | RESIDENT EVIL |
| 1791790396616.8662 | `STAR WARS Jedi: Survivor` | STAR WARS |
| 1791790396622.868 | `METAL GEAR SOLID Δ: SNAKE EATER` | METAL GEAR SOLID SNAKE EATER |
| 1791790396647.5051 | `TEKKEN 8 - Season 2 Ultimate Edition` | TEKKEN |
| 1791790396650.706 | `DEATHLOOP Deluxe Edition` | DEATHLOOP |
| 1791790396651.7905 | `RIDE 6` | RIDE |
| 1791790396652.3354 | `EA SPORTS™ Madden NFL 27` | SPORTS™ |
| 1791790396653.4658 | `LIMBO & INSIDE Bundle` | LIMBO INSIDE |
| 1791790396662.8286 | `TEKKEN 7 - Definitive Edition` | TEKKEN |
| 1791790396664.5483 | `INSIDE` | INSIDE |
| 1791790396667.8826 | `DIRT 5` | DIRT |
| 1791790396674.3423 | `RESIDENT EVIL 2 Deluxe Edition` | RESIDENT EVIL |
| 1791790396676.3452 | `RIDE 6 - Ultimate Edition` | RIDE |
| 1791790396681.1885 | `STAR WARS Jedi: Fallen Order` | STAR WARS |
| 1791790396688.522 | `NARUTO X BORUTO Ultimate Ninja STORM CONNECTIONS` | NARUTO BORUTO STORM CONNECTIONS |
| 1791790396692.2969 | `EA STAR WARS™ TRIPLE BUNDLE` | STAR WARS™ TRIPLE BUNDLE |
| 1791790396703.26 | `STAR WARS™ Jedi Cross-Gen Bundle Edition` | STAR WARS™ |
| 1791790396711.4893 | `KILLZONE™ SHADOW FALL` | KILLZONE™ SHADOW FALL |
| 1791790396715.1638 | `SONIC FORCES` | SONIC FORCES |
| 1791790396718.4817 | `REMATCH - PRO EDITION` | REMATCH EDITION |
| 1791790396728.771 | `REMATCH × BLUE LOCK TRAINING PACK BUNDLE` | REMATCH BLUE LOCK TRAINING PACK BUNDLE |
| 1791790396731.6929 | `GORN 2` | GORN |
| 1791790396736.946 | `DEATH STRANDING Digital Deluxe Edition` | DEATH STRANDING |
| 1791790396740.7368 | `STAR WARS Jedi: Survivor` | STAR WARS |
| 1791790396747.519 | `STAR WARS™: Squadrons` | STAR WARS™ |
| 1791790396749.0562 | `FINAL FANTASY XVI` | FINAL FANTASY |
| 1791790396752.6602 | `MONOPOLY Madness` | MONOPOLY |
| 1791790396753.26 | `NINJA GAIDEN: Master Collection` | NINJA GAIDEN |
| 1791790396774.5942 | `SOULCALIBUR Ⅵ` | SOULCALIBUR |
| 1791790396782.892 | `GRID Legends` | GRID |
| 1791790396788.2812 | `HELLDIVERS™: Super-Earth Ultimate Edition` | HELLDIVERS™ |
| 1791790396800.4434 | `ELEX II` | ELEX |
| 1791790396801.0361 | `FINAL FANTASY® X/X-2 HD Remaster` | FINAL FANTASY® |
| 1791790396806.2883 | `FINAL FANTASY III` | FINAL FANTASY |
| 1791790396809.4531 | `NINJA GAIDEN: Master Collection Deluxe Edition` | NINJA GAIDEN |
| 1791790396815.0557 | `ELEX` | ELEX |
| 1791790396831.809 | `DRAGON BALL FighterZ - FighterZ Pass` | DRAGON BALL |
| 1791790396834.0579 | `STAR WARS™: Bounty Hunter™ & Republic Commando™ Bundle` | STAR WARS™ |
| 1791790396835.1885 | `GORN` | GORN |
| 1791790396862.7024 | `PARKOUR SIMULATOR VR` | PARKOUR SIMULATOR |
| 1791790455039.1829 | `REANIMAL` | REANIMAL |
| 1791790455039.318 | `GORN Collection` | GORN |

## Дубли (одинаковое очищенное название)

| Группа | id | Название в БД | Цена, ₽ |
|---|---|---|---|
| 1 | 1791790396598.1545 | `Hogwarts Legacy Version` | 1220 |
| 1 | 1791790396643.9941 | `Hogwarts Legacy Version` | 1080 |
| 2 | 1791790396602.8381 | `The Quarry` | 820 |
| 2 | 1791790396772.6655 | `The Quarry` | 760 |
| 3 | 1791790396616.8662 | `STAR WARS Jedi: Survivor` | 1100 |
| 3 | 1791790396740.7368 | `STAR WARS Jedi: Survivor` | 1180 |
| 4 | 1791790396810.5896 | `Chernobylite Complete Edition` | 780 |
| 4 | 1791790396845.7737 | `Chernobylite Complete Edition` | 780 |

## Без описания

| id | Название | Длина описания |
|---|---|---|
| 1791790396572.2278 | NBA 2K27 | 0 |
| 1791790396580.514 | Mafia III: Definitive Edition | 0 |
| 1791790396591.8323 | Mafia: Definitive Edition | 0 |
| 1791790396595.9812 | DEATH STRANDING 2: ON THE BEACH Digital Deluxe Edition | 0 |
| 1791790396610.6062 | SAROS | 0 |
| 1791790396612.499 | LEGO® Batman™: Legacy of the Dark Knight Deluxe Edition | 0 |
| 1791790396614.331 | Farming Simulator 25 | 0 |
| 1791790396620.084 | Need for Speed™ Unbound Ultimate Collection | 0 |
| 1791790396622.868 | METAL GEAR SOLID Δ: SNAKE EATER | 0 |
| 1791790396630.1375 | SnowRunner - 5-Year Anniversary Edition | 0 |
| 1791790396634.3064 | NHL 27 Deluxe Edition | 0 |
| 1791790396642.0215 | God of War™ Digital Deluxe Edition | 0 |
| 1791790396650.706 | DEATHLOOP Deluxe Edition | 0 |
| 1791790396652.3354 | EA SPORTS™ Madden NFL 27 | 0 |
| 1791790396654.6177 | Little Nightmares II | 0 |
| 1791790396655.385 | Dying Light 2 Stay Human | 0 |
| 1791790396664.5483 | INSIDE | 0 |
| 1791790396675.3782 | Farming Simulator 22 | 0 |
| 1791790396686.535 | Grounded 2 | 0 |
| 1791790396691.146 | LEGO® Batman™: Legacy of the Dark Knight Deluxe Edition Upgrade | 0 |
| 1791790396704.3708 | Knack 2 | 0 |
| 1791790396711.4893 | KILLZONE™ SHADOW FALL | 0 |
| 1791790396715.1638 | SONIC FORCES | 0 |
| 1791790396716.8982 | The Alters: Deluxe Edition | 0 |
| 1791790396717.8147 | Fallout 4: Anniversary Edition Upgrade | 0 |
| 1791790396724.0242 | Fallout 4: Anniversary Edition | 0 |
| 1791790396728.771 | REMATCH × BLUE LOCK TRAINING PACK BUNDLE | 0 |
| 1791790396730.127 | Devil May Cry HD Collection & 4SE Bundle | 0 |
| 1791790396731.6929 | GORN 2 | 0 |
| 1791790396734.9768 | Injustice: Gods Among Us Ultimate Edition | 0 |
| 1791790396736.946 | DEATH STRANDING Digital Deluxe Edition | 0 |
| 1791790396743.8381 | Journey™ Collector’s Edition | 0 |
| 1791790396744.5103 | Vagrus - The Riven Realms | 0 |
| 1791790396746.2021 | Cooking Simulator VR | 0 |
| 1791790396747.519 | STAR WARS™: Squadrons | 0 |
| 1791790396750.005 | Marathon Deluxe Edition | 0 |
| 1791790396752.6602 | MONOPOLY Madness | 0 |
| 1791790396767.7222 | Life is Strange: Double Exposure Ultimate Edition | 0 |
| 1791790396770.995 | Tom Clancy's Ghost Recon® Breakpoint Gold Edition | 0 |
| 1791790396774.5942 | SOULCALIBUR Ⅵ | 0 |
| 1791790396777.705 | Borderlands 3: Super Deluxe Edition | 0 |
| 1791790396779.203 | Risen | 0 |
| 1791790396782.892 | GRID Legends | 0 |
| 1791790396783.8318 | Sniper Ghost Warrior Contracts 2 Complete Edition | 0 |
| 1791790396785.8706 | Terminator: Resistance | 0 |
| 1791790396787.8823 | Farming Simulator 17 | 0 |
| 1791790396788.2812 | HELLDIVERS™: Super-Earth Ultimate Edition | 0 |
| 1791790396794.392 | Internet Cafe Simulator 2025 | 0 |
| 1791790396796.73 | Farming Simulator 19 - Platinum Expansion | 0 |
| 1791790396798.761 | Firefighting Simulator - The Squad | 0 |
| 1791790396799.4612 | Chivalry 2 | 0 |
| 1791790396806.2883 | FINAL FANTASY III | 0 |
| 1791790396809.4531 | NINJA GAIDEN: Master Collection Deluxe Edition | 0 |
| 1791790396811.126 | Sonic Origins Plus | 0 |
| 1791790396815.0557 | ELEX | 0 |
| 1791790396817.8733 | WRC 9 Deluxe Edition FIA World Rally Championship | 0 |
| 1791790396818.932 | Evil Inside VR | 0 |
| 1791790396819.9912 | Tails of Iron 2: Whiskers of Winter | 0 |
| 1791790396820.4675 | Tom Clancy’s Rainbow Six® Extraction Deluxe Edition | 0 |
| 1791790396821.488 | Farming Simulator 15 | 0 |
| 1791790396822.3035 | Don't Starve Together: Survival Edition | 0 |
| 1791790396823.334 | LEGO Star Wars II: The Original Trilogy | 0 |
| 1791790396824.4597 | Jurassic World Aftermath Collection | 0 |
| 1791790396825.2305 | Nioh | 0 |
| 1791790396826.5835 | Insurgency: Sandstorm | 0 |
| 1791790396827.658 | Grow: Song of the Evertree | 0 |
| 1791790396828.0425 | Sonic Colours: Ultimate | 0 |
| 1791790396829.9773 | Indiana Jones and the Staff of Kings | 0 |
| 1791790396830.9148 | LEGO® DC Super-Villains Deluxe Edition | 0 |
| 1791790396831.809 | DRAGON BALL FighterZ - FighterZ Pass | 0 |
| 1791790396832.3215 | Bartender VR Simulator | 0 |
| 1791790396833.3904 | Batman™: Arkham VR | 0 |
| 1791790396834.0579 | STAR WARS™: Bounty Hunter™ & Republic Commando™ Bundle | 0 |
| 1791790396838.663 | Tom Clancy’s Rainbow Six® Extraction | 0 |
| 1791790396841.3052 | Ghostrunner 2 Deluxe Edition | 0 |
| 1791790396842.1072 | Monster Hunter Stories Deluxe Collection | 0 |
| 1791790396844.1187 | Yakuza: Like a Dragon Hero Edition | 0 |
| 1791790396847.1482 | Back 4 Blood: Standard Edition | 0 |
| 1791790396849.052 | Farming Simulator 19 | 0 |
| 1791790396850.6938 | Bayonetta & Vanquish 10th Anniversary Bundle | 0 |
| 1791790396851.8787 | Ghostrunner Game Bundle | 0 |
| 1791790396852.1172 | Psychonauts In The Rhombus Of Ruin | 0 |
| 1791790396853.2957 | Like a Dragon: Infinite Wealth | 0 |
| 1791790396854.5642 | Expeditions: A MudRunner Game | 0 |
| 1791790396855.3093 | Wolfenstein: Cyberpilot | 0 |
| 1791790396856.1846 | Carly and the Reaperman - Escape from the Underworld | 0 |
| 1791790396857.8542 | Kayak VR: Mirage Complete Edition | 0 |
| 1791790396858.0483 | Red Matter 2 | 0 |
| 1791790396862.7024 | PARKOUR SIMULATOR VR | 0 |
| 1791790396863.43 | Electrician Simulator VR | 0 |
| 1791790396865.2974 | D-Day Enhanced - Special Edition | 0 |
| 1791790455039.8508 | DiRT Rally 2.0 - Game of the Year Edition | 0 |
| 1791790455039.775 | NHL 27 Standard Edition | 0 |
| 1791790455039.318 | GORN Collection | 0 |
| 1791790455039.0798 | UFC® 4 Deluxe Edition | 0 |

## Чужие обложки

HD-апгрейд принял обложку, но IGDB нашёл другую игру, дополнение или скин — в сторис и коллаж уедет чужая картинка.

_нет_

**Расхождения, похожие на ту же игру** (полное название, подзаголовок главы, другое издание) — справочно, глазами при случае:

| id | Название | IGDB нашёл | Разбор |
|---|---|---|---|
| 1791790396573.6436 | UFC 6 | EA Sports UFC 6 (low) | издатель в начале названия |
| 1791790396606.3147 | Grand Theft Auto V and Great White Shark Card Bundle | Grand Theft Auto V: Premium Edition & Great White Shark Card Bundle (low) | другое издание той же игры |
| 1791790396685.6072 | Persona 3 Reload | Persona 3 Reload: Persona 4 Golden Persona Set (low) | подзаголовок той же игры |
| 1791790455039.0798 | UFC 4 Deluxe Edition | EA Sports UFC 4: Deluxe Edition (low) | издатель в начале названия |

## Мыльные обложки

| id | Название | Ширина, px | Почему нет HD | Предлагаемое |
|---|---|---|---|---|
| 1791790396582.8687 | UNCHARTED 4: A Thief’s End & UNCHARTED: The Lost Legacy Digital Bundle | 370 | «UNCHARTED 4: A Thief’s End & UNCHARTED: The Lost Legacy Digital Bundle» → не найдено; «UNCHARTED 4: A Thief’s End & UNCHARTED: The Lost Legacy» → не найдено | подобрать руками: вкладка PS Store пикера (нужен токен) или файл |
| 1791790396604.1213 | Resident Evil 3 RACCOON CITY EDITION | 370 | «Resident Evil 3 RACCOON CITY EDITION» → не найдено; «Resident Evil 3 RACCOON CITY» → не найдено | подобрать руками: вкладка PS Store пикера (нужен токен) или файл |
| 1791790396652.3354 | EA SPORTS Madden NFL 27 | 370 | «EA SPORTS Madden NFL 27» → не найдено | подобрать руками: вкладка PS Store пикера (нужен токен) или файл |
| 1791790396660.3162 | Mortal Kombat: Elder God Bundle | 370 | «Mortal Kombat: Elder God Bundle» → не найдено; «Mortal Kombat: Elder God» → не найдено | подобрать руками: вкладка PS Store пикера (нужен токен) или файл |
| 1791790396728.771 | REMATCH × BLUE LOCK TRAINING PACK BUNDLE | 370 | «REMATCH × BLUE LOCK TRAINING PACK BUNDLE» → не найдено; «REMATCH × BLUE LOCK TRAINING» → не найдено | подобрать руками: вкладка PS Store пикера (нужен токен) или файл |
| 1791790396738.6333 | Age of Empires II + Age of Mythology Premium Edition Bundle | 370 | «Age of Empires II Age of Mythology Premium Edition Bundle» → не найдено; «Age of Empires II Age of Mythology» → Age of Empires: Mythologies (low, не принят) | IGDB по «Age of Empires II Age of Mythology» → Age of Empires: Mythologies (low) |
| 1791790396788.2812 | HELLDIVERS: Super-Earth Ultimate Edition | 370 | «HELLDIVERS: Super-Earth Ultimate Edition» → не найдено; «HELLDIVERS: Super-Earth» → не найдено | подобрать руками: вкладка PS Store пикера (нужен токен) или файл |
| 1791790396822.3035 | Don't Starve Together: Survival Edition | 370 | «Don't Starve Together: Survival Edition» → не найдено; «Don't Starve Together: Survival» → не найдено | подобрать руками: вкладка PS Store пикера (нужен токен) или файл |
| 1791790396828.0425 | Sonic Colours: Ultimate | 370 | «Sonic Colours: Ultimate» → не найдено; «Sonic Colours» → не найдено | подобрать руками: вкладка PS Store пикера (нужен токен) или файл |
| 1791790396840.8284 | Rockstar Games PS2 Classics Bundle | 370 | «Rockstar Games PS2 Classics Bundle» → не найдено; «Rockstar Games PS2 Classics» → не найдено | подобрать руками: вкладка PS Store пикера (нужен токен) или файл |

## Обложка не грузится

_нет_
