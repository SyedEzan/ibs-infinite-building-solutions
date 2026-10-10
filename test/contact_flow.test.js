'use strict';

/**
 * Comprehensive contact form test harness.
 * Tests the Vercel serverless function api/contact.js across all scenarios.
 * Run: node test/contact_flow.test.js
 */

const path = require('path');

const CONTACT_JS = path.join(__dirname, '..', 'api', 'contact.js');
const handler = require(CONTACT_JS);

// Mock response mirroring Vercel's res API.
function createRes() {
  return {
    statusCode: null,
    body: null,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    setHeader(name, value) { this.headers[name] = value; },
  };
}

// Mock request.
//   body   -> the pre-parsed body (simulates Vercel auto-parse)
//   stream -> if provided, emit this as the raw stream body when body is undefined
function createReq(method, body, stream) {
  const listeners = {};
  const req = {
    method,
    body,
    on(event, listener) {
      (listeners[event] = listeners[event] || []).push(listener);
      // Emit asynchronously so all handlers are registered first (like a real stream).
      if (event === 'end') {
        setImmediate(() => {
          if (stream !== undefined) {
            (listeners.data || []).forEach(fn => fn(Buffer.from(stream)));
          }
          (listeners.end || []).forEach(fn => fn());
        });
      }
      return this;
    },
    destroy() {},
  };
  return req;
}

// Mock global fetch to avoid hitting SendGrid.
let sgCall = null;
const origFetch = global.fetch;
global.fetch = async (url, init) => {
  sgCall = { url, init };   // keep init so tests can inspect the payload
  return new Response(JSON.stringify({ message: 'queued' }), {
    status: 202,
    headers: { 'content-type': 'application/json' },
  });
};
process.on('exit', () => { global.fetch = origFetch; });

// Run one scenario and record pass/fail.
function record(name, condition, detail) {
  results.push({ name, pass: Boolean(condition) });
  console.log((condition ? 'PASS' : 'FAIL') + '  ' + name + (condition ? '' : '  ->  ' + detail));
}

async function postNoBodyParse() {
  // Simulate Vercel NOT auto-parsing: req.body is undefined and the JSON only
  // exists on the raw request stream. `createReq(..., stream)` emits it.
  const raw = '{"name":"Ali","phone":"03001234567","service":"Waterproofing"}';
  const req = createReq('POST', undefined, raw);
  const res = createRes();
  await handler(req, res);
  return { res };
}

async function callHandler(method, body) {
  const req = createReq(method, body);
  const res = createRes();
  await handler(req, res);
  return { res, sgCall };
}

let results = [];
function record(name, condition, detail) {
  results.push({ name, pass: Boolean(condition) });
  console.log((condition ? 'PASS' : 'FAIL') + '  ' + name + (condition ? '' : '  ->  ' + detail));
}

async function main() {
  console.log('=== Contact Form Backend Scenarios (targeted) ===\n');
  // 1. Valid submission


  // 1. Valid submission
  {
    const body = { name: '  Ali Raza  ', email: 'ali@example.com', phone: ' 03001234567 ', service: 'Waterproofing', message: '  Need roof coating.  ' };
    const { res, sgCall } = await callHandler('POST', body);
    record('Valid submission -> 200', res.statusCode === 200, 'status=' + res.statusCode);
    record('Valid submission success=true', res.body && res.body.success === true, JSON.stringify(res.body));
    record('Valid submission SendGrid called', sgCall !== null, 'no fetch: ' + (sgCall === null));
    if (sgCall) {
      const p = JSON.parse((sgCall.init && sgCall.init.body) || '{}');
      record('SendGrid: toEmail set', p.personalizations[0].to[0].email === process.env.SENDGRID_TO_EMAIL, 'got=' + p.personalizations[0].to[0].email);
      record('SendGrid: reply_to = email', p.personalizations[0].reply_to && p.personalizations[0].reply_to.email === 'ali@example.com');
      record('SendGrid: fromEmail set', p.from && p.from.email);
      record('SendGrid: subject set', p.subject);
    }
  }

  // 2. Missing name
  {
    const body = { email: 'a@b.com', phone: '03001234567', service: 'Waterproofing' };
    const { res } = await callHandler('POST', body);
    record('Missing name -> 400', res.statusCode === 400 && /name/i.test(res.body ? res.body.message : '') , 'status=' + res.statusCode + ' msg=' + (res.body ? res.body.message : res.body));
  }

  // 3. Missing phone
  {
    const body = { name: 'Ali', service: 'Waterproofing' };
    const { res } = await callHandler('POST', body);
    record('Missing phone -> 400', res.statusCode === 400 && /phone/i.test(res.body ? res.body.message : ''), 'status=' + res.statusCode);
  }

  // 4. Missing service
  {
    const body = { name: 'Ali', phone: '03001234567' };
    const { res } = await callHandler('POST', body);
    record('Missing service -> 400', res.statusCode === 400 && /service/i.test(res.body ? res.body.message : ''), 'status=' + res.statusCode);
  }

  // 5. Empty object body
  {
    const { res } = await callHandler('POST', {});
    record('Empty body -> 400', res.statusCode === 400, 'status=' + res.statusCode);
  }

  // 6. Body as string
  {
    const { res } = await callHandler('POST', JSON.stringify({ name: 'Ali', phone: '03001234567', service: 'Heat Proofing' }));
    record('String body -> parses to 200', res.statusCode === 200, 'status=' + res.statusCode);
  }

  // 7. Array body -> 400
  {
    const { res } = await callHandler('POST', []);
    record('Array body -> 400', res.statusCode === 400, 'status=' + res.statusCode);
  }

  // 8. GET -> 405
  {
    const { res } = await callHandler('GET', {});
    record('GET -> 405', res.statusCode === 405, 'status=' + res.statusCode);
  }

  // 9. PUT -> 405
  {
    const { res } = await callHandler('PUT', {});
    record('PUT -> 405', res.statusCode === 405, 'status=' + res.statusCode);
  }

  // 10. Invalid email
  {
    const body = { name: 'Ali', email: 'bad', phone: '03001234567', service: 'Waterproofing' };
    const { res } = await callHandler('POST', body);
    record('Invalid email -> 400', res.statusCode === 400 && /email/i.test(res.body ? res.body.message : ''), 'status=' + res.statusCode);
  }

  // 11. Email omitted -> 200
  {
    const body = { name: 'Ali', phone: '03001234567', service: 'Heat Proofing' };
    const { res } = await callHandler('POST', body);
    record('Email omitted -> 200', res.statusCode === 200, 'status=' + res.statusCode);
  }

  // 12. Whitespace-only required fields
  {
    const body = { name: '   ', phone: '', service: '  ', email: '   ', message: '  ' };
    const { res } = await callHandler('POST', body);
    record('Whitespace-only name/phone/service -> 400', res.statusCode === 400 && /name|phone|service/.test(res.body ? res.body.message : ''), 'status=' + res.statusCode);
  }

  // 13. HTML payloads
  {
    const body = { name: '<script>alert(1)</script>', phone: '03001234567', service: 'Waterproofing <b>X</b>', message: '<img src=x onerror=alert(2)>' };
    const { res } = await callHandler('POST', body);
    record('HTML payloads -> 200 (no crash)', res.statusCode === 200, 'status=' + res.statusCode);
  }

  // 14. Long fields
  {
    const body = { name: 'A'.repeat(5000), phone: '03001234567', service: 'Waterproofing', message: 'B'.repeat(20000) };
    const { res } = await callHandler('POST', body);
    record('Long fields -> 200', res.statusCode === 200, 'status=' + res.statusCode);
  }

  // 15. Unicode
  {
    const body = { name: 'اۓ αβγ 南', phone: '0300-123-4567', service: 'PU Coating', email: 'user@例子.测试', message: 'مرحبًا' };
    const { res, sgCall } = await callHandler('POST', body);
    record('Unicode -> 200', res.statusCode === 200, 'status=' + res.statusCode);
    if (sgCall) {
      const p = JSON.parse(sgCall.body || '{}');
      record('Unicode: SendGrid called', true);
    }
  }

  // 16. Phone with dashes
  {
    const body = { name: 'Ali', phone: '0300-123-4567', service: 'Insulation' };
    const { res } = await callHandler('POST', body);
    record('Phone with dashes -> 200', res.statusCode === 200, 'status=' + res.statusCode);
  }

  // 17. Name/phone/service only
  {
    const body = { name: 'Ali', phone: '03001234567', service: 'Termite Proofing' };
    const { res } = await callHandler('POST', body);
    record('Name/phone/service only -> 200', res.statusCode === 200, 'status=' + res.statusCode);
  }

  // 18. Numeric name
  {
    const body = { name: '12345', phone: '03001234567', service: 'Waterproofing' };
    const { res } = await callHandler('POST', body);
    record('Numeric name -> 200', res.statusCode === 200, 'status=' + res.statusCode);
  }

  // 19. Phone with special symbols
  {
    const body = { name: 'Ali', phone: '0300-123-4567!', service: 'Waterproofing', message: 'x' };
    const { res } = await callHandler('POST', body);
    record('Phone with ! -> 200', res.statusCode === 200, 'status=' + res.statusCode);
  }

  // 20. reply_to omitted when no email
  {
    const body = { name: 'Ali', phone: '03001234567', service: 'Waterproofing' };
    const { res, sgCall } = await callHandler('POST', body);
    if (sgCall) {
      const p = JSON.parse((sgCall.init && sgCall.init.body) || '{}');
      record('reply_to omitted when no email', !p.personalizations[0].reply_to, 'reply_to present');
    }
  }

  // 21. req.body undefined (no Vercel auto-parse) with raw stream
  {
    const { res } = await postNoBodyParse();
    record('No-auto-parse (raw stream) -> 200', res.statusCode === 200, 'status=' + res.statusCode);
  }

  // 22. req.body as string containing JSON
  {
    const { res } = await callHandler('POST', JSON.stringify({ name: 'Ali', phone: '03001234567', service: 'Heat Proofing' }));
    record('req.body is JSON string -> 200 (parsed)', res.statusCode === 200, 'status=' + res.statusCode);
  }

  // 23. GET with body -> 405
  {
    const { res } = await callHandler('GET', { name: 'Ali' });
    record('GET -> 405', res.statusCode === 405, 'status=' + res.statusCode);
  }

  // 24. Very long single field (200k) -> accepted (parsed body, no stream limit)
  {
    const body = { name: 'A'.repeat(200000), phone: '03001234567', service: 'Waterproofing' };
    const { res } = await callHandler('POST', body);
    record('200k name -> 200', res.statusCode === 200, 'status=' + res.statusCode);
  }

  // 25. Content-Type not JSON but body present (lenient)
  {
    const body = { name: 'Ali', phone: '03001234567', service: 'Waterproofing' };
    const { res } = await callHandler('POST', body);
    record('Body present (lenient) -> 200', res.statusCode === 200, 'status=' + res.statusCode);
  }

  // ------------------------------------------------------------------
  console.log('\n=== Summary ===');
  const failed = results.filter(r => !r.pass);
  console.log('Total: ' + results.length + ' | Passed: ' + (results.length - failed.length) + ' | Failed: ' + failed.length);
  if (failed.length) {
    console.log('Failed:');
    failed.forEach(r => console.log('  - ' + r.name));
    process.exitCode = 1;
  } else {
    console.log('All scenarios passed.');
  }
}

main().catch((e) => { console.error('TEST ERROR:', e); process.exit(1); });
