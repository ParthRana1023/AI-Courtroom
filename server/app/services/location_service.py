# app/services/location_service.py
"""
Country State City API integration service.
Provides location data with MongoDB caching and monthly refresh.
"""
import httpx
from typing import Optional
from datetime import datetime
from app.config import settings
from app.models.location_cache import LocationCache
from app.logging_config import get_logger
from app.utils.datetime import get_current_datetime

logger = get_logger(__name__)

CSC_API_BASE_URL = "https://api.countrystatecity.in/v1"
CACHE_KEY = "location_data"

# In-memory cache for fast access during runtime
_countries_cache: Optional[list[dict]] = None
_states_cache: dict[str, list[dict]] = {}  # country_iso2 -> states
_cities_cache: dict[str, list[dict]] = {}  # "country_iso2:state_iso2" -> cities
_all_locations_cache: Optional[list[dict]] = None  # Flattened searchable cache


def _get_headers() -> dict:
    """Get API headers with authentication."""
    return {
        "X-CSCAPI-KEY": settings.csc_api_key or "",
    }


async def _should_refresh_cache() -> bool:
    """
    Check if the cache should be refreshed.
    Returns True if:
    - No cache document exists for the current month
    """
    try:
        current_month = get_current_datetime().strftime("%Y-%m")
        logger.debug(f"Checking if location cache needs refresh", extra={"month": current_month})
        
        # Check if we have a cache for the current month
        cache_doc = await LocationCache.find_one(LocationCache.cached_month == current_month)
        
        if cache_doc is None:
            logger.info(f"No cache document found for current month, will fetch fresh data", extra={"month": current_month})
            return True
        
        entry_count = len(cache_doc.all_locations) if cache_doc.all_locations else 0
        logger.debug(f"Cache is valid, loading from MongoDB", extra={"month": current_month, "entry_count": entry_count})
        return False
    except Exception as e:
        logger.warning(f"Error checking cache in MongoDB, will refresh", extra={"error": str(e)})
        return True


async def _load_cache_from_db() -> bool:
    """
    Load cache data from MongoDB into memory.
    Loads from the most recent month's cache.
    Returns True if successful, False otherwise.
    """
    global _countries_cache, _states_cache, _cities_cache, _all_locations_cache
    
    try:
        # Find the most recent cache document
        cache_docs = await LocationCache.find(
            LocationCache.cache_key == CACHE_KEY
        ).sort("-cached_month").limit(1).to_list()
        
        if not cache_docs:
            logger.debug("No cache documents found in MongoDB")
            return False
        
        cache_doc = cache_docs[0]
        
        _countries_cache = cache_doc.countries
        _states_cache = cache_doc.states
        _cities_cache = cache_doc.cities
        _all_locations_cache = cache_doc.all_locations
        
        logger.info(f"Loaded location cache from MongoDB", extra={"month": cache_doc.cached_month, "entry_count": len(_all_locations_cache or [])})
        return True
    except Exception as e:
        logger.error(f"Error loading cache from MongoDB", extra={"error": str(e)})
        return False


async def _save_cache_to_db():
    """
    Save current cache data to MongoDB as a new month's document.
    Keeps only 2 months of data, deleting the oldest if necessary.
    """
    global _countries_cache, _states_cache, _cities_cache, _all_locations_cache
    
    try:
        current_month = get_current_datetime().strftime("%Y-%m")
        
        # Check if document for current month already exists
        existing_doc = await LocationCache.find_one(LocationCache.cached_month == current_month)
        
        if existing_doc:
            # Update existing document for current month
            existing_doc.cached_at = get_current_datetime()
            existing_doc.countries = _countries_cache or []
            existing_doc.states = _states_cache or {}
            existing_doc.cities = _cities_cache or {}
            existing_doc.all_locations = _all_locations_cache or []
            await existing_doc.save()
            logger.info(f"Updated existing location cache", extra={"month": current_month, "entry_count": len(_all_locations_cache or [])})
        else:
            # Create new document for this month
            cache_doc = LocationCache(
                cache_key=CACHE_KEY,
                cached_month=current_month,
                cached_at=get_current_datetime(),
                countries=_countries_cache or [],
                states=_states_cache or {},
                cities=_cities_cache or {},
                all_locations=_all_locations_cache or [],
            )
            await cache_doc.insert()
            logger.info(f"Created new location cache", extra={"month": current_month, "entry_count": len(_all_locations_cache or [])})
        
        # Clean up old cache documents - keep only 2 most recent months
        all_caches = await LocationCache.find(
            LocationCache.cache_key == CACHE_KEY
        ).sort("-cached_month").to_list()
        
        if len(all_caches) > 2:
            # Delete oldest caches beyond the 2 most recent
            for old_cache in all_caches[2:]:
                logger.debug(f"Deleting old location cache", extra={"month": old_cache.cached_month})
                await old_cache.delete()
                
    except Exception as e:
        logger.error(f"Error saving cache to MongoDB", extra={"error": str(e)})


async def get_countries() -> list[dict]:
    """
    Fetch all countries from the API.
    Results are cached in memory.
    
    Returns:
        List of country dicts with id, name, iso2, phone_code, etc.
    """
    global _countries_cache
    
    if _countries_cache is not None:
        return _countries_cache
    
    try:
        logger.debug("Fetching countries from CSC API")
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{CSC_API_BASE_URL}/countries",
                headers=_get_headers(),
                timeout=30.0,
            )
            response.raise_for_status()
            _countries_cache = response.json()
            logger.info(f"Fetched countries from API", extra={"count": len(_countries_cache)})
            return _countries_cache
    except httpx.TimeoutException:
        logger.error("Timeout while fetching countries from CSC API")
        raise Exception("Request to location API timed out")
    except httpx.HTTPStatusError as e:
        logger.error(f"HTTP error fetching countries", extra={"status_code": e.response.status_code})
        raise Exception(f"Location API returned status {e.response.status_code}")
    except Exception as e:
        logger.error(f"Error fetching countries", extra={"error": str(e)})
        raise


async def get_states(country_iso2: str) -> list[dict]:
    """
    Fetch all states for a country.
    Results are cached in memory.
    
    Args:
        country_iso2: ISO2 code of the country (e.g., "IN")
        
    Returns:
        List of state dicts with id, name, iso2, etc.
    """
    global _states_cache
    
    cache_key = country_iso2.upper()
    if cache_key in _states_cache:
        return _states_cache[cache_key]
    
    try:
        logger.debug(f"Fetching states for country from CSC API", extra={"country_iso2": country_iso2})
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{CSC_API_BASE_URL}/countries/{country_iso2}/states",
                headers=_get_headers(),
                timeout=30.0,
            )
            response.raise_for_status()
            states = response.json()
            _states_cache[cache_key] = states
            logger.info(f"Fetched states from API", extra={"country_iso2": country_iso2, "count": len(states)})
            return states
    except httpx.TimeoutException:
        logger.error(f"Timeout while fetching states", extra={"country_iso2": country_iso2})
        raise Exception("Request to location API timed out")
    except httpx.HTTPStatusError as e:
        logger.error(f"HTTP error fetching states", extra={"country_iso2": country_iso2, "status_code": e.response.status_code})
        raise Exception(f"Location API returned status {e.response.status_code}")
    except Exception as e:
        logger.error(f"Error fetching states", extra={"country_iso2": country_iso2, "error": str(e)})
        raise


async def get_cities(country_iso2: str, state_iso2: str) -> list[dict]:
    """
    Fetch all cities for a state.
    Results are cached in memory.
    
    Args:
        country_iso2: ISO2 code of the country (e.g., "IN")
        state_iso2: ISO2 code of the state (e.g., "MH")
        
    Returns:
        List of city dicts with id, name, etc.
    """
    global _cities_cache
    
    cache_key = f"{country_iso2.upper()}:{state_iso2.upper()}"
    if cache_key in _cities_cache:
        return _cities_cache[cache_key]
    
    try:
        logger.debug(f"Fetching cities for state from CSC API", extra={"country_iso2": country_iso2, "state_iso2": state_iso2})
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{CSC_API_BASE_URL}/countries/{country_iso2}/states/{state_iso2}/cities",
                headers=_get_headers(),
                timeout=30.0,
            )
            response.raise_for_status()
            cities = response.json()
            _cities_cache[cache_key] = cities
            logger.info(f"Fetched cities from API", extra={"country_iso2": country_iso2, "state_iso2": state_iso2, "count": len(cities)})
            return cities
    except httpx.TimeoutException:
        logger.error(f"Timeout while fetching cities", extra={"country_iso2": country_iso2, "state_iso2": state_iso2})
        raise Exception("Request to location API timed out")
    except httpx.HTTPStatusError as e:
        logger.error(f"HTTP error fetching cities", extra={"country_iso2": country_iso2, "state_iso2": state_iso2, "status_code": e.response.status_code})
        raise Exception(f"Location API returned status {e.response.status_code}")
    except Exception as e:
        logger.error(f"Error fetching cities", extra={"country_iso2": country_iso2, "state_iso2": state_iso2, "error": str(e)})
        raise


async def get_country_by_iso2(country_iso2: str) -> Optional[dict]:
    """
    Get a specific country by its ISO2 code.
    
    Args:
        country_iso2: ISO2 code of the country
        
    Returns:
        Country dict or None if not found
    """
    countries = await get_countries()
    country_iso2 = country_iso2.upper()
    for country in countries:
        if country.get("iso2", "").upper() == country_iso2:
            return country
    return None


async def get_phone_code(country_iso2: str) -> Optional[str]:
    """
    Get the phone code for a country.
    
    Args:
        country_iso2: ISO2 code of the country
        
    Returns:
        Phone code (e.g., "91" for India) or None
    """
    country = await get_country_by_iso2(country_iso2)
    if country:
        return country.get("phonecode") or country.get("phone_code")
    return None


async def _build_all_locations_cache_from_api() -> list[dict]:
    """
    Build a flattened cache of all locations by fetching from API.
    This fetches all countries, their states, and cities.
    
    Returns:
        List of location dicts with city, state, country info
    """
    global _all_locations_cache
    
    locations = []
    
    logger.info("Building location cache from API")
    
    # Get all countries
    countries = await get_countries()
    
    # Create country-level entries
    for country in countries:
        country_entry = {
            "type": "country",
            "name": country.get("name", ""),
            "country": country.get("name", ""),
            "country_iso2": country.get("iso2", ""),
            "phone_code": country.get("phonecode") or country.get("phone_code", ""),
            "state": None,
            "state_iso2": None,
            "city": None,
        }
        locations.append(country_entry)
    
    # For now, only pre-cache India to avoid too many API calls
    # Other countries will be fetched on-demand
    india_states = await get_states("IN")
    
    for state in india_states:
        # Add state entry
        state_entry = {
            "type": "state",
            "name": state.get("name", ""),
            "country": "India",
            "country_iso2": "IN",
            "phone_code": "91",
            "state": state.get("name", ""),
            "state_iso2": state.get("iso2", ""),
            "city": None,
        }
        locations.append(state_entry)
        
        # Get cities for this state
        try:
            cities = await get_cities("IN", state.get("iso2", ""))
            for city in cities:
                city_entry = {
                    "type": "city",
                    "name": city.get("name", ""),
                    "country": "India",
                    "country_iso2": "IN",
                    "phone_code": "91",
                    "state": state.get("name", ""),
                    "state_iso2": state.get("iso2", ""),
                    "city": city.get("name", ""),
                }
                locations.append(city_entry)
        except Exception as e:
            logger.warning(f"Error fetching cities for state, skipping", extra={"state": state.get('name'), "error": str(e)})
            continue
    
    _all_locations_cache = locations
    logger.info(f"Location cache built from API", extra={"entry_count": len(locations)})
    return locations


async def search_locations(query: str, limit: int = 20) -> list[dict]:
    """
    Search for locations matching a query.
    Searches through cities, states, and countries.
    
    Args:
        query: Search query string
        limit: Maximum number of results to return
        
    Returns:
        List of matching location dicts, sorted by relevance
    """
    global _all_locations_cache
    
    if not query or len(query) < 2:
        return []
    
    query_lower = query.lower().strip()
    
    # Ensure cache is loaded
    if _all_locations_cache is None:
        await preload_cache()
    
    locations = _all_locations_cache or []
    results = []
    
    for loc in locations:
        name = loc.get("name", "").lower()
        
        # Exact match gets highest priority
        if name == query_lower:
            results.append((0, loc))
        # Starts with query gets high priority
        elif name.startswith(query_lower):
            results.append((1, loc))
        # Contains query
        elif query_lower in name:
            results.append((2, loc))
    
    # Sort by priority, then by type (city > state > country), then alphabetically
    type_priority = {"city": 0, "state": 1, "country": 2}
    results.sort(key=lambda x: (x[0], type_priority.get(x[1].get("type", ""), 3), x[1].get("name", "")))
    
    logger.debug(f"Location search completed", extra={"query": query, "result_count": len(results[:limit])})
    # Return only the location dicts, limited to requested count
    return [r[1] for r in results[:limit]]


async def preload_cache():
    """
    Preload the location cache.
    - If cache exists in MongoDB and is from current month, load from DB.
    - Otherwise, fetch from API and save to DB.
    """
    global _all_locations_cache
    
    try:
        if not await _should_refresh_cache():
            # Load from MongoDB
            if await _load_cache_from_db():
                return
        
        # Fetch from API and save to MongoDB
        logger.info("Fetching fresh location data from API")
        await _build_all_locations_cache_from_api()
        await _save_cache_to_db()
        logger.info(f"Location cache preload complete", extra={"entry_count": len(_all_locations_cache or [])})
    except Exception as e:
        logger.error(f"Failed to preload location cache", extra={"error": str(e)})
        # Try to load stale cache as fallback
        logger.info("Attempting to load stale cache from MongoDB as fallback")
        await _load_cache_from_db()


async def clear_cache():
    """Clear all cached location data (memory and MongoDB)."""
    global _countries_cache, _states_cache, _cities_cache, _all_locations_cache
    _countries_cache = None
    _states_cache = {}
    _cities_cache = {}
    _all_locations_cache = None
    
    # Also delete the cache document from MongoDB
    try:
        cache_doc = await LocationCache.find_one(LocationCache.cache_key == CACHE_KEY)
        if cache_doc:
            await cache_doc.delete()
            logger.info("Location cache cleared from MongoDB")
    except Exception as e:
        logger.error(f"Error deleting cache from MongoDB", extra={"error": str(e)})
