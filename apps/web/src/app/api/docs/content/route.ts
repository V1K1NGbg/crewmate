import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { extractDocumentText, getDocsClient, isRevisionConflict } from "@crewmate/lib/server";
import { googleErrorResponse } from "@/lib/google-error-response";
import { isResourceId, readJsonObject } from "@/lib/requestValidation";

const MAX_CONTENT_LENGTH = 2_000_000;

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
  if (!isResourceId(docId))
    return NextResponse.json(
      { error: "Missing or invalid id parameter" },
      { status: 400 },
    );

  const docs = getDocsClient(session.accessToken);

  try {
    const doc = await docs.documents.get({ documentId: docId });
    const { text, unsupportedStructure } = extractDocumentText(doc.data.body?.content);
    return NextResponse.json({
      documentId: doc.data.documentId,
      title: doc.data.title,
      content: text,
      revisionId: doc.data.revisionId,
      unsupportedStructure,
    });
  } catch (err: unknown) {
    return googleErrorResponse(err, "docs/content GET");
  }
}

/**
 * PUT /api/docs/content
 * Body: { id: string, content: string, revisionId: string }
 * Replaces entire document content with the provided text, failing with 409
 * when the document changed after `revisionId` was read.
 */
export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.accessToken)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = await readJsonObject(req, MAX_CONTENT_LENGTH * 2);
  if (!payload) return NextResponse.json({ error: "Malformed or oversized JSON body" }, { status: 400 });
  const { id, content, revisionId } = payload;
  if (
    !isResourceId(id) ||
    typeof content !== "string" ||
    content.length > MAX_CONTENT_LENGTH ||
    typeof revisionId !== "string" ||
    !revisionId ||
    revisionId.length > 512
  )
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

    if (requests.length === 0) {
      if (doc.data.revisionId && doc.data.revisionId !== revisionId) {
        return NextResponse.json(
          { error: "The document changed in Google Docs", code: "REVISION_CONFLICT" },
          { status: 409 },
        );
      }
      return NextResponse.json({ ok: true, revisionId });
    }
    const result = await docs.documents.batchUpdate({
      documentId: id,
      requestBody: {
        requests,
        writeControl: { requiredRevisionId: revisionId },
      },
    });
    // The batchUpdate response carries the revision produced by *this* write,
    // so a concurrent edit after it cannot be mistaken for our own revision.
    const newRevisionId =
      result.data.writeControl?.requiredRevisionId ??
      (await docs.documents.get({ documentId: id, fields: "revisionId" })).data.revisionId;
    return NextResponse.json({ ok: true, revisionId: newRevisionId });
  } catch (err: unknown) {
    if (isRevisionConflict(err)) {
      return NextResponse.json(
        { error: "The document changed in Google Docs", code: "REVISION_CONFLICT" },
        { status: 409 },
      );
    }
    return googleErrorResponse(err, "docs/content PUT");
  }
}
