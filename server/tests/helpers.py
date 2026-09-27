"""Small helpers shared by test modules (fixtures live in conftest.py)."""

from beanie import Document


async def boom(*args, **kwargs):
    """Stand-in for any async function or method that must fail."""
    raise RuntimeError("boom")


async def reload[D: Document](doc: D) -> D:
    """Re-read a document from the database; fails the test if it is gone."""
    cls: type[D] = type(doc)
    fresh = await cls.get(doc.id)
    assert fresh is not None, f"{type(doc).__name__} {doc.id} was deleted"
    return fresh
