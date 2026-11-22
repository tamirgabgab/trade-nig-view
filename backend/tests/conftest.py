"""Shared fixtures. Network access is blocked for every test (see ``_block_network``)."""

from __future__ import annotations

import socket
from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app

# Loopback must stay allowed: on Windows, asyncio builds its self-pipe with socket.socketpair(),
# which connects to 127.0.0.1 internally.
_LOOPBACK_HOSTS = frozenset({"127.0.0.1", "::1", "localhost"})


class NetworkBlockedError(RuntimeError):
    """Raised when a test tries to open a non-loopback network connection."""


def _is_loopback(address: Any) -> bool:
    if isinstance(address, tuple) and address:
        return str(address[0]) in _LOOPBACK_HOSTS
    # AF_UNIX paths and other non-IP addresses are local by definition.
    return isinstance(address, (str, bytes))


@pytest.fixture(autouse=True)
def _block_network(monkeypatch: pytest.MonkeyPatch) -> None:
    """Fail any test that resolves or connects to a non-loopback host."""
    original_connect = socket.socket.connect
    original_connect_ex = socket.socket.connect_ex

    def guarded_connect(self: socket.socket, address: Any) -> None:
        if not _is_loopback(address):
            raise NetworkBlockedError(f"Network access is forbidden in tests: {address!r}")
        original_connect(self, address)

    def guarded_connect_ex(self: socket.socket, address: Any) -> int:
        if not _is_loopback(address):
            raise NetworkBlockedError(f"Network access is forbidden in tests: {address!r}")
        return original_connect_ex(self, address)

    original_getaddrinfo = socket.getaddrinfo

    def guarded_getaddrinfo(host: Any, *args: Any, **kwargs: Any) -> Any:
        # DNS lookups leak to the network too; only loopback names may be resolved.
        if host is not None and str(host) not in _LOOPBACK_HOSTS:
            raise NetworkBlockedError(f"DNS lookup is forbidden in tests: {host!r}")
        return original_getaddrinfo(host, *args, **kwargs)

    monkeypatch.setattr(socket, "getaddrinfo", guarded_getaddrinfo)
    monkeypatch.setattr(socket.socket, "connect", guarded_connect)
    monkeypatch.setattr(socket.socket, "connect_ex", guarded_connect_ex)


@pytest.fixture
def settings() -> Settings:
    """Deterministic settings that ignore the developer's ``.env`` file."""
    return Settings(_env_file=None, offline=True)


@pytest.fixture
def client(settings: Settings) -> Iterator[TestClient]:
    """In-process HTTP client for the API (no real sockets)."""
    with TestClient(create_app(settings)) as test_client:
        yield test_client
