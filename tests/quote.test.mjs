import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const { pickIndex } = await import(
  'data:text/javascript;base64,' + Buffer.from(await read('assets/home/quote.js')).toString('base64'));

test('金句清单：非空，每条有正文和出处', async () => {
  const quotes = JSON.parse(await read('assets/home/quotes.json'));
  assert.ok(quotes.length >= 10);
  for (const q of quotes) { assert.ok(q.t && q.t.length > 3); assert.ok(q.s); }
  assert.equal(new Set(quotes.map(q => q.t)).size, quotes.length);
  assert.ok(quotes.filter(q => q.k === 'do').length >= 5);
  assert.ok(quotes.filter(q => q.k !== 'do').length >= 10);
});

test('按日期取条：同一天稳定，隔天换下一条，始终在范围内', () => {
  const d1 = new Date(2026, 10, 11, 9), d1b = new Date(2026, 10, 11, 23), d2 = new Date(2026, 10, 12, 9);
  assert.equal(pickIndex(30, d1), pickIndex(30, d1b));
  assert.equal((pickIndex(30, d1) + 1) % 30, pickIndex(30, d2));
  assert.equal(pickIndex(0, d1), -1);
});
