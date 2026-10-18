/**
 * Vercel Serverless Function: POST /api/contact
 *
 * Accepts contact-form submissions and sends a notification email via
 * Brevo's transactional email API using Node's built-in `fetch`:
 *   https://api.brevo.com/v3/smtp/email
 *
 * Environment variables (set in the Vercel project settings — server-only,
 * never exposed to the client, never committed to Git):
 *   BREVO_API_KEY    - Brevo v3 API key (sent as the `api-key` header)
 *   BREVO_FROM_EMAIL - Verified sender address on your Brevo domain
 *   BREVO_TO_EMAIL   - Recipient address that should receive inquiries
 *
 * Runtime notes:
 * - Vercel's Node.js runtime normally delivers a parsed body on `req.body`
 *   for JSON requests, but this handler also supports raw-stream bodies so
 *   it keeps working if auto-parsing is unavailable. An already-consumed
 *   stream is never read twice.
 * - A successful response from Brevo means the email was accepted for
 *   delivery; it does not guarantee inbox placement.
 */

'use strict';

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';
const BREVO_TIMEOUT_MS = 10000; // 10s network timeout for the Brevo call

// Safety limits. The stream limit guards the raw body; the field limits
// mirror (with headroom) the form's maxlength attributes in contact.html.
const MAX_BODY_BYTES = 1024 * 1024; // 1 MB raw request body cap
const FIELD_LIMITS = {
  name: 200,
  email: 254,
  phone: 50,
  service: 200,
  message: 5000,
};

// Practical email shape check (unicode-friendly). Not full RFC 5322, but
// rejects whitespace, consecutive @, and single-label domains safely.
const EMAIL_REGEX = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/;

const SENDER_NAME = 'Infinite Building Solutions';
const SUBJECT = 'New Contact Form Inquiry - IBS';


/**
 * Read the raw request stream as UTF-8 text with a size cap.
 * Never attaches listeners to an already-consumed stream.
 */
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

/**
 * Resolve the parsed JSON body for this runtime:
 * 1. Use `req.body` when the platform already parsed it.
 * 2. Parse `req.body` when it is a raw JSON string.
 * 3. Otherwise read the raw stream once (unless it was already consumed).
 *
 * Throws { statusCode: 400 } for malformed JSON and for arrays / null /
 * other non-object top-level values.
 */
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

  // req.body is undefined/null -> fall back to the raw stream exactly once.
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

/**
 * Extract one field from the parsed body.
 * Accepts strings and finite numbers; rejects arrays / objects / booleans
 * with an "invalid type" error so bad payloads fail fast and safely.
 */
function readField(data, key) {
  const raw = data[key];
  if (raw === undefined || raw === null) return { value: '' };
  if (typeof raw === 'string') return { value: raw.trim() };
  if (typeof raw === 'number' && Number.isFinite(raw)) return { value: String(raw) };
  return { value: '', invalid: true };
}

/**
 * Escape user-supplied text for safe interpolation into the HTML email body.
 * Every field rendered inside HTML markup goes through this first.
 */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Convert a plain-text message to HTML, preserving line breaks. */
function textToHtml(value) {
  return escapeHtml(value).replace(/\r\n|\r|\n/g, '<br>');
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
        ? 'The submitted data is too large. Please shorten your message.'
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

  // Reject non-string field types (arrays, objects, booleans) up front.
  const invalidType = ['name', 'email', 'phone', 'service', 'message']
    .find((key) => readField(data, key).invalid);
  if (invalidType) {
    return res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: `The "${invalidType}" field must be text.`,
    });
  }

  const name = readField(data, 'name').value;
  const email = readField(data, 'email').value;
  const phone = readField(data, 'phone').value;
  const service = readField(data, 'service').value;
  const message = readField(data, 'message').value;

  // Field size limits.
  const oversized = [
    ['name', name],
    ['email', email],
    ['phone', phone],
    ['service', service],
    ['message', message],
  ].filter(([key, value]) => value.length > FIELD_LIMITS[key]).map(([key]) => key);
  if (oversized.length > 0) {
    return res.status(413).json({
      success: false,
      error: 'Payload Too Large',
      message: `The following field(s) are too long: ${oversized.join(', ')}.`,
    });
  }

  const missing = [];
  if (!name) missing.push('name');
  if (!phone) missing.push('phone');
  if (!service) missing.push('service');

  if (missing.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: `Missing required field(s): ${missing.join(', ')}.`,
    });
  }

  // Email is optional, but must be valid when supplied.
  const hasValidEmail = Boolean(email) && EMAIL_REGEX.test(email);
  if (email && !hasValidEmail) {
    return res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: 'A valid email address must be provided when email is supplied.',
    });
  }


  const apiKey = process.env.BREVO_API_KEY;
  const fromEmail = process.env.BREVO_FROM_EMAIL;
  const toEmail = process.env.BREVO_TO_EMAIL;

  if (!apiKey) {
    console.error('[contact] BREVO_API_KEY environment variable is not set.');
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to deliver your message. Please try again later.',
    });
  }

  if (!fromEmail || !toEmail) {
    console.error('[contact] BREVO_FROM_EMAIL or BREVO_TO_EMAIL is not set.');
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to deliver your message. Please try again later.',
    });
  }

  const htmlContent = `
    <div style="font-family: sans-serif; padding: 16px; border: 1px solid #ddd; border-radius: 8px; max-width: 600px;">
      <h2 style="color: #0A1628;">New Contact Form Submission</h2>
      <p style="color: #3A4A5C;"><b>Name:</b> ${escapeHtml(name)}</p>
      ${hasValidEmail ? `<p style="color: #3A4A5C;"><b>Email:</b> ${escapeHtml(email)}</p>` : ''}
      <p style="color: #3A4A5C;"><b>Phone:</b> ${escapeHtml(phone)}</p>
      <p style="color: #3A4A5C;"><b>Service:</b> ${escapeHtml(service)}</p>
      <p style="color: #3A4A5C;"><b>Message:</b><br>${textToHtml(message)}</p>
      <p style="color: #6B7280; font-size: 0.85rem;">Submitted from https://ibsolutions.pk/contact</p>
    </div>
  `.trim();

  const textContent =
    `New Contact Form Submission\n` +
    `Name: ${name}\n` +
    `${hasValidEmail ? `Email: ${email}\n` : ''}` +
    `Phone: ${phone}\n` +
    `Service: ${service}\n` +
    `Message: ${message}\n` +
    `Submitted from https://ibsolutions.pk/contact`;

  // The visitor is never the sender; they are only the reply-to when a
  // valid email address was supplied.
  const payload = {
    sender: {
      name: SENDER_NAME,
      email: fromEmail,
    },
    to: [{ email: toEmail }],
    subject: SUBJECT,
    htmlContent,
    textContent,
  };
  if (hasValidEmail) {
    payload.replyTo = { email, name };
  }

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
      console.error(`[contact] Brevo API request timed out after ${BREVO_TIMEOUT_MS}ms.`);
      return res.status(504).json({
        success: false,
        error: 'Gateway Timeout',
        message: 'Failed to deliver your message. Please try again later.',
      });
    }
    // Log only the error message — never the API key or full payload.
    console.error('[contact] Error calling Brevo API:', err && err.message ? err.message : err);
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to deliver your message. Please try again later.',
    });
  }

  if (!response.ok) {
    // Brevo returns a JSON body with an explanatory message on errors.
    let detail = '';
    try {
      detail = (await response.text()).slice(0, 500);
    } catch (err) { /* ignore */ }
    console.error(`[contact] Brevo API error (${response.status}): ${detail}`);
    return res.status(502).json({
      success: false,
      error: 'Bad Gateway',
      message: 'Failed to deliver your message. Please try again later.',
    });
  }

  return res.status(200).json({
    success: true,
    message: 'Thank you for reaching out! We will get back to you soon.',
  });
};

