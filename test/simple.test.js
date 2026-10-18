'use strict';

// Simple test harness for api/contact.js using only Node built-ins.
// Brevo version: validates the request/response contract and inspects the
// Brevo payload with a mocked global.fetch (no network, no real email).
// Run with: node test/simple.test.js

process.env.BREVO_API_KEY = 'test-brevo-key';
process.env.BREVO_FROM_EMAIL = 'noreply@example.com';
process.env.BREVO_TO_EMAIL = 'contact@example.com';

const handler = require('../api/contact.js');
const fs = require('fs');

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

let lastSendCall = null;

global.fetch = async (url, options) => {
  lastSendCall = { url, options, body: JSON.parse(options.body) };
  return {
    ok: true,
    status: 201,
    json: async () => ({ message: 'Queued', messageId: 'simple-test-id' }),
    text: async () => '{"message":"Queued","messageId":"simple-test-id"}',
  };
};

const outputLines = [];
function log(line) {
  console.log(line);
  outputLines.push(line);
}

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

async function run() {
  log('=== Testing api/contact.js with Brevo ===\n');

  log('--- Valid Submission ---');
  let req = createReq({
    name: 'John Doe',
    email: 'john@example.com',
    phone: '0300-1234567',
    service: 'Construction',
    message: 'I need a quote for my project.'
  });
  let res = createRes();
  await handler(req, res);
  log(`Status Code: ${res.statusCode}`);
  log(`Response: ${JSON.stringify(res.body)}`);
  log(`\n--- Brevo Request Details ---`);
  log(`POST ${lastSendCall.url}`);
  log(`Headers: ${JSON.stringify(lastSendCall.options.headers)}`);
  log(`Payload:\n${JSON.stringify(lastSendCall.body, null, 2)}`);
  log('');

  log('--- Missing Required Fields ---');
  req = createReq({ message: 'No other fields' });
  res = createRes();
  await handler(req, res);
  log(`Status Code: ${res.statusCode}`);
  log(`Response: ${JSON.stringify(res.body)}\n`);

  log('--- Invalid Email ---');
  req = createReq({ name: 'Test', email: 'invalid-email', phone: '123', service: 'Painting' });
  res = createRes();
  await handler(req, res);
  log(`Status Code: ${res.statusCode}`);
  log(`Response: ${JSON.stringify(res.body)}\n`);

  log('--- Method Not Allowed (GET) ---');
  req = createReq({}, 'GET');
  res = createRes();
  await handler(req, res);
  log(`Status Code: ${res.statusCode}`);
  log(`Response: ${JSON.stringify(res.body)}\n`);

  log('--- Malformed JSON body ---');
  req = createReq('{"name": "Broken');
  res = createRes();
  await handler(req, res);
  log(`Status Code: ${res.statusCode}`);
  log(`Response: ${JSON.stringify(res.body)}\n`);

  log('--- Array body ---');
  req = createReq(['name', 'phone']);
  res = createRes();
  await handler(req, res);
  log(`Status Code: ${res.statusCode}`);
  log(`Response: ${JSON.stringify(res.body)}\n`);

  log('--- Oversized message ---');
  req = createReq({ name: 'A', phone: '1', service: 'Painting', message: 'x'.repeat(6000) });
  res = createRes();
  await handler(req, res);
  log(`Status Code: ${res.statusCode}`);
  log(`Response: ${JSON.stringify(res.body)}\n`);

  fs.writeFileSync(`${__dirname}/simple.txt`, outputLines.join('\n'), 'utf8');
  console.log('\n=== Test complete ===');
}

run().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
