const test = require('node:test'); const assert = require('node:assert');
const LLM = require('../js/llm.js'); const KB = require('../js/kb.js'); const H = require('../js/handbook.js');
const msg = { system: 'sys', messages: [{ role: 'user', content: 'hi' }], json: true };
test('Anthropic requests carry the direct-browser-access header and the key only in x-api-key', () => {
  const r = LLM.buildRequest({ provider: 'anthropic', key: 'sk-ant-fake', model: 'claude-haiku-4-5' }, msg);
  assert.strictEqual(r.init.headers['anthropic-dangerous-direct-browser-access'], 'true'); assert.strictEqual(r.init.headers['x-api-key'], 'sk-ant-fake'); assert.ok(!r.init.body.includes('sk-ant-fake'));
});
test('Gemini puts the key in x-goog-api-key, not the URL', () => { const r = LLM.buildRequest({ provider: 'gemini', key: 'AIzaFAKE', model: 'gemini-2.5-flash' }, msg); assert.ok(!r.url.includes('AIzaFAKE')); assert.strictEqual(r.init.headers['x-goog-api-key'], 'AIzaFAKE'); });
test('OpenAI-compatible uses the base URL and OpenRouter headers', () => { const r = LLM.buildRequest({ provider: 'compatible', key: 'k', baseUrl: 'https://openrouter.ai/api/v1/', model: 'openai/gpt-5-mini' }, msg); assert.strictEqual(r.url, 'https://openrouter.ai/api/v1/chat/completions'); assert.match(r.init.headers['HTTP-Referer'], /onboardpilot-ai/); assert.strictEqual(r.init.headers['X-Title'], 'OnboardPilot AI'); });
test('Ollama needs no key', () => { const r = LLM.buildRequest({ provider: 'compatible', baseUrl: 'http://localhost:11434/v1', model: 'llama3.2' }, msg); assert.ok(!r.init.headers.authorization); });
for (const [provider, status, body] of [['openai', 401, { error: { message: 'Incorrect API key provided' } }], ['anthropic', 401, { error: { type: 'authentication_error', message: 'invalid x-api-key' } }], ['gemini', 400, { error: { message: 'API key not valid. Please pass a valid API key.' } }], ['compatible', 401, { error: { message: 'No auth credentials found' } }]]) {
  test(provider + ' bad key gives a readable error', async () => {
    const fetch = async () => ({ ok: false, status, text: async () => JSON.stringify(body) });
    await assert.rejects(LLM.call({ provider, key: 'bad-key-123', model: LLM.PROVIDERS[provider].defaultModel, baseUrl: provider === 'compatible' ? 'https://openrouter.ai/api/v1' : '' }, msg, { fetch }), /key was rejected/);
  });
}
test('a CORS-less OpenAI failure explains itself', async () => { await assert.rejects(LLM.call({ provider: 'openai', key: 'bad' }, msg, { fetch: async () => { throw new TypeError('Failed to fetch'); } }), /CORS header/); });
test('end to end with a mocked provider: the reply is parsed and checked', async () => {
  const kb = KB.build(H.DOCS); const p = KB.buildPrompt(kb, 'How many PTO days do I get?', null, []);
  for (const provider of ['openai', 'anthropic', 'gemini', 'compatible']) {
    const answer = JSON.stringify({ answer: 'You earn 20 days a year [time-off#paid-time-off].', citations: ['time-off#paid-time-off'], abstain: false, route: null });
    const reply = provider === 'anthropic' ? { content: [{ type: 'text', text: answer }], usage: { input_tokens: 900, output_tokens: 40 } } : provider === 'gemini' ? { candidates: [{ content: { parts: [{ text: answer }] } }], usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 40 } } : { choices: [{ message: { content: answer } }], usage: { prompt_tokens: 900, completion_tokens: 40 } };
    let sent = null; const fetch = async (url, init) => { sent = init; return { ok: true, status: 200, text: async () => JSON.stringify(reply) }; };
    const r = await LLM.call({ provider, key: 'test-key-not-real', model: LLM.PROVIDERS[provider].defaultModel, baseUrl: provider === 'compatible' ? 'http://localhost:11434/v1' : '' }, p, { fetch });
    const a = KB.parseModelAnswer(kb, r.text, p.sectionIds, 'pto'); assert.strictEqual(a.type, 'answer', provider); assert.strictEqual(a.text, 'You earn 20 days a year [1].');
    assert.ok(!sent.body.includes('test-key-not-real')); assert.ok(r.usage.input === 900);
  }
});
