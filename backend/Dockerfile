FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV ACCEPT_EULA=Y
ENV SERVE_FRONTEND=true
ENV FRONTEND_DIR=/app/frontend

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl gnupg ca-certificates unixodbc \
    && curl -fsSL https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor -o /usr/share/keyrings/microsoft-prod.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/microsoft-prod.gpg] https://packages.microsoft.com/debian/12/prod bookworm main" > /etc/apt/sources.list.d/mssql-release.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends msodbcsql18 unixodbc-dev \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt backend/requirements-prod.txt ./
RUN pip install --no-cache-dir -r requirements-prod.txt

COPY backend/ ./
COPY frontend/ ./frontend/

EXPOSE 3000

CMD ["sh", "-c", "python start_production.py && exec gunicorn --bind 0.0.0.0:${PORT:-3000} --workers 2 --threads 4 --timeout 120 wsgi:app"]
