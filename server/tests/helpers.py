"""Small helpers shared by test modules (fixtures live in conftest.py)."""

from typing import cast

from beanie import Document
from mongomock_motor import AsyncLatentCommandCursor, AsyncMongoMockClient
from pymongo import AsyncMongoClient


async def boom(*args, **kwargs):
    """Stand-in for any async function or method that must fail."""
    raise RuntimeError("boom")


async def reload[D: Document](doc: D) -> D:
    """Re-read a document from the database; fails the test if it is gone."""
    cls: type[D] = type(doc)
    fresh = await cls.get(doc.id)
    assert fresh is not None, f"{type(doc).__name__} {doc.id} was deleted"
    return fresh


# mongomock-motor fakes Motor's API. The app uses PyMongo's async client, which
# differs in two places (aggregate and close); the code below closes those gaps.


async def _ready[T](value: T) -> T:
    return value


# PyMongo: `cursor = await collection.aggregate(...)`; Motor returns it directly.
AsyncLatentCommandCursor.__await__ = lambda self: _ready(self).__await__()


class _FakeAsyncMongoClient:
    """The two client calls the app makes: client[db_name] and await close()."""

    def __init__(self) -> None:
        self._mock = AsyncMongoMockClient()

    def __getitem__(self, name: str):
        return self._mock[name]

    async def close(self) -> None:
        """PyMongo's close() is a coroutine; the in-memory fake has nothing to close."""


def mock_mongo_client() -> AsyncMongoClient:
    """An in-memory stand-in for pymongo.AsyncMongoClient."""
    return cast(AsyncMongoClient, _FakeAsyncMongoClient())
