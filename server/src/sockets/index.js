const { Server } = require('socket.io');
const { userFromToken } = require('../middlewares/auth');
const { ProjectMember } = require('../models');

let io = null;

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
  });

  return io;
}

// Khi chạy test không có socket server, các hàm emit sẽ bỏ qua
function emitToProject(projectId, event, payload) {
  if (io) io.to(`project:${projectId}`).emit(event, payload);
}

function emitToUser(userId, event, payload) {
  if (io) io.to(`user:${userId}`).emit(event, payload);
}

module.exports = { initSocket, emitToProject, emitToUser };
