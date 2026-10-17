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

The Tailwind CSS sidebar selects **Conveyor Belt** (green box), **Assembly Robot** (red cylinder), or **CNC Milling Machine** (blue box). Selection sets the app's typed placement mode and component type, highlights the button, and changes the viewport cursor. **Cancel selection** or **Escape** exits placement mode; Escape restores the overview when navigating. This step prepares selection state; clicking the floor does not create objects yet. The floor's `gridHelper` lines mark one-unit cells and five-unit sections above the surface.

Run `npm run build` for type checking and a production build, then `npm run preview` to serve that build. This first scene establishes the viewport; machines and simulation state will be added against the shared contracts.
