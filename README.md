# Optifab

A factory recovery demo built around six jobs and nine machines (four cutting, three forming, two inspection). The fixed scenario, baseline schedule, failure rules, and JSON contracts are in [`docs/`](docs/).

## Layout

```text
docs/        Shared demo contract and fixtures
frontend/    UI application (to be built)
backend/     API and optimization integration (to be built)
compose.yaml Container layout for the two applications
```

Start with [`docs/demo-contract.md`](docs/demo-contract.md) before implementing either application. The scaffold contains no running UI or API yet. `compose.yaml` names the intended services and ports; add each application's Dockerfile and start command when its implementation begins.
