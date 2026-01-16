# app/models/base.py
from pydantic import BaseModel, Field, GetCoreSchemaHandler
from pydantic_core import core_schema
from typing import Optional, Any
from beanie.odm.fields import PydanticObjectId


class PyObjectId(str):
    """Custom ObjectId type compatible with Pydantic v2."""
    
    @classmethod
    def __get_pydantic_core_schema__(
        cls, source_type: Any, handler: GetCoreSchemaHandler
    ) -> core_schema.CoreSchema:
        return core_schema.no_info_plain_validator_function(
            cls.validate,
            serialization=core_schema.to_string_ser_schema(),
        )
    
    @classmethod
    def validate(cls, v: Any) -> str:
        if not isinstance(v, (str, PydanticObjectId)):
            raise TypeError('ObjectId required')
        return str(v)

class BaseDBModel(BaseModel):
    id: Optional[PyObjectId] = Field(alias="_id", default=None)
    
    model_config = {
        "json_encoders": {PydanticObjectId: str},
        "populate_by_name": True,
    }