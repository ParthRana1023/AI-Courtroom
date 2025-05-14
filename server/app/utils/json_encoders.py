from bson import ObjectId
from beanie.odm.fields import PydanticObjectId
from pydantic.json import ENCODERS_BY_TYPE

# Add custom encoders for MongoDB ObjectId and Beanie PydanticObjectId
ENCODERS_BY_TYPE[ObjectId] = str
ENCODERS_BY_TYPE[PydanticObjectId] = str