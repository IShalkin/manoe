"""
Security Service for MANOE Orchestrator

Provides JWT authentication, authorization, and rate limiting.
"""

import os
from datetime import datetime
from typing import Any, Dict, Optional, Tuple

import jwt
from fastapi import HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer


# JWT Configuration
JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "")
JWT_ALGORITHM = "HS256"

# Allowed origins for CORS
ALLOWED_ORIGINS = [
    "https://manoe.iliashalkin.com",
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
]

# Security bearer scheme
security = HTTPBearer(auto_error=False)


class AuthenticationError(Exception):
    """Raised when authentication fails."""
    pass


class AuthorizationError(Exception):
    """Raised when authorization fails."""
    pass


def decode_jwt(token: str) -> Dict[str, Any]:
    """
    Decode and validate a Supabase JWT token.
    
    Args:
        token: JWT token string
        
    Returns:
        Decoded token payload
        
    Raises:
        AuthenticationError: If token is invalid or expired
    """
    if not JWT_SECRET:
        # If no JWT secret is configured, skip validation (development mode)
        # In production, this should raise an error
        try:
            # Decode without verification for development
            return jwt.decode(token, options={"verify_signature": False})
        except jwt.DecodeError as e:
            raise AuthenticationError(f"Invalid token format: {e}")
    
    try:
        payload = jwt.decode(
            token,
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM],
            audience="authenticated",  # Supabase uses "authenticated" as the audience for logged-in users
            options={
                "verify_exp": True,
                "verify_iat": True,
                "require": ["exp", "sub"],
            }
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise AuthenticationError("Token has expired")
    except jwt.InvalidTokenError as e:
        raise AuthenticationError(f"Invalid token: {e}")


def extract_user_id(payload: Dict[str, Any]) -> str:
    """
    Extract user ID from JWT payload.
    
    Args:
        payload: Decoded JWT payload
        
    Returns:
        User ID string
        
    Raises:
        AuthenticationError: If user ID not found in payload
    """
    user_id = payload.get("sub")
    if not user_id:
        raise AuthenticationError("User ID not found in token")
    return user_id


async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = None,
) -> Tuple[str, Dict[str, Any]]:
    """
    Get the current authenticated user from the request.
    
    Args:
        request: FastAPI request object
        credentials: HTTP Bearer credentials
        
    Returns:
        Tuple of (user_id, token_payload)
        
    Raises:
        HTTPException: If authentication fails
    """
    # Try to get token from Authorization header first
    auth_header = request.headers.get("Authorization")
    token = None
    
    if auth_header:
        # Extract token from "Bearer <token>" format
        parts = auth_header.split()
        if len(parts) == 2 and parts[0].lower() == "bearer":
            token = parts[1]
    
    # If no header token, try query parameter (for SSE connections)
    if not token:
        token = request.query_params.get("token")
    
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    try:
        payload = decode_jwt(token)
        user_id = extract_user_id(payload)
        return user_id, payload
    except AuthenticationError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
            headers={"WWW-Authenticate": "Bearer"},
        )


class RunOwnershipStore:
    """
    Hybrid store for tracking run ownership.
    Uses in-memory cache + Redis for persistence across restarts.
    Maps run_id -> user_id for authorization checks.
    """
    
    REDIS_KEY_PREFIX = "manoe:run_owner:"
    OWNERSHIP_TTL = 60 * 60 * 24 * 7  # 7 days
    
    def __init__(self):
        self._ownership: Dict[str, str] = {}
        self._redis = None
    
    def set_redis(self, redis_client) -> None:
        """Set the Redis client for persistent storage."""
        self._redis = redis_client
    
    async def register_run_async(self, run_id: str, user_id: str) -> None:
        """Register a run as owned by a user (async, persists to Redis)."""
        self._ownership[run_id] = user_id
        if self._redis:
            try:
                await self._redis.setex(
                    f"{self.REDIS_KEY_PREFIX}{run_id}",
                    self.OWNERSHIP_TTL,
                    user_id
                )
            except Exception:
                pass  # Fail silently, in-memory still works
    
    def register_run(self, run_id: str, user_id: str) -> None:
        """Register a run as owned by a user (sync, in-memory only)."""
        self._ownership[run_id] = user_id
    
    async def get_owner_async(self, run_id: str) -> Optional[str]:
        """Get the owner of a run (async, checks Redis if not in memory)."""
        # Check in-memory first
        owner = self._ownership.get(run_id)
        if owner:
            return owner
        
        # Check Redis for persisted ownership
        if self._redis:
            try:
                owner = await self._redis.get(f"{self.REDIS_KEY_PREFIX}{run_id}")
                if owner:
                    # Cache in memory
                    self._ownership[run_id] = owner
                    return owner
            except Exception:
                pass
        
        return None
    
    def get_owner(self, run_id: str) -> Optional[str]:
        """Get the owner of a run (sync, in-memory only)."""
        return self._ownership.get(run_id)
    
    async def verify_ownership_async(self, run_id: str, user_id: str) -> bool:
        """Verify that a user owns a run (async, checks Redis)."""
        owner = await self.get_owner_async(run_id)
        if owner is None:
            return False
        return owner == user_id
    
    def verify_ownership(self, run_id: str, user_id: str) -> bool:
        """Verify that a user owns a run (sync, in-memory only)."""
        owner = self._ownership.get(run_id)
        if owner is None:
            return False
        return owner == user_id
    
    def remove_run(self, run_id: str) -> None:
        """Remove a run from the ownership store."""
        self._ownership.pop(run_id, None)


# Global ownership store instance
run_ownership = RunOwnershipStore()


def check_run_ownership(run_id: str, user_id: str) -> None:
    """
    Check if a user owns a run (sync, in-memory only).
    
    Args:
        run_id: Run ID to check
        user_id: User ID to verify ownership
        
    Raises:
        HTTPException: If user doesn't own the run
    """
    if not run_ownership.verify_ownership(run_id, user_id):
        # Check if run exists at all
        owner = run_ownership.get_owner(run_id)
        if owner is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Run not found or access denied",
            )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to access this run",
        )


async def check_run_ownership_async(run_id: str, user_id: str) -> None:
    """
    Check if a user owns a run (async, checks Redis for persisted ownership).
    
    This should be used for endpoints that need to work after orchestrator redeploy,
    when ownership info may only exist in Redis, not in-memory.
    
    Args:
        run_id: Run ID to check
        user_id: User ID to verify ownership
        
    Raises:
        HTTPException: If user doesn't own the run
    """
    # First try async verification which checks Redis
    if await run_ownership.verify_ownership_async(run_id, user_id):
        return
    
    # Check if run exists at all (in Redis)
    owner = await run_ownership.get_owner_async(run_id)
    if owner is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Run not found or access denied",
        )
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="You don't have permission to access this run",
    )


# Request size limits (in characters)
MAX_SEED_IDEA_LENGTH = 50000  # 50k characters
MAX_THEMES_LENGTH = 5000
MAX_TONE_STYLE_LENGTH = 5000
MAX_CUSTOM_MORAL_LENGTH = 10000
MAX_EDITED_CONTENT_SIZE = 500000  # 500k characters for edited content


def validate_request_size(
    seed_idea: str,
    themes: Optional[str] = None,
    tone_style_references: Optional[str] = None,
    custom_moral_system: Optional[str] = None,
) -> None:
    """
    Validate request field sizes to prevent DoS attacks.
    
    Args:
        seed_idea: The seed idea text
        themes: Optional themes text
        tone_style_references: Optional style references
        custom_moral_system: Optional custom moral system
        
    Raises:
        HTTPException: If any field exceeds size limits
    """
    if len(seed_idea) > MAX_SEED_IDEA_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"seed_idea exceeds maximum length of {MAX_SEED_IDEA_LENGTH} characters",
        )
    
    if themes and len(themes) > MAX_THEMES_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"themes exceeds maximum length of {MAX_THEMES_LENGTH} characters",
        )
    
    if tone_style_references and len(tone_style_references) > MAX_TONE_STYLE_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"tone_style_references exceeds maximum length of {MAX_TONE_STYLE_LENGTH} characters",
        )
    
    if custom_moral_system and len(custom_moral_system) > MAX_CUSTOM_MORAL_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"custom_moral_system exceeds maximum length of {MAX_CUSTOM_MORAL_LENGTH} characters",
        )
