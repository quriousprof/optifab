# Frontend Source — Agent Context

## Overview

React + React Three Fiber application source. All components are functional with hooks. The 3D scene uses an orthographic camera with isometric view.

See `../../agents.md` for full project context and `../agents.md` for frontend-specific details.

## Key Files

| File | Purpose |
|------|---------|
| `App.tsx` | Root component. Manages editor mode, active machines, selection, focus, undo history. All state lives here and flows down via props. |
| `FactoryViewport.tsx` | Three.js Canvas wrapper. Sets up camera (orthographic, isometric), lighting, floor grid, renders `MachineMesh` for each placed machine, and `SceneInteraction` for pointer events. |
| `SceneInteraction.tsx` | Handles all pointer interaction: placement clicks, drag-to-move, selection, double-click focus. Uses Three.js raycasting against floor plane at y=0. |
| `MachineMesh.tsx` | 3D mesh rendering for machines (box/cylinder based on type) and conveyor corner tiles. Handles selection highlight (cyan bounding box) and HTML status overlay. |
| `ComponentSidebar.tsx` | Tailwind-styled sidebar with component palette buttons, conveyor resize slider, delete/undo buttons. |
| `factoryComponents.ts` | Type definitions (`PlacedMachine`, `FactoryComponentType`, `FloorPosition`, `EditorMode`), component catalog (`FACTORY_COMPONENTS`), floor/footprint utilities. `FLOOR_SIZE = 100`. |
| `connections.ts` | Conveyor logic: merging adjacent belts, computing connected ports, detecting conveyor runs, corner tile generation. |
| `placement.ts` | Placement validation: snap-to-grid (`Math.round`), floor bounds checking, footprint computation. |
| `machineInteraction.ts` | Camera focus: computes target position/zoom for focusing on a machine, animates with easing (`advanceCameraFocus`). |
| `styles.css` | Global styles, Tailwind imports, viewport layout classes. |
| `main.tsx` | ReactDOM entry point, mounts `<App />`. |

## Architecture Patterns

- **State**: all in `App.tsx`, passed as props. No context providers or state libraries.
- **Undo**: ref-based history stack of `PlacedMachine[]` snapshots (immutable arrays). `checkpoint()` before mutations, `undo()` pops.
- **3D interaction**: `SceneInteraction` component inside Canvas handles raycasting. Floor plane intersection at y=0, `Math.round` for grid snap.
- **Camera**: orthographic, fixed isometric polar angle (`Math.acos(1/sqrt(3))`). Left-drag = pan, Shift-drag = rotate (azimuth only), scroll = zoom. Focus animation via `useFrame`.
- **Machine rendering**: `MachineMesh` reads component type for shape/color/dimensions from `factoryComponents.ts` catalog.
- **Conveyor system**: belts auto-merge when adjacent and aligned. `conveyorRun()` finds connected belt chains. Corner tiles render at junctions.

## Types

```typescript
type PlacedMachine = {
  id: string                    // crypto.randomUUID()
  componentType: FactoryComponentType  // 'conveyor-belt' | 'assembly-robot' | 'cnc-milling-machine'
  position: FloorPosition       // [x, y, z] snapped to grid
  length?: number               // conveyors only
  rotation?: number             // quarter turns (0-3)
}

type EditorMode =
  | { mode: 'navigate' }
  | { mode: 'placement'; componentType: FactoryComponentType }
```

## Transition Notes

The current editor mode (user-placed machines) will be replaced/augmented with the fixed digital twin layout. The existing `MachineMesh`, camera controls, and interaction patterns can be adapted for the 9-machine fixed scenario. New additions needed: machine state visualization, Gantt schedule chart, failure simulation flow, factory state adapter.
