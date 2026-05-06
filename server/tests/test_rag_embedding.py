import pytest

from app.services.rag.embedding import _normalize


def test_normalize_returns_unit_vector():
    vector = _normalize([3.0, 4.0])

    assert vector == pytest.approx([0.6, 0.8])


def test_normalize_handles_zero_vector():
    assert _normalize([0.0, 0.0]) == [0.0, 0.0]
