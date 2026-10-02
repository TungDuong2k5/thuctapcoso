const { OAuth2Client } = require('google-auth-library');

let client = null;

// Kiểm tra ID token Google gửi về (đúng chữ ký Google, đúng Client ID của app, chưa hết hạn)
async function verifyCredential(credential) {
  if (!credential || typeof credential !== 'string') return null;
  if (!client) client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
  try {
    const ticket = await client.verifyIdToken({ idToken: credential, audience: process.env.GOOGLE_CLIENT_ID });
    return ticket.getPayload(); // { sub, email, email_verified, name, picture, ... }
  } catch {
    return null;
  }
}

module.exports = { verifyCredential };
