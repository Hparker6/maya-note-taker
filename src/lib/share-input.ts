import "server-only";
import { badRequest } from "./http";
import { DEFAULT_INCLUDE, type ShareInclude, type ShareScope } from "./share";

export function shareScope(value: unknown): ShareScope {
  if (value === "class" || value === "unit" || value === "note") return value;
  throw badRequest("scope must be class, unit or note.");
}

export function shareId(value: unknown): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw badRequest("id is invalid.");
  return id;
}

/** Include flags from a JSON object or query parameters ("0" turns a part off). */
export function shareInclude(read: (key: keyof ShareInclude) => unknown): ShareInclude {
  const flag = (key: keyof ShareInclude) => {
    const v = read(key);
    return v === undefined || v === null ? DEFAULT_INCLUDE[key] : !(v === false || v === "0" || v === "false");
  };
  return { notes: flag("notes"), lectures: flag("lectures"), sheets: flag("sheets"), practice: flag("practice") };
}

/** Content-Disposition for a download, safe for any title. */
export function attachment(fileName: string) {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
