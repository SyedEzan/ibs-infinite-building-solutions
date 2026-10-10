'use strict';

/**
 * Minimal smoke test: runs ONE scenario through the contact handler.
 * Run: node test/simple.test.js
 */

const path = require('path');

const CONTACT_JS = path.join(__dirname, '..', 'api', 'contact.js');
const handler = require(CONTACT_JS);

function createRes() {
  return {
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
    setHeader() {},
  };
}

function call(method, body) {
  const req = { method, body };
  const res = createRes();
  return handler(req, res).then(() => ({ req, res }));
}

// Mock fetch to avoid hitting SendGrid.
let sgCall = null;
const origFetch = global.fetch;
// NOTE: arrow functions have no `arguments`; take the params explicitly.
global.fetch = async (url, init) => {
  sgCall = { url, init };
  return new Response(JSON.stringify({ message: 'queued' }), {
    status: 202,
    headers: { 'content-type': 'application/json' },
  });
};

process.on('exit', () => {
  global.fetch = origFetch;
});

async function main() {
  const body = {
    name: '  Ali Raza  ',
    email: 'ali@example.com',
    phone: ' 03001234567 ',
    service: 'Waterproofing',
    message: '  Need roof coating.  ',
  };

  console.log('Method: POST, body:', JSON.stringify(body));
  const { res } = await call('POST', body);

  console.log('STATUS:', res.statusCode);
  console.log('BODY:', JSON.stringify(res.body));
  console.log('SENDGRID CALL PRESENT:', sgCall !== null);
  if (sgCall) {
    try {
      const p = JSON.parse(sgCall.init.body || '{}');
      console.log('TO EMAIL:', p.personalizations[0].to[0].email);
      console.log('REPLY_TO:', p.personalizations[0].reply_to?.email);
      console.log('FROM:', p.from.email);
    } catch (e) {
      console.log('payload parse error:', e.message);
    }
  }

  const ok = res.statusCode === 200 && res.body.success === true;
  console.log(ok ? 'RESULT: PASS' : 'RESULT: FAIL');
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error('ERROR:', e);
  console.error(e.stack);
  process.exit(1);
});
