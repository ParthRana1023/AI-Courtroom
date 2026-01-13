"use client";

import { useState, useEffect, useCallback } from "react";
import { MapPin, Loader2, ChevronDown, X } from "lucide-react";
import { locationAPI } from "@/lib/api";
import type { LocationSearchResult } from "@/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/animate-ui/components/radix/dropdown-menu";

interface LocationSelectorProps {
  onLocationSelect: (location: {
    city: string;
    state: string;
    state_iso2: string;
    country: string;
    country_iso2: string;
    phone_code: string;
  }) => void;
  initialValue?: {
    city?: string;
    state?: string;
    country?: string;
  };
  errors?: {
    city?: string;
    state?: string;
    country?: string;
  };
  labelBg?: string;
}

interface SearchResult {
  name: string;
  state?: string;
  state_iso2?: string;
  country: string;
  country_iso2: string;
  phone_code: string;
  type: "city" | "state" | "country";
}

export default function LocationSelector({
  onLocationSelect,
  initialValue,
  errors,
  labelBg = "bg-white dark:bg-zinc-900",
}: LocationSelectorProps) {
  // Field values
  const [city, setCity] = useState(initialValue?.city || "");
  const [state, setState] = useState(initialValue?.state || "");
  const [country, setCountry] = useState(initialValue?.country || "");

  // ISO codes (hidden, for API)
  const [stateIso2, setStateIso2] = useState("");
  const [countryIso2, setCountryIso2] = useState("");
  const [phoneCode, setPhoneCode] = useState("");

  // Search state
  const [cityResults, setCityResults] = useState<SearchResult[]>([]);
  const [stateResults, setStateResults] = useState<SearchResult[]>([]);
  const [countryResults, setCountryResults] = useState<SearchResult[]>([]);

  const [isLoadingCity, setIsLoadingCity] = useState(false);
  const [isLoadingState, setIsLoadingState] = useState(false);
  const [isLoadingCountry, setIsLoadingCountry] = useState(false);

  // Dropdown open state
  const [cityDropdownOpen, setCityDropdownOpen] = useState(false);
  const [stateDropdownOpen, setStateDropdownOpen] = useState(false);
  const [countryDropdownOpen, setCountryDropdownOpen] = useState(false);

  // Track if user selected from dropdown (not just typed)
  const [citySelected, setCitySelected] = useState(false);
  const [stateSelected, setStateSelected] = useState(false);

  // Focus state for floating labels
  const [cityFocused, setCityFocused] = useState(false);
  const [stateFocused, setStateFocused] = useState(false);
  const [countryFocused, setCountryFocused] = useState(false);

  // Notify parent of changes
  const notifyParent = useCallback(
    (
      updates: Partial<{
        city: string;
        state: string;
        state_iso2: string;
        country: string;
        country_iso2: string;
        phone_code: string;
      }>
    ) => {
      const newCity = updates.city ?? city;
      const newState = updates.state ?? state;
      const newStateIso2 = updates.state_iso2 ?? stateIso2;
      const newCountry = updates.country ?? country;
      const newCountryIso2 = updates.country_iso2 ?? countryIso2;
      const newPhoneCode = updates.phone_code ?? phoneCode;

      onLocationSelect({
        city: newCity,
        state: newState,
        state_iso2: newStateIso2,
        country: newCountry,
        country_iso2: newCountryIso2,
        phone_code: newPhoneCode,
      });
    },
    [city, state, stateIso2, country, countryIso2, phoneCode, onLocationSelect]
  );

  // Search cities
  const searchCities = useCallback(async (query: string) => {
    if (query.length < 2) {
      setCityResults([]);
      return;
    }
    setIsLoadingCity(true);
    try {
      const results = await locationAPI.search(query, 10);
      const cities = results.filter(
        (r: LocationSearchResult) => r.type === "city"
      );
      setCityResults(
        cities.map((r: LocationSearchResult) => ({
          name: r.city || r.name,
          state: r.state || undefined,
          state_iso2: r.state_iso2 || undefined,
          country: r.country,
          country_iso2: r.country_iso2,
          phone_code: r.phone_code,
          type: r.type,
        }))
      );
    } catch (error) {
      console.error("City search error:", error);
      setCityResults([]);
    } finally {
      setIsLoadingCity(false);
    }
  }, []);

  // Search states
  const searchStates = useCallback(async (query: string) => {
    if (query.length < 2) {
      setStateResults([]);
      return;
    }
    setIsLoadingState(true);
    try {
      const results = await locationAPI.search(query, 10);
      const states = results.filter(
        (r: LocationSearchResult) => r.type === "state"
      );
      setStateResults(
        states.map((r: LocationSearchResult) => ({
          name: r.state || r.name,
          country: r.country,
          country_iso2: r.country_iso2,
          phone_code: r.phone_code,
          state_iso2: r.state_iso2 || undefined,
          type: r.type,
        }))
      );
    } catch (error) {
      console.error("State search error:", error);
      setStateResults([]);
    } finally {
      setIsLoadingState(false);
    }
  }, []);

  // Search countries
  const searchCountries = useCallback(async (query: string) => {
    if (query.length < 2) {
      setCountryResults([]);
      return;
    }
    setIsLoadingCountry(true);
    try {
      const results = await locationAPI.search(query, 10);
      const countries = results.filter(
        (r: LocationSearchResult) => r.type === "country"
      );
      setCountryResults(
        countries.map((r: LocationSearchResult) => ({
          name: r.country || r.name,
          country: r.country,
          country_iso2: r.country_iso2,
          phone_code: r.phone_code,
          type: r.type,
        }))
      );
    } catch (error) {
      console.error("Country search error:", error);
      setCountryResults([]);
    } finally {
      setIsLoadingCountry(false);
    }
  }, []);

  // Debounced search effects
  useEffect(() => {
    const timer = setTimeout(() => {
      if (city && cityDropdownOpen) searchCities(city);
    }, 300);
    return () => clearTimeout(timer);
  }, [city, cityDropdownOpen, searchCities]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (state && stateDropdownOpen) searchStates(state);
    }, 300);
    return () => clearTimeout(timer);
  }, [state, stateDropdownOpen, searchStates]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (country && countryDropdownOpen) searchCountries(country);
    }, 300);
    return () => clearTimeout(timer);
  }, [country, countryDropdownOpen, searchCountries]);

  // Handle city selection - auto-fills state and country
  const handleCitySelect = (result: SearchResult) => {
    setCity(result.name);
    setState(result.state || "");
    setStateIso2(result.state_iso2 || "");
    setCountry(result.country);
    setCountryIso2(result.country_iso2);
    setPhoneCode(result.phone_code);
    setCityDropdownOpen(false);
    setStateDropdownOpen(false); // Ensure state dropdown stays closed
    setCountryDropdownOpen(false); // Ensure country dropdown stays closed
    setCityResults([]);
    setCitySelected(true); // Mark as selected from dropdown

    notifyParent({
      city: result.name,
      state: result.state || "",
      state_iso2: result.state_iso2 || "",
      country: result.country,
      country_iso2: result.country_iso2,
      phone_code: result.phone_code,
    });
  };

  // Handle state selection - auto-fills country
  const handleStateSelect = (result: SearchResult) => {
    setState(result.name);
    setStateIso2(result.state_iso2 || "");
    setCountry(result.country);
    setCountryIso2(result.country_iso2);
    setPhoneCode(result.phone_code);
    setStateDropdownOpen(false);
    setStateResults([]);
    setStateSelected(true); // Mark as selected from dropdown

    notifyParent({
      state: result.name,
      state_iso2: result.state_iso2 || "",
      country: result.country,
      country_iso2: result.country_iso2,
      phone_code: result.phone_code,
    });
  };

  // Handle country selection
  const handleCountrySelect = (result: SearchResult) => {
    setCountry(result.country);
    setCountryIso2(result.country_iso2);
    setPhoneCode(result.phone_code);
    setCountryDropdownOpen(false);
    setCountryResults([]);

    notifyParent({
      country: result.country,
      country_iso2: result.country_iso2,
      phone_code: result.phone_code,
    });
  };

  // Clear field handlers
  const handleClearCity = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCity("");
    setCityResults([]);
    setCitySelected(false); // Reset selection flag
    notifyParent({ city: "" });
  };

  const handleClearState = (e: React.MouseEvent) => {
    e.stopPropagation();
    setState("");
    setStateIso2("");
    setStateResults([]);
    setStateSelected(false); // Reset selection flag
    notifyParent({ state: "", state_iso2: "" });
  };

  const handleClearCountry = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCountry("");
    setCountryIso2("");
    setPhoneCode("");
    setCountryResults([]);
    notifyParent({ country: "", country_iso2: "", phone_code: "" });
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* City Field */}
      <div className="relative">
        <label
          className={`absolute pointer-events-none transition-all duration-200 ease-out px-1
            ${
              cityFocused || city
                ? `left-8 -top-2.5 text-xs ${labelBg}`
                : "left-10 top-1/2 -translate-y-1/2 text-base"
            }
            ${
              errors?.city
                ? "text-red-500 dark:text-red-400"
                : cityFocused
                ? "text-blue-500 dark:text-blue-400"
                : "text-zinc-500 dark:text-zinc-400"
            }
            z-10
          `}
        >
          City
        </label>
        <DropdownMenu
          open={cityDropdownOpen}
          onOpenChange={setCityDropdownOpen}
        >
          <DropdownMenuTrigger asChild>
            <div className="relative cursor-pointer">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-400 z-10" />
              <input
                type="text"
                value={city}
                onChange={(e) => {
                  setCity(e.target.value);
                  // Reset selection state when typing (force selection from dropdown)
                  if (citySelected) {
                    setCitySelected(false);
                    // Clear auto-filled values
                    setState("");
                    setStateIso2("");
                    setCountry("");
                    setCountryIso2("");
                    setPhoneCode("");
                    notifyParent({
                      city: e.target.value,
                      state: "",
                      state_iso2: "",
                      country: "",
                      country_iso2: "",
                      phone_code: "",
                    });
                  }
                  if (!cityDropdownOpen) setCityDropdownOpen(true);
                }}
                onFocus={() => {
                  setCityDropdownOpen(true);
                  setCityFocused(true);
                }}
                onBlur={() => setCityFocused(false)}
                placeholder=" "
                className={`w-full pl-10 pr-10 py-3 border-2 rounded-lg focus:outline-none transition-colors cursor-text
                  ${
                    errors?.city
                      ? "border-red-500"
                      : "border-zinc-300 focus:border-blue-500 dark:border-zinc-600 dark:focus:border-blue-400"
                  }
                  dark:bg-transparent dark:text-white`}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {isLoadingCity && (
                  <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
                )}
                {city && !isLoadingCity && (
                  <button
                    type="button"
                    onClick={handleClearCity}
                    className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-full"
                  >
                    <X className="h-4 w-4 text-zinc-400" />
                  </button>
                )}
                {!city && !isLoadingCity && (
                  <ChevronDown className="h-4 w-4 text-zinc-400" />
                )}
              </div>
            </div>
          </DropdownMenuTrigger>
          {cityResults.length > 0 && (
            <DropdownMenuContent
              align="start"
              className="w-(--radix-dropdown-menu-trigger-width) max-h-48 overflow-y-auto"
            >
              {cityResults.map((result, index) => (
                <DropdownMenuItem
                  key={`city-${result.name}-${index}`}
                  onClick={() => handleCitySelect(result)}
                  className="flex flex-col items-start cursor-pointer"
                >
                  <span className="font-medium">{result.name}</span>
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">
                    {result.state}, {result.country}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          )}
        </DropdownMenu>
        {errors?.city && (
          <p className="mt-1 text-sm text-red-600 dark:text-red-400">
            {errors.city}
          </p>
        )}
      </div>

      {/* State Field */}
      <div className="relative">
        <label
          className={`absolute pointer-events-none transition-all duration-200 ease-out px-1
            ${
              stateFocused || state
                ? `left-3 -top-2.5 text-xs ${labelBg}`
                : "left-4 top-1/2 -translate-y-1/2 text-base"
            }
            ${
              errors?.state
                ? "text-red-500 dark:text-red-400"
                : stateFocused
                ? "text-blue-500 dark:text-blue-400"
                : "text-zinc-500 dark:text-zinc-400"
            }
            z-10
          `}
        >
          State
        </label>
        <DropdownMenu
          open={stateDropdownOpen}
          onOpenChange={setStateDropdownOpen}
        >
          <DropdownMenuTrigger asChild>
            <div
              className={`relative ${
                citySelected
                  ? "cursor-not-allowed opacity-60"
                  : "cursor-pointer"
              }`}
            >
              <input
                type="text"
                value={state}
                disabled={citySelected}
                onChange={(e) => {
                  setState(e.target.value);
                  if (!stateDropdownOpen) setStateDropdownOpen(true);
                }}
                onFocus={() => {
                  if (!citySelected) {
                    setStateDropdownOpen(true);
                    setStateFocused(true);
                  }
                }}
                onBlur={() => setStateFocused(false)}
                placeholder=" "
                className={`w-full pl-4 pr-10 py-3 border-2 rounded-lg focus:outline-none transition-colors
                  ${
                    citySelected
                      ? "cursor-not-allowed bg-zinc-100 dark:bg-zinc-800"
                      : "cursor-text"
                  }
                  ${
                    errors?.state
                      ? "border-red-500"
                      : "border-zinc-300 focus:border-blue-500 dark:border-zinc-600 dark:focus:border-blue-400"
                  }
                  dark:text-white`}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {isLoadingState && (
                  <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
                )}
                {state && !isLoadingState && (
                  <button
                    type="button"
                    onClick={handleClearState}
                    className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-full"
                  >
                    <X className="h-4 w-4 text-zinc-400" />
                  </button>
                )}
                {!state && !isLoadingState && (
                  <ChevronDown className="h-4 w-4 text-zinc-400" />
                )}
              </div>
            </div>
          </DropdownMenuTrigger>
          {stateResults.length > 0 && (
            <DropdownMenuContent
              align="start"
              className="w-(--radix-dropdown-menu-trigger-width) max-h-48 overflow-y-auto"
            >
              {stateResults.map((result, index) => (
                <DropdownMenuItem
                  key={`state-${result.name}-${index}`}
                  onClick={() => handleStateSelect(result)}
                  className="flex flex-col items-start cursor-pointer"
                >
                  <span className="font-medium">{result.name}</span>
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">
                    {result.country}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          )}
        </DropdownMenu>
        {errors?.state && (
          <p className="mt-1 text-sm text-red-600 dark:text-red-400">
            {errors.state}
          </p>
        )}
      </div>

      {/* Country Field */}
      <div className="relative">
        <label
          className={`absolute pointer-events-none transition-all duration-200 ease-out px-1
            ${
              countryFocused || country
                ? `left-3 -top-2.5 text-xs ${labelBg}`
                : "left-4 top-1/2 -translate-y-1/2 text-base"
            }
            ${
              errors?.country
                ? "text-red-500 dark:text-red-400"
                : countryFocused
                ? "text-blue-500 dark:text-blue-400"
                : "text-zinc-500 dark:text-zinc-400"
            }
            z-10
          `}
        >
          Country
        </label>
        <DropdownMenu
          open={countryDropdownOpen}
          onOpenChange={setCountryDropdownOpen}
        >
          <DropdownMenuTrigger asChild>
            <div
              className={`relative ${
                citySelected || stateSelected
                  ? "cursor-not-allowed opacity-60"
                  : "cursor-pointer"
              }`}
            >
              <input
                type="text"
                value={country}
                disabled={citySelected || stateSelected}
                onChange={(e) => {
                  setCountry(e.target.value);
                  if (!countryDropdownOpen) setCountryDropdownOpen(true);
                }}
                onFocus={() => {
                  if (!(citySelected || stateSelected)) {
                    setCountryDropdownOpen(true);
                    setCountryFocused(true);
                  }
                }}
                onBlur={() => setCountryFocused(false)}
                placeholder=" "
                className={`w-full pl-4 pr-10 py-3 border-2 rounded-lg focus:outline-none transition-colors
                  ${
                    citySelected || stateSelected
                      ? "cursor-not-allowed bg-zinc-100 dark:bg-zinc-800"
                      : "cursor-text"
                  }
                  ${
                    errors?.country
                      ? "border-red-500"
                      : "border-zinc-300 focus:border-blue-500 dark:border-zinc-600 dark:focus:border-blue-400"
                  }
                  dark:text-white`}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {isLoadingCountry && (
                  <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
                )}
                {country && !isLoadingCountry && (
                  <button
                    type="button"
                    onClick={handleClearCountry}
                    className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-full"
                  >
                    <X className="h-4 w-4 text-zinc-400" />
                  </button>
                )}
                {!country && !isLoadingCountry && (
                  <ChevronDown className="h-4 w-4 text-zinc-400" />
                )}
              </div>
            </div>
          </DropdownMenuTrigger>
          {countryResults.length > 0 && (
            <DropdownMenuContent
              align="start"
              className="w-(--radix-dropdown-menu-trigger-width) max-h-48 overflow-y-auto"
            >
              {countryResults.map((result, index) => (
                <DropdownMenuItem
                  key={`country-${result.country}-${index}`}
                  onClick={() => handleCountrySelect(result)}
                  className="flex items-center justify-between cursor-pointer"
                >
                  <span className="font-medium">{result.country}</span>
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">
                    +{result.phone_code}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          )}
        </DropdownMenu>
        {errors?.country && (
          <p className="mt-1 text-sm text-red-600 dark:text-red-400">
            {errors.country}
          </p>
        )}
      </div>
    </div>
  );
}
