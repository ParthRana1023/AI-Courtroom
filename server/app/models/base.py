from pydantic import BaseModel, Field
from typing import Optional
from beanie.odm.fields import PydanticObjectId

class PyObjectId(str):
    @classmethod
    def __get_validators__(cls):
        yield cls.validate

    @classmethod
    def validate(cls, v):
        if not isinstance(v, (str, PydanticObjectId)):
            raise TypeError('ObjectId required')
        return str(v)

class BaseDBModel(BaseModel):
    id: Optional[PyObjectId] = Field(alias="_id", default=None)
    
    class ConfigDict:
        json_encoders = {
            PydanticObjectId: str
        }
        populate_by_name = True