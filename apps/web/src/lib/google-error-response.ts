import { NextResponse } from "next/server";
import { mapGoogleApiError } from "@crewmate/lib/server";

export function googleErrorResponse(error: unknown, context: string) {
  const failure = mapGoogleApiError(error);
  const correlationId = crypto.randomUUID();
  console.error(`[${context}] ${correlationId}`, error);
  return NextResponse.json(
    { error: failure.message, code: failure.code, retryable: failure.retryable, correlationId },
    { status: failure.status },
  );
}
