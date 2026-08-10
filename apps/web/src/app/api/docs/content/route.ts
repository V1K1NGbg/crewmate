import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { getDocsClient } from "@crewmate/lib/server";
import { googleErrorResponse } from "@/lib/google-error-response";

/**
 * GET /api/docs/content?id=<documentId>
 * Returns the plain-text content of the document.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.accessToken)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const docId = searchParams.get("id");
  if (!docId)
    return NextResponse.json(
      { error: "Missing id parameter" },
      { status: 400 },
    );

  const docs = getDocsClient(session.accessToken);

  try {
    const doc = await docs.documents.get({ documentId: docId });
    const body = doc.data.body;
    let text = "";
    if (body?.content) {
      for (const el of body.content) {
        if (el.paragraph?.elements) {
          for (const e of el.paragraph.elements) {
            if (e.textRun?.content) text += e.textRun.content;
          }
        }
      }
    }
    return NextResponse.json({
      documentId: doc.data.documentId,
      title: doc.data.title,
      content: text,
      revisionId: doc.data.revisionId,
    });
  } catch (err: unknown) {
    return googleErrorResponse(err, "docs/content GET");
  }
}

/**
 * PUT /api/docs/content
 * Body: { id: string, content: string }
 * Replaces entire document content with the provided text.
 */
export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.accessToken)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, content, revisionId } = (await req.json()) as {
    id: string;
    content: string;
    revisionId: string;
  };
  if (!id || typeof content !== "string" || content.length > 2_000_000 || !revisionId)
    return NextResponse.json(
      { error: "id, content, and revisionId are required" },
      { status: 400 },
    );

  const docs = getDocsClient(session.accessToken);

  try {
    // Get the doc to find the end index
    const doc = await docs.documents.get({ documentId: id });
    const body = doc.data.body;
    const endIndex =
      body?.content?.[body.content.length - 1]?.endIndex ?? 1;

    const requests: Array<Record<string, unknown>> = [];

    // Delete existing content (leave the trailing newline at index 1)
    if (endIndex > 2) {
      requests.push({
        deleteContentRange: {
          range: { startIndex: 1, endIndex: endIndex - 1 },
        },
      });
    }

    // Insert new content
    if (content) {
      requests.push({
        insertText: {
          location: { index: 1 },
          text: content,
        },
      });
    }

    if (requests.length > 0) {
      await docs.documents.batchUpdate({
        documentId: id,
        requestBody: {
          requests,
          writeControl: { requiredRevisionId: revisionId },
        },
      });
    }
    const updated = await docs.documents.get({ documentId: id });
    return NextResponse.json({ ok: true, revisionId: updated.data.revisionId });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/revision|requiredRevisionId|failed precondition/i.test(msg)) {
      return NextResponse.json(
        { error: "The document changed in Google Docs", code: "REVISION_CONFLICT" },
        { status: 409 },
      );
    }
    return googleErrorResponse(err, "docs/content PUT");
  }
}
