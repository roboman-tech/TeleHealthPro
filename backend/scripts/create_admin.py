"""Create an admin user (from backend dir: python scripts/create_admin.py)."""

import asyncio
import os
import sys

from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
load_dotenv()

from sqlalchemy import select

from app.database import async_session_factory
from app.models.user import User, UserRole
from app.security import hash_password


async def main() -> None:
    email = os.environ.get("ADMIN_EMAIL", "admin@example.com")
    password = os.environ.get("ADMIN_PASSWORD")
    if not password:
        print(
            "ADMIN_PASSWORD is not set.\n\n"
            "Option 1 — PowerShell (this terminal only), then run the script again:\n"
            "  $env:ADMIN_PASSWORD = 'YourSecurePassword'\n"
            "  python scripts\\create_admin.py\n\n"
            "Option 2 — backend/.env (load_dotenv reads it). Add a line:\n"
            "  ADMIN_PASSWORD=YourSecurePassword\n"
            "Then: python scripts\\create_admin.py\n\n"
            "Optional: ADMIN_EMAIL, ADMIN_NAME (defaults: admin@example.com, System Admin)",
            file=sys.stderr,
        )
        sys.exit(1)
    name = os.environ.get("ADMIN_NAME", "System Admin")
    force_reset = os.environ.get("ADMIN_FORCE_RESET", "").lower() in ("1", "true", "yes")

    async with async_session_factory() as session:
        result = await session.execute(select(User).where(User.email == email))
        existing = result.scalar_one_or_none()

        if existing:
            if force_reset and existing.role == UserRole.admin:
                existing.hashed_password = hash_password(password)
                existing.full_name = name
                existing.is_active = True
                await session.commit()
                print("Reset password for admin:", email)
                return
            print(
                "User already exists:",
                email,
                file=sys.stderr,
            )
            if existing.role == UserRole.admin:
                print(
                    "Nothing to do. Sign in at the app with that email and your password.\n"
                    "Forgot password? Set ADMIN_PASSWORD and run with ADMIN_FORCE_RESET=1:\n"
                    "  $env:ADMIN_PASSWORD = 'NewPassword'; $env:ADMIN_FORCE_RESET = '1'; python scripts\\create_admin.py",
                    file=sys.stderr,
                )
            sys.exit(1)

        user = User(
            email=email,
            hashed_password=hash_password(password),
            full_name=name,
            role=UserRole.admin,
            is_active=True,
            is_provider_approved=True,
        )
        session.add(user)
        await session.commit()
    print("Created admin:", email)


if __name__ == "__main__":
    asyncio.run(main())
