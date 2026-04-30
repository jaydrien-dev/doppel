FROM python:3.13-slim

WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Copy dependency files first for layer caching
COPY pyproject.toml uv.lock ./

# Install dependencies (no dev deps, use system Python)
RUN uv sync --frozen --no-dev --no-editable

# Copy source
COPY doppel/ ./doppel/

# Railway injects $PORT at runtime
EXPOSE 8000
CMD ["uv", "run", "uvicorn", "doppel.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
