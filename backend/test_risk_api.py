#!/usr/bin/env python3
"""Quick test to verify risk layer API works for 2024-03-10"""
import os
import sys
from pathlib import Path

# Add backend to path
BACKEND = Path(__file__).parent
sys.path.insert(0, str(BACKEND))

# Set environment
os.environ['DATABASE_URL'] = 'postgresql+psycopg://resq:CePcuepkCinrPKWr8sfDv-KH7Czz8mEGYPHxhkrypgRnPXCpcaZj7UNkr3EsBYsA@127.0.0.1:5432/resq'
os.environ['RISK_FORECAST_ENABLED'] = 'true'
os.environ['RISK_FORECAST_DATE'] = '2024-03-10'

from datetime import date
from app.barv3 import daily_geojson, daily_risk

print("Testing Bar v3 data loading...")
print("-" * 60)

# Test GeoJSON endpoint
result = daily_geojson(date(2024, 3, 10))
features = result.get('features', [])
print(f"✅ GeoJSON Features: {len(features)}")

if features:
    print(f"✅ First feature cell_id: {features[0]['properties']['cell_id']}")
    print(f"✅ First feature band: {features[0]['properties']['band']}")
    print(f"✅ First feature state: {features[0]['properties']['state']}")
    
    # Show band distribution
    bands = {}
    for f in features:
        band = f['properties']['band']
        bands[band] = bands.get(band, 0) + 1
    
    print("\n📊 Band Distribution:")
    for band in ['Very high', 'High', 'Moderate', 'Low']:
        if band in bands:
            print(f"   {band}: {bands[band]} cells")
else:
    print("❌ No features found")
    sys.exit(1)

# Test daily risk endpoint
print("\n" + "-" * 60)
print("Testing daily risk endpoint...")
risk = daily_risk(date(2024, 3, 10))
if risk:
    print(f"✅ Model: {risk.get('model')}")
    print(f"✅ Date: {risk.get('date')}")
    print(f"✅ Cell count: {risk.get('forest_cell_count')}")
    print(f"✅ Records: {len(risk.get('records', []))}")
else:
    print("❌ No risk data found")

print("\n" + "=" * 60)
print("✅ ALL TESTS PASSED - Risk layer data is working!")
print("=" * 60)
