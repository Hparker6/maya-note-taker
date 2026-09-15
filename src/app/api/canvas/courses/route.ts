import { linkCourse } from "@/lib/calendar";
import { canvasStatus } from "@/lib/canvas";
import { badRequest, handler, notFound, optionalInt, readJson } from "@/lib/http";
import { getClass } from "@/lib/repo";

/** Links a Canvas course to one of the student's classes (or unlinks it with class_id: null). */
export const PUT = handler(async (request: Request) => {
  const body = await readJson(request);
  if (typeof body.course_key !== "string" || !body.course_key) throw badRequest("course_key is required.");
  const classId = optionalInt(body.class_id) ?? null;
  if (classId && !getClass(classId)) throw notFound("Class not found.");
  linkCourse(body.course_key, classId);
  return Response.json(canvasStatus());
});
