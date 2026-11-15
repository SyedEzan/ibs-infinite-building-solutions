/**
 * Vercel Serverless Function: POST /api/subscribe
 *
 * Accepts footer newsletter subscriptions and notifies IBS by email via
 * Brevo's transactional email API (same setup as /api/contact):
 *   https://api.brevo.com/v3/smtp/email
 *
 * Environment variables (set in the Vercel project settings — server-only,
 * never exposed to the client, never committed to Git):
 *   BREVO_API_KEY    - Brevo v3 API key (sent as the `api-key` header)
 *   BREVO_FROM_EMAIL - Verified sender address on your Brevo domain
 *   BREVO_TO_EMAIL   - Recipient address that should receive subscriptions
 *
 * The subscriber's address is sent to IBS in the notification email so it
 * can be added to the mailing list. A successful response from Brevo means
 * the email was accepted for delivery; it does not guarantee inbox
 * placement.
 */

'use strict';

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';
const BREVO_TIMEOUT_MS = 10000; // 10s network timeout for the Brevo call

const MAX_BODY_BYTES = 64 * 1024; // 64 KB raw request body cap
const MAX_EMAIL_LENGTH = 254;

// Practical email shape check (unicode-friendly). Not full RFC 5322, but
// rejects whitespace, consecutive @, and single-label domains safely.
const EMAIL_REGEX = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/;

const SENDER_NAME = 'Infinite Building Solutions';
const SUBJECT = 'New Newsletter Subscriber - IBS';

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    if (typeof req.on !== 'function' || req.readableEnded === true) {
      return resolve('');
    }

    let body = '';
    let size = 0;
    let settled = false;

    req.on('data', (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        settled = true;
        reject(Object.assign(new Error('Payload too large'), { statusCode: 413 }));
        try { req.destroy(); } catch (err) { /* ignore */ }
        return;
      }
      body += chunk;
    });

    req.on('end', () => {
      if (settled) return;
      settled = true;
      resolve(body);
    });

    req.on('error', (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });
  });
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function parseBody(req) {
  const data = req.body;

  if (isPlainObject(data)) {
    return data;
  }

  if (typeof data === 'string') {
    const trimmed = data.trim();
    if (!trimmed) return {};
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch (err) {
      throw Object.assign(new Error('Malformed JSON'), { statusCode: 400 });
    }
    if (!isPlainObject(parsed)) {
      throw Object.assign(new Error('JSON body must be an object'), { statusCode: 400 });
    }
    return parsed;
  }

  const raw = await readJsonBody(req);
  if (!raw || !raw.trim()) return {};
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw Object.assign(new Error('Malformed JSON'), { statusCode: 400 });
  }
  if (!isPlainObject(parsed)) {
    throw Object.assign(new Error('JSON body must be an object'), { statusCode: 400 });
  }
  return parsed;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({
      success: false,
      error: 'Method Not Allowed',
      message: 'This endpoint only accepts POST requests.',
    });
  }

  let data;
  try {
    data = await parseBody(req);
  } catch (err) {
    const statusCode = err && err.statusCode === 413 ? 413 : 400;
    return res.status(statusCode).json({
      success: false,
      error: statusCode === 413 ? 'Payload Too Large' : 'Bad Request',
      message: statusCode === 413
        ? 'The submitted data is too large. Please shorten it.'
        : 'The submitted data could not be read. Please try again.',
    });
  }

  if (!isPlainObject(data)) {
    return res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: 'The submitted data could not be read. Please try again.',
    });
  }

  const rawEmail = data.email;
  if (rawEmail !== undefined && rawEmail !== null && typeof rawEmail !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: 'The "email" field must be text.',
    });
  }
  const email = typeof rawEmail === 'string' ? rawEmail.trim() : '';

  if (!email || email.length > MAX_EMAIL_LENGTH || !EMAIL_REGEX.test(email)) {
    return res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: 'A valid email address is required to subscribe.',
    });
  }

  const apiKey = process.env.BREVO_API_KEY;
  const fromEmail = process.env.BREVO_FROM_EMAIL;
  const toEmail = process.env.BREVO_TO_EMAIL;

  if (!apiKey) {
    console.error('[subscribe] BREVO_API_KEY environment variable is not set.');
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to subscribe. Please try again later.',
    });
  }

  if (!fromEmail || !toEmail) {
    console.error('[subscribe] BREVO_FROM_EMAIL or BREVO_TO_EMAIL is not set.');
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to subscribe. Please try again later.',
    });
  }

  const htmlContent = `
    <div style="font-family: sans-serif; padding: 16px; border: 1px solid #ddd; border-radius: 8px; max-width: 600px;">
      <h2 style="color: #0A1628;">New Newsletter Subscriber</h2>
      <p style="color: #3A4A5C;">Someone subscribed to the IBS newsletter from the website footer.</p>
      <p style="color: #3A4A5C;"><b>Email:</b> ${escapeHtml(email)}</p>
      <p style="color: #6B7280; font-size: 0.85rem;">Add this address to your mailing list. Submitted from https://ibsolutions.pk</p>
    </div>
  `.trim();

  const textContent =
    `New Newsletter Subscriber\n` +
    `Email: ${email}\n` +
    `Add this address to your mailing list. Submitted from https://ibsolutions.pk`;

  const payload = {
    sender: {
      name: SENDER_NAME,
      email: fromEmail,
    },
    to: [{ email: toEmail }],
    subject: SUBJECT,
    htmlContent,
    textContent,
    replyTo: { email },
  };

  let response;
  try {
    response = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(BREVO_TIMEOUT_MS),
    });
  } catch (err) {
    if (err && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      console.error(`[subscribe] Brevo API request timed out after ${BREVO_TIMEOUT_MS}ms.`);
      return res.status(504).json({
        success: false,
        error: 'Gateway Timeout',
        message: 'Failed to subscribe. Please try again later.',
      });
    }
    console.error('[subscribe] Error calling Brevo API:', err && err.message ? err.message : err);
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to subscribe. Please try again later.',
    });
  }

  if (!response.ok) {
    let detail = '';
    try {
      detail = (await response.text()).slice(0, 500);
    } catch (err) { /* ignore */ }
    console.error(`[subscribe] Brevo API error (${response.status}): ${detail}`);
    return res.status(502).json({
      success: false,
      error: 'Bad Gateway',
      message: 'Failed to subscribe. Please try again later.',
    });
  }

  return res.status(200).json({
    success: true,
    message: 'Thank you for subscribing. You will hear from IBS soon.',
  });
};
