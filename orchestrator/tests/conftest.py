"""
Pytest configuration and fixtures for orchestrator tests.

This module provides:
- Network blocking fixture to prevent accidental API calls in CI
- Common test fixtures for state and context
"""

import socket
import pytest
from unittest.mock import patch


class NetworkBlockedError(Exception):
    """Raised when a test attempts to make a network connection."""
    pass


def _block_socket_connect(*args, **kwargs):
    """Block all socket connections to prevent accidental API calls."""
    raise NetworkBlockedError(
        "Network access is blocked in unit tests. "
        "If you need to test network functionality, use mocks. "
        "This prevents accidental OpenAI/Anthropic API calls that cost money."
    )


@pytest.fixture(autouse=True)
def block_network():
    """
    Automatically block all network connections in tests.
    
    This fixture is applied to ALL tests automatically (autouse=True).
    It prevents any accidental API calls to OpenAI, Anthropic, or other
    services that could:
    - Cost money on each CI run
    - Cause flaky tests due to network issues
    - Expose credentials in test environments
    
    If a test needs to make real network calls (integration tests),
    it should be marked with @pytest.mark.integration and run separately.
    """
    with patch.object(socket.socket, 'connect', _block_socket_connect):
        with patch.object(socket, 'create_connection', _block_socket_connect):
            yield


@pytest.fixture
def fresh_blackboard_state():
    """Create a fresh BlackboardState for testing."""
    from core.blackboard import BlackboardState
    return BlackboardState()


@pytest.fixture
def fresh_run_context():
    """Create a fresh RunContext with no services (safe for unit tests)."""
    from core.blackboard import BlackboardState, RunContext
    state = BlackboardState()
    return RunContext(state=state)


@pytest.fixture
def fresh_key_constraints():
    """Create fresh KeyConstraints for testing."""
    from core.blackboard import KeyConstraints
    return KeyConstraints()
