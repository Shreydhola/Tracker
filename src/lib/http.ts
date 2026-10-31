import { NextResponse } from "next/server";
import { ZodError } from "zod";
export function failure(e: unknown) {
  const m = e instanceof Error ? e.message : "Request failed";
  const status =
    m === "UNAUTHORIZED"
      ? 401
      : m === "FORBIDDEN"
        ? 403
        : m === "RATE_LIMIT"
          ? 429
          : e instanceof SyntaxError ||
              e instanceof ZodError ||
              m.startsWith("VALIDATION:")
            ? 400
            : 500;
  if (status === 500)
    console.error("Request failed", e instanceof Error ? e.name : "Unknown");
  return NextResponse.json(
    {
      error:
        status === 500
          ? "Operation failed. Check server logs and configuration."
          : m,
    },
    { status },
  );
}
