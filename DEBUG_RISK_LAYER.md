# Debug Risk Layer - Step by Step

## Step 1: Check Browser Console

Open your browser DevTools (Press F12 or Cmd+Option+I)

Go to the **Console** tab and look for these messages:

```
[DEBUG Risk Layer] { hasRiskInLayers: ..., riskEnabled: ..., queryStatus: ..., ... }
```

**Tell me what you see for each value:**
- `hasRiskInLayers`: true or false?
- `riskEnabled`: true or false?
- `queryStatus`: 'success', 'error', 'loading', or 'idle'?
- `queryError`: any error message?
- `featuresCount`: a number or undefined?

---

## Step 2: Check Network Tab

In DevTools, go to the **Network** tab

Look for a request to: `/api/ops/settings`

**Click on it and check the Response:**
- Does it show `"risk_forecast_enabled": true`?
- Does it show `"risk_forecast_date": "2024-03-10"`?

---

## Step 3: Check Risk API Request

In the Network tab, look for: `/api/risk/geojson?target=2024-03-10`

**What do you see?**
- [ ] No request at all (means query didn't run)
- [ ] Request with 403 error (wrong role)
- [ ] Request with 200 but empty features
- [ ] Request with 200 and features

If you see the request, click on it and check:
- **Status Code**: Should be 200
- **Response Preview**: Should show `"type": "FeatureCollection"` and `"features": [...]`

---

## Step 4: Check Your User Role

In the Console tab, type this and press Enter:

```javascript
localStorage.getItem('auth')
```

Or check the Network tab for any API response that shows your user info.

**What role do you have?**
- control_room_operator ✅ (allowed)
- incident_commander ✅ (allowed)
- range_officer ✅ (allowed)
- field_crew ❌ (not allowed)
- citizen ❌ (not allowed)

---

## Step 5: Check Active Preset

On the Map page, which button is highlighted?
- [ ] **Situation** (this should include risk layer)
- [ ] **Field** (this doesn't include risk layer)

---

## Quick Test Commands

### Test 1: Check if backend is serving the right settings
Open a new terminal and run:

```bash
# This will show what the settings endpoint returns
# You'll need to be logged in first, so do this from browser DevTools Console:

fetch('/api/ops/settings', {
  headers: {
    'Authorization': 'Bearer ' + localStorage.getItem('auth_token')
  }
}).then(r => r.json()).then(console.log)
```

### Test 2: Check if risk API works
From browser DevTools Console:

```javascript
fetch('/api/risk/geojson?target=2024-03-10', {
  headers: {
    'Authorization': 'Bearer ' + localStorage.getItem('auth_token')
  }
}).then(r => r.json()).then(data => {
  console.log('Features count:', data.features?.length);
  console.log('First feature:', data.features?.[0]);
})
```

---

## Common Issues and Solutions

### Issue 1: `riskEnabled: false`
**Cause**: Settings not loaded or backend not returning true

**Fix**:
1. Check backend is running: `lsof -ti:8000`
2. Restart backend if needed
3. Hard refresh browser (Cmd+Shift+R)

### Issue 2: `hasRiskInLayers: false`
**Cause**: Wrong preset selected or layer manually toggled off

**Fix**:
1. Click "Situation" preset button
2. Check if there's a layers toggle that's off

### Issue 3: 403 Error in Network Tab
**Cause**: User doesn't have permission

**Fix**:
1. Log out
2. Log in as a user with role: control_room_operator, incident_commander, or range_officer

### Issue 4: Query shows 'idle' status
**Cause**: Query not enabled - one of the conditions is false

**Fix**: 
Both must be true:
- `layers.has('risk_forecast')` - check preset
- `riskEnabled` - check settings endpoint

### Issue 5: 0 features returned
**Cause**: Date has no data OR user's state scopes don't match any risk cells

**Fix**:
Check what states you have access to vs what states have risk data

---

## After Checking, Report Back

Please tell me:

1. **Console Debug Output**: Copy/paste the `[DEBUG Risk Layer]` message
2. **Network /api/ops/settings Response**: What does it show?
3. **Network /api/risk/geojson Status**: 200? 403? Not called?
4. **Your Role**: What role is your user?
5. **Active Preset**: Situation or Field?

Then I can pinpoint the exact issue!
