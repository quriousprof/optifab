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

Open http://localhost:3000. The full-screen viewport uses React Three Fiber, Drei, and an orthographic camera over a 100 × 100 scene-unit gray factory floor (four times the original area), framed large against an always-visible pale infinite world-aligned grid. The floor keeps its stronger one-unit grid for future object placement; the surrounding grid uses lighter, thinner lines.

Left-drag to move the view freely; Shift-drag to rotate at a fixed isometric tilt. Right-drag or use the arrow keys after focusing the canvas to pan along the floor. Scroll/pinch to zoom; use **Fit view** or **Escape** to restore the original angle and overview. Touch supports one-finger pan and two-finger pinch/pan.

The Tailwind CSS sidebar selects **Conveyor Belt** (green box), **Assembly Robot** (red cylinder), or **CNC Milling Machine** (blue box). Move over the floor to see a translucent preview, then left-click to place a solid machine. Three.js raycasting intersects the floor at `y = 0`; `Math.round` snaps X and Z to the one-unit grid. The entire machine footprint stays inside the 100 × 100 floor. The floor's `gridHelper` lines mark one-unit cells and five-unit sections above the surface.

Placement mode stays active for repeated clicks. Dragging, Shift-dragging, right-clicking, and interacting with overlays do not place machines. **Cancel selection** or **Escape** exits placement mode; Escape restores the overview when navigating. Placed machines have stable IDs, component types, and snapped positions in the React `activeMachines` array. They remain through camera changes and selection changes, and reset on page reload; persistence and overlap detection are not implemented.

Click a placed machine to select it with a neon cyan bounding box and an HTML status card above it. The card shows demo values: **Operational** and **94% efficiency**. Double-click the same machine to smoothly move the camera and OrbitControls target toward its center while zooming in. Camera input interrupts the motion; reduced-motion settings apply the focus immediately. Clicking an existing machine exits placement mode without placing another object. Click empty space to deselect, or use **Fit view / Escape** to return to the overview.

Run `npm run build` for type checking and a production build, then `npm run preview` to serve that build. The scene supports component layout prototyping; simulation state will be integrated against the shared contracts.

Run `npm test` on Node.js 22.12+ for placement raycasting, snapping, floor bounds, click-versus-drag checks, machine picking, double-click recognition, and camera focus/easing.
