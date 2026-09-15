import { isClassColor } from "@/lib/colors";
import { badRequest, handler, readJson, text } from "@/lib/http";
import { createClass } from "@/lib/repo";

export const POST = handler(async (request: Request) => {
  const body = await readJson(request);
  const color = body.color ?? "sage";
  if (!isClassColor(color)) throw badRequest("Unknown color.");
  const id = createClass({
    name: text(body.name, "Class name"),
    code: text(body.code, "Course code", { max: 40, required: false }),
    color,
  });
  return Response.json({ id }, { status: 201 });
});
