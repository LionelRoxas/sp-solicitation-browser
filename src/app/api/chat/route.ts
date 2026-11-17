import { z } from "zod";
import { parseIntent } from "@/lib/intent";
import { hybridSearch } from "@/lib/search";
import { appendTurns, getSession, isUuid } from "@/lib/sessions";


const Body = z.object({
  sessionId: z.string().refine(isUuid, "invalid session id"),
  message: z.string().trim().min(1).max(500),
});

export async function POST(req: Request) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  try {
    const history = getSession(body.sessionId);
    const { intent, reply, source } = await parseIntent(history, body.message);
    const results = await hybridSearch(intent, { limit: 40 });
    appendTurns(body.sessionId, [
      { role: "user", content: body.message },
      { role: "assistant", content: reply, intent },
    ]);
    return Response.json({ reply, intent, source, results, total: results.length });
  } catch (e) {
    console.error("chat error:", e);
    return Response.json({ error: "Something went wrong" }, { status: 500 });
  }
}
