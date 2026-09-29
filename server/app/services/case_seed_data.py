"""Names, organisations and cities for generated cases.

Picking from lists is instant, costs nothing and keeps the city inside the
case's state; asking the model for these took three extra calls per case.
Organisations are fictional on purpose: generated cases are often criminal.
"""

import random

FIRST_NAMES = [
    "Aarav",
    "Aditi",
    "Akash",
    "Ananya",
    "Arjun",
    "Bhavna",
    "Deepak",
    "Divya",
    "Farhan",
    "Gauri",
    "Harish",
    "Isha",
    "Jaspreet",
    "Kavita",
    "Kiran",
    "Lakshmi",
    "Manoj",
    "Meera",
    "Mohammed",
    "Nandini",
    "Naveen",
    "Pooja",
    "Pradeep",
    "Priya",
    "Rahul",
    "Rekha",
    "Rohan",
    "Sanjay",
    "Shalini",
    "Suresh",
    "Tanvi",
    "Uday",
    "Vandana",
    "Vikram",
    "Yasmin",
    "Zoya",
    "Abhishek",
    "Neha",
    "Ravi",
    "Sunita",
]

SURNAMES = [
    "Sharma",
    "Verma",
    "Iyer",
    "Nair",
    "Reddy",
    "Rao",
    "Patel",
    "Shah",
    "Deshmukh",
    "Kulkarni",
    "Banerjee",
    "Chatterjee",
    "Das",
    "Ghosh",
    "Singh",
    "Gill",
    "Khan",
    "Qureshi",
    "Menon",
    "Pillai",
    "Joshi",
    "Mishra",
    "Yadav",
    "Gupta",
    "Agarwal",
    "Mehta",
    "Bhat",
    "Naidu",
    "Mukherjee",
    "Saxena",
    "Chauhan",
    "Rathore",
    "Fernandes",
    "D'Souza",
    "Hegde",
    "Kamath",
    "Bose",
    "Tiwari",
    "Pandey",
    "Chaudhary",
]

ORGANIZATIONS = [
    "Shreeji Textiles Pvt Ltd",
    "Sahyadri Infrastructure Ltd",
    "Ganga Logistics Pvt Ltd",
    "Coastal Agro Exports Ltd",
    "Deccan Finserv Pvt Ltd",
    "Nilgiri Tea Estates Ltd",
    "Vindhya Cement Works Ltd",
    "Kaveri Pharma Pvt Ltd",
    "Brahmaputra Steel Industries Ltd",
    "Aravali Realty Developers Pvt Ltd",
    "Konkan Fisheries Co-operative Society",
    "Satpura Power Solutions Pvt Ltd",
    "Malabar Spices Trading Co.",
    "Narmada Water Services Ltd",
    "Himalayan Adventures Travel Pvt Ltd",
    "Sunrise Micro Credit Foundation",
    "Indus Digital Payments Pvt Ltd",
    "Thar Solar Energy Ltd",
    "Godavari Sugar Mills Ltd",
    "Chambal Transport Corporation",
]

# Keys match INDIAN_HIGH_COURTS (ISO 3166-2 style state / UT codes).
STATE_CITIES = {
    "AN": ["Port Blair"],
    "AP": ["Visakhapatnam", "Vijayawada", "Guntur", "Tirupati", "Nellore", "Kurnool"],
    "AR": ["Itanagar", "Naharlagun", "Pasighat"],
    "AS": ["Guwahati", "Dibrugarh", "Silchar", "Jorhat", "Tezpur"],
    "BR": ["Patna", "Gaya", "Bhagalpur", "Muzaffarpur", "Darbhanga"],
    "CH": ["Chandigarh"],
    "CT": ["Raipur", "Bilaspur", "Durg", "Bhilai", "Korba"],
    "DL": ["New Delhi", "Dwarka", "Rohini", "Saket", "Karkardooma"],
    "DN": ["Daman", "Diu", "Silvassa"],
    "GA": ["Panaji", "Margao", "Mapusa", "Vasco da Gama"],
    "GJ": ["Ahmedabad", "Surat", "Vadodara", "Rajkot", "Bhavnagar", "Gandhinagar"],
    "HP": ["Shimla", "Mandi", "Dharamshala", "Solan", "Kullu"],
    "HR": ["Gurugram", "Faridabad", "Panipat", "Ambala", "Hisar", "Rohtak"],
    "JH": ["Ranchi", "Jamshedpur", "Dhanbad", "Bokaro", "Hazaribagh"],
    "JK": ["Srinagar", "Jammu", "Anantnag", "Baramulla", "Udhampur"],
    "KA": ["Bengaluru", "Mysuru", "Mangaluru", "Hubballi", "Belagavi", "Kalaburagi"],
    "KL": ["Thiruvananthapuram", "Kochi", "Kozhikode", "Thrissur", "Kollam"],
    "LA": ["Leh", "Kargil"],
    "LD": ["Kavaratti"],
    "MH": ["Mumbai", "Pune", "Nagpur", "Nashik", "Aurangabad", "Thane"],
    "ML": ["Shillong", "Tura", "Jowai"],
    "MN": ["Imphal", "Thoubal", "Churachandpur"],
    "MP": ["Bhopal", "Indore", "Gwalior", "Jabalpur", "Ujjain"],
    "MZ": ["Aizawl", "Lunglei", "Champhai"],
    "NL": ["Kohima", "Dimapur", "Mokokchung"],
    "OR": ["Bhubaneswar", "Cuttack", "Rourkela", "Berhampur", "Sambalpur"],
    "PB": ["Ludhiana", "Amritsar", "Jalandhar", "Patiala", "Bathinda"],
    "PY": ["Puducherry", "Karaikal"],
    "RJ": ["Jaipur", "Jodhpur", "Udaipur", "Kota", "Ajmer", "Bikaner"],
    "SK": ["Gangtok", "Namchi"],
    "TG": ["Hyderabad", "Warangal", "Karimnagar", "Nizamabad", "Khammam"],
    "TN": [
        "Chennai",
        "Coimbatore",
        "Madurai",
        "Tiruchirappalli",
        "Salem",
        "Tirunelveli",
    ],
    "TR": ["Agartala", "Dharmanagar"],
    "UK": ["Dehradun", "Haridwar", "Haldwani", "Rudrapur", "Nainital"],
    "UP": ["Lucknow", "Kanpur", "Varanasi", "Agra", "Prayagraj", "Meerut", "Ghaziabad"],
    "WB": ["Kolkata", "Howrah", "Siliguri", "Durgapur", "Asansol"],
}


def random_names(count: int = 3) -> list[str]:
    """Distinct full names for the parties."""
    first = random.sample(FIRST_NAMES, count)
    last = random.sample(SURNAMES, count)
    return [f"{f} {s}" for f, s in zip(first, last, strict=True)]


def random_organizations(count: int = 2) -> list[str]:
    return random.sample(ORGANIZATIONS, count)


def random_city(state_code: str) -> str:
    return random.choice(STATE_CITIES.get(state_code) or ["New Delhi"])
