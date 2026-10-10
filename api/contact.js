/**
 * Vercel Serverless Function: POST /api/contact
 *
 * Accepts contact-form submissions and sends an email notification
 * via the SendGrid v3 Mail Send Web API using Node's built-in `fetch`.
 *
 * Environment variables (set in the Vercel project settings):
 *   SENDGRID_API_KEY     - SendGrid API key (secret, never sent to clients)
 *   SENDGRID_FROM_EMAIL  - Verified sender address used in the "From" field
 *   SENDGRID_TO_EMAIL    - Recipient address that should receive inquiries
 *
 * Important: Vercel Serverless Functions do not guarantee that `req.body`
 * is already parsed (this is unreliable for same-origin `fetch` calls).
 * This module therefore reads and parses the raw request body stream itself,
 * so the contact form works reliably regardless of the hosting platform.
 */

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    const limit = 1024 * 1024; // 1 MB safety limit

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('Payload too large'));
        try { req.destroy(); } catch (err) { /* ignore */ }
        return;
      }
      body += chunk;
    });

    req.on('end', () => {
      if (!body) return resolve(undefined);
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        // Not valid JSON -> treat as empty body.
        resolve(undefined);
      }
    });

    req.on('error', reject);
  });
}

/**
 * Escape user-supplied text for safe interpolation into the HTML email body.
 * Every field below is rendered inside HTML markup, so this is required to
 * prevent markup injection (and broken emails) from arbitrary input.
 */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}


async function parseBody(req) {
  let data = req.body;

  if (data !== undefined && typeof data === 'object' && !Array.isArray(data)) {
    return data;
  }

  if (typeof data === 'string' && data.trim()) {
    try {
      const parsed = JSON.parse(data);
      if (typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch (err) {
      // Not valid JSON -> fall through to reading the raw stream.
    }
  }

  const raw = await readJsonBody(req);
  if (raw !== undefined && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw;
  }
  return {};
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
    return res.status(413).json({
      success: false,
      error: 'Payload Too Large',
      message: 'The submitted data is too large. Please shorten your message.',
    });
  }

  const name = (data.name || '').toString().trim();
  const email = (data.email || '').toString().trim();
  const phone = (data.phone || '').toString().trim();
  const service = (data.service || '').toString().trim();
  const message = (data.message || '').toString().trim();

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

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const hasValidEmail = Boolean(email) && emailRegex.test(email);
  if (email && !hasValidEmail) {
    return res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: 'A valid email address must be provided when email is supplied.',
    });
  }

  const apiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL;
  const toEmail = process.env.SENDGRID_TO_EMAIL;

  if (!apiKey) {
    console.error('[contact] SENDGRID_API_KEY environment variable is not set.');
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Server email configuration error: API key is missing.',
    });
  }

  if (!fromEmail || !toEmail) {
    console.error('[contact] SENDGRID_FROM_EMAIL or SENDGRID_TO_EMAIL is not set.');
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Server email configuration error: sender or recipient is missing.',
    });
  }
  const replyTo = hasValidEmail ? email : undefined;
  const htmlContent = `
    <div style="font-family: sans-serif; padding: 16px; border: 1px solid #ddd; border-radius: 8px; max-width: 600px;">
      <h2 style="color: #0A1628;">New Contact Form Submission</h2>
      <p style="color: #3A4A5C;"><b>Name:</b> ${escapeHtml(name)}</p>
      ${hasValidEmail ? `<p style="color: #3A4A5C;"><b>Email:</b> ${escapeHtml(email)}</p>` : ''}
      <p style="color: #3A4A5C;"><b>Phone:</b> ${escapeHtml(phone)}</p>
      <p style="color: #3A4A5C;"><b>Service:</b> ${escapeHtml(service)}</p>
      <p style="color: #3A4A5C;"><b>Message:</b><br>${escapeHtml(message)}</p>
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

  const payload = {
    personalizations: [
      {
        to: [{ email: toEmail }],
        reply_to: replyTo ? { email: replyTo } : undefined,
      },
    ],
    from: { email: fromEmail },
    subject: `New contact form submission - IBS (${service})`,
    content: [
      {
        type: 'text/plain',
        value: textContent,
      },
      {
        type: 'text/html',
        value: htmlContent,
      },
    ],
  };

  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[contact] SendGrid API error (${response.status}): ${errorText}`);
      return res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: 'Failed to deliver your message. Please try again later.',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Thank you for reaching out! We will get back to you soon.',
    });
  } catch (err) {
    console.error('[contact] Error calling SendGrid API:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to deliver your message. Please try again later.',
    });
  }
};
