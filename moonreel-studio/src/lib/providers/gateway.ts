import { env } from "@/lib/env";

const GATEWAY_HOST = "https://gateway.ai.cloudflare.com/v1";
const CHAT_TIMEOUT_MS = 240_000;

export class GatewayError extends Error {}

// "Provider 'deepseek' has no BYOK credential named 'default'. Configured aliases: 'my-deepseek-key'"
const MISSING_ALIAS = /no BYOK credential named '[^']*'\. Configured aliases: (.+?)"/;

/** Alias learned from the gateway's own error, used when CF_AIG_BYOK_ALIAS is not set. */
let learnedAlias: string | undefined;

/** The gateway's OpenAI-compatible base URL, or null when script writing stays on Muse. */
function baseUrl() {
  const { CF_AIG_BASE_URL, CF_AIG_ACCOUNT_ID, CF_AIG_GATEWAY_ID } = env();
  if (CF_AIG_BASE_URL) return CF_AIG_BASE_URL.replace(/\/+$/, "");
  if (CF_AIG_ACCOUNT_ID) return `${GATEWAY_HOST}/${CF_AIG_ACCOUNT_ID}/${CF_AIG_GATEWAY_ID || "default"}/compat`;
  return null;
}

/** True when scripts should be written through Cloudflare AI Gateway instead of Muse. */
export function gatewayConfigured() {
  const { CF_AIG_TOKEN, CF_AIG_PROVIDER_KEY } = env();
  return !!baseUrl() && !!(CF_AIG_TOKEN || CF_AIG_PROVIDER_KEY);
}

/**
 * One chat turn through Cloudflare AI Gateway's `/compat/chat/completions`, with the model
 * named as `provider/model` (e.g. `deepseek/deepseek-chat`) or `dynamic/<route>`.
 *
 * Auth: with only a Cloudflare token, it is the API key (the provider key is stored on the
 * gateway, BYOK); with a provider key, that key is sent and the token goes in
 * `cf-aig-authorization`.
 */
export async function gatewayChat(prompt: string): Promise<string> {
  const url = baseUrl();
  const { CF_AIG_TOKEN, CF_AIG_PROVIDER_KEY, CF_AIG_GATEWAY_ID, CF_AIG_BYOK_ALIAS, SCRIPT_MODEL } = env();
  if (!url) throw new GatewayError("Cloudflare AI Gateway is not configured");

  const alias = CF_AIG_BYOK_ALIAS || learnedAlias;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (CF_AIG_GATEWAY_ID) headers["cf-aig-gateway-id"] = CF_AIG_GATEWAY_ID; // required for dynamic/... routes
  // The gateway looks for a stored key named "default"; a key stored under another name must be named.
  if (alias) headers["cf-aig-byok-alias"] = alias;
  if (CF_AIG_PROVIDER_KEY) {
    headers.Authorization = `Bearer ${CF_AIG_PROVIDER_KEY}`;
    if (CF_AIG_TOKEN) headers["cf-aig-authorization"] = `Bearer ${CF_AIG_TOKEN}`;
  } else {
    headers.Authorization = `Bearer ${CF_AIG_TOKEN}`;
  }

  const res = await fetch(`${url}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({ model: SCRIPT_MODEL, messages: [{ role: "user", content: prompt }] }),
    signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),
  });
  const text = await res.text();
  if (!res.ok) {
    // A gateway with exactly one stored key tells us its name: use it instead of failing.
    const aliases = !alias && text.match(MISSING_ALIAS)?.[1].match(/'([^']+)'/g);
    if (aliases && aliases.length === 1) {
      learnedAlias = aliases[0].slice(1, -1);
      console.warn(`[gateway] using BYOK alias '${learnedAlias}'; set CF_AIG_BYOK_ALIAS=${learnedAlias} in .env to skip this lookup`);
      return gatewayChat(prompt);
    }
    throw new GatewayError(`AI Gateway ${res.status}: ${text.slice(0, 500)}`);
  }
  const content = (JSON.parse(text) as { choices?: { message?: { content?: string | null } }[] })
    .choices?.[0]?.message?.content;
  if (!content) throw new GatewayError("AI Gateway returned an empty chat response");
  return content;
}
