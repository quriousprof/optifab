# Frontend Tests — Agent Context

## Overview

Pure Node.js test files using the built-in `node:test` runner. No browser or jsdom — tests validate logic functions directly.

See `../../agents.md` for full project context.

## Test Files

| File | What It Tests |
|------|--------------|
| `placement.test.mjs` | Placement raycasting, snap-to-grid (`Math.round`), floor bounds (`FLOOR_SIZE/2`), footprint calculation |
| `machineInteraction.test.mjs` | Click vs drag discrimination, double-click detection, camera focus target computation, easing |
| `connections.test.mjs` | Conveyor merging (adjacent + aligned belts), connected run detection, corner tile generation, port connectivity |

## Running

```sh
cd frontend
npm test
# or directly:
node --experimental-strip-types --test tests/*.test.mjs
```

Requires **Node.js 22.12+** (or 20.19+) for `--experimental-strip-types`.

## Conventions

- Tests import directly from `../src/*.ts` source files
- No mocking of Three.js or React — tests target pure logic functions only
- Assertions use `node:assert/strict`
- Test descriptions follow `describe/it` style via `node:test`
