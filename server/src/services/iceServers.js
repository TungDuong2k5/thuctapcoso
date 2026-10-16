// Danh sách máy chủ ICE cho cuộc gọi WebRTC.
// - STUN (miễn phí, luôn có): giúp 2 máy tìm đường kết nối trực tiếp
// - TURN (tùy chọn): trung chuyển âm thanh/hình ảnh khi mạng chặn kết nối trực tiếp (4G, wifi trường/công ty...)
//   Cách 1: Cloudflare TURN  → CF_TURN_KEY_ID + CF_TURN_API_TOKEN (cấp mật khẩu tạm cho từng cuộc gọi)
//   Cách 2: TURN bất kỳ      → TURN_URLS (cách nhau dấu phẩy) + TURN_USERNAME + TURN_CREDENTIAL
const STUN = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];

async function cloudflareTurn() {
  const { CF_TURN_KEY_ID: keyId, CF_TURN_API_TOKEN: token } = process.env;
  if (!keyId || !token) return null;
  try {
    const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: 12 * 3600 }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return [].concat(data.iceServers || []);
  } catch (err) {
    console.error('Không lấy được TURN của Cloudflare:', err.message);
    return null;
  }
}

function staticTurn() {
  const { TURN_URLS, TURN_USERNAME, TURN_CREDENTIAL } = process.env;
  if (!TURN_URLS) return null;
  return [{
    urls: TURN_URLS.split(',').map((u) => u.trim()).filter(Boolean),
    username: TURN_USERNAME,
    credential: TURN_CREDENTIAL,
  }];
}

async function getIceServers() {
  const turn = (await cloudflareTurn()) || staticTurn() || [];
  return { iceServers: [...STUN, ...turn], hasTurn: turn.length > 0 };
}

module.exports = { getIceServers };
