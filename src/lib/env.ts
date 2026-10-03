/**
 * Environment access in one place. Public values are inlined by Next.js at build time;
 * server values are read lazily so a missing optional key only disables that feature.
 */
/**
 * Accepts what people paste from the Supabase dashboard ("https://x.supabase.co/rest/v1/", trailing slash,
 * surrounding spaces) and returns the bare project URL the client libraries expect.
 */
export function normalizeSupabaseUrl(raw: string | undefined): string {
  return (raw ?? "")
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/(rest|auth|storage)\/v1$/, "")
    .replace(/\/+$/, "");
}

export const publicEnv = {
  supabaseUrl: normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim(),
  appVersion: process.env.NEXT_PUBLIC_APP_VERSION ?? "0.1.0",
};

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}. See .env.example.`);
  return v;
}

export const serverEnv = {
  supabaseServiceRoleKey: () => required("SUPABASE_SERVICE_ROLE_KEY").trim(),
  anthropicKey: () => (process.env.ANTHROPIC_API_KEY ?? "").trim(),
  googleKey: () => (process.env.GEMINI_API_KEY ?? "").trim(),
  openaiKey: () => (process.env.OPENAI_API_KEY ?? "").trim(),
  googleTtsKey: () => (process.env.GOOGLE_TTS_API_KEY ?? "").trim(),
  /** Gemini model used for speech-to-text */
  geminiSttModel: () => process.env.GEMINI_STT_MODEL ?? "gemini-3.8-flash",
  /** JSON: {"gloss":[{"provider":"google","model":"gemini-2.5-flash","weight":1}], ...} */
  aiRoutes: () => process.env.AI_ROUTES ?? "",
  /** JSON: {"google:gemini-x":{"in":0.3,"out":2.5}} — USD per million tokens */
  priceOverrides: () => process.env.AI_PRICE_OVERRIDES ?? "",
  /** "openai,google" — order to try for speech-to-text */
  sttProviders: () => (process.env.STT_PROVIDERS ?? "openai,google").split(",").map((s) => s.trim()).filter(Boolean),
  /** "google,openai" — order to try for text-to-speech */
  ttsProviders: () => (process.env.TTS_PROVIDERS ?? "google,openai").split(",").map((s) => s.trim()).filter(Boolean),
  ttsVoiceNo: () => process.env.TTS_VOICE_NO ?? "",
  ttsVoiceEn: () => process.env.TTS_VOICE_EN ?? "",
  /** Store full prompts and responses in llm_calls (useful for analysis; contains learner text). */
  logAiPayloads: () => (process.env.LOG_AI_PAYLOADS ?? "true") === "true",
};
