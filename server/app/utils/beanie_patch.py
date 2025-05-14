# app/utils/beanie_patch.py
from beanie.odm.fields import PydanticObjectId
from pydantic_core import core_schema
from typing import Any, Type
from pydantic import GetCoreSchemaHandler

def patch_beanie():
    """Comprehensive patch for Beanie's ObjectID handling"""
    # Define the function that will become the class method
    def get_pydantic_core_schema(
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
        # Set the function as a method on the class
        setattr(PydanticObjectId, "__get_pydantic_core_schema__", get_pydantic_core_schema)
        # Then make it a class method
        setattr(PydanticObjectId, "__get_pydantic_core_schema__", 
                classmethod(getattr(PydanticObjectId, "__get_pydantic_core_schema__")))
    except Exception as e:
        print(f"Failed to patch Beanie: {str(e)}")
        raise