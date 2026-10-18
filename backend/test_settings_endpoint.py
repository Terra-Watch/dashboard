#!/usr/bin/env python3
"""Test the ops/settings endpoint that the frontend queries"""
import sys
from pathlib import Path

BACKEND = Path(__file__).parent
sys.path.insert(0, str(BACKEND))

from fastapi.testclient import TestClient
from app.main import app
from tests.test_auth import make_user, fresh_client

# Create test client
client = fresh_client()

# Create a control room operator
role, email = make_user('control_room_operator', scopes=['OD'])
print(f"Created user: {email} with role: {role}")

# Login
login_resp = client.post('/api/auth/login', json={'email': email, 'password': 'SecurePassword123!'})
if login_resp.status_code != 200:
    print(f"❌ Login failed: {login_resp.status_code}")
    print(login_resp.text)
    sys.exit(1)

token = login_resp.json()['access_token']
headers = {
    'Authorization': f'Bearer {token}',
    'x-resq-csrf': client.cookies.get('resq_csrf')
}

# Get settings
print("\nFetching /api/ops/settings...")
settings_resp = client.get('/api/ops/settings', headers=headers)

if settings_resp.status_code != 200:
    print(f"❌ Settings request failed: {settings_resp.status_code}")
    print(settings_resp.text)
    sys.exit(1)

settings = settings_resp.json()
print("\n" + "=" * 60)
print("Settings Response:")
print("=" * 60)
for key, value in settings.items():
    print(f"  {key}: {value}")

print("\n" + "=" * 60)
if settings.get('risk_forecast_enabled'):
    print("✅ Risk forecast is ENABLED")
    print(f"✅ Risk forecast date: {settings.get('risk_forecast_date')}")
else:
    print("❌ Risk forecast is DISABLED")
print("=" * 60)
