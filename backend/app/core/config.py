import os

DATABASE_URL = os.getenv('DATABASE_URL', 'postgresql+psycopg://resq:resq@localhost:55432/resq')
RESQ_SECRET_KEY = os.getenv('RESQ_SECRET_KEY')
API_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173', 'http://127.0.0.1:4173']
INGEST_LIVE = os.getenv('INGEST_LIVE', 'false').lower() in ('true', '1')
