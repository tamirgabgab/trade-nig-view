"""The harness is a DUT too: prove the network blocker blocks and allows the right things."""

from __future__ import annotations

import socket

import pytest

from tests.conftest import NetworkBlockedError


def test_external_connection_is_blocked() -> None:
    with (
        socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock,
        pytest.raises(NetworkBlockedError),
    ):
        sock.connect(("93.184.216.34", 80))


def test_create_connection_is_blocked() -> None:
    with pytest.raises(NetworkBlockedError):
        socket.create_connection(("example.com", 443), timeout=1)


def test_loopback_socketpair_is_allowed() -> None:
    left, right = socket.socketpair()
    with left, right:
        left.sendall(b"ping")
        assert right.recv(4) == b"ping"
