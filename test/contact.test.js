'use strict';

/**
 * Contact Form end-to-end test harness.
 * Tests the Vercel serverless function api/contact.js against every input scenario.
 *
 * How to run: node test/contact.test.js
 * Requires Node >= 18 (uses global fetch).
 */

const path = require('path');

const CONTACT_JS = path.join(__dirname, '..', 'api', 'contact.js');

// ---------------------------------------------------------------------------
// Load the serverless function module.
// ---------------------------------------------------------------------------
let contactHandler;
try {
  contactHandler = require(CONTACT_JS);
} catch (err) {
  console.error('FATAL: Could not load api/contact.js');
  console.error(err.message);
  process.exit(1);
}

if (typeof contactHandler !== 'function') {
  console.error('FATAL: api/contact.js does not export a handler function.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Mock response object that mirrors Vercel's res API.
//   res.status(code).json(payload)  ->  res
//   res.setHeader(name, value)
// ---------------------------------------------------------------------------
function createRes() {
  const res = {
    statusCode: null,
    body: null,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
    },
  };
  return res;
}

// ---------------------------------------------------------------------------
// Mock request object.
//   req.method -> HTTP method (string)
//   req.body   -> parsed body as Vercel would deliver it (object | string)
//
// When body is a string it is exposed as a raw stream (via .on) so the
// handler's own body-parsing path is exercised. req.on is ALWAYS available,
// mirroring a real Node IncomingMessage, so "no body" resolves as empty
// instead of throwing.
// ---------------------------------------------------------------------------
function createReq(method, body) {
  const raw = typeof body === 'string' && body.trim() ? body : null;
  const listeners = {};

  const req = {
    method,
    body,
    on(event, cb) {
      (listeners[event] = listeners[event] || []).push(cb);
      if (event === 'end') {
        setImmediate(() => {
          if (raw) (listeners.data || []).forEach(fn => fn(Buffer.from(raw)));
          (listeners.end || []).forEach(fn => fn());
        });
      }
      return req;
    },
    destroy() {},
  };
  return req;
}

// ---------------------------------------------------------------------------
// Mock global fetch so we never hit the real SendGrid API.
// ---------------------------------------------------------------------------
let lastSendGridCall = null;
const originalFetch = global.fetch;
global.fetch = async (url, init) => {
  lastSendGridCall = { url, init };
  return new Response(JSON.stringify({ message: 'queued' }), {
    status: 202,
    headers: { 'content-type': 'application/json' },
  });
};

process.on('exit', () => {
  global.fetch = originalFetch;
});

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
function callHandler(method, body) {
  const req = createReq(method, body);
  const res = createRes();
  return contactHandler(req, res).then(() => ({ req, res }));
}

function assert(name, condition, detail) {
  const pass = Boolean(condition);
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${condition ? '' : '  ->  ' + detail}`);
  return pass;
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------
async function run() {
  const results = [];
  const record = (name, condition, detail) => results.push({ name, pass: Boolean(condition), detail });

  console.log('=== Contact Form Backend Scenarios ===\n');

  // 1. Valid submission with all fields (email + message included)
  {
    const body = {
      name: '  Ali Raza  ',
      email: 'ali@example.com',
      phone: ' 03001234567 ',
      service: 'Waterproofing',
      message: '  Need roof coating for a 3-bed house.  ',
    };
    const { res } = await callHandler('POST', body);
    record('Valid submission (all fields) -> 200 + success', res.statusCode === 200 && res.body.success === true, `status=${res.statusCode} body=${JSON.stringify(res.body)}`);
    record('Valid submission returns success message', typeof res.body?.message === 'string' && res.body.message.length > 0, `got=${res.body ? res.body.message : res.body}`);
    record('Valid submission sends to SendGrid (202)', lastSendGridCall !== null, 'No fetch call made');
    if (lastSendGridCall) {
      const payload = JSON.parse(lastSendGridCall.init?.body || '{}');
      // The recipient is the IBS inbox, not the customer; the customer is reply_to.
      record('SendGrid: toEmail set', payload.personalizations[0].to[0].email === process.env.SENDGRID_TO_EMAIL, `got=${payload.personalizations[0].to[0].email}`);
      record('SendGrid: reply_to = customer email', payload.personalizations[0].reply_to?.email === 'ali@example.com', `got=${JSON.stringify(payload.personalizations[0].reply_to)}`);
      record('SendGrid: fromEmail set', payload.from.email);
      record('SendGrid: subject set', payload.subject);
      // Whitespace must be trimmed before it reaches the email body.
      record('SendGrid: HTML escapes/contains trimmed name', payload.content.find(c => c.type === 'text/html').value.includes('Ali Raza') && !payload.content.find(c => c.type === 'text/html').value.includes('  Ali Raza  '));
    }
  }

  // 2. Missing name
  {
    const body = { email: 'ali@example.com', phone: '03001234567', service: 'Waterproofing', message: 'hi' };
    const { res } = await callHandler('POST', body);
    record('Missing name -> 400 + lists name', res.statusCode === 400 && /name/i.test(res.body?.message || ''), `status=${res.statusCode} message=${res.body?.message}`);
  }

  // 3. Missing phone
  {
    const body = { name: 'Ali', email: 'ali@example.com', service: 'Waterproofing', message: 'hi' };
    const { res } = await callHandler('POST', body);
    record('Missing phone -> 400 + lists phone', res.statusCode === 400 && /phone/i.test(res.body.message || ''), `status=${res.statusCode} message=${res.body?.message}`);
  }

  // 4. Missing service
  {
    const body = { name: 'Ali', email: 'ali@example.com', phone: '03001234567', message: 'hi' };
    const { res } = await callHandler('POST', body);
    record('Missing service -> 400 + lists service', res.statusCode === 400 && /service/i.test(res.body.message || ''), `status=${res.statusCode} message=${res.body?.message}`);
  }

  // 5. Empty body (no fields at all)
  {
    const { res } = await callHandler('POST', {});
    record('Empty body -> 400 listing all required missing', res.statusCode === 400 && /name|phone|service/.test(res.body?.message || ''), `status=${res.statusCode} message=${res.body?.message}`);
  }

  // 6. Body as raw JSON string (edge-case tolerance)
  {
    const { res } = await callHandler('POST', '{"name":"Ali","phone":"03001234567","service":"Heat Proofing"}');
    record('String body parses successfully', res.statusCode === 200, `status=${res.statusCode} body=${JSON.stringify(res.body)}`);
  }

  // 7. Body is an array (should be treated as empty)
  {
    const { res } = await callHandler('POST', []);
    record('Array body -> 400 missing fields', res.statusCode === 400 && /name|phone|service/.test(res.body?.message || ''), `status=${res.statusCode}`);
  }

  // 8. GET request -> 405
  {
    const { res } = await callHandler('GET', {});
    record('GET -> 405 Method Not Allowed', res.statusCode === 405, `status=${res.statusCode}`);
  }

  // 9. PUT request -> 405
  {
    const { res } = await callHandler('PUT', {});
    record('PUT -> 405 Method Not Allowed', res.statusCode === 405, `status=${res.statusCode}`);
  }

  // 10. Invalid email format (when email provided)
  {
    const body = { name: 'Ali', email: 'not-an-email', phone: '03001234567', service: 'Waterproofing', message: 'hi' };
    const { res } = await callHandler('POST', body);
    record('Invalid email -> 400', res.statusCode === 400 && /email/i.test(res.body.message || ''), `status=${res.statusCode} message=${res.body?.message}`);
  }

  // 11. Valid email omitted -> 200 (email optional)
  {
    const body = { name: 'Ali', phone: '03001234567', service: 'Heat Proofing' };
    const { res } = await callHandler('POST', body);
    record('Email omitted -> 200 success', res.statusCode === 200 && res.body.success === true, `status=${res.statusCode} message=${res.body?.message}`);
  }


  // 12. Whitespace-only required fields -> required fail
  {
    const body = { name: '   ', phone: '', service: '  ', email: '   ', message: '  ' };
    const { res } = await callHandler('POST', body);
    record('Whitespace-only name/phone/service -> 400', res.statusCode === 400 && /name|phone|service/.test(res.body?.message || ''), `status=${res.statusCode} message=${res.body?.message}`);
  }

  // 13. HTML / XSS payloads in name, service, message
  {
    const body = {
      name: '<script>alert(1)</script>',
      phone: '03001234567',
      service: 'Waterproofing <b>X</b>',
      message: '<img src=x onerror=alert(2)>',
    };
    const { res } = await callHandler('POST', body);
    record('HTML payloads accepted at entry -> 200', res.statusCode === 200, `status=${res.statusCode}`);
    record('No crash on XSS payloads', true);
  }

  // 14. Very long message / name (buffer tolerance)
  {
    const body = { name: 'A'.repeat(5000), phone: '03001234567', service: 'Waterproofing', message: 'B'.repeat(20000) };
    const { res } = await callHandler('POST', body);
    record('Long fields (5k name / 20k message) -> 200', res.statusCode === 200, `status=${res.statusCode}`);
  }

  // 15. Unicode / international characters
  {
    const body = {
      name: 'اۓ αβγ 南',
      phone: '0300-123-4567',
      service: 'PU Coating',
      email: 'user@例子.测试',
      message: 'مرحبًا',
    };
    const { res } = await callHandler('POST', body);
    record('Unicode fields -> 200', res.statusCode === 200, `status=${res.statusCode}`);
  }

  // 16. Phone with dashes is accepted (no strict phone format enforced)
  {
    const body = { name: 'Ali', phone: '0300-123-4567', service: 'Insulation', message: 'test' };
    const { res } = await callHandler('POST', body);
    record('Phone with dashes -> 200', res.statusCode === 200, `status=${res.statusCode}`);
  }

  // 17. Name/phone/service only (email + message omitted) -> 200
  {
    const body = { name: 'Ali', phone: '03001234567', service: 'Termite Proofing' };
    const { res } = await callHandler('POST', body);
    record('Name/phone/service only -> 200', res.statusCode === 200, `status=${res.statusCode}`);
  }

  // 18. reply_to must be omitted when no valid email (security)
  {
    const body = { name: 'Ali', phone: '03001234567', service: 'Waterproofing' };
    const { res } = await callHandler('POST', body);
    if (lastSendGridCall) {
      const payload = JSON.parse(lastSendGridCall.init?.body || '{}');
      record('reply_to omitted when no email', !payload.reply_to, 'reply_to present');
    }
  }

  // 19. Numeric name still accepted
  {
    const body = { name: '12345', phone: '03001234567', service: 'Waterproofing' };
    const { res } = await callHandler('POST', body);
    record('Numeric name -> 200', res.statusCode === 200, `status=${res.statusCode}`);
  }

  // 20. Phone with special symbols
  {
    const body = { name: 'Ali', phone: '0300-123-4567!', service: 'Waterproofing', message: 'x' };
    const { res } = await callHandler('POST', body);
    record('Phone with "!" -> 200', res.statusCode === 200, `status=${res.statusCode}`);
  }


  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log('\n=== Summary ===');
  const failed = results.filter((r) => !r.pass);
  console.log(`Total: ${results.length}  |  Passed: ${results.length - failed.length}  |  Failed: ${failed.length}`);

  if (failed.length > 0) {
    console.log('\nFailed scenarios:');
    failed.forEach((r) => console.log(`  - ${r.name}${r.detail ? '  ->  ' + r.detail : ''}`));
    process.exitCode = 1;
  } else {
    console.log('\nAll backend scenarios passed.');
  }
}

run().catch((err) => {
  console.error('TEST HARNESS ERROR:', err);
  console.error(err.stack);
  process.exit(1);
});

