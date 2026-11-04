// Los íconos que usa el código tienen que estar en la fuente recortada (src/fonts/material-symbols-subset.woff2).
// Si falla: ejecuta `python3 scripts/subset-icons.py` (ver el encabezado del script).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, '..');
const manifest = new Set(JSON.parse(fs.readFileSync(path.join(here, 'material-symbols-subset.json'), 'utf8')).icons);

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return files(full);
    return /\.(js|jsx)$/.test(entry.name) && !/\.test\.js$/.test(entry.name) ? [full] : [];
  });
}

const QUOTED = /['"]([a-z][a-z0-9_]*)['"]/g;
const ICON_CONTEXTS = [
  /\bicon\s*[:=]\s*(?:\{\s*)?['"]([a-z][a-z0-9_]*)['"]/g, // icon: 'bolt'  ·  icon="lock"
  /<Icon\s+name=['"]([a-z][a-z0-9_]*)['"]/g, // <Icon name="home" />
  /\[\s*'([a-z][a-z0-9_]*)'\s*,\s*t\(/g, // ['bolt', t('Tiempo real')]  (tarjetas con ícono y texto)
];

test('todos los íconos que usa el código están en la fuente recortada', () => {
  const used = new Map(); // ícono → archivo
  for (const file of files(src)) {
    const code = fs.readFileSync(file, 'utf8');
    for (const pattern of ICON_CONTEXTS) for (const m of code.matchAll(pattern)) used.set(m[1], path.relative(src, file));
    // <Icon name={cond ? 'a' : 'b'} />: todas las palabras entre comillas dentro de las llaves
    for (const m of code.matchAll(/<Icon\s+name=\{([^}]*)\}/g)) for (const q of m[1].matchAll(QUOTED)) used.set(q[1], path.relative(src, file));
  }
  assert.ok(used.size > 60, `se esperaban muchos íconos, se encontraron ${used.size}`);
  const missing = [...used].filter(([name]) => !manifest.has(name)).map(([name, file]) => `${name} (${file})`);
  assert.deepEqual(missing, [], 'íconos que no están en la fuente: ejecuta `python3 scripts/subset-icons.py`');
});

test('el archivo de la fuente recortada existe y es pequeño', () => {
  const size = fs.statSync(path.join(here, 'material-symbols-subset.woff2')).size;
  assert.ok(size > 2000 && size < 40_000, `tamaño inesperado: ${size} B`);
});
