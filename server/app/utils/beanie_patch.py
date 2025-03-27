# app/utils/beanie_patch.py
from beanie.odm.fields import PydanticObjectId
from pydantic_core import core_schema
from typing import Any, Type
from pydantic import GetCoreSchemaHandler

def patch_beanie():
    """Comprehensive patch for Beanie's ObjectID handling"""
    def custom_pydantic_object_id_schema(
        cls: Type[Any], 
        source: Type[Any],
        handler: GetCoreSchemaHandler,
        *args, 
        **kwargs
    ) -> core_schema.CoreSchema:
        return core_schema.no_info_plain_validator_function(
            lambda x: x if x is not None else None
        )

    # Apply patch with proper error handling
    try:
        PydanticObjectId.__get_pydantic_core_schema__ = classmethod(custom_pydantic_object_id_schema)
    except Exception as e:
        print(f"Failed to patch Beanie: {str(e)}")
        raise