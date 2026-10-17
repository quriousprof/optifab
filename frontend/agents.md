# Frontend — Agent Context

## Overview

React 19 + React Three Fiber + Drei + Three.js application serving the 3D factory digital twin. Built with Vite 7, TypeScript 5.9, and Tailwind CSS 4. Runs on port 3000.

See `../agents.md` for full project context (scenario, data contracts, failure rules).

## Tech Stack

- **React 19** with functional components and hooks
- **React Three Fiber** (v9) — React renderer for Three.js
- **Drei** (v10) — R3F helper components (OrbitControls, Grid, Html)
- **Three.js** (v0.180) — 3D rendering engine
- **Tailwind CSS 4** via Vite plugin
- **Vite 7** — dev server and bundler
- **TypeScript 5.9** — strict mode via `tsconfig.json`

## Directory Structure

```
frontend/
  src/
    App.tsx              — Root component, state management, keyboard shortcuts, undo history
    FactoryViewport.tsx  — Canvas setup, camera, lighting, floor grid, machine rendering
    SceneInteraction.tsx — Pointer events, raycasting, placement/drag/select logic
    MachineMesh.tsx      — 3D mesh components for machines and conveyor corners
    ComponentSidebar.tsx — Tailwind sidebar for component palette and controls
    factoryComponents.ts — Component definitions, types, floor/footprint utilities
    connections.ts       — Conveyor merging, port connectivity, corner tile computation
    placement.ts         — Placement validation, snap-to-grid, floor bounds
    machineInteraction.ts— Camera focus animation, machine picking
    styles.css           — Global styles + Tailwind imports
    main.tsx             — App mount point
  tests/
    placement.test.mjs   — Placement raycasting, snapping, floor bounds
    machineInteraction.test.mjs — Click/drag, double-click, camera focus
    connections.test.mjs — Conveyor merging, run detection
  index.html
  package.json
  tsconfig.json
  vite.config.ts
```

## Current State

The frontend currently implements a **component editor** with:
- 100x100 scene-unit floor with grid
- Orthographic camera with isometric view, orbit (Shift-drag), pan, zoom
- Component palette: Conveyor Belt, Assembly Robot, CNC Milling Machine
- Click-to-place with snap-to-grid
- Drag-to-move placed machines
- Conveyor connections with merging, corners, and rotation
- Machine selection with bounding box highlight
- Double-click to focus camera on machine
- Undo (Ctrl/Cmd+Z) and Delete support
- Fit view / Escape to reset camera

## Target State (Phase 2 Digital Twin)

Needs to transition to the fixed 9-machine layout per `docs/phase-2-ui-decision.md`:

1. **Fixed layout** — 9 machines from `docs/six-job-scenario.json` positions, not user-placed
2. **Machine states** — idle (default), processing (active operation), failed (F1 at t=6), blocked (downstream of failure)
3. **Visual encoding** — color + label/symbol per state on each workstation mesh
4. **Selection panel** — side panel showing machine ID, stage, state, current operation, affected jobs
5. **Viewport modes** — overview (all 9 machines), inspection (zoom to selected), failure impact (highlight affected)
6. **Production schedule** — Gantt chart below viewport, one row per machine, minute time axis, operation bars from schedule data
7. **Failure flow** — trigger F1 failure, show baseline schedule with minute-6 failure line, wait for recovery schedule from backend
8. **State source** — render from `factory-state.schema.json` shape, not internal simulation

## Data Flow

- Factory state: `factory-state.schema.json` shape (phase, machine states, blocked jobs)
- Schedule: `schedule.schema.json` shape (18 operations with machine/time assignments)
- Phase 2 loads `failure-state.json` via local adapter; later from FastAPI backend
- Machine positions from `six-job-scenario.json`
- The UI renders returned data — no internal clock or scheduling logic

## Commands

```sh
npm install     # Install dependencies
npm run dev     # Dev server on port 3000
npm run build   # Type check + production build
npm run preview # Serve production build
npm test        # Run tests (Node.js 22.12+)
```
