'use strict';

// Test harness for api/contact.js — end-to-end request → Brevo flow.
// Run with: node test/contact_flow.test.js
// Uses only Node built-ins (assert) with a mocked global.fetch; no network
// and no real email is ever sent.

process.env.BREVO_API_KEY = 'test-brevo-key';
process.env.BREVO_FROM_EMAIL = 'noreply@example.com';
process.env.BREVO_TO_EMAIL = 'contact@example.com';

const assert = require('assert');
const handler = require('../api/contact.js');

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

let lastSendCall = null;

function mockFetchSuccess() {
  lastSendCall = null;
  global.fetch = async (url, options) => {
    lastSendCall = { url, options, body: JSON.parse(options.body) };
    return {
      ok: true,
      status: 201,
      json: async () => ({ message: 'Queued', messageId: 'mock-id' }),
      text: async () => '{"message":"Queued","messageId":"mock-id"}',
    };
  };
}

mockFetchSuccess();

// Vercel-style request: platform already parsed the JSON body onto req.body.
function createReq(body, method = 'POST') {
  const req = {
    method,
    body: undefined,
    readableEnded: false,
    on(event, cb) {
      if (event === 'data' && body !== undefined) {
        setImmediate(() => {
          try { cb(Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))); } catch (err) { /* ignore */ }
          if (req.readableEnded) return;
          req.readableEnded = true;
          (req._listeners.end || []).forEach((endCb) => endCb());
        });
      }
      if (event === 'end') {
        (req._listeners = req._listeners || {}).end = (req._listeners.end || []).concat(cb);
      }
      return req;
    },
    destroy() {},
  };
  return req;
}

function createRes() {
  const res = {
    statusCode: null,
    body: null,
    headers: {},
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  return res;
}

async function runTests() {
  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed += 1;
    } catch (err) {
      console.error(`  ✗ ${name}`);
      console.error(`    ${err && err.message ? err.message : err}`);
      failed += 1;
    }
  }

  console.log('Contact API end-to-end tests (Brevo):\n');

  await test('Full valid submission flows to Brevo and returns success', async () => {
    mockFetchSuccess();
    const req = createReq({
      name: 'Ali Raza',
      email: 'ali@example.com',
      phone: '03001234567',
      service: 'Waterproofing',
      message: 'Need waterproofing for my basement. Please call me back.',
    });
    const res = createRes();
    await handler(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(typeof res.body.message === 'string' && res.body.message.length > 0);
    assert.ok(lastSendCall, 'Brevo must have been called');
    assert.strictEqual(lastSendCall.url, BREVO_URL);
  });

  await test('Brevo request carries api-key header and JSON content type', async () => {
    mockFetchSuccess();
    const req = createReq({ name: 'A', phone: '1', service: 'Painting' });
    const res = createRes();
    await handler(req, res);
    const headers = lastSendCall.options.headers;
    assert.strictEqual(headers['api-key'], 'test-brevo-key');
    assert.strictEqual(headers['Content-Type'], 'application/json');
    assert.strictEqual(headers.Accept, 'application/json');
  });

  await test('Brevo payload uses sender/to/replyTo/subject/htmlContent/textContent', async () => {
    mockFetchSuccess();
    const req = createReq({
      name: 'Ali Raza',
      email: 'ali@example.com',
      phone: '03001234567',
      service: 'Waterproofing',
      message: 'Line1\nLine2',
    });
    const res = createRes();
    await handler(req, res);
    const payload = lastSendCall.body;
    assert.deepStrictEqual(payload.sender, { name: 'Infinite Building Solutions', email: 'noreply@example.com' });
    assert.deepStrictEqual(payload.to, [{ email: 'contact@example.com' }]);
    assert.deepStrictEqual(payload.replyTo, { email: 'ali@example.com', name: 'Ali Raza' });
    assert.strictEqual(payload.subject, 'New Contact Form Inquiry - IBS');
    assert.ok(payload.htmlContent.includes('Line1<br>Line2'), 'htmlContent preserves line breaks');
    assert.ok(payload.textContent.includes('Line1\nLine2'), 'textContent preserves line breaks');
  });

  await test('Visitor email is never used as the sender address', async () => {
    mockFetchSuccess();
    const req = createReq({ name: 'A', email: 'visitor@example.com', phone: '1', service: 'Painting' });
    const res = createRes();
    await handler(req, res);
    assert.notStrictEqual(lastSendCall.body.sender.email, 'visitor@example.com');
    assert.strictEqual(lastSendCall.body.replyTo.email, 'visitor@example.com');
  });

  await test('XSS payload in every field is escaped in htmlContent', async () => {
    mockFetchSuccess();
    const req = createReq({
      name: '<script>alert(1)</script>',
      phone: '1',
      service: '"><img src=x onerror=alert(1)>',
      message: "'); DROP TABLE users;--",
    });
    const res = createRes();
    await handler(req, res);
    assert.strictEqual(res.statusCode, 200);
    const html = lastSendCall.body.htmlContent;
    assert.ok(!html.includes('<script>'));
    assert.ok(!html.includes('<img src=x'));
    assert.ok(html.includes('&lt;script&gt;'));
  });

  await test('Invalid input never triggers a Brevo call', async () => {
    const cases = [
      { name: '', phone: '1', service: 'Painting' },
      { name: 'A', phone: '', service: 'Painting' },
      { name: 'A', phone: '1', service: '' },
      { name: 'A', phone: '1', service: 'Painting', email: 'not-an-email' },
      { name: 'A', phone: '1', service: 'Painting', email: 'bad@@domain.com' },
    ];
    for (const payload of cases) {
      lastSendCall = null;
      mockFetchSuccess();
      lastSendCall = null; // ensure no call recorded
      const res = createRes();
      await handler(createReq(payload), res);
      assert.strictEqual(res.statusCode, 400, `expected 400 for ${JSON.stringify(payload)}`);
      assert.strictEqual(lastSendCall, null, 'fetch must not be called for invalid input');
    }
  });

  await test('Oversized fields are rejected before any Brevo call', async () => {
    const cases = [
      { name: 'N'.repeat(5000), phone: '1', service: 'Painting' },
      { name: 'A', phone: '1', service: 'Painting', message: 'M'.repeat(20000) },
    ];
    for (const payload of cases) {
      mockFetchSuccess();
      const res = createRes();
      await handler(createReq(payload), res);
      assert.strictEqual(res.statusCode, 413, `expected 413 for ${Object.keys(payload).join(',')}`);
      assert.strictEqual(lastSendCall, null, 'fetch must not be called for oversized input');
    }
  });

  await test('Array body returns 400 without crashing or calling Brevo', async () => {
    mockFetchSuccess();
    const res = createRes();
    await handler(createReq(['name', 'phone']), res);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(lastSendCall, null);
  });

  await test('Empty message field is still a valid submission', async () => {
    mockFetchSuccess();
    const res = createRes();
    await handler(createReq({ name: 'A', phone: '1', service: 'Painting' }), res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(lastSendCall.body.textContent.includes('Message: \n') || lastSendCall.body.textContent.includes('Message:'));
  });

  await test('Numeric name and unicode content flow through to payload', async () => {
    mockFetchSuccess();
    const res = createRes();
    await handler(createReq({ name: '12345', phone: '9876543210', service: 'Waterproofing', message: 'اۓ αβγ 南' }), res);
    assert.strictEqual(res.statusCode, 200);
    assert.ok(lastSendCall.body.htmlContent.includes('12345'));
    assert.ok(lastSendCall.body.textContent.includes('9876543210'));
    assert.ok(lastSendCall.body.textContent.includes('اۓ αβγ 南'));
  });

  await test('Email omitted -> no replyTo key in payload', async () => {
    mockFetchSuccess();
    const res = createRes();
    await handler(createReq({ name: 'A', phone: '1', service: 'Painting' }), res);
    assert.strictEqual(res.statusCode, 200);
    assert.ok(!('replyTo' in lastSendCall.body), 'replyTo must be absent when email is not supplied');
  });

  await test('Response contract is always { success: boolean, message: string }', async () => {
    mockFetchSuccess();
    const okRes = createRes();
    await handler(createReq({ name: 'A', phone: '1', service: 'Painting' }), okRes);
    assert.strictEqual(typeof okRes.body.success, 'boolean');
    assert.strictEqual(typeof okRes.body.message, 'string');
    const errRes = createRes();
    await handler(createReq({}), errRes);
    assert.strictEqual(typeof errRes.body.success, 'boolean');
    assert.strictEqual(typeof errRes.body.message, 'string');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
