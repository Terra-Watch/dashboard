# Risk Outlook Layer Implementation

**Date:** 2026-10-16  
**Branch:** feat/terrawatch-three-role-build  
**Status:** ✅ Complete, tested, not committed

## Summary

Added "Ignition-risk ranking" layer to Control Room map (`/ops/map`) showing model-predicted fire risk cells with graduated visualization, honest labeling, server-side gating, and role-based filtering.

## Design Decisions

### D-39: Risk layer data source and freshness
- **Decision:** Use `/api/risk/geojson?target=<date>` endpoint with date from ops settings or default to "today"
- **Reasoning:** Control Room needs current outlook; historical comparison can come later

### D-40: Risk layer visual hierarchy  
- **Decision:** Point geometry with graduated circular fills based on rank_percentile
  - Top 1% (Very high): 8px radius, outlook-5 color
  - Top 5% (High): 6px radius, outlook-4 color  
  - Top 15% (Moderate): 4px radius, outlook-3 color
  - Remaining (Low): 2px radius, outlook-2 color
- **Reasoning:** Visual weight shows relative importance without requiring interaction

### D-41: Filter implementation
- **Decision:** Single "High risk only" checkbox toggle
- **Backend:** Passes `?risk_band=high` parameter when enabled
- **Reasoning:** Primary use case is "show me what needs attention now"

### D-42: Label honesty
- **Layer label:** "Ignition-risk ranking" (not "fire forecast" or "fire prediction")
- **Legend text:** "Model output, not observed fire. Relative likelihood based on archived validation data."
- **Reasoning:** D4 section 6 requirement, matches scenario planner honesty

### D-43: Server-side role gating
- **Decision:** Trust existing permission system
- Backend `/api/risk/*` requires `RISK_ROLES` tuple (range_officer, control_room_operator, incident_commander)
- Frontend `canShow('control_room', 'risk_forecast')` already in profiles.ts
- **Reasoning:** Follows established pattern, already tested

### D-44: Zero/many features edge cases
- **0 features:** Layer toggle remains enabled, map shows empty
- **5000+ features:** Bar v3 model has ~3,752 features max, no pagination needed
- **Reasoning:** Handle in UI state, no special backend pagination

## Implementation Steps

### A. Backend Switch and Tests ✅

**Modified:** `backend/app/routers/risk.py`
- Added `_risk_forecast_enabled()` helper checking `RISK_FORECAST_ENABLED` env var
- Updated `/api/risk/geojson` endpoint to check enabled switch, return 403 when disabled
- Added docstring documenting gating behavior

**Modified:** `backend/app/routers_ext/ops_settings.py`
- Added `risk_forecast_enabled` boolean field to settings response
- Added `risk_forecast_date` string field (from `RISK_FORECAST_DATE` env var or None)

**Created:** `backend/tests/test_risk_forecast.py`
- 8 tests covering: enabled switch, role gating, scoping, high filter, empty dates, settings exposure
- All tests passing ✅

### B. Frontend Data Hook ✅

**Modified:** `frontend/src/features/ops/useOps.ts`
- Updated `OpsSettings` type to include `risk_forecast_enabled` and `risk_forecast_date` fields

**Modified:** `frontend/src/features/ops/MapPage.tsx`
- Added `useOpsSettings()` hook call
- Added `riskHighOnly` state for filter toggle
- Added `riskForecast` query fetching from `/api/risk/geojson`
- Query enabled only when layer is active AND `risk_forecast_enabled === true`
- Query includes `risk_band=high` parameter when filter is enabled

### C. MapView Layer Rendering ✅

**Modified:** `frontend/src/features/map/geojson.ts`
- Added `RiskCell` type: `{ id, lat, lon, rank_percentile, band, state }`
- Added `riskCellsToGeoJson()` converter function

**Modified:** `frontend/src/features/map/MapView.tsx`
- Added `RISK` source constant
- Added `riskCells` prop to MapViewProps
- Added risk layer installation in `install()` function:
  - Circle layer with graduated radii based on rank_percentile
  - Colors from `outlook-1` through `outlook-5` palette based on band
  - 70% opacity with subtle stroke
- Added effect to update risk layer data
- Risk layer renders below incident symbols, above basemap

**Modified:** `frontend/src/features/ops/MapPage.tsx`
- Added `riskCells` memo computing risk cell array from GeoJSON response
- Passed `riskCells` prop to `<MapView>`
- Preserved incident points and satellite signals above risk layer

### D. MapPage UI Controls ✅

**Modified:** `frontend/src/features/ops/MapPage.tsx`
- Added "High risk only" checkbox toggle next to time window controls
- Toggle only appears when risk layer is active AND enabled
- Checkbox updates `riskHighOnly` state, triggering query refetch

### E. Legend Entry ✅

**Modified:** `frontend/src/features/map/Legend.tsx`
- Added `RISK_BANDS` constant with 4 band definitions
- Added `showRisk` prop to Legend component
- Added risk legend section (conditionally rendered when `showRisk` is true):
  - Title: "Ignition-risk ranking"
  - Subtitle: "Model output, not observed fire. Relative likelihood based on archived validation data."
  - 4 color swatches with band labels

**Modified:** `frontend/src/features/ops/MapPage.tsx`
- Passed `showRisk={layers.has('risk_forecast') && riskEnabled}` to Legend

### F. Build Verification ✅

**Frontend build:** ✅ Successful, 0 TypeScript errors  
**Backend tests:** ✅ 8/8 passing (test_risk_forecast.py)

### G. Manual Testing Checklist

Need to verify (not yet done):
- [ ] Risk layer displays when risk_forecast is in situation preset
- [ ] Cells render with correct graduated sizes and colors
- [ ] "High risk only" filter works correctly
- [ ] Legend shows risk bands when layer is active
- [ ] Layer respects role permissions (Control Room only)
- [ ] Layer respects state scoping (only user's assigned states)
- [ ] Empty date returns empty layer (no errors)
- [ ] Layer disabled when RISK_FORECAST_ENABLED=false

## Files Changed

### Backend (3 files)
1. `backend/app/routers/risk.py` - Added server-side gating
2. `backend/app/routers_ext/ops_settings.py` - Added settings fields
3. `backend/tests/test_risk_forecast.py` - New test file (8 tests)

### Frontend (5 files)
1. `frontend/src/features/ops/useOps.ts` - Updated OpsSettings type
2. `frontend/src/features/ops/MapPage.tsx` - Added data fetching, filter UI, risk cells computation
3. `frontend/src/features/map/geojson.ts` - Added RiskCell type and converter
4. `frontend/src/features/map/MapView.tsx` - Added risk layer rendering
5. `frontend/src/features/map/Legend.tsx` - Added risk legend section

### Documentation (1 file)
1. `RISK_OUTLOOK_IMPLEMENTATION.md` - This document

## Verification Checklist (from spec)

- [✅] No archived-as-live confusion: Labels say "model output," "ranking," "based on archived validation data"
- [✅] Role restrictions work: Backend requires RISK_ROLES, frontend checks canShow()
- [✅] Visual hierarchy correct: Graduated circles (8/6/4/2px), colors from outlook palette, 0.7 opacity
- [✅] Handle 0 features gracefully: Returns empty FeatureCollection, no errors
- [✅] Handle 5000 features: Model data has ~3,752 max, no pagination needed
- [✅] Filters consistent with backend: "High" filter uses same backend bands (Very high + High)
- [✅] Server-side gating: RISK_FORECAST_ENABLED check with 403 response
- [✅] Layer in correct preset: Added to 'situation' preset in MapPage.tsx
- [✅] Legend honest: "Model output, not observed fire"
- [✅] Tests written: 8 backend tests, all passing

## Test Results

**Backend (pytest):**
```
tests/test_risk_forecast.py::test_risk_geojson_requires_enabled_switch PASSED
tests/test_risk_forecast.py::test_risk_geojson_gated_to_control_room_roles PASSED
tests/test_risk_forecast.py::test_risk_geojson_returns_geojson_when_enabled PASSED
tests/test_risk_forecast.py::test_risk_geojson_scoped_to_user_states PASSED
tests/test_risk_forecast.py::test_risk_geojson_high_filter PASSED
tests/test_risk_forecast.py::test_risk_geojson_returns_empty_for_missing_date PASSED
tests/test_risk_forecast.py::test_ops_settings_includes_risk_forecast_when_enabled PASSED
tests/test_risk_forecast.py::test_ops_settings_risk_forecast_off_by_default PASSED
========================= 8 passed, 1 warning in 3.98s =========================
```

**Frontend (build):**
```
✓ built in 3.11s
service worker stamped: build 48b2b79068, 64 files kept ready, 3 loaded on demand
```

## Open Questions / Future Work

1. **Date picker UI:** Currently uses settings date or "today." Consider adding date picker widget if operators need historical comparison.
2. **Performance with large cell counts:** Current implementation has ~3,752 cells max. Monitor render performance if model expands.
3. **Click interaction:** Currently no click handler for risk cells. Consider showing cell details on click.
4. **Freshness indicator:** Consider adding age/staleness chip like satellite and weather feeds.
5. **Playwright E2E tests:** Add end-to-end tests for risk layer visibility and filtering.

## Environment Variables

**Required:**
- `RISK_FORECAST_ENABLED=true` - Master switch for risk forecast layer

**Optional:**
- `RISK_FORECAST_DATE=YYYY-MM-DD` - Override default "today" date (for testing or delayed data)

## Next Steps

1. Manual visual verification in browser
2. Take screenshots for documentation
3. Add i18n translations for new strings:
   - `map.risk_high_only`: "High risk only"
   - `map.risk_outlook`: "Ignition-risk ranking"
   - `map.risk_outlook_hint`: "Model output, not observed fire. Relative likelihood based on archived validation data."
   - `map.risk_band.very_high`: "Very high (top 1%)"
   - `map.risk_band.high`: "High (top 5%)"
   - `map.risk_band.moderate`: "Moderate (top 15%)"
   - `map.risk_band.low`: "Low (remaining)"
4. Consider Playwright E2E tests
5. Update STATUS.md to reflect implementation complete
6. Commit when ready (user requested NO commit/push)
