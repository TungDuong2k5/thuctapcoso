const express = require('express');
const { requireAuth, requireAdmin } = require('../middlewares/auth');
const { asyncHandler: h } = require('../utils/http');
const auth = require('../controllers/authController');
const admin = require('../controllers/adminController');
const projects = require('../controllers/projectController');
const tasks = require('../controllers/taskController');
const reports = require('../controllers/reportController');
const stats = require('../controllers/statsController');
const notifications = require('../controllers/notificationController');
const attachments = require('../controllers/attachmentController');
const { uploadFiles } = require('../middlewares/upload');

const router = express.Router();

// Công khai
router.post('/auth/register', h(auth.register));
router.post('/auth/login', h(auth.login));
router.post('/auth/google', h(auth.googleLogin));
router.get('/auth/config', auth.authConfig);
router.get('/auth/reset-password', h(auth.checkResetToken));
router.post('/auth/reset-password', h(auth.resetPassword));
router.get('/invitations/:token', h(projects.invitationInfo));

// Từ đây trở xuống phải đăng nhập
router.use(requireAuth);

router.get('/auth/me', h(auth.me));
router.put('/users/me', h(auth.updateMe));
router.get('/users/search', h(projects.searchUsers));

router.get('/admin/users', requireAdmin, h(admin.listUsers));
router.patch('/admin/users/:id', requireAdmin, h(admin.updateUser));
router.post('/admin/users/:id/reset-link', requireAdmin, h(admin.resetLink));

router.get('/projects', h(projects.list));
router.post('/projects', h(projects.create));
router.get('/projects/:id', h(projects.detail));
router.put('/projects/:id', h(projects.update));
router.post('/projects/:id/members', h(projects.addMembers));
router.delete('/projects/:id/members/:userId', h(projects.removeMember));
router.get('/projects/:id/invitations', h(projects.listInvitations));
router.delete('/invitations/:inviteId', h(projects.cancelInvitation));
router.post('/invitations/:token/accept', h(projects.acceptInvitation));

router.get('/projects/:projectId/tasks', h(tasks.list));
router.post('/projects/:projectId/tasks', h(tasks.create));
router.get('/tasks/:id', h(tasks.detail));
router.put('/tasks/:id', h(tasks.update));
router.patch('/tasks/:id/move', h(tasks.move));
router.post('/tasks/:id/review', h(tasks.review));
router.delete('/tasks/:id', h(tasks.remove));
router.post('/tasks/:id/comments', h(tasks.addComment));
router.post('/tasks/:id/attachments', h(attachments.checkTaskAccess), uploadFiles, h(attachments.upload));
router.post('/tasks/:id/submit', h(attachments.checkTaskAccess), uploadFiles, h(attachments.submit));
router.get('/attachments/:id/download', h(attachments.download));
router.delete('/attachments/:id', h(attachments.remove));

router.get('/projects/:projectId/reports', h(reports.list));
router.get('/projects/:projectId/reports/suggest', h(reports.suggest));
router.post('/projects/:projectId/reports', h(reports.save));
router.patch('/reports/:id/review', h(reports.review));

router.get('/projects/:projectId/stats', h(stats.projectStats));

router.get('/notifications', h(notifications.list));
router.patch('/notifications/read', h(notifications.markRead));
router.patch('/notifications/:id/read', h(notifications.markRead));

module.exports = router;
