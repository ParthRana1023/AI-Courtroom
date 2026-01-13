# app/models/location_cache.py
"""
MongoDB model for storing location cache data.
Stores up to 2 consecutive months of data as backup.
"""
from datetime import datetime
from typing import List, Dict, Optional
from beanie import Document
from pydantic import Field
from app.utils.datetime import get_current_datetime


class LocationCache(Document):
    """
    Stores cached location data from Country State City API.
    Each document represents one month's cache data.
    We keep up to 2 months of data as backup.
    """
    cache_key: str = Field(default="location_data", description="Base key for cache documents")
    cached_month: str = Field(..., description="Month when cache was created (YYYY-MM)")
    cached_at: datetime = Field(default_factory=get_current_datetime)
    countries: List[dict] = Field(default_factory=list)
    states: Dict[str, List[dict]] = Field(default_factory=dict)  # country_iso2 -> states
    cities: Dict[str, List[dict]] = Field(default_factory=dict)  # "country_iso2:state_iso2" -> cities
    all_locations: List[dict] = Field(default_factory=list)  # Flattened searchable cache

    class Settings:
        name = "location_cache"
