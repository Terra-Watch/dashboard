#!/usr/bin/env python3
"""Test citizen upload endpoint directly"""
import sys
import os
from pathlib import Path

# Load .env
env_file = Path(__file__).parent / '.env'
if env_file.exists():
    with open(env_file) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, value = line.split('=', 1)
                os.environ[key] = value

sys.path.insert(0, str(Path(__file__).parent))

print("=== Testing Citizen Upload Flow ===\n")

# Check if database is accessible
from sqlalchemy import create_engine, text

db_url = os.getenv('DATABASE_URL', 'postgresql+psycopg://kireeti@localhost/resq')
print(f"Database: {db_url.split('@')[0]}@...\n")

try:
    engine = create_engine(db_url)
    with engine.connect() as conn:
        # Check if tables exist
        result = conn.execute(text("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('resq_incidents', 'resq_incident_images', 'resq_users')")).fetchall()
        tables = [row[0] for row in result]
        print(f"Database tables found: {len(tables)}")
        for table in tables:
            print(f"  - {table}")
        
        # Check for test users
        if 'resq_users' in tables:
            users = conn.execute(text("SELECT id, email, role FROM resq_users WHERE role='citizen' LIMIT 3")).fetchall()
            print(f"\nCitizen users: {len(users)}")
            for user in users:
                print(f"  - ID {user[0]}: {user[1]} ({user[2]})")
        
        # Check image storage directory
        from app.routers.operations import IMAGE_ROOT
        print(f"\nImage storage: {IMAGE_ROOT}")
        print(f"  Exists: {IMAGE_ROOT.exists()}")
        print(f"  Writable: {os.access(IMAGE_ROOT, os.W_OK) if IMAGE_ROOT.exists() else 'N/A'}")
        
        # Check for recent incidents
        if 'resq_incidents' in tables:
            recent = conn.execute(text("SELECT id, status, reporter_id, created_at FROM resq_incidents ORDER BY created_at DESC LIMIT 3")).fetchall()
            print(f"\nRecent incidents: {len(recent)}")
            for inc in recent:
                print(f"  - ID {inc[0]}: status={inc[1]}, reporter={inc[2]}, created={inc[3]}")
                
                # Check images for this incident
                images = conn.execute(text("SELECT id, assessment_status, created_at FROM resq_incident_images WHERE incident_id=:id"), {"id": inc[0]}).fetchall()
                if images:
                    print(f"    Images: {len(images)}")
                    for img in images:
                        print(f"      - Image {img[0]}: {img[1]} at {img[2]}")
        
        print("\n✅ Database connection working")
        
except Exception as e:
    print(f"\n❌ Database error: {e}")
    import traceback
    traceback.print_exc()

print("\n=== Potential Issues ===\n")
print("If upload fails from browser but works here:")
print("1. CSRF token - check browser cookies for 'resq_csrf'")
print("2. Authentication - check localStorage for 'resq_token'")
print("3. CORS - check if frontend and backend on same domain")
print("4. Backend logs - check uvicorn terminal for actual error")
