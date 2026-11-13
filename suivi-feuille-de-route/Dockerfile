FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt requirements-server.txt ./
RUN pip install --no-cache-dir -r requirements.txt -r requirements-server.txt

COPY app.py db.py import_excel.py ./
COPY templates ./templates
COPY static ./static
COPY seed ./seed

ENV PYTHONUNBUFFERED=1 \
    FDR_HOST=0.0.0.0 \
    FDR_PORT=8000

EXPOSE 8000

VOLUME ["/app/data"]

CMD ["gunicorn", "--preload", "-w", "4", "-b", "0.0.0.0:8000", "app:app"]
