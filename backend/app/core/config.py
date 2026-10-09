import os

DATABASE_URL = os.getenv('DATABASE_URL', 'postgresql+psycopg://resq:resq@localhost:55432/resq')
RESQ_SECRET_KEY = os.getenv('RESQ_SECRET_KEY', 'development-only-resq-secret-key-change-me')
API_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173']
