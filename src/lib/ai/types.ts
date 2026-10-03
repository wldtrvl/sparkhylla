export type Provider = "anthropic" | "google" | "openai";

/** Every AI use in the app is one of these tasks. Routing, prompts and analytics key on it. */
export type Task =
  | "gloss" // explain a word/phrase in context
  | "talk_open" // tutor's first line in a role-play
  | "tutor_turn" // tutor reply + silent error notes
  | "talk_help" // "help me say it"
  | "talk_feedback" // post-conversation feedback
  | "explain" // grammar explanation + exercise
  | "judge"; // offline evaluation of other models' outputs

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface CompletionRequest {
  model: string;
  system?: string;
  messages: ChatMessage[];
  maxTokens: number;
  temperature?: number;
  /** Ask the provider for a JSON-only reply where it supports that. */
  json?: boolean;
  /** Disable extended "thinking" where the provider supports it (faster, cheaper short tasks). */
  lowLatency?: boolean;
  signal?: AbortSignal;
}

export interface CompletionResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export interface ProviderAdapter {
  name: Provider;
  available(): boolean;
  complete(req: CompletionRequest): Promise<CompletionResult>;
}

export interface Route {
  provider: Provider;
  model: string;
  weight: number;
}

/** A versioned prompt. Bump `version` whenever the wording changes, so analytics can compare versions. */
export interface PromptSpec {
  id: string;
  version: number;
  system: string;
  messages: ChatMessage[];
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly retryable = false,
  ) {
    super(message);
  }
}
