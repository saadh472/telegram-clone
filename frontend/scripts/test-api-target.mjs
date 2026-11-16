import assert from 'node:assert/strict';

const location = new URL('https://telegram.example/?api=https://untrusted.example/api');
globalThis.window = { location };
globalThis.document = { querySelector: () => null };
globalThis.localStorage = { getItem: () => 'test-token' };
let request;
globalThis.fetch = async (url, options) => {
  request = { url, options };
  return new Response(JSON.stringify({ status: 'ok' }));
};

const { apiFetch, checkBackendHealth } = await import('../js/models/apiModel.js');
await apiFetch('/chats/42/messages?limit=50');
assert.equal(request.url, 'https://telegram.example/api/chats/42/messages?limit=50');
assert.equal(request.options.headers.Authorization, 'Bearer test-token');
assert.equal(request.options.redirect, 'error');
await assert.rejects(apiFetch('/chats/42/../../users/offline'), /Unexpected API route/);
assert.match(request.url, /\/chats\/42\/messages\?/);

assert.equal(await checkBackendHealth(), true);
assert.equal(request.url, 'https://telegram.example/api/health');
assert.equal(request.options.redirect, 'error');

window.TELEGRAM_API_BASE = 'https://configured.example/api/';
const { API_BASE } = await import('../js/config.js?deployment');
assert.equal(API_BASE, 'https://configured.example/api');
console.log('API target regression passed');
