#!/usr/bin/env python3
"""Test the actual citizen evidence upload endpoint"""
import requests
import sys
from pathlib import Path
from PIL import Image
import io

print("=== Testing Citizen Evidence Upload ===\n")

# Create a test image
img = Image.new('RGB', (640, 480), color='orange')
buf = io.BytesIO()
img.save(buf, 'PNG')
buf.seek(0)

# Get the incident ID (use the last one from database)
import os
from sqlalchemy import create_engine, text

db_url = 'postgresql+psycopg://kireeti@localhost/resq'
with open('.env') as f:
    for line in f:
        if line.strip().startswith('DATABASE_URL='):
            db_url = line.split('=', 1)[1].strip()
            break

engine = create_engine(db_url)
with engine.connect() as db:
    result = db.execute(text(
        "SELECT id FROM resq_incidents ORDER BY created_at DESC LIMIT 1"
    )).scalar()
    incident_id = result

print(f"Testing upload to incident {incident_id}\n")

# Test without authentication (should fail with 401)
print("1. Test without token (should fail with 401)...")
try:
    response = requests.post(
        f'http://localhost:8000/api/citizen/reports/{incident_id}/evidence',
        files={'image': ('test.png', buf, 'image/png')},
        timeout=30
    )
    print(f"   Status: {response.status_code}")
    if response.status_code != 200:
        try:
            print(f"   Response: {response.json()}")
        except:
            print(f"   Response: {response.text[:200]}")
except Exception as e:
    print(f"   Error: {e}")

# Test with mock token (should fail differently)
buf.seek(0)
print("\n2. Test with mock Bearer token (should fail with 401/403)...")
try:
    response = requests.post(
        f'http://localhost:8000/api/citizen/reports/{incident_id}/evidence',
        files={'image': ('test.png', buf, 'image/png')},
        headers={'Authorization': 'Bearer fake_token'},
        timeout=30
    )
    print(f"   Status: {response.status_code}")
    try:
        print(f"   Response: {response.json()}")
    except:
        print(f"   Response: {response.text[:200]}")
except Exception as e:
    print(f"   Error: {e}")

# Test with CSRF header
buf.seek(0)
print("\n3. Test with CSRF header...")
try:
    response = requests.post(
        f'http://localhost:8000/api/citizen/reports/{incident_id}/evidence',
        files={'image': ('test.png', buf, 'image/png')},
        headers={
            'Authorization': 'Bearer fake_token',
            'x-resq-csrf': 'fake_csrf'
        },
        timeout=30
    )
    print(f"   Status: {response.status_code}")
    try:
        print(f"   Response: {response.json()}")
    except:
        print(f"   Response: {response.text[:200]}")
except Exception as e:
    print(f"   Error: {e}")

print("\n=== Analysis ===")
print("The frontend is likely getting 401 Unauthorized.")
print("This means the JWT token isn't being sent or is invalid.")
print("\nTo fix:")
print("1. Check browser DevTools → Network → Failed request")
print("2. Look at Request Headers - is Authorization header present?")
print("3. Check localStorage - is resq_token present?")
print("4. Check browser console for JavaScript errors")
