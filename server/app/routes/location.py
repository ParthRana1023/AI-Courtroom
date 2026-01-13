# app/routes/location.py
"""
Location API routes for fetching countries, states, cities and search.
"""
from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from app.services.location_service import (
    get_countries,
    get_states,
    get_cities,
    search_locations,
    get_phone_code,
)
from app.services.high_court_mapping import get_all_indian_states
from app.logging_config import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/location", tags=["location"])


@router.get("/countries")
async def list_countries():
    """
    Get all countries with their details.
    
    Returns:
        List of countries with id, name, iso2, phone_code, etc.
    """
    logger.debug("Fetching countries list")
    try:
        countries = await get_countries()
        logger.debug(f"Returned {len(countries)} countries")
        return countries
    except Exception as e:
        logger.error(f"Failed to fetch countries: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to fetch countries: {str(e)}")


@router.get("/states/{country_iso2}")
async def list_states(country_iso2: str):
    """
    Get all states for a specific country.
    
    Args:
        country_iso2: ISO2 code of the country (e.g., "IN" for India)
        
    Returns:
        List of states with id, name, iso2, etc.
    """
    logger.debug(f"Fetching states for country: {country_iso2}")
    try:
        states = await get_states(country_iso2)
        logger.debug(f"Returned {len(states)} states for {country_iso2}")
        return states
    except Exception as e:
        logger.error(f"Failed to fetch states for {country_iso2}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to fetch states: {str(e)}")


@router.get("/cities/{country_iso2}/{state_iso2}")
async def list_cities(country_iso2: str, state_iso2: str):
    """
    Get all cities for a specific state.
    
    Args:
        country_iso2: ISO2 code of the country (e.g., "IN")
        state_iso2: ISO2 code of the state (e.g., "MH")
        
    Returns:
        List of cities with id, name, etc.
    """
    logger.debug(f"Fetching cities for state: {state_iso2}, country: {country_iso2}")
    try:
        cities = await get_cities(country_iso2, state_iso2)
        logger.debug(f"Returned {len(cities)} cities for {state_iso2}/{country_iso2}")
        return cities
    except Exception as e:
        logger.error(f"Failed to fetch cities for {state_iso2}/{country_iso2}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to fetch cities: {str(e)}")


@router.get("/search")
async def search(
    q: str = Query(..., min_length=2, description="Search query"),
    limit: int = Query(20, ge=1, le=50, description="Maximum results to return"),
):
    """
    Search for locations (cities, states, countries).
    Returns matching locations with auto-complete data.
    
    Args:
        q: Search query (minimum 2 characters)
        limit: Maximum number of results
        
    Returns:
        List of matching locations with full details (city, state, country, phone_code)
    """
    logger.debug(f"Location search: query='{q}', limit={limit}")
    try:
        results = await search_locations(q, limit)
        logger.debug(f"Search returned {len(results)} results for '{q}'")
        return results
    except Exception as e:
        logger.error(f"Location search failed for '{q}': {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")


@router.get("/phone-code/{country_iso2}")
async def get_country_phone_code(country_iso2: str):
    """
    Get the phone code for a specific country.
    
    Args:
        country_iso2: ISO2 code of the country (e.g., "IN")
        
    Returns:
        Phone code (e.g., "91")
    """
    logger.debug(f"Fetching phone code for country: {country_iso2}")
    try:
        phone_code = await get_phone_code(country_iso2)
        if phone_code:
            return {"phone_code": phone_code}
        logger.warning(f"Phone code not found for country: {country_iso2}")
        raise HTTPException(status_code=404, detail="Country not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to fetch phone code for {country_iso2}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to fetch phone code: {str(e)}")


@router.get("/indian-states")
async def list_indian_states():
    """
    Get all Indian states with their High Courts.
    Used for the case location preference settings dropdown.
    
    Returns:
        List of Indian states with state_iso2, state_name, and high_court
    """
    logger.debug("Fetching Indian states list")
    return get_all_indian_states()
