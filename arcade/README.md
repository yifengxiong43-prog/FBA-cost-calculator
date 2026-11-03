# 🎮 Browser Games

[![Pages](https://img.shields.io/badge/play-wavde.github.io%2Fgames-f5c542?style=flat)](https://wavde.github.io/games/)
[![License: MIT](https://img.shields.io/badge/license-MIT-8affc1?style=flat)](LICENSE)
[![No build](https://img.shields.io/badge/build-none-ffd166?style=flat)](#run-locally)

Twelve classics and logic puzzles built with vanilla **HTML, CSS, and JavaScript**. No frameworks, no build step, no npm dependencies — open one file and play. Mobile-first retro-terminal aesthetic.

**▶ Play now: [wavde.github.io/games](https://wavde.github.io/games/)**

---

## The lineup

### Classics

| | Game | Highlights |
|---|---|---|
| ❌⭕ | **[tic-tac-toe](tic-tac-toe/)** | Unbeatable AI via full minimax. |
| 🔢 | **[2048](2048/)** | Slide & merge. Per-session best score. |
| 💣 | **[minesweeper](minesweeper/)** | 3 sizes. First-click safe. Long-press to flag. |
| 🧠 | **[memory](memory/)** | 4×4 / 6×6 / 8×8. Timer and per-size best. |
| ♞ | **[chess](chess/)** | Full rules. Alpha-beta + piece-square-table engine, 3 levels. |
| 🔴 | **[connect-four](connect-four/)** | Local 2P or alpha-beta AI (depths 2/4/6). |
| 💡 | **[lights-out](lights-out/)** | 5×5 toggle grid. Turn every light off. |

### Logic puzzles

Every logic puzzle ships with an in-browser generator + solver and three difficulty tiers. A **daily puzzle** seed (hash of the UTC date + difficulty + game) means everyone sees the same board each day; **↻ new** rolls a fresh one.

| | Game | Highlights |
|---|---|---|
| ﹟ | **[mini-sudoku](mini-sudoku/)** | 6×6 with 2×3 boxes. Pencil marks, keyboard support. |
| ☀ | **[tango](tango/)** | Suns & moons. No 3-in-a-row, balanced counts, `=` / `×` edge constraints. |
| ♛ | **[queens](queens/)** | Non-attacking queens across colored regions. |
| 🧵 | **[zip](zip/)** | Draw one Hamiltonian path through numbered waypoints in order. |
| ▦ | **[patches](patches/)** | Partition the grid into rectangles — clue number = rectangle area. |

---

## Design system

- **Retro terminal**: Fira Mono, amber + mint on near-black, 1px hairline borders, ASCII banners, subtle scanline overlay.
- **Light mode**: follows `prefers-color-scheme`, plus a footer toggle that cycles **dark → light → system**. Preference persists in `localStorage`.
- **Manpage help**: every game has a `? man` button that opens a Unix-style manpage overlay (NAME · RULES · CONTROLS · STRATEGY). Auto-opens on first visit per game; quick to dismiss with ESC / `q` / tap-outside.
- **Mobile-first**: 44px minimum tap targets, `dvh` viewport units, `touch-action: manipulation`, no hover-only UI.

## Run locally

```bash
git clone https://github.com/wavde/games.git
cd games
# open index.html in any modern browser
```

Or serve it:

```bash
python -m http.server 8000
# then visit http://localhost:8000
```

## Project structure

```
games/
├── index.html          hub page
├── shared.css          design tokens, buttons, panels, light mode
├── manpage.css         shared help-overlay styles
├── manpage.js          shared help-overlay controller
├── gamekit.js          shared helpers (PRNG, daily seed, storage, chips, etc.)
├── manifest.json       PWA manifest (iOS/Android home screen)
├── favicon.svg
├── tic-tac-toe/     ├── index.html, game.js   (5 classics)
├── 2048/            │
├── minesweeper/     │
├── memory/          │
├── chess/           │
├── connect-four/    │
├── lights-out/      │   (new — generator-backed)
├── mini-sudoku/     │   (new — generator + solver)
├── tango/           │
├── queens/          │
├── zip/             │
└── patches/         │
```

Each game folder is self-contained: `index.html` + `game.js`. Styling inherits from `shared.css` and `manpage.css`.

## Generators & difficulty

Every logic puzzle generates uniquely-solvable boards in the browser:

| Game | Easy | Medium | Hard |
|---|---|---|---|
| lights-out | 3 random taps | 6 taps | 10 taps |
| connect-four (AI) | depth 2 | depth 4 | depth 6 |
| mini-sudoku | 22 clues | 18 clues | 14 clues |
| tango | 16 givens, 10 edges | 10 givens, 8 edges | 6 givens, 7 edges |
| queens | 6×6 | 7×7 | 8×8 |
| zip | 5×5, 4 waypoints | 6×6, 5 wp, 3 walls | 7×7, 6 wp, 5 walls |
| patches | 5×5 partition | 6×6 partition | 7×7 partition |

All generators validate uniqueness against a solver before returning.

## Tech

- **Rendering**: HTML + CSS Grid. No `<canvas>`.
- **State**: plain JS, no framework.
- **AI**:
  - *tic-tac-toe*: full-tree minimax (unbeatable).
  - *chess*: alpha-beta + MVV-LVA move ordering + piece-square tables.
  - *connect-four*: alpha-beta with center-first column ordering.
- **PRNG**: mulberry32 seeded by FNV-1a hash of date+difficulty+game — deterministic dailies across devices.

## License

[MIT](LICENSE) © Tejas Wavde
