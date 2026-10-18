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

Open http://localhost:3000. The full-screen viewport uses React Three Fiber, Drei, and an orthographic camera over an empty 100 × 100 scene-unit gray factory floor, with an always-visible pale infinite world-aligned grid beyond it. Click the floor dimensions in the bottom-left to set its width and depth independently (1–10,000 whole units). The floor keeps its stronger one-unit grid for object placement; the surrounding grid uses lighter, thinner lines. A resize is refused if it would leave a component outside the floor. Floor dimensions are included in saved layouts; older layouts default to 100 × 100.

Left-drag empty space to select components, or drag a component to move it. Shift-drag rotates and tilts the view. Right-drag or use the arrow keys after focusing the canvas to pan along the floor. Scroll/pinch to zoom; use **Fit view** or **Escape** to restore the original angle and overview. Touch supports one-finger pan and two-finger pinch/pan.

The sidebar contains seven distinct components: raw material supply, conveyor belt, workstation, cutting machine, forming machine, inspection machine, and finished-goods bin. The workstation is a light, flat 18 × 14 platform for several machines; place a machine on its top surface to mount it. Select a workstation to adjust its length and breadth up to 40 units. A shrink is refused if it would leave a mounted machine beyond the deck. Production machines have visible input and output decks; the supply has an output and the collection bin has an input. The default footprints are larger for easier inspection. Select either deposit to change its length and breadth independently with the sidebar controls; its mesh, floor bounds, and connection point update together. Drag a component from the sidebar onto the floor, or select it, move over the floor to preview it, and click to place. Nothing is pre-placed. Three.js raycasting intersects the floor or workstation top; `Math.round` snaps X and Z to the one-unit grid. Component footprints stay inside their supporting surface. Grid lines mark one-unit cells and five-unit sections above the surface.

Placement mode stays active for repeated clicks. Dragging, Shift-dragging, right-clicking, and interacting with overlays do not place machines. **Cancel selection** or **Escape** exits placement mode; Escape restores the overview when navigating. Placed machines have stable IDs, component types, and snapped positions in the React `activeMachines` array. Use **Layouts** to save and reopen them, including component dimensions, floor dimensions, and connection details. With `OPTIFAB_GCP_PROJECT` set, layouts are stored in Firestore; otherwise they use local JSON files. Overlap detection is not implemented.

Click a placed component to select it with a neon cyan bounding box and an HTML detail card above it. Double-click the same component to smoothly move the camera and OrbitControls target toward its center while zooming in. Camera input interrupts the motion; reduced-motion settings apply the focus immediately. Clicking an existing component exits placement mode without placing another object. Click empty space to deselect, or use **Fit view / Escape** to return to the overview.

Components whose input and output ports touch form a linked assembly. Conveyor branches and merges also link where an endpoint meets a belt's centerline. Dragging one moves the whole assembly while keeping its connections aligned; an assembly cannot move beyond the floor edge. Clicking selects only that component or its explicit group. Drag from empty space across components to select several; hold Ctrl or Cmd while dragging to add to the selection. Shift-click also adds or removes individual components. Choose **Group** to group the selection; **Ungroup** removes manual grouping while touching connections remain linked. Alt-drag an unlocked component away to detach it from a connected assembly. **Lock selected** prevents movement, rotation, resizing, deletion, and conveyor merging until unlocked. Group and lock changes are included in Undo.

Select a conveyor to show its orange input and blue output controls on the floor. Click either end to detach it independently; click the resulting plus sign to enable that end again. An enabled end connects when aligned with a compatible component.

Select any component and use the sidebar label field to give it a custom name. Save a blank field to remove the custom name. Machine scenario IDs remain separate from these labels, and labels are included when a layout is saved.

Machines mounted on a workstation remain individually selectable and draggable across its deck. Drag the platform to carry all mounted machines together; Alt-drag a mounted machine off the platform to detach it. Deleting a workstation leaves its machines on the floor.

Select a placed conveyor to change its length with the sidebar buttons or slider. Its connected input stays anchored and any machines connected beyond its output move with it; if only its terminal output is connected, that end stays anchored instead. Mid-belt branches stay at their attachment point, and resizes that would sever a connection or push a component beyond the floor are refused. Each accepted change can be undone.

Drag a conveyor from a workstation across its edge to lay one connected run: a raised deck section and a floor section are created in one undo step, with a short sloped joint at the height change. Existing deck and floor belts also show that joint when their ports meet at the workstation edge.

To build a fan or merge, select **Conveyor belt** and drag in any direction. Start a drag on an existing belt to branch from its centerline, or finish on another belt to merge into it; repeat to add several paths. The new belt inherits the trunk's tangent at takeoff or arrival, so its bed, rails, and slats follow a smooth curve through the turn. Belt endpoints snap to half-unit positions for a stable preview. Blue output and amber input dots mark exact attachment sockets during conveyor placement. Repeated drags from the same output create a fan. Connected ends share position and tangent, and internal rails are removed where branches overlap to leave an open, continuous junction. A branch remains an individually selectable belt, while its connected assembly moves together unless detached with Alt-drag.

Run `npm run build` for type checking and a production build, then `npm run preview` to serve that build. The scene supports component layout prototyping; simulation state will be integrated against the shared contracts.

Run `npm test` on Node.js 22.12+ for placement raycasting, snapping, floor bounds, click-versus-drag checks, machine picking, double-click recognition, and camera focus/easing.
