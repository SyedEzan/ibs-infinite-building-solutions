'use strict';

// Test harness for api/contact.js — runs with mocked global.fetch, no network.
// Run with: node test/contact.test.js
// Uses only Node built-ins (assert). Environment variables are set to safe
// dummy values so the suite is self-contained and never sends real email.

process.env.BREVO_API_KEY = 'test-api-key';
process.env.BREVO_FROM_EMAIL = 'no-reply@example.com';
process.env.BREVO_TO_EMAIL = 'inbox@example.com';

const assert = require('assert');
const handler = require('../api/contact.js');

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

let lastSendCall = null; // { url, options, body } of the most recent fetch

function mockFetchSuccess() {
  lastSendCall = null; // reset so "fetch not called" assertions are reliable
  global.fetch = async (url, options) => {
    lastSendCall = { url, options, body: JSON.parse(options.body) };
    return {
      ok: true,
      status: 201,
      text: async () => '{"message":"Queued","messageId":"test-message-id"}',
    };
  };
}

mockFetchSuccess();

// Simulates a Vercel-style request where the platform already consumed the
// stream (readableEnded = true) and exposed the body on req.body.
function createReq(body, method = 'POST') {
  return {
    method,
    body,
    readableEnded: true,
    on() { return this; },
    destroy() {},
  };
}

// Simulates a request where the body must be read from the raw stream.
function createStreamReq() {
  const listeners = {};
  return {
    method: 'POST',
    body: undefined,
    readableEnded: false,
    on(event, cb) {
      (listeners[event] = listeners[event] || []).push(cb);
      return this;
    },
    destroy() {},
    emitStream(raw) {
      (listeners.data || []).forEach((cb) => cb(Buffer.from(raw)));
      (listeners.end || []).forEach((cb) => cb());
    },
  };
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

  console.log('Contact API tests (Brevo):\n');

  await test('Valid submission with all fields returns 200 and success message', async () => {
    mockFetchSuccess();
    const req = createReq({
      name: 'Ali Raza',
      email: 'ali@example.com',
      phone: '03001234567',
      service: 'Waterproofing',
      message: 'Need waterproofing for basement',
    });
    const res = createRes();
    await handler(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.message, 'Thank you for reaching out! We will get back to you soon.');
  });

  await test('Fetch is called against the Brevo API with correct method', async () => {
    mockFetchSuccess();
    const req = createReq({ name: 'Test', phone: '123', service: 'Painting' });
    const res = createRes();
    await handler(req, res);
    assert.ok(lastSendCall, 'fetch must have been called');
    assert.strictEqual(lastSendCall.url, BREVO_URL);
    assert.strictEqual(lastSendCall.options.method, 'POST');
    assert.ok(!/sendgrid/i.test(lastSendCall.url), 'SendGrid must not be used');
  });

  await test('Brevo headers: api-key, Content-Type, Accept', async () => {
    mockFetchSuccess();
    const req = createReq({ name: 'Test', phone: '123', service: 'Painting' });
    const res = createRes();
    await handler(req, res);
    const headers = lastSendCall.options.headers;
    assert.strictEqual(headers['api-key'], 'test-api-key');
    assert.strictEqual(headers['Content-Type'], 'application/json');
    assert.strictEqual(headers.Accept, 'application/json');
    assert.ok(!headers.authorization, 'no Authorization header expected');
  });

  await test('Payload sender/to use env addresses — visitor email is never the sender', async () => {
    mockFetchSuccess();
    const req = createReq({
      name: 'Visitor',
      email: 'visitor@example.com',
      phone: '123',
      service: 'Construction',
    });
    const res = createRes();
    await handler(req, res);
    assert.deepStrictEqual(lastSendCall.body.sender, {
      name: 'Infinite Building Solutions',
      email: 'no-reply@example.com',
    });
    assert.deepStrictEqual(lastSendCall.body.to, [{ email: 'inbox@example.com' }]);
    assert.notStrictEqual(lastSendCall.body.sender.email, 'visitor@example.com');
  });

  await test('Subject is exactly "New Contact Form Inquiry - IBS"', async () => {
    mockFetchSuccess();
    const req = createReq({ name: 'Test', phone: '123', service: 'Painting' });
    const res = createRes();
    await handler(req, res);
    assert.strictEqual(lastSendCall.body.subject, 'New Contact Form Inquiry - IBS');
  });

  await test('replyTo contains the visitor email and name when valid', async () => {
    mockFetchSuccess();
    const req = createReq({
      name: 'Ali Raza',
      email: 'ali@example.com',
      phone: '123',
      service: 'Waterproofing',
    });
    const res = createRes();
    await handler(req, res);
    assert.deepStrictEqual(lastSendCall.body.replyTo, { email: 'ali@example.com', name: 'Ali Raza' });
  });

  await test('Payload includes htmlContent and textContent with the message', async () => {
    mockFetchSuccess();
    const req = createReq({
      name: 'Test',
      phone: '123',
      service: 'Painting',
      message: 'Line one\nLine two',
    });
    const res = createRes();
    await handler(req, res);
    assert.ok(typeof lastSendCall.body.htmlContent === 'string' && lastSendCall.body.htmlContent.length > 0);
    assert.ok(typeof lastSendCall.body.textContent === 'string' && lastSendCall.body.textContent.length > 0);
    assert.ok(lastSendCall.body.textContent.includes('Line one\nLine two'), 'textContent keeps raw line breaks');
    assert.ok(lastSendCall.body.htmlContent.includes('Line one<br>Line two'), 'htmlContent preserves line breaks via <br>');
  });

  await test('HTML special characters in fields are escaped in htmlContent', async () => {
    mockFetchSuccess();
    const req = createReq({
      name: '<script>alert("xss")</script>',
      phone: '123',
      service: 'Painting',
      message: 'Hello <img src=x onerror=alert(1)>',
    });
    const res = createRes();
    await handler(req, res);
    assert.ok(!lastSendCall.body.htmlContent.includes('<script>'), 'raw <script> must not appear');
    assert.ok(!lastSendCall.body.htmlContent.includes('<img src=x'), 'raw <img> must not appear');
    assert.ok(lastSendCall.body.htmlContent.includes('&lt;script&gt;'), 'escaped markup expected');
    assert.ok(lastSendCall.body.htmlContent.includes('&lt;img'), 'escaped markup expected');
  });

  await test('No replyTo is sent when the visitor email is omitted', async () => {
    mockFetchSuccess();
    const req = createReq({ name: 'Test', phone: '123', service: 'Painting' });
    const res = createRes();
    await handler(req, res);
    assert.strictEqual(lastSendCall.body.replyTo, undefined);
  });

  await test('Response body never leaks the API key', async () => {
    mockFetchSuccess();
    const req = createReq({ name: 'Test', phone: '123', service: 'Painting' });
    const res = createRes();
    await handler(req, res);
    assert.ok(!JSON.stringify(res.body).includes('test-api-key'));
  });

  await test('Method not allowed for GET, PUT, DELETE', async () => {
    mockFetchSuccess();
    for (const method of ['GET', 'PUT', 'DELETE']) {
      const res = createRes();
      await handler(createReq({}, method), res);
      assert.strictEqual(res.statusCode, 405);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.headers.Allow, 'POST');
    }
  });

  await test('Missing required fields returns 400 with field names', async () => {
    mockFetchSuccess();
    const res = createRes();
    await handler(createReq({ message: 'Some message' }), res);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.success, false);
    assert.ok(res.body.message.includes('name'));
    assert.ok(res.body.message.includes('phone'));
    assert.ok(res.body.message.includes('service'));
    assert.strictEqual(lastSendCall, null, 'fetch must not be called for invalid input');
  });

  await test('Each missing field is reported individually', async () => {
    mockFetchSuccess();
    for (const [payload, field] of [
      [{ phone: '1', service: 'Painting' }, 'name'],
      [{ name: 'A', service: 'Painting' }, 'phone'],
      [{ name: 'A', phone: '1' }, 'service'],
    ]) {
      const res = createRes();
      await handler(createReq(payload), res);
      assert.strictEqual(res.statusCode, 400);
      assert.ok(res.body.message.includes(field), `expected message to mention ${field}`);
    }
  });

  await test('Empty body returns 400', async () => {
    mockFetchSuccess();
    const res = createRes();
    await handler(createReq(undefined), res);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.success, false);
  });

  await test('String JSON body is parsed successfully', async () => {
    mockFetchSuccess();
    const res = createRes();
    await handler(createReq(JSON.stringify({ name: 'Test', phone: '123', service: 'Painting' })), res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);
  });

  await test('Malformed JSON string returns 400 without crashing', async () => {
    mockFetchSuccess();
    const res = createRes();
    await handler(createReq('{"name": "Unclosed'), res);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(lastSendCall, null);
  });

  await test('Array body returns 400 without crashing', async () => {
    mockFetchSuccess();
    const res = createRes();
    await handler(createReq(['name', 'phone']), res);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.success, false);
  });

  await test('Null body returns 400 without crashing', async () => {
    mockFetchSuccess();
    const res = createRes();
    await handler(createReq(null), res);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.success, false);
  });

  await test('Raw stream body is read and parsed', async () => {
    mockFetchSuccess();
    const req = createStreamReq();
    const res = createRes();
    const handlerPromise = handler(req, res);
    req.emitStream(JSON.stringify({ name: 'Stream', phone: '999', service: 'Painting', message: 'From stream' }));
    await handlerPromise;
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(lastSendCall.body.textContent.includes('From stream'));
  });

  await test('Malformed JSON on the raw stream returns 400 without crashing', async () => {
    mockFetchSuccess();
    const req = createStreamReq();
    const res = createRes();
    const handlerPromise = handler(req, res);
    req.emitStream('{"name": ');
    await handlerPromise;
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.success, false);
  });

  await test('Raw stream larger than the 1MB limit returns 413', async () => {
    mockFetchSuccess();
    const req = createStreamReq();
    const res = createRes();
    const handlerPromise = handler(req, res);
    req.emitStream('x'.repeat(1024 * 1024 + 1024));
    await handlerPromise;
    assert.strictEqual(res.statusCode, 413);
    assert.strictEqual(res.body.success, false);
  });

  await test('Non-text field types (array/object/boolean) return 400', async () => {
    mockFetchSuccess();
    for (const [field, value] of [
      ['name', ['array']],
      ['phone', { obj: 1 }],
      ['service', true],
      ['message', ['nested']],
    ]) {
      const res = createRes();
      await handler(createReq({ name: 'A', phone: '1', service: 'Painting', [field]: value }), res);
      assert.strictEqual(res.statusCode, 400, `expected 400 for ${field}=${JSON.stringify(value)}`);
      assert.ok(res.body.message.includes(field));
    }
  });

  await test('Oversized name returns 413', async () => {
    mockFetchSuccess();
    const res = createRes();
    await handler(createReq({ name: 'x'.repeat(300), phone: '1', service: 'Painting' }), res);
    assert.strictEqual(res.statusCode, 413);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(lastSendCall, null);
  });

  await test('Oversized message returns 413', async () => {
    mockFetchSuccess();
    const res = createRes();
    await handler(createReq({ name: 'A', phone: '1', service: 'Painting', message: 'm'.repeat(6000) }), res);
    assert.strictEqual(res.statusCode, 413);
  });

  await test('Invalid emails are rejected; valid unicode email is accepted', async () => {
    mockFetchSuccess();
    for (const bad of ['not-an-email', 'user@', 'user@domain', '@domain.com', 'us er@example.com', 'user@@example.com']) {
      const res = createRes();
      await handler(createReq({ name: 'A', phone: '1', service: 'Painting', email: bad }), res);
      assert.strictEqual(res.statusCode, 400, `expected 400 for email "${bad}"`);
      assert.strictEqual(res.body.success, false);
    }
    const resOk = createRes();
    await handler(createReq({ name: 'A', phone: '1', service: 'Painting', email: 'user@例子.测试' }), resOk);
    assert.strictEqual(resOk.statusCode, 200);
  });

  await test('Numeric name value is coerced and accepted', async () => {
    mockFetchSuccess();
    const res = createRes();
    await handler(createReq({ name: 12345, phone: '1', service: 'Painting' }), res);
    assert.strictEqual(res.statusCode, 200);
    assert.ok(lastSendCall.body.htmlContent.includes('12345'));
  });

  await test('Unicode names and phone numbers are preserved in payload', async () => {
    mockFetchSuccess();
    const res = createRes();
    await handler(createReq({ name: 'اۓ αβγ 南', phone: '9876543210', service: 'Painting' }), res);
    assert.strictEqual(res.statusCode, 200);
    assert.ok(lastSendCall.body.htmlContent.includes('اۓ αβγ 南'));
    assert.ok(lastSendCall.body.textContent.includes('9876543210'));
  });

  await test('Brevo API error response maps to 502 with a generic message', async () => {
    lastSendCall = null;
    global.fetch = async (url, options) => {
      lastSendCall = { url, options, body: JSON.parse(options.body) };
      return {
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ code: 'invalid_parameter', message: 'API Key not found' }),
      };
    };
    const res = createRes();
    await handler(createReq({ name: 'A', phone: '1', service: 'Painting' }), res);
    assert.strictEqual(res.statusCode, 502);
    assert.strictEqual(res.body.success, false);
    assert.ok(!res.body.message.includes('API Key'), 'internal Brevo errors must not leak to the client');
    mockFetchSuccess();
  });

  await test('Network failure maps to 500 with a generic message', async () => {
    global.fetch = async () => { throw new Error('fetch failed: ECONNREFUSED'); };
    const res = createRes();
    await handler(createReq({ name: 'A', phone: '1', service: 'Painting' }), res);
    assert.strictEqual(res.statusCode, 500);
    assert.strictEqual(res.body.success, false);
    mockFetchSuccess();
  });

  await test('Request timeout maps to 504 with a generic message', async () => {
    global.fetch = async () => {
      const err = new Error('The operation was aborted due to timeout');
      err.name = 'TimeoutError';
      throw err;
    };
    const res = createRes();
    await handler(createReq({ name: 'A', phone: '1', service: 'Painting' }), res);
    assert.strictEqual(res.statusCode, 504);
    assert.strictEqual(res.body.success, false);
    mockFetchSuccess();
  });

  await test('Missing BREVO_API_KEY returns 500 without calling fetch', async () => {
    const saved = process.env.BREVO_API_KEY;
    delete process.env.BREVO_API_KEY;
    try {
      global.fetch = async () => { throw new Error('fetch must not be called'); };
      const res = createRes();
      await handler(createReq({ name: 'A', phone: '1', service: 'Painting' }), res);
      assert.strictEqual(res.statusCode, 500);
      assert.strictEqual(res.body.success, false);
    } finally {
      process.env.BREVO_API_KEY = saved;
      mockFetchSuccess();
    }
  });

  await test('Missing BREVO_FROM_EMAIL returns 500 without calling fetch', async () => {
    const saved = process.env.BREVO_FROM_EMAIL;
    delete process.env.BREVO_FROM_EMAIL;
    try {
      global.fetch = async () => { throw new Error('fetch must not be called'); };
      const res = createRes();
      await handler(createReq({ name: 'A', phone: '1', service: 'Painting' }), res);
      assert.strictEqual(res.statusCode, 500);
    } finally {
      process.env.BREVO_FROM_EMAIL = saved;
      mockFetchSuccess();
    }
  });

  await test('Missing BREVO_TO_EMAIL returns 500 without calling fetch', async () => {
    const saved = process.env.BREVO_TO_EMAIL;
    delete process.env.BREVO_TO_EMAIL;
    try {
      global.fetch = async () => { throw new Error('fetch must not be called'); };
      const res = createRes();
      await handler(createReq({ name: 'A', phone: '1', service: 'Painting' }), res);
      assert.strictEqual(res.statusCode, 500);
    } finally {
      process.env.BREVO_TO_EMAIL = saved;
      mockFetchSuccess();
    }
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
