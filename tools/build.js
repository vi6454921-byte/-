#!/usr/bin/env node
/* ============================================================================
   Сборка одностраничного шутера.

   На выходе — один html без внешних файлов, кроме three.js с CDN
   (как в исходном ak74_modular.html). Порядок склейки важен:
   утилиты -> геометрия -> система модулей АК -> игровая логика.
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src', 'game');
const OUT = path.join(ROOT, 'shooter.html');

const read = (p) => fs.readFileSync(p, 'utf8');

/* Модули игры в порядке зависимостей. Каждый — UMD-обёртка, которая
   регистрируется в globalThis (внутри модульного скрипта это window). */
const MODULES = [
  'util.js', 'textures.js', 'geobuf.js', 'skeleton.js',
  'soldier.js', 'character.js', 'rig.js', 'world.js',
  'fx.js', 'audio.js', 'player.js', 'game.js'
];

function section(title) {
  const bar = '='.repeat(74);
  return `\n/* ${bar}\n   ${title}\n   ${bar} */\n`;
}

function build() {
  const shell = read(path.join(SRC, 'shell.html'));
  const vendor = read(path.join(SRC, 'vendor', 'ak74_bundle.js'));

  let js = '';
  js += section('ОРУЖИЕ: система модулей и процедурная модель АК-74 (перенесено как есть из ak74_modular.html)');
  js += vendor;

  for (const m of MODULES) {
    const p = path.join(SRC, m);
    if (!fs.existsSync(p)) throw new Error('нет модуля: ' + m);
    js += section('МОДУЛЬ: ' + m);
    js += read(p);
  }

  js += section('ЗАПУСК');
  js += '\ntry { GGame.main(); } catch (e) { showErr(e); }\n';

  const out = shell.replace('/*__GAME_BUNDLE__*/', () => js);
  if (out.indexOf('/*__GAME_BUNDLE__*/') >= 0) throw new Error('плейсхолдер не заменён');
  fs.writeFileSync(OUT, out, 'utf8');

  const kb = (Buffer.byteLength(out, 'utf8') / 1024).toFixed(0);
  console.log('собрано: ' + path.relative(ROOT, OUT) + ' (' + kb + ' КБ)');
}

build();