// LLM wrapper with three backends:
//   1. DRY_RUN=true            → deterministic mocks, fully offline
//   2. USE_CLAUDE_CODE=true    → Claude Code CLI headless mode (`claude -p`).
//      Runs on a Claude Pro/Max subscription's included usage — no API key,
//      no per-token billing. Requires `claude login` on the machine.
//   3. otherwise               → Anthropic API SDK (ANTHROPIC_API_KEY, per-token)
import { execFile } from 'node:child_process';
import { DRY_RUN } from '../config.js';

const USE_CLAUDE_CODE = process.env.USE_CLAUDE_CODE === 'true'
  || (!process.env.ANTHROPIC_API_KEY && process.env.USE_CLAUDE_CODE !== 'false');

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

  if (USE_CLAUDE_CODE) {
    const prompt = [
      system, '', user, '',
      'Respond with ONLY a JSON object (no prose, no markdown fences) matching this JSON Schema:',
      JSON.stringify(schema),
    ].join('\n');
    return parseJson(await claudeCode(prompt));
  }

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

/** Ask Claude for long-form text. */
export async function askText({ system, user, mock, maxTokens = 16000 }) {
  if (DRY_RUN) return mock();

  if (USE_CLAUDE_CODE) {
    return claudeCode(`${system}\n\n${user}`);
  }

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

// --- Claude Code CLI backend (subscription usage, not API billing) ---

function claudeCode(prompt) {
  return new Promise((resolve, reject) => {
    const child = execFile(
      'claude',
      ['-p', '--output-format', 'json', '--model', 'opus'],
      { maxBuffer: 10 * 1024 * 1024, timeout: 10 * 60 * 1000 },
      (err, stdout, stderr) => {
        if (err) {
          return reject(new Error(
            `claude CLI failed (is Claude Code installed and logged in? \`claude login\`): ${stderr || err.message}`
          ));
        }
        try {
          const parsed = JSON.parse(stdout);
          if (parsed.is_error) return reject(new Error(`claude CLI error: ${parsed.result}`));
          resolve(parsed.result ?? '');
        } catch {
          // Older CLI versions may print plain text
          resolve(stdout.trim());
        }
      }
    );
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

function parseJson(text) {
  // Tolerate markdown fences or a stray preamble around the JSON object
  const cleaned = text.replace(/```(?:json)?/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error(`Expected JSON from Claude, got: ${text.slice(0, 200)}`);
  return JSON.parse(cleaned.slice(start, end + 1));
}
