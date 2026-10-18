# Optifab

A factory recovery demo built around six jobs and nine machines (four cutting, three forming, two inspection). The fixed scenario, baseline schedule, failure rules, and JSON contracts are in [`docs/`](docs/).

## Layout

```text
docs/        Shared demo contract and fixtures
frontend/    React / Three.js factory viewport
backend/     API and optimization integration (to be built)
compose.yaml Container layout for the two applications
```

Start with [`docs/demo-contract.md`](docs/demo-contract.md) before implementing either application. `compose.yaml` names the intended services and ports; Dockerfiles and the backend are still to be built.

## Run the frontend

Use Node.js 22.12+ (or 20.19+).

```sh
cd frontend
npm install
npm run dev
```

Open http://localhost:3000. The full-screen viewport uses React Three Fiber, Drei, and an orthographic camera over an empty 100 × 100 scene-unit gray factory floor, with an always-visible pale infinite world-aligned grid beyond it. The floor keeps its stronger one-unit grid for object placement; the surrounding grid uses lighter, thinner lines.

Left-drag to move the view freely; Shift-drag to rotate at a fixed isometric tilt. Right-drag or use the arrow keys after focusing the canvas to pan along the floor. Scroll/pinch to zoom; use **Fit view** or **Escape** to restore the original angle and overview. Touch supports one-finger pan and two-finger pinch/pan.

The sidebar contains seven distinct components: raw material supply, conveyor belt, workstation, cutting machine, forming machine, inspection machine, and finished-goods bin. The workstation is a light, flat 18 × 14 platform for several machines; place a machine on its top surface to mount it. Select a workstation to adjust its length and breadth up to 40 units. A shrink is refused if it would leave a mounted machine beyond the deck. Production machines have visible input and output decks; the supply has an output and the collection bin has an input. The default footprints are larger for easier inspection. Select either deposit to change its length and breadth independently with the sidebar controls; its mesh, floor bounds, and connection point update together. Drag a component from the sidebar onto the floor, or select it, move over the floor to preview it, and click to place. Nothing is pre-placed. Three.js raycasting intersects the floor or workstation top; `Math.round` snaps X and Z to the one-unit grid. Component footprints stay inside their supporting surface. The floor's `gridHelper` lines mark one-unit cells and five-unit sections above the surface.

Placement mode stays active for repeated clicks. Dragging, Shift-dragging, right-clicking, and interacting with overlays do not place machines. **Cancel selection** or **Escape** exits placement mode; Escape restores the overview when navigating. Placed machines have stable IDs, component types, and snapped positions in the React `activeMachines` array. They remain through camera changes and selection changes, and reset on page reload; persistence and overlap detection are not implemented.

Click a placed component to select it with a neon cyan bounding box and an HTML detail card above it. Double-click the same component to smoothly move the camera and OrbitControls target toward its center while zooming in. Camera input interrupts the motion; reduced-motion settings apply the focus immediately. Clicking an existing component exits placement mode without placing another object. Click empty space to deselect, or use **Fit view / Escape** to return to the overview.

Components whose input and output ports touch form a linked assembly. Dragging one moves the whole assembly while keeping its connections aligned; an assembly cannot move beyond the floor edge. Shift-click separate components and use **Group** to link them manually. **Ungroup** removes manual grouping, while touching ports remain linked. Alt-drag an unlocked component away to detach it from a connected assembly. **Lock selected** prevents movement, rotation, resizing, deletion, and conveyor merging until the assembly is unlocked. Group and lock changes are included in Undo.

Machines mounted on a workstation remain individually selectable and draggable across its deck. Drag the platform to carry all mounted machines together; Alt-drag a mounted machine off the platform to detach it. Deleting a workstation leaves its machines on the floor.

Select a placed conveyor to change its length with the sidebar buttons or slider. Its connected input stays anchored and any machines connected beyond its output move with it; if only its output is connected, that end stays anchored instead. Resizes that would push any linked component beyond the floor are refused, and each accepted change can be undone.

Run `npm run build` for type checking and a production build, then `npm run preview` to serve that build. The scene supports component layout prototyping; simulation state will be integrated against the shared contracts.

Run `npm test` on Node.js 22.12+ for placement raycasting, snapping, floor bounds, click-versus-drag checks, machine picking, double-click recognition, and camera focus/easing.
