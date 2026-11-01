"""Photos citizens agreed to share to test and improve the photo check, and the labels staff give them. Idempotent."""
from sqlalchemy import text


def ensure(db) -> None:
    for ddl in ('research_consent BOOLEAN NOT NULL DEFAULT false', 'research_scene VARCHAR(16)', 'research_origin VARCHAR(16)',
                'research_labeled_by INTEGER REFERENCES resq_users(id) ON DELETE SET NULL', 'research_labeled_at TIMESTAMPTZ'):
        db.execute(text(f'ALTER TABLE resq_incident_images ADD COLUMN IF NOT EXISTS {ddl}'))
    db.execute(text("CREATE INDEX IF NOT EXISTS resq_incident_images_research_idx ON resq_incident_images (created_at) WHERE research_consent"))
