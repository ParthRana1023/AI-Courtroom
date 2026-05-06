from datetime import datetime
from enum import Enum
from typing import Any, List, Optional

from beanie import Document
from pymongo import IndexModel
from pydantic import Field
from pydantic_mongo import PydanticObjectId

from app.utils.datetime import get_current_datetime


class CaseMemorySourceType(str, Enum):
    CASE_DETAILS = "case_details"
    EVIDENCE = "evidence"
    PARTY_BIO = "party_bio"
    ARGUMENT = "argument"
    PROCEEDING = "proceeding"
    WITNESS_TESTIMONY = "witness_testimony"
    VERDICT = "verdict"
    ANALYSIS = "analysis"
    PARTY_CHAT = "party_chat"


class CaseMemoryChunk(Document):
    case_id: PydanticObjectId
    cnr: str
    user_id: PydanticObjectId
    source_type: CaseMemorySourceType
    source_id: str
    chunk_index: int = 0
    content: str
    content_hash: str
    embedding: List[float] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)
    is_active: bool = True
    created_at: datetime = Field(default_factory=get_current_datetime)
    updated_at: datetime = Field(default_factory=get_current_datetime)

    class Settings:
        name = "case_memory_chunks"
        indexes = [
            IndexModel([("case_id", 1)]),
            IndexModel([("cnr", 1)]),
            IndexModel([("user_id", 1)]),
            IndexModel([("source_type", 1)]),
            IndexModel([("content_hash", 1)]),
            IndexModel([("case_id", 1), ("source_type", 1), ("source_id", 1)]),
            IndexModel([("case_id", 1), ("is_active", 1)]),
        ]
