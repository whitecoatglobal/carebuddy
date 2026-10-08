export class TokenHubError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = "TokenHubError";
  }
}

export interface TokenHubMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_TOKENS = 1024;
const MAX_RESPONSE_CHARACTERS = 8000;
const CONFIGURATION_ERROR =
  "Buddy AI is not configured. Add the TokenHub settings on the server.";

function configuration() {
  const key = process.env.TOKENHUB_API_KEY?.trim();
  const base = process.env.TOKENHUB_BASE_URL?.trim();
  const model = process.env.TOKENHUB_MODEL?.trim();
  if (!key || !base || !model) {
    throw new TokenHubError(CONFIGURATION_ERROR, 503, "AI_NOT_CONFIGURED");
  }
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    throw new TokenHubError(CONFIGURATION_ERROR, 503, "AI_NOT_CONFIGURED");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname.replace(/\/$/, "") !== "/v1"
  ) {
    throw new TokenHubError(CONFIGURATION_ERROR, 503, "AI_NOT_CONFIGURED");
  }
  return { key, model, endpoint: `${url.origin}/v1/chat/completions` };
}

export function isTokenHubConfigured(): boolean {
  try {
    configuration();
    return true;
  } catch {
    return false;
  }
}

export async function completeBuddyChat(
  messages: TokenHubMessage[],
  limits: { maxTokens?: number; maxCharacters?: number } = {},
): Promise<string> {
  const config = configuration();
  try {
    const response = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.key}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        thinking: { type: "disabled" },
        stream: false,
        max_tokens: Math.min(limits.maxTokens ?? MAX_RESPONSE_TOKENS, 4096),
      }),
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new TokenHubError(
        "Buddy's AI provider could not complete the request. Please try again later.",
        502,
        "AI_PROVIDER_ERROR",
      );
    }
    const data = (await response.json()) as {
      choices?: { finish_reason?: string; message?: { content?: unknown } }[];
    };
    const choice = data?.choices?.[0];
    const text = choice?.message?.content;
    if (
      typeof text !== "string" ||
      !text.trim() ||
      text.length >
        Math.min(limits.maxCharacters ?? MAX_RESPONSE_CHARACTERS, 24000) ||
      choice?.finish_reason === "length" ||
      choice?.finish_reason === "content_filter" ||
      choice?.finish_reason === "tool_calls"
    ) {
      throw new TokenHubError(
        "Buddy received an incomplete AI response. Please try again.",
        502,
        "AI_INVALID_RESPONSE",
      );
    }
    return text.trim();
  } catch (error) {
    if (error instanceof TokenHubError) throw error;
    if (
      error instanceof Error &&
      ["TimeoutError", "AbortError"].includes(error.name)
    ) {
      throw new TokenHubError(
        "Buddy's AI request timed out. Please try again.",
        504,
        "AI_TIMEOUT",
      );
    }
    throw new TokenHubError(
      "Buddy's AI provider is unavailable. Please try again later.",
      502,
      "AI_PROVIDER_ERROR",
    );
  }
}
