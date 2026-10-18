"""One password rule for every account: long enough, not a well-known password, not built from the email address."""
MIN_LENGTH = 10
_COMMON = {
    'password', 'password1', 'password12', 'password123', 'passw0rd123', '1234567890', '12345678901', 'qwertyuiop', 'qwerty12345',
    'iloveyou123', 'welcome123', 'letmein1234', 'admin12345', 'terrawatch', 'terrawatch1', 'abcdefghij', '0123456789', 'changeme123',
}


def password_problem(password: str, email: str = '') -> str:
    """Plain-language reason the password is not acceptable, or '' when it is."""
    if len(password) < MIN_LENGTH:
        return f'Use at least {MIN_LENGTH} characters.'
    lowered = password.lower()
    if lowered in _COMMON or len(set(lowered)) <= 3:
        return 'That password is too easy to guess. Try a few unrelated words.'
    local = email.split('@')[0].lower()
    if len(local) >= 4 and local in lowered:
        return 'Do not use your email address in your password.'
    return ''
