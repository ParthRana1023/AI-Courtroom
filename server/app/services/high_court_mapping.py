# app/services/high_court_mapping.py
"""
Mapping of Indian states/UTs to their respective High Courts.
Used for case generation to determine the appropriate court jurisdiction.
"""

from app.logging_config import get_logger

logger = get_logger(__name__)

# ISO2 codes for Indian states/UTs mapped to their High Courts (Standardized names)
INDIAN_HIGH_COURTS: dict[str, str] = {
    # --- Union Territories (8) ---
    "AN": "Calcutta High Court (Circuit Bench at Port Blair)",  # Andaman & Nicobar Islands
    "CH": "Punjab and Haryana High Court",  # Chandigarh
    "DL": "Delhi High Court",  # Delhi (NCT)
    "DN": "Bombay High Court",  # Dadra & Nagar Haveli and Daman & Diu
    "JK": "High Court of Jammu & Kashmir and Ladakh",  # J&K (UT)
    "LA": "High Court of Jammu & Kashmir and Ladakh",  # Ladakh (UT)
    "LD": "Kerala High Court",  # Lakshadweep
    "PY": "Madras High Court",  # Puducherry
    # --- States (28) ---
    "AP": "High Court of Andhra Pradesh",  # Andhra Pradesh
    "AR": "Gauhati High Court (Itanagar Bench)",  # Arunachal Pradesh
    "AS": "Gauhati High Court",  # Assam
    "BR": "Patna High Court",  # Bihar
    "CT": "High Court of Chhattisgarh",  # Chhattisgarh
    "GA": "Bombay High Court (Goa Bench at Panaji)",  # Goa
    "GJ": "Gujarat High Court",  # Gujarat
    "HP": "Himachal Pradesh High Court",  # Himachal Pradesh
    "HR": "Punjab and Haryana High Court",  # Haryana
    "JH": "Jharkhand High Court",  # Jharkhand
    "KA": "Karnataka High Court",  # Karnataka
    "KL": "Kerala High Court",  # Kerala
    "MH": "Bombay High Court",  # Maharashtra
    "ML": "Meghalaya High Court",  # Meghalaya
    "MN": "Manipur High Court",  # Manipur
    "MP": "Madhya Pradesh High Court",  # Madhya Pradesh
    "MZ": "Gauhati High Court (Aizawl Bench)",  # Mizoram
    "NL": "Gauhati High Court (Kohima Bench)",  # Nagaland
    "OR": "Orissa High Court",  # Odisha
    "PB": "Punjab and Haryana High Court",  # Punjab
    "RJ": "Rajasthan High Court",  # Rajasthan
    "SK": "Sikkim High Court",  # Sikkim
    "TN": "Madras High Court",  # Tamil Nadu
    "TG": "Telangana High Court",  # Telangana
    "TR": "Tripura High Court",  # Tripura
    "UK": "Uttarakhand High Court",  # Uttarakhand
    "UP": "Allahabad High Court",  # Uttar Pradesh
    "WB": "Calcutta High Court",  # West Bengal
}


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
        result.append(
            {
                "state_iso2": iso2,
                "state_name": state_names.get(iso2, iso2),
                "high_court": high_court,
            }
        )

    # Sort by state name
    result.sort(key=lambda x: x["state_name"])
    logger.debug(
        "Retrieved all Indian states with high courts", extra={"count": len(result)}
    )
    return result
