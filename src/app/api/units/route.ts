import { handler, notFound, optionalInt, readJson, text } from "@/lib/http";
import { createUnit, getSection } from "@/lib/repo";

export const POST = handler(async (request: Request) => {
  const body = await readJson(request);
  const sectionId = optionalInt(body.section_id);
  if (!sectionId || !getSection(sectionId)) throw notFound("Section not found.");
  const id = createUnit(sectionId, text(body.name, "Unit name"));
  return Response.json({ id }, { status: 201 });
});
