#!/usr/bin/env node
/* ============================================================================
   Локальный кэш three.js для автотестов.

   Сама игра тянет библиотеку с CDN, но тест не должен зависеть от сети:
   Playwright перехватывает запросы к unpkg и отдаёт эти файлы с диска.
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const VER = '0.166.1';
const FILES = [
  'build/three.module.js',
  'examples/jsm/environments/RoomEnvironment.js',
  'examples/jsm/objects/Sky.js'
];
const OUT = path.join(__dirname, 'cdn');

(async () => {
  for (const rel of FILES) {
    const url = 'https://unpkg.com/three@' + VER + '/' + rel;
    const dst = path.join(OUT, rel);
    if (fs.existsSync(dst)) { console.log('есть:  ' + rel); continue; }
    const res = await fetch(url);
    if (!res.ok) throw new Error('не скачалось: ' + url + ' -> ' + res.status);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.writeFileSync(dst, await res.text(), 'utf8');
    console.log('скачано: ' + rel);
  }
  console.log('кэш three.js готов: ' + path.relative(process.cwd(), OUT));
})().catch((e) => { console.error(e.message); process.exit(1); });