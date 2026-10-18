FROM --platform=linux/amd64 python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:0.7 /uv /uvx /bin/

WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY . .

ENV PATH="/app/.venv/bin:$PATH"

EXPOSE 8080

CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}
