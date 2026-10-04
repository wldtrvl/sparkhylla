import { NextResponse, type NextRequest } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Local development sign-in without email (Supabase's built-in mailer allows only a few emails an hour).
 * Signs in DEV_LOGIN_EMAIL from .env.local. Exists only under `next dev`; production builds answer 404.
 * The service role mints a one-time magic-link token and the cookie client redeems it at once.
 */
export async function POST(request: NextRequest) {
  const email = process.env.DEV_LOGIN_EMAIL?.trim();
  if (process.env.NODE_ENV !== "development" || !email) return new NextResponse(null, { status: 404 });
  const origin = request.nextUrl.origin;
  const { data, error } = await adminClient().auth.admin.generateLink({ type: "magiclink", email });
  if (error) {
    console.error("dev sign-in: generateLink failed:", error.message);
    return NextResponse.redirect(`${origin}/login?error=dev`, 303);
  }
  const supabase = await createClient();
  const verified = await supabase.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: "magiclink" });
  if (verified.error) {
    console.error("dev sign-in: verifyOtp failed:", verified.error.message);
    return NextResponse.redirect(`${origin}/login?error=dev`, 303);
  }
  return NextResponse.redirect(`${origin}/`, 303);
}
