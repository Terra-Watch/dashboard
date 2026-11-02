# Live camera, "which way is it", and face blur (2026-11-02)

Status: built and tested on a desktop browser with a fake camera and a faked compass; NOT tried on a real phone. Demo only; nothing here is a production decision.

## What changed for people
- **Report a fire:** photos can only be taken with the live camera inside the page. There is no gallery or file picker. At the moment of capture the page reads which way the phone points. After the photo the citizen can confirm or change the direction (eight compass points) and say how far it is (under 1 km, 1 to 3 km, more than 3 km, not sure). All of it is optional; sending is never blocked.
- **Control Room map:** a layer "Where reports point". Each recent report with a direction is a wedge; where several wedges overlap the map shows a search area ("3 reports point here, about 2 km2"). The label says it is estimated from phone compasses and not a position.
- **Community posts:** the same live camera replaces the file picker.
- **Faces** in public copies of report photos and in community post images are blurred before anyone else can see them. If the face detector cannot run, no public copy is made and a community image is refused (503).

## Where it lives
| Part | Files |
|---|---|
| Live camera | frontend/src/features/citizen/LiveCamera.tsx |
| Compass reading | frontend/src/lib/useCompass.ts, heading.ts (unit tests: unit/heading.unit.ts) |
| Report form | frontend/src/features/citizen/ReportPage.tsx |
| Wedge and overlap maths | backend/app/services/bearings.py (tests/test_bearings.py) |
| Storage and API | backend/app/schemas_ext/bearings.py, routers/citizen.py (create_report), routers_ext/bearings.py, GET /api/bearings (tests/test_report_bearings_api.py) |
| Map layer | frontend/src/features/ops/MapPage.tsx |
| Face blur | backend/app/services/privacy_blur.py, YuNet model in backend/app/assets/yunet (MIT), used by public_photo.py and community_image_assessment.py (tests/test_privacy_blur.py) |
| Browser tests | frontend/tests/citizen-report-flow.spec.ts, community-photo.spec.ts |

## Assumptions to check in the field
- A compass reading gets a wedge half-angle of 20 degrees and a hand-picked direction 22.5 degrees; the distance bands are widened (close 0 to 1.5 km, medium 0.5 to 4, far 2 to 15, not sure 0 to 15). These are judgement values in services/bearings.py, not measurements.
- Android: the direction comes from the Earth-referenced orientation angles. iPhone: from Safari's own compass heading (not checked on a real iPhone; the citizen can always pick the direction by hand).
- Compass is magnetic north; India's declination is small compared with a phone compass's error.

## Limits
- A browser cannot prove a photo came from the camera; a determined person can feed the page a fake camera or send requests directly. The API still accepts any image. Say "taken in the app", not "verified".
- Two observers looking from nearby make a long thin overlap; a hill can hide the base of the smoke; people judge distance badly. The result is a search area.
- Face blur: small, turned-away, masked or partly hidden faces can be missed. Number plates are NOT blurred.
- Deploy size: opencv-python-headless adds roughly 50 MB to the backend; check the hosting limit before deploying.
- Pre-existing failures, unrelated and present before this change: backend tests/test_auth.py route-coverage (GET /api/risk/status), two tests in tests/test_risk_filter.py, and the frontend what-if Hindi key test.
