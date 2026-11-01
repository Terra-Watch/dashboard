"""Browser push subscriptions and the record of what was sent. Idempotent."""
from sqlalchemy import text


def ensure(db) -> None:
    db.execute(text('''CREATE TABLE IF NOT EXISTS resq_push_subscriptions (
        id BIGSERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES resq_users(id) ON DELETE CASCADE,
        endpoint TEXT NOT NULL UNIQUE,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        state VARCHAR(2) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_ok_at TIMESTAMPTZ
    )'''))
    db.execute(text('CREATE INDEX IF NOT EXISTS resq_push_subscriptions_state_idx ON resq_push_subscriptions (state)'))
    db.execute(text('''CREATE TABLE IF NOT EXISTS resq_push_log (
        notice_id BIGINT NOT NULL REFERENCES resq_notices(id) ON DELETE CASCADE,
        subscription_id BIGINT NOT NULL REFERENCES resq_push_subscriptions(id) ON DELETE CASCADE,
        sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (notice_id, subscription_id)
    )'''))
