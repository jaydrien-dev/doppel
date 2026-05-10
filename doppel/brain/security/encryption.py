"""
AES-256-GCM authenticated encryption for sensitive fields at rest.

Usage:
    from doppel.brain.security.encryption import encrypt_field, decrypt_field

Encrypted values are prefixed with "enc:v1:" so the system can transparently
handle both legacy plaintext rows and newly encrypted rows (backward compatible).

Key management:
    - Set ENCRYPTION_KEY env var to a base64-encoded 32-byte (256-bit) random key
    - Generate one with: python -c "import os,base64; print(base64.urlsafe_b64encode(os.urandom(32)).decode())"
    - Store it in Railway secrets — never commit it to git

If ENCRYPTION_KEY is not set, encrypt_field returns plaintext unchanged and
decrypt_field returns the value as-is. This means the system degrades gracefully
but does NOT encrypt. Log a warning so it's visible on startup.
"""
from __future__ import annotations

import base64
import logging
import os

_log = logging.getLogger(__name__)
_PREFIX = "enc:v1:"
_NONCE_LEN = 12  # 96-bit nonce for AES-GCM (NIST recommended)


def _get_key() -> bytes | None:
    """Load the 32-byte encryption key from env. Returns None if not configured."""
    from doppel.config import settings  # lazy import to avoid circular deps
    raw = getattr(settings, "encryption_key", "") or ""
    if not raw:
        return None
    try:
        key = base64.urlsafe_b64decode(raw.encode())
        if len(key) != 32:
            _log.error(
                "ENCRYPTION_KEY must decode to exactly 32 bytes (256-bit). "
                "Got %d bytes. Encryption disabled.",
                len(key),
            )
            return None
        return key
    except Exception as e:
        _log.error("Failed to decode ENCRYPTION_KEY: %s. Encryption disabled.", e)
        return None


def encrypt_field(plaintext: str | None) -> str | None:
    """Encrypt a string with AES-256-GCM. Returns plaintext if key not set."""
    if plaintext is None:
        return None
    if plaintext.startswith(_PREFIX):
        return plaintext  # already encrypted — idempotent

    key = _get_key()
    if key is None:
        _log.warning(
            "ENCRYPTION_KEY not set — storing sensitive field as plaintext. "
            "Set ENCRYPTION_KEY in Railway secrets to enable at-rest encryption."
        )
        return plaintext

    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    nonce = os.urandom(_NONCE_LEN)
    ct = AESGCM(key).encrypt(nonce, plaintext.encode("utf-8"), None)
    payload = base64.urlsafe_b64encode(nonce + ct).decode()
    return f"{_PREFIX}{payload}"


def decrypt_field(value: str | None) -> str | None:
    """Decrypt an encrypted field. Passes through plaintext transparently."""
    if value is None:
        return None
    if not value.startswith(_PREFIX):
        return value  # plaintext — legacy row or key not set at write time

    key = _get_key()
    if key is None:
        _log.error(
            "ENCRYPTION_KEY not set but found encrypted field (prefix %s). "
            "Cannot decrypt — returning raw ciphertext.",
            _PREFIX,
        )
        return value  # can't decrypt without key; surface problem loudly

    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    try:
        data = base64.urlsafe_b64decode(value[len(_PREFIX):].encode())
        nonce, ct = data[:_NONCE_LEN], data[_NONCE_LEN:]
        return AESGCM(key).decrypt(nonce, ct, None).decode("utf-8")
    except Exception as e:
        _log.error("AES-256-GCM decryption failed: %s", e)
        return None  # corrupted or wrong key
