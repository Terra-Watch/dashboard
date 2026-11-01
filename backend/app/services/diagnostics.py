"""A system check: finds the kind of problem that otherwise only shows up when a person hits it (two settings that exclude each other, a switch that is off,
a service that cannot be reached, leftover test accounts). Settings checks are pure functions of the environment so they can be tested; the live probes only read,
except the storage probe, which writes and removes one tiny file.

Levels: 'fail' means something is broken or unsafe now; 'warn' means it works but is probably not what you want; 'ok' says what was checked.
"""
from __future__ import annotations

import asyncio
import json
import os
import urllib.request
import uuid
from typing import Mapping

TRUE = {"1", "true", "yes", "on"}
DEV_ENVS = {"dev", "development", "local", "test"}


def _on(env: Mapping[str, str], name: str) -> bool:
    return str(env.get(name, "")).strip().lower() in TRUE


def _val(env: Mapping[str, str], name: str) -> str:
    return str(env.get(name, "")).strip()


def finding(level: str, id_: str, title: str, detail: str) -> dict:
    return {"level": level, "id": id_, "title": title, "detail": detail}


def config_findings(env: Mapping[str, str]) -> list[dict]:
    out: list[dict] = []
    hosted = bool(_val(env, "VERCEL"))
    prod = hosted or _val(env, "RESQ_ENV").lower() == "production"
    inference, experimental = _on(env, "FIRE_EVIDENCE_INFERENCE_ENABLED"), _on(env, "FIRE_EVIDENCE_EXPERIMENTAL_ENABLED")
    remote = _val(env, "FIRE_EVIDENCE_REMOTE_URL")
    # the evidence check
    if experimental and inference:
        out.append(finding("fail", "experimental_conflict", "The photo check cannot run", "The developer-only test path and the approved model are both switched on, so neither runs. Turn FIRE_EVIDENCE_EXPERIMENTAL_ENABLED off."))
    elif experimental and prod:
        out.append(finding("fail", "experimental_in_production", "A developer-only mode is on in production", "FIRE_EVIDENCE_EXPERIMENTAL_ENABLED should be false here."))
    if prod and _val(env, "TERRAWATCH_ENV").lower() in DEV_ENVS:
        out.append(finding("fail", "environment_name", "The environment is named like a developer machine", "TERRAWATCH_ENV should be production here; a development name unlocks test-only behaviour."))
    if not inference:
        out.append(finding("warn", "inference_off", "The automated photo check is switched off", "Photos are stored but no fire or smoke check runs (FIRE_EVIDENCE_INFERENCE_ENABLED)."))
    else:
        if remote:
            if not remote.lower().startswith("https://"):
                out.append(finding("fail" if prod else "warn", "remote_not_https", "The model host address is not https", "FIRE_EVIDENCE_REMOTE_URL should start with https://."))
            if not _val(env, "FIRE_EVIDENCE_REMOTE_TOKEN"):
                out.append(finding("fail", "remote_token", "The model host token is missing", "FIRE_EVIDENCE_REMOTE_URL is set without FIRE_EVIDENCE_REMOTE_TOKEN, so every check fails."))
        elif not (_val(env, "FIRE_EVIDENCE_REPO") and _val(env, "FIRE_EVIDENCE_ARTIFACT_DIR")):
            out.append(finding("fail", "no_model", "No model is configured", "The check is on, but there is neither a model host address nor a local model folder."))
        if hosted and not remote:
            out.append(finding("warn", "model_in_function", "The model would run inside the web server", "On Vercel the model is too large to run in the function; use FIRE_EVIDENCE_REMOTE_URL."))
        if _on(env, "FIRE_EVIDENCE_SHADOW_MODE"):
            out.append(finding("warn", "shadow_on", "Shadow mode is on", "Photo checks run but staff cannot see the results (FIRE_EVIDENCE_SHADOW_MODE)."))
        if not _on(env, "FIRE_EVIDENCE_REPORT_AUTHENTICITY_ENABLED"):
            out.append(finding("warn", "report_authenticity_off", "Authenticity is hidden for incident photos", "The check reads but does not show editing or AI-generation results (FIRE_EVIDENCE_REPORT_AUTHENTICITY_ENABLED)."))
    if _on(env, "COMMUNITY_IMAGES_ENABLED") and not _on(env, "FIRE_EVIDENCE_COMMUNITY_ENABLED"):
        out.append(finding("warn", "community_unchecked", "Community photos are not checked", "Photos on posts are allowed but the authenticity check is off, so none are held (FIRE_EVIDENCE_COMMUNITY_ENABLED)."))
    if _on(env, "PUBLIC_REPORTS_ENABLED") and not inference:
        out.append(finding("warn", "public_unchecked", "Public photos are not being checked", "Unverified photos are shown to the public while the automatic check is off, so none are held."))
    # storage, sessions, accounts
    if hosted and not _on(env, "BLOB_STORAGE_ENABLED"):
        out.append(finding("fail", "storage", "Photos are not being stored safely", "BLOB_STORAGE_ENABLED is off on a serverless host, so uploaded photos would be lost."))
    if _on(env, "BLOB_STORAGE_ENABLED") and not _val(env, "BLOB_READ_WRITE_TOKEN") and not (_val(env, "BLOB_STORE_ID") and _val(env, "VERCEL_OIDC_TOKEN")):
        out.append(finding("fail", "storage_token", "Photo storage has no credentials", "BLOB_STORAGE_ENABLED is on but no storage token is set."))
    key = _val(env, "RESQ_SECRET_KEY")
    if not key or len(key) < 32 or key.lower().startswith(("test", "change", "secret", "dev")):
        out.append(finding("fail", "secret_key", "The signing secret is weak or missing", "RESQ_SECRET_KEY should be a long random value."))
    if prod and _val(env, "RESQ_ENV").lower() != "production":
        out.append(finding("warn", "resq_env", "RESQ_ENV is not set to production", "Development accounts could be created if RESQ_SEED_DEV_ACCOUNTS is on."))
    if prod and _on(env, "RESQ_SEED_DEV_ACCOUNTS"):
        out.append(finding("fail", "seed_dev_accounts", "Test accounts may be created on startup", "RESQ_SEED_DEV_ACCOUNTS should be off in production."))
    origins = _val(env, "API_ORIGINS")
    if prod and ("localhost" in origins or "127.0.0.1" in origins):
        out.append(finding("warn", "origins", "Local addresses are allowed to call the API", "API_ORIGINS lists localhost in production."))
    # alerts and the Control Room
    public_key, private_key = _val(env, "PUSH_VAPID_PUBLIC_KEY"), _val(env, "PUSH_VAPID_PRIVATE_KEY")
    if bool(public_key) != bool(private_key):
        out.append(finding("fail", "push_keys", "Phone alerts are half set up", "Only one of the two push keys is set; alerts will not be sent."))
    elif not public_key:
        out.append(finding("warn", "push_off", "Phone alerts are not set up", "No push keys (PUSH_VAPID_PUBLIC_KEY / PUSH_VAPID_PRIVATE_KEY)."))
    if not (_val(env, "CORROBORATION_RADIUS_KM") and _val(env, "CORROBORATION_WINDOW_MINUTES")):
        out.append(finding("warn", "corroboration_off", "Duplicate-report suggestions are off", "CORROBORATION_RADIUS_KM and CORROBORATION_WINDOW_MINUTES are not both set."))
    if _val(env, "RISK_FORECAST_DATE") and _on(env, "RISK_FORECAST_ENABLED"):
        out.append(finding("warn", "forecast_date", "The risk layer is pinned to one day", f"RISK_FORECAST_DATE is {_val(env, 'RISK_FORECAST_DATE')}; it will not move forward."))
    if not out:
        out.append(finding("ok", "settings", "Settings are consistent", "No conflicting or missing settings were found."))
    return out


def dev_account_findings(emails: list[str], prod: bool) -> list[dict]:
    dev = [e for e in emails if e.endswith((".dev@terrawatch.local", "@resq.local"))]
    if dev and prod:
        return [finding("fail", "dev_accounts", "Test accounts exist in production", f"{len(dev)} account(s) such as {dev[0]} were made for development. Deactivate them or change their passwords.")]
    return [finding("ok", "dev_accounts", "No test accounts in production", "None found.")] if prod else []


async def live_findings(env: Mapping[str, str], deep: bool = False) -> list[dict]:
    from sqlalchemy import text
    from ..database.session import engine
    from . import blob_storage, image_assessment
    out: list[dict] = []
    prod = bool(_val(env, "VERCEL")) or _val(env, "RESQ_ENV").lower() == "production"
    try:
        with engine.connect() as db:
            db.execute(text("SELECT 1"))
            emails = db.execute(text("SELECT email FROM resq_users WHERE deactivated_at IS NULL")).scalars().all()
            no_scope = db.execute(text("""SELECT count(*) FROM resq_users u WHERE u.deactivated_at IS NULL AND u.role IN ('control_room_operator','incident_commander','field_crew')
                AND NOT EXISTS (SELECT 1 FROM resq_user_scopes s WHERE s.user_id=u.id)""")).scalar()
        out.append(finding("ok", "database", "The database answers", "A test query worked."))
        out.extend(dev_account_findings(list(emails), prod))
        if no_scope:
            out.append(finding("warn", "staff_without_states", "Some staff have no states", f"{no_scope} staff account(s) cover no state; they see nothing except states nobody covers."))
    except Exception as exc:
        out.append(finding("fail", "database", "The database does not answer", type(exc).__name__))
    if blob_storage.enabled():
        key = f"diagnostics/{uuid.uuid4().hex}.txt"
        try:
            import hashlib
            data = b"terrawatch storage check"
            await blob_storage.put(key, data, "text/plain")
            back = await blob_storage.get(key, hashlib.sha256(data).hexdigest())
            await blob_storage.delete(key)
            out.append(finding("ok" if back == data else "fail", "storage_probe", "Photo storage works" if back == data else "Photo storage returned the wrong file", "Wrote, read back and removed a test file." if back == data else "The file read back did not match."))
        except Exception as exc:
            out.append(finding("fail", "storage_probe", "Photo storage does not work", type(exc).__name__))
    remote = _val(env, "FIRE_EVIDENCE_REMOTE_URL")
    if remote and _on(env, "FIRE_EVIDENCE_INFERENCE_ENABLED"):
        def health() -> dict:
            with urllib.request.urlopen(remote.rstrip("/") + "/health", timeout=8) as r:
                return json.loads(r.read(5000))
        try:
            body = await asyncio.to_thread(health)
            ok = bool(body.get("ok"))
            out.append(finding("ok" if ok else "warn", "model_host", "The model host answers" if ok else "The model host answers but is not ready", json.dumps(body.get("loaded", {}))))
        except Exception as exc:
            out.append(finding("fail", "model_host", "The model host cannot be reached", f"{type(exc).__name__}. It may be starting (the first call after idle takes up to a minute)."))
        if deep:
            try:
                from io import BytesIO
                from PIL import Image
                buf = BytesIO(); Image.new("RGB", (320, 240), (90, 110, 70)).save(buf, "JPEG")
                result = await image_assessment.assess_image_async(buf.getvalue(), "diagnostics/probe.jpg")
                ok = result.get("assessment_status") == "COMPLETED"
                out.append(finding("ok" if ok else "fail", "model_run", "A test photo was checked" if ok else "A test photo could not be checked",
                                   f"model {result.get('model_version')}" if ok else f"{result.get('assessment_status')} {result.get('error_code') or ''}".strip()))
            except Exception as exc:
                out.append(finding("fail", "model_run", "A test photo could not be checked", type(exc).__name__))
    return out
