const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const {
  CallRoom, Project, ProjectMember, User,
} = require('../models');
const { getRole, requireLeader } = require('../services/projectAccess');
const { notify } = require('../services/notify');
const { emitToProject, emitToCall, clearCallChat } = require('../sockets');
const { HttpError } = require('../utils/http');
const { getIceServers } = require('../services/iceServers');

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // bỏ ký tự dễ nhầm O/0, I/1
const PASSWORD_RE = /^[A-Za-z0-9]{4,20}$/;
const secret = () => process.env.JWT_SECRET || 'dev-secret';

const randomCode = () => Array.from(crypto.randomBytes(6), (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
const randomPassword = () => String(crypto.randomInt(0, 1e6)).padStart(6, '0');

// Chống dò mật khẩu: tối đa 10 lần nhập sai mỗi 10 phút cho mỗi người
const failures = new Map();
function checkAttempts(userId) {
  const f = failures.get(userId);
  if (f && f.until > Date.now() && f.count >= 10) {
    throw new HttpError(429, 'Bạn nhập sai quá nhiều lần, thử lại sau 10 phút');
  }
}
function recordFailure(userId) {
  const f = failures.get(userId);
  if (!f || f.until < Date.now()) failures.set(userId, { count: 1, until: Date.now() + 10 * 60 * 1000 });
  else f.count += 1;
}

function roomJson(room, isLeader) {
  const json = {
    id: room.id,
    projectId: room.projectId,
    title: room.title,
    code: room.code,
    status: room.status,
    createdAt: room.createdAt,
    host: room.host ? { id: room.host.id, fullName: room.host.fullName } : null,
  };
  if (isLeader) json.password = room.password; // chỉ trưởng nhóm xem lại được mật khẩu để gửi cho thành viên
  return json;
}

async function sendInvites(room, project, actor, userIds) {
  await notify(userIds, actor.id, {
    type: 'call_invite',
    message: `📞 ${actor.fullName} mời bạn vào cuộc gọi nhóm "${room.title || project.name}". Mã phòng: ${room.code} · Mật khẩu: ${room.password}`,
    link: `/projects/${project.id}/call?code=${room.code}`,
  });
}

async function list(req, res) {
  const role = await getRole(req.params.projectId, req.user);
  const rooms = await CallRoom.findAll({
    where: { projectId: req.params.projectId, status: 'active' },
    include: [{ model: User, as: 'host', attributes: ['id', 'fullName'] }],
    order: [['id', 'DESC']],
  });
  res.json(rooms.map((r) => roomJson(r, role === 'leader')));
}

// Trưởng nhóm mở phòng gọi: tạo mã phòng + mật khẩu, gửi thông báo cho các thành viên
async function create(req, res) {
  const projectId = Number(req.params.projectId);
  await requireLeader(projectId, req.user);
  if (await CallRoom.count({ where: { projectId, status: 'active' } })) {
    throw new HttpError(400, 'Dự án đang có một phòng gọi, hãy kết thúc phòng cũ trước');
  }
  const password = String(req.body.password || '').trim() || randomPassword();
  if (!PASSWORD_RE.test(password)) throw new HttpError(400, 'Mật khẩu phòng gồm 4–20 chữ cái hoặc số');
  const title = String(req.body.title || '').trim().slice(0, 100) || null;

  let code;
  do code = randomCode(); while (await CallRoom.findOne({ where: { code } }));
  const room = await CallRoom.create({
    projectId, code, password, title, hostId: req.user.id,
  });
  room.host = req.user;

  const project = await Project.findByPk(projectId);
  if (req.body.notify !== false) {
    const members = await ProjectMember.findAll({ where: { projectId } });
    await sendInvites(room, project, req.user, members.map((m) => m.userId));
  }
  emitToProject(projectId, 'call:changed', {});
  res.status(201).json(roomJson(room, true));
}

// Gửi lại mã phòng + mật khẩu (cho tất cả hoặc một số thành viên)
async function invite(req, res) {
  const room = await CallRoom.findByPk(req.params.id);
  if (!room || room.status !== 'active') throw new HttpError(404, 'Phòng gọi không tồn tại hoặc đã kết thúc');
  await requireLeader(room.projectId, req.user);
  const members = await ProjectMember.findAll({ where: { projectId: room.projectId } });
  let ids = members.map((m) => m.userId);
  if (Array.isArray(req.body.userIds) && req.body.userIds.length) {
    ids = ids.filter((id) => req.body.userIds.map(Number).includes(id));
  }
  await sendInvites(room, await Project.findByPk(room.projectId), req.user, ids);
  res.json({ sent: ids.filter((id) => id !== req.user.id).length });
}

// Vào phòng: phải là người trong dự án và nhập đúng mã phòng + mật khẩu
async function join(req, res) {
  checkAttempts(req.user.id);
  const code = String(req.body.code || '').trim().toUpperCase();
  const password = String(req.body.password || '').trim();
  const room = code ? await CallRoom.findOne({ where: { code } }) : null;
  if (!room || room.status !== 'active') {
    recordFailure(req.user.id);
    throw new HttpError(400, 'Mã phòng không đúng hoặc cuộc gọi đã kết thúc');
  }
  await getRole(room.projectId, req.user); // người ngoài dự án → 403
  const a = Buffer.from(password);
  const b = Buffer.from(room.password);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    recordFailure(req.user.id);
    throw new HttpError(400, 'Mật khẩu phòng không đúng');
  }
  failures.delete(req.user.id);
  const token = jwt.sign({ purpose: 'call', roomId: room.id, userId: req.user.id }, secret(), { expiresIn: '12h' });
  res.json({
    token,
    room: {
      id: room.id, projectId: room.projectId, code: room.code, title: room.title,
    },
  });
}

async function end(req, res) {
  const room = await CallRoom.findByPk(req.params.id);
  if (!room || room.status !== 'active') throw new HttpError(404, 'Phòng gọi không tồn tại hoặc đã kết thúc');
  await requireLeader(room.projectId, req.user);
  await room.update({ status: 'ended', endedAt: new Date() });
  emitToCall(room.id, 'call:ended', { id: room.id });
  clearCallChat(room.id);
  emitToProject(room.projectId, 'call:changed', {});
  res.json({ success: true });
}

// Máy chủ STUN/TURN cho trình duyệt (chỉ người đã đăng nhập)
async function iceServers(req, res) {
  res.json(await getIceServers());
}

// Dùng cho socket: kiểm tra vé vào phòng
async function verifyCallToken(token, userId) {
  const payload = jwt.verify(token, secret());
  if (payload.purpose !== 'call' || payload.userId !== userId) throw new Error('invalid');
  const room = await CallRoom.findByPk(payload.roomId);
  if (!room || room.status !== 'active') throw new Error('ended');
  return room;
}

module.exports = {
  list, create, invite, join, end, verifyCallToken, iceServers,
};
