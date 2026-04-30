FROM python:3.13-slim

WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Copy dependency files first for layer caching
COPY pyproject.toml uv.lock ./

# Install dependencies
RUN uv sync --frozen --no-dev --no-editable

# Copy source
COPY doppel/ ./doppel/

# Railway sets $PORT at runtime — default to 8000 for local
ENV PORT=8000
EXPOSE 8000

CMD uv run uvicorn doppel.main:app --host 0.0.0.0 --port ${PORT} --workers 2
