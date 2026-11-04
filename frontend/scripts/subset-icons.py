#!/usr/bin/env python3
"""
Genera src/fonts/material-symbols-subset.woff2: la fuente de íconos (Material Symbols) con SOLO los íconos que usa la app.

La fuente completa pesa 323 KB (4000 íconos); la app usa un centenar. Cada ícono es una ligadura: el texto `home` se
dibuja como el ícono "home". El script:
  1. busca en src/ todas las palabras entre comillas que son nombres de ícono de la fuente (de más, nunca de menos);
  2. quita de la fuente todas las ligaduras de los demás íconos y recorta los glifos sobrantes.

Cuándo ejecutarlo: al añadir un ícono nuevo a la interfaz (si no, se vería su nombre en texto; la prueba
src/fonts/icons.test.js avisa de ello).

    pip install fonttools brotli
    cd frontend && python3 scripts/subset-icons.py
"""
import json
import re
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
SOURCE_FONT = ROOT / "node_modules/@fontsource/material-symbols-outlined/files/material-symbols-outlined-latin-400-normal.woff2"
OUT_DIR = ROOT / "src/fonts"
OUT_FONT = OUT_DIR / "material-symbols-subset.woff2"
OUT_MANIFEST = OUT_DIR / "material-symbols-subset.json"

# Letras, dígitos y guion bajo con los que se escriben los nombres de los íconos (las ligaduras se forman con ellos).
NAME_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789_"


def ligatures(font):
    """Todas las subtablas de ligaduras de la fuente (están envueltas en 'Extension')."""
    for lookup in font["GSUB"].table.LookupList.Lookup:
        for sub in lookup.SubTable:
            table = getattr(sub, "ExtSubTable", sub)
            if hasattr(table, "ligatures"):
                yield table


def typed_name(font_chars, first, lig):
    """El texto que hay que escribir para formar la ligadura (p. ej. "arrow_forward")."""
    return "".join(font_chars[g] for g in [first, *lig.Component])


def main():
    if not SOURCE_FONT.exists():
        sys.exit(f"No encuentro {SOURCE_FONT}. Ejecuta `npm ci` en frontend/.")

    font = TTFont(SOURCE_FONT)
    chars = {glyph: chr(code) for code, glyph in font.getBestCmap().items() if chr(code) in NAME_CHARS}
    # Un mismo glifo se puede escribir con varios nombres (sinónimos: `emoji_events` y `trophy`): se busca por lo que se escribe.
    all_names = {typed_name(chars, first, lig) for table in ligatures(font) for first, group in table.ligatures.items() for lig in group}

    # 1. Palabras entre comillas del código que coinciden con un nombre de ícono (de más, nunca de menos).
    words = set()
    for path in (ROOT / "src").rglob("*"):
        if path.suffix in {".js", ".jsx"} and ".test." not in path.name:
            words |= set(re.findall(r"""['"]([a-z][a-z0-9_]*)['"]""", path.read_text(encoding="utf8")))
    used = sorted(words & all_names)
    print(f"{len(all_names)} nombres de ícono en la fuente, {len(used)} usados por la app")

    # 2. Quitar las ligaduras de los demás nombres (si no, el recorte las conservaría todas: las letras sí están).
    keep = set(used)
    glyphs = set()
    for table in ligatures(font):
        for first in list(table.ligatures):
            kept = [lig for lig in table.ligatures[first] if typed_name(chars, first, lig) in keep]
            glyphs |= {lig.LigGlyph for lig in kept}
            if kept:
                table.ligatures[first] = kept  # el orden relativo (de la más larga a la más corta) se conserva
            else:
                del table.ligatures[first]

    options = subset.Options()
    options.layout_features = ["rlig"]  # la característica que activa las ligaduras
    options.hinting = False
    options.glyph_names = False
    options.notdef_outline = True
    options.flavor = "woff2"
    subsetter = subset.Subsetter(options)
    subsetter.populate(glyphs=sorted(glyphs), unicodes=[ord(c) for c in NAME_CHARS])
    subsetter.subset(font)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    font.flavor = "woff2"
    font.save(OUT_FONT)

    # Comprobación: la fuente resultante forma exactamente los nombres pedidos (se leen sus letras: al recortar se pierden
    # los nombres de los glifos).
    result = TTFont(OUT_FONT)
    result_chars = {glyph: chr(code) for code, glyph in result.getBestCmap().items() if chr(code) in NAME_CHARS}
    present = {typed_name(result_chars, first, lig) for table in ligatures(result) for first, group in table.ligatures.items() for lig in group}
    if present != keep:
        sys.exit(f"La fuente recortada no coincide. Faltan: {sorted(keep - present)}. Sobran: {sorted(present - keep)}")
    OUT_MANIFEST.write_text(json.dumps({"icons": used}, indent=1) + "\n", encoding="utf8")
    print(f"{OUT_FONT.relative_to(ROOT)}: {OUT_FONT.stat().st_size / 1024:.1f} KB (antes 323 KB), {len(glyphs)} glifos")


if __name__ == "__main__":
    main()
