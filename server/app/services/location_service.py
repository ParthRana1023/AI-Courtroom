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
        current_month = datetime.now().strftime("%Y-%m")
        print(f"🔍 Checking if location cache needs refresh for {current_month}...")
        
        # Check if we have a cache for the current month
        cache_doc = await LocationCache.find_one(LocationCache.cached_month == current_month)
        
        if cache_doc is None:
            print(f"📭 No cache document found for {current_month}. Will fetch fresh data.")
            return True
        
        entry_count = len(cache_doc.all_locations) if cache_doc.all_locations else 0
        print(f"✅ Cache is valid for {current_month} with {entry_count} entries. Loading from MongoDB.")
        return False
    except Exception as e:
        print(f"⚠️ Error checking cache in MongoDB: {e}. Will refresh.")
        import traceback
        traceback.print_exc()
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
            return False
        
        cache_doc = cache_docs[0]
        
        _countries_cache = cache_doc.countries
        _states_cache = cache_doc.states
        _cities_cache = cache_doc.cities
        _all_locations_cache = cache_doc.all_locations
        
        print(f"📂 Loaded location cache from MongoDB (month: {cache_doc.cached_month}) with {len(_all_locations_cache or [])} entries")
        return True
    except Exception as e:
        print(f"⚠️ Error loading cache from MongoDB: {e}")
        return False


async def _save_cache_to_db():
    """
    Save current cache data to MongoDB as a new month's document.
    Keeps only 2 months of data, deleting the oldest if necessary.
    """
    global _countries_cache, _states_cache, _cities_cache, _all_locations_cache
    
    try:
        current_month = datetime.now().strftime("%Y-%m")
        
        # Check if document for current month already exists
        existing_doc = await LocationCache.find_one(LocationCache.cached_month == current_month)
        
        if existing_doc:
            # Update existing document for current month
            existing_doc.cached_at = datetime.now()
            existing_doc.countries = _countries_cache or []
            existing_doc.states = _states_cache or {}
            existing_doc.cities = _cities_cache or {}
            existing_doc.all_locations = _all_locations_cache or []
            await existing_doc.save()
            print(f"💾 Updated existing location cache for {current_month} ({len(_all_locations_cache or [])} entries)")
        else:
            # Create new document for this month
            cache_doc = LocationCache(
                cache_key=CACHE_KEY,
                cached_month=current_month,
                cached_at=datetime.now(),
                countries=_countries_cache or [],
                states=_states_cache or {},
                cities=_cities_cache or {},
                all_locations=_all_locations_cache or [],
            )
            await cache_doc.insert()
            print(f"💾 Created new location cache for {current_month} ({len(_all_locations_cache or [])} entries)")
        
        # Clean up old cache documents - keep only 2 most recent months
        all_caches = await LocationCache.find(
            LocationCache.cache_key == CACHE_KEY
        ).sort("-cached_month").to_list()
        
        if len(all_caches) > 2:
            # Delete oldest caches beyond the 2 most recent
            for old_cache in all_caches[2:]:
                print(f"🗑️ Deleting old cache from {old_cache.cached_month}")
                await old_cache.delete()
                
    except Exception as e:
        print(f"⚠️ Error saving cache to MongoDB: {e}")
        import traceback
        traceback.print_exc()


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
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{CSC_API_BASE_URL}/countries",
                headers=_get_headers(),
                timeout=30.0,
            )
            response.raise_for_status()
            _countries_cache = response.json()
            return _countries_cache
    except httpx.TimeoutException:
        print("⚠️ Timeout while fetching countries from CSC API")
        raise Exception("Request to location API timed out")
    except httpx.HTTPStatusError as e:
        print(f"⚠️ HTTP error fetching countries: {e.response.status_code}")
        raise Exception(f"Location API returned status {e.response.status_code}")
    except Exception as e:
        print(f"⚠️ Error fetching countries: {e}")
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
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{CSC_API_BASE_URL}/countries/{country_iso2}/states",
                headers=_get_headers(),
                timeout=30.0,
            )
            response.raise_for_status()
            states = response.json()
            _states_cache[cache_key] = states
            return states
    except httpx.TimeoutException:
        print(f"⚠️ Timeout while fetching states for {country_iso2}")
        raise Exception("Request to location API timed out")
    except httpx.HTTPStatusError as e:
        print(f"⚠️ HTTP error fetching states: {e.response.status_code}")
        raise Exception(f"Location API returned status {e.response.status_code}")
    except Exception as e:
        print(f"⚠️ Error fetching states for {country_iso2}: {e}")
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
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{CSC_API_BASE_URL}/countries/{country_iso2}/states/{state_iso2}/cities",
                headers=_get_headers(),
                timeout=30.0,
            )
            response.raise_for_status()
            cities = response.json()
            _cities_cache[cache_key] = cities
            return cities
    except httpx.TimeoutException:
        print(f"⚠️ Timeout while fetching cities for {country_iso2}/{state_iso2}")
        raise Exception("Request to location API timed out")
    except httpx.HTTPStatusError as e:
        print(f"⚠️ HTTP error fetching cities: {e.response.status_code}")
        raise Exception(f"Location API returned status {e.response.status_code}")
    except Exception as e:
        print(f"⚠️ Error fetching cities for {country_iso2}/{state_iso2}: {e}")
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
            print(f"Error fetching cities for {state.get('name')}: {e}")
            continue
    
    _all_locations_cache = locations
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
        print("🌍 Fetching fresh location data from API...")
        await _build_all_locations_cache_from_api()
        await _save_cache_to_db()
        print(f"✅ Location cache loaded with {len(_all_locations_cache or [])} entries")
    except Exception as e:
        print(f"⚠️ Failed to preload location cache: {e}")
        # Try to load stale cache as fallback
        print("📂 Attempting to load stale cache from MongoDB as fallback...")
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
            print("🗑️ Cache document deleted from MongoDB")
    except Exception as e:
        print(f"⚠️ Error deleting cache from MongoDB: {e}")
