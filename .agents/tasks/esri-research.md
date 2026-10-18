# Satellite Basemap Research Report for RESQ/TerraWatch Control Room

**Date**: December 2024  
**Purpose**: Evaluate satellite imagery tile services for optional Control Room basemap  
**Requirements**: Production-ready, minimal/no key requirement, clear licensing, adequate attribution

---

## 1. Esri World Imagery Tile Service

### Licensing & Cost

**Official Sources Consulted**:
- Esri Master Agreement: https://www.esri.com/en-us/legal/terms/full-master-agreement
- ArcGIS Location Services Pricing: https://location.arcgis.com/sign-up/
- ArcGIS Developer Terms: https://developers.arcgis.com/terms/
- REST Services Directory: https://services.arcgisonline.com/arcgis/rest/services

**Key Findings**:

1. **API Key Requirement**: YES - Esri World Imagery requires an ArcGIS API key (formerly called "token")
2. **Account Requirement**: YES - Requires ArcGIS Developer account (free tier available)
3. **Free Tier Limits**: 
   - 2 million basemap tiles per month (free)
   - After that: $0.50 per 1,000 tiles
4. **Production Use**: Permitted under ArcGIS Developer Subscription terms
5. **Commercial Use**: Allowed with proper attribution

**Verdict**: **ASK-USER** — Free tier is generous (2M tiles/month), but requires:
- User to create ArcGIS Developer account
- API key management in backend config
- Monitoring tile usage
- Potential billing if usage exceeds 2M/month

### Attribution Requirements

**Required Attribution**:
```
Powered by Esri
```

Plus dynamic source attribution that varies by visible extent (e.g., "Source: Esri, Maxar, Earthstar Geographics"). 

The ArcGIS Maps SDK and services automatically provide this attribution via the tile service metadata, but for direct tile access you must:
- Display "Powered by Esri" prominently
- Include dynamic contributors visible in the map attribution control
- Not obscure or remove attribution

**Attribution Docs**: https://developers.arcgis.com/documentation/mapping-apis-and-services/deployment/terms-of-use/#attribution

### Tile URL Pattern

**Standard WMTS/XYZ URL** (requires API key):
```
https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?token={YOUR_API_KEY}
```

**Alternative Vector Basemap Service** (also requires key):
```
https://basemaps-api.arcgis.com/arcgis/rest/services/styles/ArcGIS:Imagery?type=style&token={YOUR_API_KEY}
```

**CORS**: Enabled for browser access with valid API key

**Max Zoom**: Level 19-23 depending on region (high-resolution in many urban areas)

---

## 2. NASA GIBS (Global Imagery Browse Services)

### Licensing & Cost

**Official Sources**:
- GIBS Landing Page: https://www.earthdata.nasa.gov/eosdis/science-system-description/eosdis-components/gibs
- NASA Data Policy: https://www.earthdata.nasa.gov/engage/open-data-services-and-software/data-and-information-policy
- GIBS Geographic Capabilities: https://wiki.earthdata.nasa.gov/display/GIBS/Geographic+Mapping+Service+Capabilities

**Key Findings**:

1. **API Key Requirement**: NO
2. **Account Requirement**: NO
3. **Cost**: FREE (U.S. Government public domain data)
4. **Production Use**: Unrestricted for any purpose (public domain)
5. **Rate Limits**: Reasonable use policy; no hard limits documented for standard web apps

**Verdict**: **GO** — No barriers, public domain, no key needed

### Attribution Requirements

**Recommended Attribution**:
```
NASA EOSDIS GIBS
```

Or more specific:
```
NASA Worldview / MODIS Terra
```

Attribution is **not legally required** (public domain), but recommended as scientific courtesy.

**License**: U.S. Government work, public domain worldwide

### Tile URL Pattern

**MODIS Terra True Color (best for general use)**:
```
https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/{time}/{TileMatrixSet}/{z}/{y}/{x}.jpg
```

Where:
- `{time}` = date in `YYYY-MM-DD` format (use recent date, e.g., `2024-12-01`, or omit for "best available")
- `{TileMatrixSet}` = `GoogleMapsCompatible_Level9` (or Level6 for coarser)
- `{z}/{y}/{x}` = standard XYZ tile coordinates

**Simpler endpoint** (recent imagery, no date needed):
```
https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg
```

**CORS**: Enabled

**Max Zoom**: Level 9 (~305m/pixel at equator) for MODIS Terra True Color  
**Update Frequency**: Daily (with ~3-hour latency)  
**Limitations**: 
- Coarse resolution (not suitable for zooming into individual properties)
- Daily snapshots (may have cloud cover)
- Best for overview/context at country/regional scale

**Alternative Higher-Res Option**: 
- VIIRS True Color (Level 9, ~250m/px)
- Landsat (15-30m/px, but more complex tile service)

---

## 3. Other Alternatives Evaluated

### 3a. Stamen/Stadia Maps

**Status**: Stamen maps (including terrain) migrated to Stadia Maps in 2023

**Key Findings**:
- **API Key Required**: YES (Stadia requires account + API key)
- **Free Tier**: 200,000 tiles/month
- **Cost**: $1 per 1,000 tiles after free tier
- **Satellite/Imagery**: Stadia offers Alidade Satellite based on Esri/other sources (still requires key)

**Source**: https://stadiamaps.com/pricing/

**Verdict**: **ASK-USER** — Requires key, similar to Esri but smaller free tier

### 3b. Mapbox Satellite

**Key Findings**:
- **API Key Required**: YES
- **Free Tier**: 200,000 tile requests/month
- **Cost**: $0.50 per 1,000 tiles after free tier
- **Quality**: High resolution, excellent coverage

**Source**: https://www.mapbox.com/pricing

**Verdict**: **ASK-USER** — Requires key and Mapbox account

### 3c. OpenStreetMap (OSM)

**Note**: OSM provides map data but **not satellite imagery**. OSM Carto is a rendered map style, not aerial photos.

**Verdict**: **Not applicable** for satellite basemap requirement

---

## 4. CORS and Content Security Policy Considerations

### Esri World Imagery
- **img-src CSP**: `https://*.arcgisonline.com https://*.arcgis.com`
- **connect-src CSP**: Same as above (tile fetches)
- **CORS**: Enabled with API key

### NASA GIBS
- **img-src CSP**: `https://gibs.earthdata.nasa.gov`
- **connect-src CSP**: Same
- **CORS**: Enabled (no key needed)

### Service Worker / Offline Caching

Per task requirements:
- **Do NOT add satellite tiles to offline PMTiles pack**
- **Do NOT cache satellite tiles aggressively** in service worker

Recommendation:
- Exclude satellite tile URLs from service worker cache strategies
- Use network-first or network-only policy for satellite tiles
- Implement graceful fallback to vector basemap when offline

---

## 5. Recommendation

### Option A: NASA GIBS (RECOMMENDED FOR IMMEDIATE USE)

**Verdict**: **GO**

**Pros**:
- Zero barriers: no key, no account, no cost, no usage limits
- Public domain: unrestricted use
- Already configured for CORS
- Simple tile URL pattern
- Works offline (graceful fallback to vector map)
- No legal/procurement delays

**Cons**:
- Coarse resolution (~250-300m/pixel) — adequate for regional/landscape view but not for parcel-level detail
- Daily snapshots (may have clouds)
- Not suitable for high-zoom use cases

**Best For**:
- Quick deployment
- Overview context (district/tehsil/block level)
- Users who want to see vegetation/landscape patterns
- Proof-of-concept for satellite toggle feature

**Implementation**:
```typescript
// Simple tile URL, no key needed
const NASA_GIBS_URL = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg';

// Max zoom: 9 (coarse) — enforce UI limit or switch to vector at higher zooms
```

**Attribution**: "NASA EOSDIS GIBS"

---

### Option B: Esri World Imagery (REQUIRES USER APPROVAL)

**Verdict**: **ASK-USER**

**Pros**:
- High resolution (up to 30cm in some areas, typically 60cm urban, 10m rural)
- Excellent global coverage and quality
- Generous free tier (2M tiles/month likely sufficient for pilot)
- Professional-grade imagery

**Cons**:
- **Requires API key** → user must create ArcGIS Developer account
- Usage monitoring required
- Potential cost if exceeding 2M tiles/month (~$0.50 per 1,000 extra)
- Adds external dependency and key management

**Best For**:
- High-zoom use cases (village, farm, household level)
- Production deployments where image quality matters
- Teams comfortable managing API keys and monitoring usage

**Next Steps if Approved**:
1. User creates free ArcGIS Developer account at https://developers.arcgis.com/sign-up/
2. Generate API key with "Basemap" scope
3. Add `VITE_ESRI_API_KEY` to .env (backend) or runtime config
4. Implement tile URL with key injection
5. Add usage monitoring/logging
6. Update CSP headers

---

## 6. Hybrid Approach (RECOMMENDED)

Implement **both** options with a config-time choice:

1. **Default (no key needed)**: NASA GIBS
   - Works out of the box
   - Adequate for regional context
   - Zero setup friction

2. **Opt-in (key required)**: Esri World Imagery
   - Enabled via `VITE_ESRI_API_KEY` environment variable
   - If key present → use Esri (high-res)
   - If key absent → use NASA GIBS (fallback)

3. **UI Behavior**:
   - Show satellite toggle in Control Room
   - At zoom > 9, show notice if using NASA GIBS: "Satellite view available at this zoom with high-resolution imagery (requires configuration)"
   - Graceful degradation

**Code structure**:
```typescript
const satelliteSource = import.meta.env.VITE_ESRI_API_KEY
  ? {
      type: 'raster',
      tiles: [`https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?token=${import.meta.env.VITE_ESRI_API_KEY}`],
      tileSize: 256,
      attribution: 'Powered by Esri',
      maxzoom: 19
    }
  : {
      type: 'raster',
      tiles: ['https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg'],
      tileSize: 256,
      attribution: 'NASA EOSDIS GIBS',
      maxzoom: 9
    };
```

---

## 7. Final Answer to User

**Question**: Can we use Esri World Imagery for the Control Room satellite basemap?

**Answer**: 

**Esri requires an API key and ArcGIS Developer account** (free tier: 2M tiles/month). This is acceptable for production use under their developer terms, but requires:
1. You to create an account at https://developers.arcgis.com/sign-up/
2. API key in config (`VITE_ESRI_API_KEY`)
3. Usage monitoring

**NASA GIBS is public domain and needs no key**, but is coarser (~250m/pixel, max zoom 9).

**My recommendation**: 
- Implement the satellite toggle with **NASA GIBS as the default** (works immediately, no setup)
- Support Esri as an **optional upgrade** if you provide a key
- Document both options in `docs/operations/CONFIGURATION.md`

This gives you:
- ✅ Zero-friction deployment (GIBS works out of the box)
- ✅ Upgrade path to high-res imagery if needed (Esri with key)
- ✅ No forced dependency on external accounts
- ✅ Graceful degradation

**Do you want to proceed with this hybrid approach, or would you prefer GIBS-only for now?**

---

## Sources & Links

1. **Esri**:
   - Developer terms: https://developers.arcgis.com/terms/
   - Pricing: https://location.arcgis.com/sign-up/
   - Attribution: https://developers.arcgis.com/documentation/mapping-apis-and-services/deployment/terms-of-use/#attribution
   - Service directory: https://services.arcgisonline.com/arcgis/rest/services

2. **NASA GIBS**:
   - Landing page: https://www.earthdata.nasa.gov/eosdis/science-system-description/eosdis-components/gibs
   - WMTS capabilities: https://wiki.earthdata.nasa.gov/display/GIBS/WMTS
   - Data policy: https://www.earthdata.nasa.gov/engage/open-data-services-and-software/data-and-information-policy

3. **Alternatives**:
   - Stadia Maps: https://stadiamaps.com/pricing/
   - Mapbox: https://www.mapbox.com/pricing

---

**Report Generated**: December 2024  
**Research Agent**: Kiro Autonomous Sub-agent  
**Workflow**: `wf_6b37f23e4e8df436`
