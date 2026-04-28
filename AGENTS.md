# Cephome: Vietnamese Phonemetizer

A Bun-based monorepo for Vietnamese→CeVIO text-to-speech phoneme transcription.

**Engine-specific details**: See `engine/AGENTS.md`

## Tech Stack

- **Runtime**: Bun (not Node.js)
- **Language**: TypeScript
- **Testing**: `bun:test`
- **Frontend**: React 19 + HTML imports (no build tool)
- **Database**: SQLite (via `bun:sqlite`)

## Commands

```bash
bun test                      # Run all tests
bun run engine/cli.ts < input.txt   # CLI: stream Vietnamese → phonetics (engine/)
```

## Code Style

### TypeScript

- Tabs (not spaces)
- Double quotes, trailing semicolons
- `camelCase` functions/vars, `PascalCase` classes/components
- Prefer named exports
- Use `import type { ... }` for TypeScript-only imports

### File Structure

- Each module has a clear responsibility
- Test files colocated with source (`.test.ts`)
- One export per file preferred; multiple if cohesive

### Git

- Commit one logical change per PR
- Descriptive commit messages: "Add X feature" not "fix bug"
- Keep commits small for easier review

## Structure

```
cephome/
├── engine/              # Pure TypeScript transcription library
│   ├── index.ts         # Public API
│   ├── onset.ts         # Vietnamese onset → CeVIO phoneme mappings
│   ├── van.ts           # Nucleus/coda → mora conversion
│   ├── segment.ts       # Syllable parsing
│   ├── normalize.ts     # Unicode normalization + tone extraction
│   ├── validate.ts      # CeVIO phoneme palette validation
│   ├── cli.ts           # Streaming CLI (reads stdin, writes stdout)
│   ├── *.test.ts        # Tests
│   └── AGENTS.md        # Engine-specific reference
│
└── src/                 # Frontend + REST API (Bun.serve)
    ├── index.ts         # HTTP server entry
    ├── App.tsx          # React UI
    └── index.html       # HTML shell
```

## Development

**Terminal 1 — Engine tests** (watch mode):

```bash
cd engine && bun test --watch
```

**Terminal 2 — Frontend** (live reload):

```bash
cd src && bun --hot index.ts  # http://localhost:3000
```

## Formatting

Must

`bun lint` to utilize typescript capability of correct iteration, `bun fmt` to ensure stylin

must avoid any or unknown for signature typing, except for unsafe parsing
