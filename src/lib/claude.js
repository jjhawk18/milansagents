// Claude client wrapper. In DRY_RUN mode every call returns a deterministic
// mock (supplied by the caller) so the pipeline runs offline.
import { DRY_RUN } from '../config.js';

let _client = null;
async function client() {
  if (!_client) {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    _client = new Anthropic();
  }
  return _client;
}

const MODEL = 'claude-opus-4-8';

/**
 * Ask Claude for a JSON object conforming to `schema` (JSON Schema).
 * `mock` is a function returning the offline stand-in response.
 */
export async function askJSON({ system, user, schema, mock, maxTokens = 4096 }) {
  if (DRY_RUN) return mock();
  const c = await client();
  const response = await c.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    thinking: { type: 'adaptive' },
    system,
    messages: [{ role: 'user', content: user }],
    output_config: { format: { type: 'json_schema', schema } },
  });
  if (response.stop_reason === 'refusal') {
    throw new Error('Claude refused this request — flag story for manual review');
  }
  const text = response.content.find(b => b.type === 'text')?.text ?? '{}';
  return JSON.parse(text);
}

/** Ask Claude for long-form text (streams to avoid timeouts on long outputs). */
export async function askText({ system, user, mock, maxTokens = 16000 }) {
  if (DRY_RUN) return mock();
  const c = await client();
  const stream = c.messages.stream({
    model: MODEL,
    max_tokens: maxTokens,
    thinking: { type: 'adaptive' },
    system,
    messages: [{ role: 'user', content: user }],
  });
  const message = await stream.finalMessage();
  if (message.stop_reason === 'refusal') {
    throw new Error('Claude refused this request — flag story for manual review');
  }
  return message.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
}
