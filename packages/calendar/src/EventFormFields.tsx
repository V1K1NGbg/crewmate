"use client";

import type { Dispatch, SetStateAction } from "react";
import { AlignLeft, Calendar as CalIcon, ChevronDown, MapPin } from "lucide-react";
import type { GoogleCalendarList } from "./settings";

export type EventFormErrors = Record<string, string>;

export interface EventFormFieldsProps {
  title: string;
  setTitle: (value: string) => void;
  allDay: boolean;
  onToggleAllDay: () => void;
  startDate: string;
  setStartDate: (value: string) => void;
  endDate: string;
  setEndDate: (value: string) => void;
  start: string;
  setStart: (value: string) => void;
  end: string;
  setEnd: (value: string) => void;
  location: string;
  setLocation: (value: string) => void;
  description: string;
  setDescription: (value: string) => void;
  errors: EventFormErrors;
  setErrors: Dispatch<SetStateAction<EventFormErrors>>;
  calendars: GoogleCalendarList[];
  /**
   * Create mode: a selectable writable calendar. Edit mode passes
   * `lockedCalendarId`, because moving an event between calendars is not
   * supported, so the calendar is shown read-only.
   */
  calendarId: string;
  setCalendarId: (value: string) => void;
  lockedCalendarId?: string;
  titlePlaceholder: string;
  onSubmit: () => void;
  saving: boolean;
}

const LABEL = "text-xs font-semibold text-text-3 uppercase tracking-widest";
const fieldClass = (error?: string) =>
  `w-full bg-bg border rounded-lg px-3 py-2 text-sm text-text outline-none transition-colors ${error ? "border-danger" : "border-border-2 focus:border-accent"}`;

/** Fields shared by the create and edit event dialogs. */
export default function EventFormFields(props: EventFormFieldsProps) {
  const { errors, setErrors } = props;
  const clearError = (key: string) => {
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: "" }));
  };
  const lockedCalendar = props.lockedCalendarId
    ? props.calendars.find((calendar) => calendar.id === props.lockedCalendarId)
    : undefined;

  const dateField = (
    key: string,
    label: string,
    type: "date" | "datetime-local",
    value: string,
    setValue: (value: string) => void,
    min?: string,
  ) => (
    <div className="flex flex-col gap-1">
      <label className={LABEL} htmlFor={`event-${key}`}>{label}</label>
      <input
        id={`event-${key}`}
        type={type}
        value={value}
        min={min}
        aria-invalid={Boolean(errors[key])}
        onChange={(e) => {
          setValue(e.target.value);
          clearError(key);
        }}
        className={fieldClass(errors[key])}
      />
      {errors[key] && <span className="text-xs text-danger">{errors[key]}</span>}
    </div>
  );

  return (
    <>
      <div className="flex flex-col gap-1">
        <input
          autoFocus
          aria-label="Event title"
          aria-invalid={Boolean(errors.title)}
          className={`w-full bg-transparent border-b px-0 py-2 text-base font-semibold text-text outline-none placeholder:text-text-3 transition-colors ${errors.title ? "border-danger" : "border-border-2 focus:border-accent"}`}
          placeholder={props.titlePlaceholder}
          value={props.title}
          onChange={(e) => {
            props.setTitle(e.target.value);
            clearError("title");
          }}
          onKeyDown={(e) => e.key === "Enter" && !props.saving && props.onSubmit()}
        />
        {errors.title && <span className="text-xs text-danger">{errors.title}</span>}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-text-2" id="event-all-day-label">All day</span>
        <button
          type="button"
          role="switch"
          aria-checked={props.allDay}
          aria-labelledby="event-all-day-label"
          onClick={props.onToggleAllDay}
          className={`relative rounded-full transition-colors ${props.allDay ? "bg-accent" : "bg-border-2"}`}
          style={{ height: 22, width: 40 }}
        >
          <div
            className={`absolute top-[3px] w-4 h-4 rounded-full bg-white shadow transition-transform ${props.allDay ? "translate-x-[19px]" : "translate-x-[3px]"}`}
          />
        </button>
      </div>

      {props.allDay ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {dateField("date", "Start date", "date", props.startDate, props.setStartDate)}
          {dateField("endDate", "End date", "date", props.endDate || props.startDate, props.setEndDate, props.startDate)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {dateField("start", "Start", "datetime-local", props.start, props.setStart)}
          {dateField("end", "End", "datetime-local", props.end, props.setEnd)}
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label className={`flex items-center gap-1.5 ${LABEL}`} htmlFor="event-location">
          <MapPin size={11} /> Location
        </label>
        <input
          id="event-location"
          className="w-full bg-bg border border-border-2 rounded-lg px-3 py-2.5 text-sm text-text outline-none focus:border-accent placeholder:text-text-3 transition-colors"
          placeholder="Add location"
          value={props.location}
          onChange={(e) => props.setLocation(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className={`flex items-center gap-1.5 ${LABEL}`} htmlFor="event-description">
          <AlignLeft size={11} /> Description
        </label>
        <textarea
          id="event-description"
          className="w-full bg-bg border border-border-2 rounded-lg px-3 py-2.5 text-sm text-text outline-none focus:border-accent resize-none placeholder:text-text-3 transition-colors leading-relaxed"
          placeholder="Add description"
          rows={3}
          value={props.description}
          onChange={(e) => props.setDescription(e.target.value)}
        />
      </div>

      {props.lockedCalendarId ? (
        <div className="flex flex-col gap-1">
          <span className={`flex items-center gap-1.5 ${LABEL}`}>
            <CalIcon size={11} /> Calendar
          </span>
          <span className="text-sm text-text-2">
            {lockedCalendar?.summary ?? props.lockedCalendarId}
          </span>
        </div>
      ) : (
        props.calendars.length > 0 && (
          <div className="flex flex-col gap-1">
            <label className={`flex items-center gap-1.5 ${LABEL}`} htmlFor="event-calendar">
              <CalIcon size={11} /> Calendar
            </label>
            <div className="relative">
              <select
                id="event-calendar"
                value={props.calendarId}
                onChange={(e) => props.setCalendarId(e.target.value)}
                className="w-full appearance-none bg-bg border border-border-2 rounded-lg px-3 py-2.5 text-sm text-text outline-none focus:border-accent transition-colors pr-8 cursor-pointer"
              >
                {props.calendars.filter((c) => c.writable).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.summary}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={13}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-3 pointer-events-none"
              />
            </div>
          </div>
        )
      )}
    </>
  );
}
