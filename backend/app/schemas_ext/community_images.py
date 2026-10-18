"""Community post images and their media-moderation assessments. Idempotent. Entirely separate from resq_incident_images.

Nothing here references incidents, assignments or alerts. The tables stay empty unless COMMUNITY_IMAGES_ENABLED is turned on.
"""
from sqlalchemy import text

MIMES = "('image/jpeg','image/png','image/webp')"
STATUSES = "('AUTHENTIC_NO_CONCERN','POSSIBLE_SYNTHETIC','POSSIBLE_EDITED','REUSED','INCONCLUSIVE','UNAVAILABLE')"


def ensure(db) -> None:
    if db.execute(text("SELECT to_regclass('resq_community_image_assessments') IS NOT NULL AND to_regclass('resq_community_post_images') IS NOT NULL")).scalar():
        return  # CREATE TABLE IF NOT EXISTS is cheap, but skipping it avoids needless locks on resq_community_posts at every start
    db.execute(text(f'''CREATE TABLE IF NOT EXISTS resq_community_post_images (
        id BIGSERIAL PRIMARY KEY,
        post_id BIGINT NOT NULL UNIQUE REFERENCES resq_community_posts(id) ON DELETE CASCADE,
        author_id INTEGER NOT NULL REFERENCES resq_users(id) ON DELETE CASCADE,
        storage_key TEXT NOT NULL UNIQUE,
        sha256 VARCHAR(64) NOT NULL CHECK (sha256 ~ '^[0-9a-f]{{64}}$'),
        mime VARCHAR(30) NOT NULL CHECK (mime IN {MIMES}),
        size_bytes BIGINT NOT NULL CHECK (size_bytes > 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now())'''))
    db.execute(text(f'''CREATE TABLE IF NOT EXISTS resq_community_image_assessments (
        id BIGSERIAL PRIMARY KEY,
        image_id BIGINT NOT NULL UNIQUE REFERENCES resq_community_post_images(id) ON DELETE CASCADE,
        status VARCHAR(30) NOT NULL CHECK (status IN {STATUSES}),
        assessment JSONB NOT NULL,
        error_code VARCHAR(64),
        assessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        moderator_decision VARCHAR(12) CHECK (moderator_decision IS NULL OR moderator_decision IN ('approved','removed','dismissed')),
        moderator_id INTEGER REFERENCES resq_users(id) ON DELETE SET NULL,
        moderator_decided_at TIMESTAMPTZ,
        moderator_note VARCHAR(500))'''))
