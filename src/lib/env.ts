/**
 * Environment access in one place. Public values are inlined by Next.js at build time;
 * server values are read lazily so a missing optional key only disables that feature.
 */
export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  appVersion: process.env.NEXT_PUBLIC_APP_VERSION ?? "0.1.0",
};

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}. See .env.example.`);
  return v;
}

export const serverEnv = {
  supabaseServiceRoleKey: () => required("SUPABASE_SERVICE_ROLE_KEY"),
  anthropicKey: () => process.env.ANTHROPIC_API_KEY ?? "",
  googleKey: () => process.env.GEMINI_API_KEY ?? "",
  openaiKey: () => process.env.OPENAI_API_KEY ?? "",
  googleTtsKey: () => process.env.GOOGLE_TTS_API_KEY ?? "",
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
