import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { isAuthError } from "@/lib/googleApiError";
import { getDriveClient, getDocsClient } from "@/lib/google";

const DOC_NAME = "Crewmate Notes";

/**
 * POST /api/docs/init
 * Finds or creates the single "Crewmate Notes" Google Doc.
 * Returns { documentId, title }.
 */
export async function POST() {
  const session = await auth();
  if (!session?.accessToken)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const drive = getDriveClient(session.accessToken);
  const docs = getDocsClient(session.accessToken);

  try {
    // Search for an existing doc we created
    const search = await drive.files.list({
      q: `name='${DOC_NAME}' and mimeType='application/vnd.google-apps.document' and trashed=false`,
      fields: "files(id,name)",
      pageSize: 1,
    });

    if (search.data.files && search.data.files.length > 0) {
      const file = search.data.files[0];
      return NextResponse.json({
        documentId: file.id,
        title: file.name,
      });
    }

    // Create a new doc
    const created = await docs.documents.create({
      requestBody: { title: DOC_NAME },
    });

    return NextResponse.json({
      documentId: created.data.documentId,
      title: created.data.title,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[docs/init]", err);
    if (isAuthError(err))
      return NextResponse.json({ error: msg || "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
