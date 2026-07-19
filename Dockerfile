# 方隅生产镜像：先构建 Studio，再装 Python API，单进程托管 UI+API
FROM node:22-bookworm-slim AS ui
WORKDIR /src
COPY package.json package-lock.json ./
COPY fangyu-core/package.json fangyu-core/
COPY fangyu-canvas/package.json fangyu-canvas/
COPY fangyu-studio/package.json fangyu-studio/
COPY fangyu-worker/package.json fangyu-worker/
RUN npm ci
COPY fangyu-core fangyu-core
COPY fangyu-canvas fangyu-canvas
COPY fangyu-studio fangyu-studio
RUN npm run build -w fangyu-studio

FROM python:3.12-slim-bookworm AS api
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    FANGYU_SERVE_UI=1 \
    FANGYU_UI_DIST=/app/fangyu-studio/dist \
    FANGYU_DATA_DIR=/data \
    HOST=0.0.0.0 \
    PORT=8000 \
    CORS_ORIGINS=*

RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential curl \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml README.md ./
COPY a2a a2a
COPY core core
COPY engine engine
COPY models models
COPY routers routers
COPY skills skills
COPY __init__.py __main__.py server.py ./
RUN pip install --no-cache-dir -e .

COPY --from=ui /src/fangyu-studio/dist /app/fangyu-studio/dist

VOLUME ["/data"]
EXPOSE 8000
HEALTHCHECK --interval=20s --timeout=5s --start-period=30s --retries=5 \
  CMD curl -fsS http://127.0.0.1:8000/api/health || exit 1
CMD ["python", "-m", "uvicorn", "fangyu.server:app", "--host", "0.0.0.0", "--port", "8000"]
