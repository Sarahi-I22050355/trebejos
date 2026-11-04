// Busca en el código todas las frases de interfaz: las que pasan por t('…'), tp(n, '…', '…') y msg('…').
// Las usa la prueba de i18n (cada frase debe tener traducción) y sirve para ver qué falta:
//   node scripts/i18n-keys.js            # imprime las frases que no están en src/i18n/en.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');
const STRING = String.raw`('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|` + '`(?:\\\\.|[^`\\\\$])*`)';
const T_CALL = new RegExp(String.raw`(?<![\w.$])(?:t|msg)\(\s*` + STRING, 'g');
const TP_CALL = new RegExp(String.raw`(?<![\w.$])tp\(\s*[^,()]+,\s*` + STRING + String.raw`\s*,\s*` + STRING, 'g');
// t(`...${x}...`): una plantilla con variables no se puede traducir; tiene que usar {parámetros}.
const T_TEMPLATE = /(?<![\w.$])(?:t|msg)\(\s*`[^`]*\$\{/g;

const literal = (source) => new Function(`return ${source}`)(); // las cadenas del código fuente ya son JS válido

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return files(full);
    return /\.(js|jsx)$/.test(entry.name) && !/\.test\.js$/.test(entry.name) && !full.endsWith(path.join('i18n', 'en.js')) ? [full] : [];
  });
}

/** → { keys: Set<string>, templates: string[] (llamadas inválidas) } */
export function extractKeys() {
  const keys = new Set();
  const templates = [];
  for (const file of files(root)) {
    const code = fs.readFileSync(file, 'utf8');
    for (const m of code.matchAll(T_CALL)) keys.add(literal(m[1]));
    for (const m of code.matchAll(TP_CALL)) {
      keys.add(literal(m[1]));
      keys.add(literal(m[2]));
    }
    for (const m of code.matchAll(T_TEMPLATE)) templates.push(`${path.relative(root, file)}: ${m[0]}`);
  }
  return { keys, templates };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { EN } = await import('../src/i18n/en.js');
  const { keys, templates } = extractKeys();
  const missing = [...keys].filter((k) => !(k in EN));
  console.log(JSON.stringify({ total: keys.size, missing: missing.length, templates }, null, 1));
  for (const k of missing) console.log(JSON.stringify(k));
}
