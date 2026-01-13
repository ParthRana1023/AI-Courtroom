# app/models/location_cache.py
"""
MongoDB model for storing location cache data.
"""
from datetime import datetime
from typing import List, Dict, Optional
from beanie import Document
from pydantic import Field
from app.utils.datetime import get_current_datetime


class LocationCache(Document):
    """
    Stores cached location data from Country State City API.
    Uses a single document to store all location data.
    """
    cache_key: str = Field(default="location_data", description="Unique key for the cache document")
    cached_month: str = Field(..., description="Month when cache was created (YYYY-MM)")
    cached_at: datetime = Field(default_factory=get_current_datetime)
    countries: List[dict] = Field(default_factory=list)
    states: Dict[str, List[dict]] = Field(default_factory=dict)  # country_iso2 -> states
    cities: Dict[str, List[dict]] = Field(default_factory=dict)  # "country_iso2:state_iso2" -> cities
    all_locations: List[dict] = Field(default_factory=list)  # Flattened searchable cache

    class Settings:
        name = "location_cache"
