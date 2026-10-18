"""Community D5 schema: status/topic/language, reactions, chat rooms, sanctions, auto-held queue entries. Idempotent."""
from sqlalchemy import text



def _check(db, table: str, name: str, expression: str) -> None:
    """Add a named CHECK once (no repeated lock-taking drop/add on every start)."""
    if not db.execute(text('SELECT 1 FROM pg_constraint WHERE conrelid=CAST(:t AS regclass) AND conname=:n'), {'t': table, 'n': name}).scalar():
        db.execute(text(f'ALTER TABLE {table} ADD CONSTRAINT {name} CHECK ({expression})'))


ITEM_TABLES = ('resq_community_posts', 'resq_community_comments', 'resq_community_messages')


def _already_applied(db) -> bool:
    """ALTER TABLE takes heavy locks even when it changes nothing; skip all of it once the final shape exists (avoids deadlocks on every start)."""
    return bool(db.execute(text("""SELECT to_regclass('resq_community_rooms') IS NOT NULL AND to_regclass('resq_community_reactions') IS NOT NULL
        AND to_regclass('resq_community_sanctions') IS NOT NULL
        AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname='resq_community_reports_one_target')
        AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='resq_community_messages' AND column_name='room_id' AND is_nullable='NO')
        AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='resq_community_posts' AND column_name='language')
        AND EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='resq_community_reports_once_message')""")).scalar())


def ensure(db) -> None:
    if _already_applied(db):
        return
    run = lambda sql: db.execute(text(sql))  # noqa: E731
    run('''CREATE TABLE IF NOT EXISTS resq_community_rooms (
        id BIGSERIAL PRIMARY KEY, region VARCHAR(80) NOT NULL UNIQUE,
        slow_mode_seconds INTEGER NOT NULL DEFAULT 0 CHECK (slow_mode_seconds BETWEEN 0 AND 3600),
        frozen BOOLEAN NOT NULL DEFAULT false, retention_days INTEGER CHECK (retention_days IS NULL OR retention_days > 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now())''')
    run("INSERT INTO resq_community_rooms (region) VALUES ('default') ON CONFLICT (region) DO NOTHING")
    for table in ITEM_TABLES:
        run(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS status VARCHAR(10) NOT NULL DEFAULT 'published'")
        _check(db, table, f'{table}_status_check', "status IN ('published','held','removed')")
    run("ALTER TABLE resq_community_posts ADD COLUMN IF NOT EXISTS language VARCHAR(5) NOT NULL DEFAULT 'en'")
    _check(db, 'resq_community_posts', 'resq_community_posts_language_check', "language IN ('en','hi','or','other')")
    # chat messages: removal fields, room, 500-character limit
    run('ALTER TABLE resq_community_messages ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ')
    run('ALTER TABLE resq_community_messages ADD COLUMN IF NOT EXISTS removed_by INTEGER REFERENCES resq_users(id) ON DELETE SET NULL')
    run('ALTER TABLE resq_community_messages ADD COLUMN IF NOT EXISTS removal_kind VARCHAR(10)')
    run('ALTER TABLE resq_community_messages ADD COLUMN IF NOT EXISTS removal_reason VARCHAR(500)')
    run('ALTER TABLE resq_community_messages ADD COLUMN IF NOT EXISTS room_id BIGINT REFERENCES resq_community_rooms(id) ON DELETE CASCADE')
    run("UPDATE resq_community_messages SET room_id=(SELECT id FROM resq_community_rooms WHERE region='default') WHERE room_id IS NULL")
    run('ALTER TABLE resq_community_messages ALTER COLUMN room_id SET NOT NULL')  # no-op when already set
    run('CREATE INDEX IF NOT EXISTS resq_community_messages_room_idx ON resq_community_messages (room_id, id DESC)')
    for table in ITEM_TABLES:  # removals made before the status column existed
        run(f"UPDATE {table} SET status='removed' WHERE removed_at IS NOT NULL AND status='published'")
    run('''CREATE TABLE IF NOT EXISTS resq_community_reactions (
        post_id BIGINT NOT NULL REFERENCES resq_community_posts(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES resq_users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (post_id, user_id))''')
    run('''CREATE TABLE IF NOT EXISTS resq_community_sanctions (
        id BIGSERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES resq_users(id) ON DELETE CASCADE,
        kind VARCHAR(4) NOT NULL CHECK (kind IN ('warn','mute')), reason VARCHAR(500) NOT NULL CHECK (char_length(reason) > 0),
        until TIMESTAMPTZ, created_by INTEGER REFERENCES resq_users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(), lifted_at TIMESTAMPTZ)''')
    run('CREATE INDEX IF NOT EXISTS resq_community_sanctions_user_idx ON resq_community_sanctions (user_id, created_at DESC)')
    # Auto-held items sit in the moderation queue as report rows with no reporter; a report may target a chat message too.
    run('ALTER TABLE resq_community_reports ALTER COLUMN reporter_id DROP NOT NULL')
    run('ALTER TABLE resq_community_reports ADD COLUMN IF NOT EXISTS message_id BIGINT REFERENCES resq_community_messages(id) ON DELETE CASCADE')
    old = db.execute(text("""SELECT conname FROM pg_constraint WHERE conrelid='resq_community_reports'::regclass AND contype='c'
        AND pg_get_constraintdef(oid) LIKE '%post_id IS NOT NULL%' AND conname <> 'resq_community_reports_one_target'""")).scalars().all()
    for name in old:
        run(f'ALTER TABLE resq_community_reports DROP CONSTRAINT "{name}"')
    _check(db, 'resq_community_reports', 'resq_community_reports_one_target', 'num_nonnulls(post_id, comment_id, message_id) = 1')
    run('CREATE UNIQUE INDEX IF NOT EXISTS resq_community_reports_once_message ON resq_community_reports (reporter_id, message_id) WHERE message_id IS NOT NULL')
