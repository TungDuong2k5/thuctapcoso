const { Server } = require('socket.io');
const { userFromToken } = require('../middlewares/auth');
const { ProjectMember } = require('../models');

let io = null;
// Tin nhắn trong từng phòng gọi (giữ trong bộ nhớ, tối đa 200 tin; xóa khi kết thúc cuộc gọi)
const callChats = new Map();

function initSocket(httpServer) {
  io = new Server(httpServer, { cors: { origin: '*' } });

  // Xác thực bằng JWT gửi kèm khi kết nối
  io.use(async (socket, next) => {
    try {
      socket.user = await userFromToken(socket.handshake.auth?.token);
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`user:${socket.user.id}`);

    socket.on('project:join', async (projectId) => {
      const isMember = socket.user.systemRole === 'admin'
        || await ProjectMember.findOne({ where: { projectId, userId: socket.user.id } });
      if (isMember) socket.join(`project:${projectId}`);
    });

    socket.on('project:leave', (projectId) => socket.leave(`project:${projectId}`));

    registerCallSignaling(socket);
  });

  return io;
}

// ----- Gọi nhóm: trao đổi tín hiệu WebRTC giữa các máy trong cùng phòng -----
// Mỗi người kết nối trực tiếp với từng người khác (mesh), server chỉ chuyển tiếp offer/answer/ICE.
function registerCallSignaling(socket) {
  const { verifyCallToken } = require('../controllers/callController'); // tránh vòng lặp require

  const peerInfo = (s) => ({
    socketId: s.id,
    userId: s.user.id,
    fullName: s.user.fullName,
    avatarUrl: s.user.avatarUrl,
    media: s.data.media || {},
    hand: Boolean(s.data.hand),
    recording: Boolean(s.data.recording),
  });

  const leave = () => {
    const roomId = socket.data.callRoomId;
    if (!roomId) return;
    socket.to(`call:${roomId}`).emit('call:peer-left', { socketId: socket.id });
    socket.leave(`call:${roomId}`);
    socket.data.callRoomId = null;
    socket.data.hand = false;
    socket.data.recording = false;
  };

  socket.on('call:join', async ({ token, media } = {}, ack = () => {}) => {
    try {
      const room = await verifyCallToken(token, socket.user.id);
      leave();
      socket.data.callRoomId = room.id;
      socket.data.media = media || {};
      const others = await io.in(`call:${room.id}`).fetchSockets();
      socket.join(`call:${room.id}`);
      socket.to(`call:${room.id}`).emit('call:peer-joined', peerInfo(socket));
      ack({ ok: true, peers: others.map(peerInfo), chat: callChats.get(room.id) || [] });
    } catch {
      ack({ ok: false, message: 'Vé vào phòng không hợp lệ hoặc cuộc gọi đã kết thúc' });
    }
  });

  // Chuyển tín hiệu cho đúng người, chỉ khi cả hai đang ở cùng một phòng
  socket.on('call:signal', ({ to, data } = {}) => {
    const roomId = socket.data.callRoomId;
    const target = io.sockets.sockets.get(to);
    if (!roomId || !target || target.data.callRoomId !== roomId) return;
    target.emit('call:signal', { from: socket.id, data });
  });

  socket.on('call:media', (media = {}) => {
    if (!socket.data.callRoomId) return;
    socket.data.media = media;
    socket.to(`call:${socket.data.callRoomId}`).emit('call:peer-media', { socketId: socket.id, media });
  });

  // Nhắn tin trong cuộc gọi
  socket.on('call:chat', (text) => {
    const roomId = socket.data.callRoomId;
    const content = String(text || '').trim().slice(0, 1000);
    if (!roomId || !content) return;
    const msg = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      userId: socket.user.id,
      fullName: socket.user.fullName,
      text: content,
      at: new Date().toISOString(),
    };
    const list = callChats.get(roomId) || [];
    list.push(msg);
    callChats.set(roomId, list.slice(-200));
    io.to(`call:${roomId}`).emit('call:chat', msg);
  });

  // Giơ tay phát biểu
  socket.on('call:hand', (raised) => {
    const roomId = socket.data.callRoomId;
    if (!roomId) return;
    socket.data.hand = Boolean(raised);
    io.to(`call:${roomId}`).emit('call:peer-hand', { socketId: socket.id, fullName: socket.user.fullName, raised: socket.data.hand });
  });

  // Báo cho cả phòng biết ai đang ghi âm
  socket.on('call:recording', (on) => {
    const roomId = socket.data.callRoomId;
    if (!roomId) return;
    socket.data.recording = Boolean(on);
    io.to(`call:${roomId}`).emit('call:peer-recording', { socketId: socket.id, fullName: socket.user.fullName, on: socket.data.recording });
  });

  socket.on('call:leave', leave);
  socket.on('disconnect', leave);
}

// Khi chạy test không có socket server, các hàm emit sẽ bỏ qua
function emitToProject(projectId, event, payload) {
  if (io) io.to(`project:${projectId}`).emit(event, payload);
}

function emitToUser(userId, event, payload) {
  if (io) io.to(`user:${userId}`).emit(event, payload);
}

function emitToCall(roomId, event, payload) {
  if (io) io.to(`call:${roomId}`).emit(event, payload);
}

function clearCallChat(roomId) {
  callChats.delete(roomId);
}

module.exports = {
  initSocket, emitToProject, emitToUser, emitToCall, clearCallChat,
};
