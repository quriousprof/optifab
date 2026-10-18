FROM --platform=linux/amd64 ghcr.io/astral-sh/uv:0.7 AS uv

FROM --platform=linux/amd64 python:3.12-slim

COPY --from=uv /uv /uvx /bin/

WORKDIR /app

COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev

COPY backend/ .
COPY docs/ ./docs

ENV PATH="/app/.venv/bin:$PATH"
ENV OPTIFAB_DOCS_PATH=/app/docs

EXPOSE 8080

CMD ["/bin/sh", "-c", "/app/.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
