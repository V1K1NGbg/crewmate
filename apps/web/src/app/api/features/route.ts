import { NextResponse } from "next/server";
import { getInstalledFeatures } from "@/lib/features.server";
import { auth, localAuthEnabled } from "@/auth";

export async function GET() {
  const session = await auth();
  if (!session || (localAuthEnabled && !session.localOwner)) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  return NextResponse.json({ features: getInstalledFeatures() }, { headers: { "Cache-Control": "no-store" } });
}
