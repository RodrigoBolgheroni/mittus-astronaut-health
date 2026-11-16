"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";

import { Button, ButtonLink } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { isApiError, listMissionPlaces, registerMission } from "@/lib/api";
import type { MissionPhase, MissionPlaceOption, MissionRegistrationInput } from "@/lib/api/types";
import { DEPARTURE_TIME_SOURCES, DEPARTURE_TIME_SOURCE_LABEL } from "@/lib/mission/mission-registration";

import { MissionShell, MissionSlot } from "./MissionShell";

/** Figma 09 "Moon to Earth" is where both "Back to mission map" actions land. */
const MAP_HREF = "/mission?direction=return";
const CONFIRM_TITLE = "mission-registered-title";
const CONFIRM_DESC = "mission-registered-desc";

type Leg = MissionRegistrationInput["legs"][MissionPhase];
const EMPTY_LEG: Leg = { departurePlace: "", destinationPlace: "", departureAt: "", departureAtSource: "", destinationDescription: "" };
const EMPTY: MissionRegistrationInput = {
  name: "",
  code: "",
  noradId: "",
  ll2LaunchId: "",
  referenceLabel: "",
  referenceUrl: "",
  isDemo: false,
  legs: { in_orbit: EMPTY_LEG, return_to_earth: EMPTY_LEG },
};

const LEGS: { phase: MissionPhase; title: string }[] = [
  { phase: "in_orbit", title: "Outbound · In orbit" },
  { phase: "return_to_earth", title: "Return to Earth" },
];

/** Card surface of the form (Figma "Mission details" and "Mission leg" frames: glass 27, line, radius 28). */
const CARD = "glass rounded-card border border-solid border-line bg-glass";

/** Figma "Mission · Register a mission" (111:1728) + "Registration confirmation" (111:1956). */
export function RegisterMissionScreen() {
  const router = useRouter();
  const [form, setForm] = useState<MissionRegistrationInput>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [places, setPlaces] = useState<MissionPlaceOption[]>([]);

  useEffect(() => {
    let live = true;
    listMissionPlaces().then(
      (r) => live && setPlaces(r.places),
      // No database configured or reachable: nothing can be saved either.
      () => live && setFormError("Saved places are unavailable, so the mission cannot be saved right now."),
    );
    return () => {
      live = false;
    };
  }, []);

  const set = <K extends keyof MissionRegistrationInput>(key: K, value: MissionRegistrationInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const setLeg = (phase: MissionPhase, key: keyof Leg, value: string) =>
    setForm((f) => ({ ...f, legs: { ...f.legs, [phase]: { ...f.legs[phase], [key]: value } } }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      await registerMission(form);
      setErrors({});
      setSaved(true);
    } catch (error) {
      const body = isApiError(error) ? (error.body as { error?: string; fields?: Record<string, string> } | null) : null;
      const fields = body?.fields ?? {};
      setErrors(fields);
      const messages = Object.values(fields);
      setFormError(
        messages.length > 0
          ? messages.length === 1
            ? messages[0]!
            : `${messages[0]} ${messages.length - 1} more field${messages.length > 2 ? "s" : ""} highlighted.`
          : body?.error === "session_required"
            ? "Save a daily check-in first, or use it as the demo mission."
            : "The mission could not be saved. Try again.",
      );
    } finally {
      setSaving(false);
    }
  }


  return (
    <MissionShell
      title="Register a mission."
      subtitle="Name your mission and plan its outbound and return legs."
      footerLeft="ALEX MORGAN     /     MISSION DAY 024"
      frame={{ height: 1144, footerY: 1105 }}
    >
      <form onSubmit={submit} noValidate className="contents">
        <MissionSlot top={194}>
          <section aria-labelledby="mission-details-title" className={`${CARD} flex flex-col gap-[17px] px-7 pb-6 pt-[25px] canvas:h-[346px]`}>
            <h2 id="mission-details-title" className="font-display text-[34px] leading-[1.17] text-ivory">
              Mission details
            </h2>
            <div className="grid gap-[17px] sm:grid-cols-3">
              <TextField label="Mission name" placeholder="Enter a name" value={form.name} onChange={(v) => set("name", v)} error={errors.name} required />
              <TextField label="Mission code" placeholder="e.g. lunar-return" value={form.code} onChange={(v) => set("code", v)} error={errors.code} required />
              <TextField label="NORAD ID" placeholder="Optional" inputMode="numeric" value={form.noradId} onChange={(v) => set("noradId", v)} error={errors.noradId} />
            </div>
            <div className="grid gap-[17px] sm:grid-cols-3">
              <TextField label="Launch Library 2 ID" placeholder="Optional launch UUID" value={form.ll2LaunchId} onChange={(v) => set("ll2LaunchId", v)} error={errors.ll2LaunchId} />
              <TextField label="Reference label" placeholder="Optional" value={form.referenceLabel} onChange={(v) => set("referenceLabel", v)} />
              <TextField label="Reference URL" placeholder="https://" type="url" value={form.referenceUrl} onChange={(v) => set("referenceUrl", v)} error={errors.referenceUrl} />
            </div>
            <label className="relative flex h-[26px] w-fit cursor-pointer items-center gap-2 text-body leading-[1.17] text-ivory">
              <input
                type="checkbox"
                checked={form.isDemo}
                onChange={(e) => set("isDemo", e.target.checked)}
                className="peer absolute inset-0 cursor-pointer opacity-0"
              />
              <Icon name={form.isDemo ? "square-check-18" : "square-18"} className="rounded-[3px] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-cyan" />
              Use as the demo mission
            </label>
          </section>
        </MissionSlot>

        <MissionSlot top={559}>
          <section aria-labelledby="mission-route-title" className="flex flex-col gap-2.5">
            <h2 id="mission-route-title" className="font-display text-[31px] leading-[1.17] text-ivory">
              Mission route
            </h2>
            <p className="text-body leading-[1.17] text-ivory">Choose saved places. Add a source if you enter a departure time.</p>
            <div className="grid gap-6 md:grid-cols-2">
              {LEGS.map(({ phase, title }) => {
                const leg = form.legs[phase];
                const err = (k: keyof Leg) => errors[`legs.${phase}.${k}`];
                return (
                  <fieldset key={phase} className={`${CARD} flex min-w-0 flex-col gap-3.5 px-6 py-[22px] canvas:h-[374px]`}>
                    <legend className="float-left w-full font-display text-[29px] leading-[1.15] text-ivory">{title}</legend>
                    <div className="grid gap-[13px] sm:grid-cols-2">
                      <SelectField label="Departure place" placeholder="Select a place" value={leg.departurePlace} onChange={(v) => setLeg(phase, "departurePlace", v)} error={err("departurePlace")} required>
                        {places.map((p) => (
                          <option key={p.code} value={p.code}>
                            {p.name === p.label ? p.name : `${p.name} · ${p.label}`}
                          </option>
                        ))}
                      </SelectField>
                      <SelectField label="Destination place" placeholder="Select a place" value={leg.destinationPlace} onChange={(v) => setLeg(phase, "destinationPlace", v)} error={err("destinationPlace")} required>
                        {places.map((p) => (
                          <option key={p.code} value={p.code}>
                            {p.name === p.label ? p.name : `${p.name} · ${p.label}`}
                          </option>
                        ))}
                      </SelectField>
                    </div>
                    <div className="grid gap-[13px] sm:grid-cols-2">
                      <TextField
                        label="Departure date and time"
                        placeholder="Optional · UTC"
                        description="YYYY-MM-DD HH:MM, in UTC"
                        value={leg.departureAt}
                        onChange={(v) => setLeg(phase, "departureAt", v)}
                        error={err("departureAt")}
                      />
                      <SelectField label="Source of departure time" placeholder="Select a source" value={leg.departureAtSource} onChange={(v) => setLeg(phase, "departureAtSource", v)} error={err("departureAtSource")}>
                        {DEPARTURE_TIME_SOURCES.map((s) => (
                          <option key={s} value={s}>
                            {DEPARTURE_TIME_SOURCE_LABEL[s]}
                          </option>
                        ))}
                      </SelectField>
                    </div>
                    <TextField
                      label="Destination description"
                      placeholder="Describe the destination"
                      value={leg.destinationDescription}
                      onChange={(v) => setLeg(phase, "destinationDescription", v)}
                      error={err("destinationDescription")}
                      required
                    />
                  </fieldset>
                );
              })}
            </div>
          </section>
        </MissionSlot>

        <MissionSlot top={1030}>
          <div className="flex flex-wrap items-center justify-between gap-gap">
            <ButtonLink variant="secondary" href={MAP_HREF} className="canvas:w-[210px]">
              Back to mission map
            </ButtonLink>
            <div className="flex flex-wrap items-center justify-end gap-gap">
              <p role="alert" className="text-label text-purple">
                {formError}
              </p>
              <Button type="submit" disabled={saving} className="canvas:w-[200px]">
                {saving ? "Saving…" : "Save mission"}
              </Button>
            </div>
          </div>
        </MissionSlot>
      </form>

      <Dialog
        open={saved}
        onClose={() => router.push(MAP_HREF)}
        labelledBy={CONFIRM_TITLE}
        describedBy={CONFIRM_DESC}
        className="w-[460px] rounded-card"
      >
        <div className="flex flex-col items-start gap-3.5 rounded-card bg-glass p-pad">
          <h2 id={CONFIRM_TITLE} className="font-display text-[36px] leading-[1.17] text-ivory">
            Mission registered.
          </h2>
          <p id={CONFIRM_DESC} className="text-body-md leading-[1.17] text-ivory">
            Your mission details and route are ready to review.
          </p>
          <ButtonLink href={MAP_HREF} className="w-[225px]">
            Back to mission map
          </ButtonLink>
        </div>
      </Dialog>
    </MissionShell>
  );
}

// ---- Fields: Figma "Mittus / Mission field" (111:1865): label 15 + 52px input, gap 8 ----

const INPUT =
  "glass h-[52px] w-full rounded-[10px] border border-solid bg-glass px-3.5 text-body-md leading-[1.17] text-ivory";

type FieldShellProps = { label: string; error?: string; description?: string; children: (ids: FieldIds) => ReactNode };
type FieldIds = { id: string; describedBy: string | undefined; invalid: boolean };

function FieldShell({ label, error, description, children }: FieldShellProps) {
  const id = useId();
  const descId = `${id}-desc`;
  const errId = `${id}-err`;
  const describedBy = [description ? descId : null, error ? errId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor={id} className="text-body leading-[1.17] text-ivory">
        {label}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {description ? (
        <span id={descId} className="sr-only">
          {description}
        </span>
      ) : null}
      {/* The Figma grid has no room for a message under each field: on the canvas it is read
          with the field and summarised next to "Save mission"; below 1280px it shows here. */}
      {error ? (
        <span id={errId} className="text-pill text-purple canvas:sr-only">
          {error}
        </span>
      ) : null}
    </div>
  );
}

type TextFieldProps = {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  description?: string;
  required?: boolean;
  type?: "text" | "url";
  inputMode?: "numeric";
};

function TextField({ label, placeholder, value, onChange, error, description, required, type = "text", inputMode }: TextFieldProps) {
  return (
    <FieldShell label={label} error={error} description={description}>
      {({ id, describedBy, invalid }) => (
        <input
          id={id}
          type={type}
          inputMode={inputMode}
          value={value}
          required={required}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          // Figma shows the placeholders in ivory.
          className={`${INPUT} placeholder:text-ivory ${invalid ? "border-purple" : "border-line"}`}
        />
      )}
    </FieldShell>
  );
}

type SelectFieldProps = {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  required?: boolean;
  children: ReactNode;
};

/** Native select under a styled face: Figma draws the "▾" right after the text. */
function SelectField({ label, placeholder, value, onChange, error, required, children }: SelectFieldProps) {
  const [shown, setShown] = useState<string | null>(null);
  return (
    <FieldShell label={label} error={error}>
      {({ id, describedBy, invalid }) => (
        <div
          className={`${INPUT} relative flex items-center focus-within:outline-2 focus-within:outline-offset-3 focus-within:outline-cyan ${
            invalid ? "border-purple" : "border-line"
          }`}
        >
          <span aria-hidden="true" className="truncate">
            {(value && shown) || placeholder} ▾
          </span>
          <select
            id={id}
            value={value}
            required={required}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            onChange={(e) => {
              setShown(e.target.selectedOptions[0]?.text ?? null);
              onChange(e.target.value);
            }}
            className="absolute inset-0 cursor-pointer appearance-none bg-surface text-ivory opacity-0"
          >
            <option value="">{placeholder}</option>
            {children}
          </select>
        </div>
      )}
    </FieldShell>
  );
}
