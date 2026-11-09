FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV SERVE_FRONTEND=true
ENV FRONTEND_DIR=/app/frontend
ENV DB_ENGINE=sqlite
ENV SQLITE_DB_PATH=/app/data/telegram_clone.db

WORKDIR /app

RUN mkdir -p /app/data

COPY backend/requirements-prod.txt ./
RUN pip install --no-cache-dir -r requirements-prod.txt

COPY backend/ ./
COPY frontend/ ./frontend/

EXPOSE 3000

CMD ["sh", "-c", "python start_production.py && exec gunicorn --bind 0.0.0.0:${PORT:-3000} --workers 2 --threads 4 --timeout 120 wsgi:app"]
