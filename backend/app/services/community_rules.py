"""Community content rules (D5 section 4). Detectors and name helpers are pure; the purge takes a database connection."""
import re

from sqlalchemy import text

STAFF_ROLES = {'admin', 'control_room_operator', 'incident_commander'}

_EMAIL = re.compile(r'[^\s@]+@[^\s@]+\.[a-z]{2,}', re.I)
_URL = re.compile(r'(?:https?://|www\.)\S+', re.I)
_TLDS = ('com|org|net|in|co|io|gov|edu|info|biz|me|app|xyz|ly|gl|to|tv|cc|us|uk|link|site|online|shop|top|club|page|dev')
_DOMAIN = re.compile(rf'(?<![\w@.-])(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:{_TLDS})\b(?![\w-])', re.I)
_COORD_COMMA = re.compile(r'(?<![\d.])(-?\d{1,3}\.\d{2,})\s*°?\s*[NS]?\s*[,;]\s*(?:lon(?:g|gitude)?\.?[:=]?\s*)?(-?\d{1,3}\.\d{2,})\s*°?\s*[EW]?(?![\d.])', re.I)
_COORD_SPACE = re.compile(r'(?<![\d.])(-?\d{1,3}\.\d{3,})\s+(-?\d{1,3}\.\d{3,})(?![\d.])')
_COORD_HEMI = re.compile(r'(?<![\d.])(\d{1,3}\.\d+)\s*°?\s*([NS])\W{1,3}(\d{1,3}\.\d+)\s*°?\s*([EW])', re.I)
_PHONE = re.compile(r'(?<!\w)\+?\(?\d[\d\s\-()]{5,}\d(?!\d)')

EMERGENCY_LATIN = ('fire at', 'on fire', 'burning', 'help', 'trapped', 'smoke at', 'flames', 'evacuate', 'save us', 'emergency')
EMERGENCY_OTHER = ('आग', 'जल रहा', 'जल रही', 'मदद', 'बचाओ', 'ନିଆଁ', 'ସାହାଯ୍ୟ')
_EMERGENCY_LATIN = re.compile(r'(?<![a-z])(?:' + '|'.join(re.escape(p) for p in EMERGENCY_LATIN) + r')(?![a-z])', re.I)


def has_link(value: str) -> bool:
    return bool(_URL.search(value) or _EMAIL.search(value) or _DOMAIN.search(value))


def _valid_pair(lat: str, lon: str) -> bool:
    try:
        return abs(float(lat)) <= 90 and abs(float(lon)) <= 180
    except ValueError:
        return False


def _coordinate_spans(value: str) -> list[tuple[int, int]]:
    spans = []
    for pattern in (_COORD_COMMA, _COORD_SPACE):
        for match in pattern.finditer(value):
            if _valid_pair(match.group(1), match.group(2)):
                spans.append(match.span())
    for match in _COORD_HEMI.finditer(value):
        if _valid_pair(match.group(1), match.group(3)):
            spans.append(match.span())
    return spans


def has_coordinates(value: str) -> bool:
    return bool(_coordinate_spans(value))


def has_phone(value: str) -> bool:
    """Seven or more digits, possibly spaced or dashed or in brackets (+91 98765 43210, 0674-2345678). Coordinates are removed first."""
    for start, end in sorted(_coordinate_spans(value), reverse=True):
        value = value[:start] + ' ' + value[end:]
    return any(len(re.sub(r'\D', '', match.group(0))) >= 7 for match in _PHONE.finditer(value))


def held_reason(value: str) -> str | None:
    """The moderation-queue reason when the text must be held for review, else None."""
    if has_link(value):
        return 'auto: link'
    if has_coordinates(value):
        return 'auto: coordinates'
    if has_phone(value):
        return 'auto: phone'
    return None


def emergency_hint(value: str) -> str | None:
    if _EMERGENCY_LATIN.search(value) or any(phrase in value for phrase in EMERGENCY_OTHER):
        return 'emergency'
    return None


def public_name(name: str | None) -> str:
    """'Asha Rao' -> 'Asha R.'; one-word names stay as they are; never an email."""
    parts = (name or '').split()
    if not parts or '@' in parts[0]:
        return 'TerraWatch member'
    if len(parts) == 1:
        return parts[0]
    return f'{parts[0]} {parts[1][0].upper()}.'


def badge_for(role: str | None) -> str | None:
    return 'Staff' if role in STAFF_ROLES else None


def purge_expired_messages(db) -> int:
    """Delete chat messages older than their room's retention_days. Rooms without retention_days are never touched."""
    result = db.execute(text('''DELETE FROM resq_community_messages m USING resq_community_rooms r
        WHERE m.room_id=r.id AND r.retention_days IS NOT NULL AND m.created_at < now() - make_interval(days => r.retention_days)'''))
    return result.rowcount or 0
