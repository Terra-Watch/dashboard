"""Create the first administrator on a fresh installation. Run: python -m scripts.create_admin --email you@example.org --name "Your Name"

The password is read from a hidden prompt (or the RESQ_ADMIN_PASSWORD variable for automation), is checked against the password policy,
and is stored as an argon2 hash. Nothing is printed except the outcome.
"""
import argparse
import getpass
import os
import sys

from sqlalchemy import text

from app.database.session import engine, init_db
from app.core.security import hash_password_argon2
from app.services.password_policy import password_problem


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--email', required=True)
    parser.add_argument('--name', required=True)
    args = parser.parse_args()
    email = args.email.strip().lower()
    password = os.environ.get('RESQ_ADMIN_PASSWORD') or getpass.getpass('Password: ')
    problem = password_problem(password, email)
    if problem:
        print(problem, file=sys.stderr)
        return 2
    init_db()
    with engine.begin() as db:
        if db.execute(text('SELECT 1 FROM resq_users WHERE email=:e'), {'e': email}).first():
            print('An account with that email already exists.', file=sys.stderr)
            return 1
        db.execute(text("INSERT INTO resq_users (email,name,password_hash,password_algo,role) VALUES (:e,:n,:h,'argon2','admin')"),
                   {'e': email, 'n': args.name.strip(), 'h': hash_password_argon2(password)})
    print('Administrator created.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
