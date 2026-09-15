import "server-only";
import { sanitizeRichHtml } from "./html";
import { badRequest, notFound, optionalInt, text } from "./http";
import type { ManualEventInput } from "./calendar";
import { getClass, getUnitContext } from "./repo";
import { EVENT_KINDS, type EventKind } from "./types";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function eventKind(value: unknown): EventKind {
  if (typeof value === "string" && (EVENT_KINDS as readonly string[]).includes(value)) return value as EventKind;
  throw badRequest("Unknown event type.");
}

function optionalNumber(value: unknown, field: string, max: number): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > max) throw badRequest(`${field} must be a number between 0 and ${max}.`);
  return n;
}

function timestamp(value: unknown, field: string, allDay: boolean): string {
  if (typeof value !== "string") throw badRequest(`${field} is required.`);
  if (allDay) {
    if (!DATE.test(value)) throw badRequest(`${field} must be a date.`);
    return value;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw badRequest(`${field} must be a date and time.`);
  return date.toISOString();
}

export function classAndUnit(body: Record<string, unknown>) {
  const classId = optionalInt(body.class_id) ?? null;
  const unitId = optionalInt(body.unit_id) ?? null;
  if (classId && !getClass(classId)) throw notFound("Class not found.");
  if (unitId) {
    const ctx = getUnitContext(unitId);
    if (!ctx) throw notFound("Unit not found.");
    if (classId && ctx.klass.id !== classId) throw badRequest("That unit belongs to a different class.");
  }
  return { class_id: classId, unit_id: unitId };
}

export function manualEventInput(body: Record<string, unknown>): ManualEventInput {
  const allDay = Boolean(body.all_day);
  const startsAt = timestamp(body.starts_at, "Start", allDay);
  const endsAt = body.ends_at ? timestamp(body.ends_at, "End", allDay) : null;
  if (endsAt && endsAt < startsAt) throw badRequest("The end must be after the start.");
  const description = text(body.description, "Details", { max: 20_000, required: false });
  return {
    title: text(body.title, "Title"),
    kind: eventKind(body.kind ?? "other"),
    ...classAndUnit(body),
    starts_at: startsAt,
    ends_at: endsAt,
    all_day: allDay,
    location: text(body.location, "Location", { max: 200, required: false }),
    description: description
      ? sanitizeRichHtml(
          description
            .split(/\n{2,}/)
            .map((p) => `<p>${p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>")}</p>`)
            .join(""),
        )
      : "",
    points: optionalNumber(body.points, "Points", 100_000),
    weight: optionalNumber(body.weight, "Grade weight", 100),
  };
}
