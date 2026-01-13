# app/services/high_court_mapping.py
"""
Mapping of Indian states/UTs to their respective High Courts.
Used for case generation to determine the appropriate court jurisdiction.
"""
import random
from typing import Optional

# ISO2 codes for Indian states/UTs mapped to their High Courts (Standardized names)
INDIAN_HIGH_COURTS: dict[str, str] = {
    # --- Union Territories (8) ---
    "AN": "Calcutta High Court (Circuit Bench at Port Blair)",              # Andaman & Nicobar Islands
    "CH": "Punjab and Haryana High Court",                                  # Chandigarh
    "DL": "Delhi High Court",                                               # Delhi (NCT)
    "DN": "Bombay High Court",                                              # Dadra & Nagar Haveli and Daman & Diu
    "JK": "High Court of Jammu & Kashmir and Ladakh",                       # J&K (UT)
    "LA": "High Court of Jammu & Kashmir and Ladakh",                       # Ladakh (UT)
    "LD": "Kerala High Court",                                              # Lakshadweep
    "PY": "Madras High Court",                                              # Puducherry

    # --- States (28) ---
    "AP": "High Court of Andhra Pradesh",                                   # Andhra Pradesh
    "AR": "Gauhati High Court (Itanagar Bench)",                            # Arunachal Pradesh
    "AS": "Gauhati High Court",                                             # Assam
    "BR": "Patna High Court",                                               # Bihar
    "CT": "High Court of Chhattisgarh",                                     # Chhattisgarh
    "GA": "Bombay High Court (Goa Bench at Panaji)",                        # Goa
    "GJ": "Gujarat High Court",                                             # Gujarat
    "HP": "Himachal Pradesh High Court",                                    # Himachal Pradesh
    "HR": "Punjab and Haryana High Court",                                  # Haryana
    "JH": "Jharkhand High Court",                                           # Jharkhand
    "KA": "Karnataka High Court",                                           # Karnataka
    "KL": "Kerala High Court",                                              # Kerala
    "MH": "Bombay High Court",                                              # Maharashtra
    "ML": "Meghalaya High Court",                                           # Meghalaya
    "MN": "Manipur High Court",                                             # Manipur
    "MP": "Madhya Pradesh High Court",                                      # Madhya Pradesh
    "MZ": "Gauhati High Court (Aizawl Bench)",                              # Mizoram
    "NL": "Gauhati High Court (Kohima Bench)",                              # Nagaland
    "OR": "Orissa High Court",                                              # Odisha
    "PB": "Punjab and Haryana High Court",                                  # Punjab
    "RJ": "Rajasthan High Court",                                           # Rajasthan
    "SK": "Sikkim High Court",                                              # Sikkim
    "TN": "Madras High Court",                                              # Tamil Nadu
    "TG": "Telangana High Court",                                           # Telangana
    "TR": "Tripura High Court",                                             # Tripura
    "UK": "Uttarakhand High Court",                                         # Uttarakhand
    "UP": "Allahabad High Court",                                           # Uttar Pradesh
    "WB": "Calcutta High Court",                                            # West Bengal
}

# List of major Indian High Courts for random selection
MAJOR_HIGH_COURTS = [
    "Supreme Court of India",
    "Delhi High Court",
    "Bombay High Court",
    "Madras High Court",
    "Calcutta High Court",
    "Karnataka High Court",
    "Gujarat High Court",
    "Allahabad High Court",
    "Punjab and Haryana High Court",
    "Rajasthan High Court",
]


def get_high_court_for_state(state_iso2: str) -> Optional[str]:
    """
    Get the High Court for a given Indian state ISO2 code.
    
    Args:
        state_iso2: The ISO2 code of the Indian state (e.g., "MH" for Maharashtra)
        
    Returns:
        The name of the High Court, or None if not found
    """
    return INDIAN_HIGH_COURTS.get(state_iso2.upper())


def get_high_court(state_iso2: Optional[str], country_iso2: Optional[str]) -> str:
    """
    Get the appropriate High Court based on user's location.
    
    Args:
        state_iso2: The ISO2 code of the state
        country_iso2: The ISO2 code of the country
        
    Returns:
        The name of the High Court. For Indian states, returns the specific
        High Court. For non-Indian locations or unknown states, returns
        a randomly selected major Indian High Court.
    """
    # Only use specific mapping for India
    if country_iso2 and country_iso2.upper() == "IN" and state_iso2:
        high_court = get_high_court_for_state(state_iso2)
        if high_court:
            return high_court
    
    # For non-Indian users or unknown states, return random major High Court
    return random.choice(MAJOR_HIGH_COURTS)


def get_random_high_court() -> str:
    """
    Get a randomly selected major Indian High Court.
    
    Returns:
        The name of a randomly selected High Court
    """
    return random.choice(MAJOR_HIGH_COURTS)


def get_all_indian_states() -> list[dict]:
    """
    Get a list of all Indian states with their High Courts.
    Useful for the settings dropdown.
    
    Returns:
        List of dicts with state_iso2, state_name, and high_court
    """
    # State ISO2 to full name mapping
    state_names = {
        "AP": "Andhra Pradesh",
        "AR": "Arunachal Pradesh",
        "AS": "Assam",
        "BR": "Bihar",
        "CT": "Chhattisgarh",
        "GA": "Goa",
        "GJ": "Gujarat",
        "HR": "Haryana",
        "HP": "Himachal Pradesh",
        "JH": "Jharkhand",
        "KA": "Karnataka",
        "KL": "Kerala",
        "MP": "Madhya Pradesh",
        "MH": "Maharashtra",
        "MN": "Manipur",
        "ML": "Meghalaya",
        "MZ": "Mizoram",
        "NL": "Nagaland",
        "OR": "Odisha",
        "PB": "Punjab",
        "RJ": "Rajasthan",
        "SK": "Sikkim",
        "TN": "Tamil Nadu",
        "TG": "Telangana",
        "TR": "Tripura",
        "UP": "Uttar Pradesh",
        "UK": "Uttarakhand",
        "WB": "West Bengal",
        "AN": "Andaman and Nicobar Islands",
        "CH": "Chandigarh",
        "DN": "Dadra and Nagar Haveli and Daman and Diu",
        "DL": "Delhi",
        "JK": "Jammu and Kashmir",
        "LA": "Ladakh",
        "LD": "Lakshadweep",
        "PY": "Puducherry",
    }
    
    result = []
    for iso2, high_court in INDIAN_HIGH_COURTS.items():
        result.append({
            "state_iso2": iso2,
            "state_name": state_names.get(iso2, iso2),
            "high_court": high_court,
        })
    
    # Sort by state name
    result.sort(key=lambda x: x["state_name"])
    return result
