"""One-time production startup tasks before Gunicorn serves the API."""
from __future__ import annotations

import config
from services.seeder import initialize_database

if config.JWT_SECRET_IS_DEFAULT:
    raise SystemExit("Set JWT_SECRET to a unique value before starting the deployment.")

print("Initializing database for production service...")
initialize_database()
print("Database ready.")
