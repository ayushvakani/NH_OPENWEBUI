# Authentication Utilities
import hashlib
import binascii
import hmac
import os
import datetime
from pathlib import Path
from typing import Optional

# ── Load .env ──────────────────────────────────────────────────────────────────
# Try project-root .env first (nemhemai/.env), then the backend dir itself.
try:
    from dotenv import load_dotenv
    _here = Path(__file__).resolve().parent        # backend/
    _root = _here.parent                           # nemhemai/
    # load_dotenv does NOT override vars already set in the shell
    load_dotenv(_root / ".env", override=False)
    load_dotenv(_here / ".env", override=False)    # fallback: backend/.env
except ImportError:
    pass  # python-dotenv not installed; rely on shell environment

# ── Third-party imports (after dotenv so env is populated) ────────────────────
from fastapi import HTTPException, status, Request, Depends
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from pydantic import BaseModel

# Passlib is optional – fall back gracefully if not installed
try:
    from passlib.hash import pbkdf2_sha256 as _pbkdf2_handler
    from passlib.hash import bcrypt as _bcrypt_handler
except Exception:
    _pbkdf2_handler = None
    _bcrypt_handler = None

# Models import is deferred to avoid circular imports at module level;
# individual functions import User only when needed.

# ── SECRET_KEY ────────────────────────────────────────────────────────────────
_secret = os.getenv("SECRET_KEY", "").strip()
if not _secret:
    raise RuntimeError(
        "\n\n[NemhemAI] SECRET_KEY is not set!\n"
        "  → Open  nemhemai/.env\n"
        "  → Set   SECRET_KEY=<a long random hex string>\n"
        "  Tip: python -c \"import secrets; print(secrets.token_hex(32))\"\n"
    )
SECRET_KEY: str = _secret
ALGORITHM: str = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 1 week

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/login")


# ── Pydantic token model (defined once, not inside a function) ─────────────────
class TokenData(BaseModel):
    username: Optional[str] = None
    role: Optional[str] = None


# ── Password helpers ──────────────────────────────────────────────────────────
def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Return True if plain_password matches hashed_password."""
    try:
        # Try passlib pbkdf2_sha256
        if _pbkdf2_handler is not None:
            try:
                if isinstance(hashed_password, str) and _pbkdf2_handler.identify(hashed_password):
                    return _pbkdf2_handler.verify(plain_password, hashed_password)
            except Exception:
                pass

        # Try passlib bcrypt
        if _bcrypt_handler is not None:
            try:
                if isinstance(hashed_password, str) and _bcrypt_handler.identify(hashed_password):
                    return _bcrypt_handler.verify(plain_password, hashed_password)
            except Exception:
                pass

        # Fallback: manual pbkdf2_sha256$<iter>$<salt_hex>$<dk_hex> format
        if isinstance(hashed_password, str) and hashed_password.startswith("pbkdf2_sha256$"):
            parts = hashed_password.split("$")
            if len(parts) == 4:
                iterations = int(parts[1])
                salt = binascii.unhexlify(parts[2])
                dk = binascii.unhexlify(parts[3])
                newdk = hashlib.pbkdf2_hmac(
                    "sha256", plain_password.encode("utf-8"), salt, iterations
                )
                return hmac.compare_digest(newdk, dk)

        return False
    except Exception:
        return False


def get_password_hash(password: str) -> str:
    """Hash a password using pbkdf2_sha256 (passlib if available, else stdlib)."""
    if _pbkdf2_handler is not None:
        try:
            return _pbkdf2_handler.hash(password)
        except Exception:
            pass

    # Stdlib fallback
    iterations = 120_000
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return (
        f"pbkdf2_sha256${iterations}"
        f"${binascii.hexlify(salt).decode()}"
        f"${binascii.hexlify(dk).decode()}"
    )


# ── JWT helpers ───────────────────────────────────────────────────────────────
def create_access_token(
    data: dict, expires_delta: Optional[datetime.timedelta] = None
) -> str:
    to_encode = data.copy()
    expire = datetime.datetime.utcnow() + (
        expires_delta or datetime.timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode["exp"] = expire
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


# ── Current-user dependency ───────────────────────────────────────────────────
async def get_current_user(request: Request, db=None):
    """Resolve current user from Authorization header or HttpOnly cookie.

    Supports both:
      - Bearer token in Authorization header  (API clients / tests)
      - HttpOnly cookie named ``access_token`` (browser sessions)
    """
    # Lazy import to avoid circular dependency at module load time
    from models import User, get_db  # noqa: PLC0415

    if db is None:
        db = next(get_db())

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    # 1. Try Authorization header
    token: Optional[str] = None
    auth_header = request.headers.get("Authorization", "")
    if auth_header.lower().startswith("bearer "):
        token = auth_header.split(" ", 1)[1].strip()

    # 2. Fall back to HttpOnly cookie
    if not token:
        token = request.cookies.get("access_token")

    if not token:
        raise credentials_exception

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: Optional[str] = payload.get("sub")
        role: Optional[str] = payload.get("role")
        if not username or not isinstance(username, str):
            raise credentials_exception
        token_data = TokenData(username=username, role=role)
    except JWTError:
        raise credentials_exception

    user = db.query(User).filter(User.username == token_data.username).first()
    if user is None:
        raise credentials_exception
    return user


# ── Role guard ────────────────────────────────────────────────────────────────
def require_role(required_role: str):
    """FastAPI dependency factory – raises 403 if the user lacks the required role."""
    def role_checker(user=Depends(get_current_user)):
        if getattr(user, "role", None) != required_role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required role: {required_role}",
            )
        return user
    return role_checker