FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app/backend

COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

COPY backend /app/backend
COPY frontend /app/frontend
COPY assets /app/assets

EXPOSE 8080

CMD ["uvicorn", "auramesh.asgi:application", "--host", "0.0.0.0", "--port", "8080"]
