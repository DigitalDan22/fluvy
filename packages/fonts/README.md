# @fluvy/fonts

Inter, self-hosted as a variable font for Fluvy and the design lab, under the SIL Open Font License 1.1
(`files/OFL-Inter.txt`; no Reserved Font Name is declared, so the subset keeps the family name).

| family | file                                | axes                         | source                               |
| ------ | ----------------------------------- | ---------------------------- | ------------------------------------ |
| Inter  | `files/inter-variable.woff2`        | `opsz` 14–32, `wght` 100–900 | github.com/google/fonts (ofl/inter)  |
| Inter  | `files/inter-italic-variable.woff2` | `opsz` 14–32, `wght` 100–900 | github.com/google/fonts (ofl/inter)  |

The subset covers Latin, Latin Extended-A (the letters of Polish, Czech, Slovak, Hungarian, Turkish, Romanian: ł, ń,
č, ő, ş, ș) and the symbols the UI uses (°, ², ³, µ, ‰, arrows, ≈, ≠, ±, €); every OpenType feature is kept, so
`font-variant-numeric: tabular-nums` and the character variants work. The bundle registers the faces itself with the
`FontFace` API (a Home Assistant theme cannot carry `@font-face`); `fonts.css` is for pages that load them as a
stylesheet (the design lab, the playground).

## Regenerating

From the upstream variable TTFs (`Inter[opsz,wght].ttf`, `Inter-Italic[opsz,wght].ttf`), with fontTools:

```sh
pip install fonttools brotli
pyftsubset 'Inter[opsz,wght].ttf' --output-file=files/inter-variable.woff2 --flavor=woff2 \
  --layout-features='*' --name-IDs='*' --notdef-outline --no-hinting \
  --unicodes='U+0000,U+0020-007E,U+00A0-00AC,U+00AE-00FF,U+0100-017F,U+0218-021B,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+2000-200B,U+2010-2027,U+202F-2055,U+2057,U+205F,U+2074,U+20AC,U+2103,U+2109,U+2122,U+2190-2199,U+2211-2212,U+221E,U+2248,U+2260,U+2264-2265,U+FEFF'
```

The same command with the italic TTF writes `files/inter-italic-variable.woff2`. The outputs are committed so the
repository builds offline. `--no-hinting` keeps the files as they have always been laid out: a hinted file rounds a
glyph's advance on Linux, and every width the cards and the measurer read would move by a pixel.
