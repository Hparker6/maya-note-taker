import { handler, notFound, optionalInt, readJson, text } from "@/lib/http";
import { createSection, getClass } from "@/lib/repo";

export const POST = handler(async (request: Request) => {
  const body = await readJson(request);
  const classId = optionalInt(body.class_id);
  if (!classId || !getClass(classId)) throw notFound("Class not found.");
  const id = createSection(classId, text(body.name, "Section name"));
  return Response.json({ id }, { status: 201 });
});
