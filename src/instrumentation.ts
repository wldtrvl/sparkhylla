import type { Instrumentation } from "next";

/** Every server error also goes to app_errors, visible on the coach page. */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { recordServerError } = await import("@/lib/errors");
  await recordServerError(err, request, context).catch((e) => console.error("could not record error", e));
};
