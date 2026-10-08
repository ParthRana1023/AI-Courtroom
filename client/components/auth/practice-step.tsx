"use client";

import { useEffect, useState, type SubmitEvent } from "react";
import Select from "@/components/court/select";
import { authAPI, locationAPI } from "@/lib/api";
import { getErrorDetail } from "@/lib/error-utils";
import { Confirm, Field, JourneyBar, Objection, primaryButton, Slip, SlipHeading, slipInput, type JourneyProps } from "./kit";

interface Place {
  name: string;
  iso2: string;
}

/**
 * Form J-3 "Where do you practise?". Shown after the first sign-in, before the
 * first case. Country and state come from /location so "my location" case
 * generation gets the ISO codes it needs; the city is typed.
 */
export default function PracticeStep({
  note,
  journey,
  onDone,
}: {
  note?: string;
  journey?: JourneyProps;
  onDone: () => void;
}) {
  const [countries, setCountries] = useState<Place[]>([]);
  const [states, setStates] = useState<Place[] | null>(null);
  const [country, setCountry] = useState("");
  const [state, setState] = useState("");
  const [stateText, setStateText] = useState("");
  const [city, setCity] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState("");

  useEffect(() => {
    locationAPI
      .getCountries()
      .then((list: Place[]) => setCountries(list))
      .catch(() => setFormErr("Couldn’t load the list of countries. Please refresh the page."));
  }, []);

  const pickCountry = (iso2: string) => {
    setCountry(iso2);
    setState("");
    setStates(null);
    locationAPI
      .getStates(iso2)
      .then((list: Place[]) => setStates(list))
      .catch(() => setStates([])); // fall back to typing the state
  };

  const stateName = states?.length ? states.find((s) => s.iso2 === state)?.name ?? "" : stateText.trim();
  const errors = {
    country: !country ? "Country is required" : "",
    state: !stateName ? "State is required" : "",
    city: !city.trim() ? "City is required" : "",
  };
  const shown = (k: keyof typeof errors) => (tried ? errors[k] : "");

  const submit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const first = (Object.keys(errors) as (keyof typeof errors)[]).find((k) => errors[k]);
    if (first) {
      setTried(true);
      document.getElementById(`p_${first}`)?.focus();
      return;
    }
    setBusy(true);
    setFormErr("");
    try {
      await authAPI.updateProfile({
        country: countries.find((c) => c.iso2 === country)?.name,
        country_iso2: country,
        state: stateName,
        state_iso2: states?.length ? state : undefined,
        city: city.trim(),
      });
      onDone();
    } catch (err) {
      setFormErr(getErrorDetail(err) ?? "Couldn’t save your seat of practice. Please try again.");
      setBusy(false);
    }
  };

  return (
    <Slip form={["Form J-3", "Seat of practice"]} onSubmit={submit} scallop={false} maxWidth={560}>
      {journey && <JourneyBar {...journey} />}
      {note && <Confirm>{note}</Confirm>}
      {formErr && <Objection>{formErr}</Objection>}
      <SlipHeading
        title="Where do you practise?"
        sub="Your cases are built around the law and courts where you practise. You can change this later in your profile."
      />
      <Field id="p_country" label="Country" error={shown("country")}>
        <Select
          id="p_country"
          value={country}
          onChange={pickCountry}
          placeholder="Select a country"
          invalid={!!shown("country")}
          options={countries.map((c) => ({ value: c.iso2, label: c.name }))}
          className={slipInput}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field id="p_state" label="State / province" error={shown("state")}>
          {states?.length ? (
            <Select
              id="p_state"
              value={state}
              onChange={setState}
              placeholder="Select"
              invalid={!!shown("state")}
              options={states.map((s) => ({ value: s.iso2, label: s.name }))}
              className={slipInput}
            />
          ) : (
            <input
              id="p_state"
              autoComplete="address-level1"
              value={stateText}
              onChange={(e) => setStateText(e.target.value)}
              disabled={!country || states === null}
              aria-invalid={!!shown("state") || undefined}
              className={slipInput}
            />
          )}
        </Field>
        <Field id="p_city" label="City" error={shown("city")}>
          <input
            id="p_city"
            autoComplete="address-level2"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            aria-invalid={!!shown("city") || undefined}
            className={slipInput}
          />
        </Field>
      </div>
      <button type="submit" disabled={busy} className={primaryButton}>
        {busy ? "Opening the docket…" : "Open my first case →"}
      </button>
    </Slip>
  );
}
