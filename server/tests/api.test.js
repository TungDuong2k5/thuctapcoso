process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';
process.env.JWT_SECRET = 'test-secret';
process.env.UPLOAD_DIR = 'tests/tmp-uploads';

const request = require('supertest');
const app = require('../src/app');
const { sequelize } = require('../src/models');

let leader;
let member;
let projectId;

async function register(fullName, email) {
  const res = await request(app).post('/api/auth/register').send({ fullName, email, password: '123456' });
  return res.body.token;
}

const as = (token) => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  await sequelize.sync({ force: true });
  leader = await register('Trưởng nhóm', 'leader@test.local');
  member = await register('Thành viên', 'member@test.local');
});

afterAll(async () => {
  await sequelize.close();
  require('fs').rmSync(require('path').join(__dirname, 'tmp-uploads'), { recursive: true, force: true });
});

describe('Xác thực', () => {
  test('đăng nhập sai mật khẩu bị từ chối', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'leader@test.local', password: 'sai' });
    expect(res.status).toBe(400);
  });

  test('không có token thì không gọi được API', async () => {
    const res = await request(app).get('/api/projects');
    expect(res.status).toBe(401);
  });
});

describe('Dự án và công việc', () => {
  test('tạo dự án và thêm thành viên', async () => {
    const created = await request(app).post('/api/projects').set(as(leader)).send({ name: 'Dự án test' });
    expect(created.status).toBe(201);
    projectId = created.body.id;

    const added = await request(app).post(`/api/projects/${projectId}/members`).set(as(leader)).send({ email: 'member@test.local' });
    expect(added.status).toBe(201);
  });

  test('người ngoài dự án không xem được task', async () => {
    const outsider = await register('Người ngoài', 'out@test.local');
    const res = await request(app).get(`/api/projects/${projectId}/tasks`).set(as(outsider));
    expect(res.status).toBe(403);
  });

  test('Bắt đầu → In progress; không kéo tay vào Review/Done', async () => {
    const task = await request(app).post(`/api/projects/${projectId}/tasks`).set(as(member)).send({ title: 'Việc 1' });
    const start = await request(app).patch(`/api/tasks/${task.body.id}/move`).set(as(member)).send({ status: 'in_progress' });
    expect(start.status).toBe(200);
    expect(start.body.assigneeId).toBeTruthy(); // việc chưa giao: ai bắt đầu thì nhận việc

    for (const status of ['review', 'done']) {
      for (const who of [member, leader]) {
        const res = await request(app).patch(`/api/tasks/${task.body.id}/move`).set(as(who)).send({ status });
        expect(res.status).toBe(400);
      }
    }
  });
});

describe('Cập nhật tiến độ và nộp file', () => {
  let taskId;

  test('người làm cập nhật % tiến độ', async () => {
    const task = await request(app).post(`/api/projects/${projectId}/tasks`).set(as(member)).send({ title: 'Viết báo cáo' });
    taskId = task.body.id;
    const res = await request(app).put(`/api/tasks/${taskId}`).set(as(member)).send({ progress: 60 });
    expect(res.body.progress).toBe(60);

    const bad = await request(app).put(`/api/tasks/${taskId}`).set(as(member)).send({ progress: 150 });
    expect(bad.status).toBe(400);
  });

  test('gửi nhiều loại file: tự sang Review, tên tiếng Việt giữ nguyên, tải về được', async () => {
    const res = await request(app).post(`/api/tasks/${taskId}/submit`).set(as(member))
      .field('note', 'Em nộp bản nháp')
      .attach('files', Buffer.from('noi dung word'), 'Báo cáo tuần 3.docx')
      .attach('files', Buffer.from('%PDF-1.4'), 'slide.pdf')
      .attach('files', Buffer.from('a,b'), 'du-lieu.xlsx');
    expect(res.status).toBe(201);
    expect(res.body.task.status).toBe('review'); // gửi báo cáo xong tự sang Review
    expect(res.body.task.submittedAt).toBeTruthy();
    expect(res.body.attachments.map((a) => a.originalName)).toContain('Báo cáo tuần 3.docx');

    const file = await request(app).get(`/api/attachments/${res.body.attachments[0].id}/download`).set(as(leader));
    expect(file.status).toBe(200);
    expect(file.headers['content-disposition']).toContain('attachment');
  });

  test('chặn file chạy được (.exe) và người ngoài dự án không tải được', async () => {
    const exe = await request(app).post(`/api/tasks/${taskId}/attachments`).set(as(member))
      .attach('files', Buffer.from('MZ'), 'virus.exe');
    expect(exe.status).toBe(400);

    const detail = await request(app).get(`/api/tasks/${taskId}`).set(as(leader));
    const outsider = await register('Người lạ', 'la@test.local');
    const res = await request(app).get(`/api/attachments/${detail.body.attachments[0].id}/download`).set(as(outsider));
    expect(res.status).toBe(403);
  });
});

describe('Review: trưởng nhóm nhận xét bài thành viên, thành viên nhận xét bài trưởng nhóm', () => {
  let memberId;
  let leaderId;
  let otherMember;

  beforeAll(async () => {
    memberId = (await request(app).get('/api/auth/me').set(as(member))).body.id;
    leaderId = (await request(app).get('/api/auth/me').set(as(leader))).body.id;
    otherMember = await register('Thành viên 2', 'tv2@test.local');
    await request(app).post(`/api/projects/${projectId}/members`).set(as(leader)).send({ emails: 'tv2@test.local' });
  });

  const newTask = async (title, assigneeId) => (await request(app).post(`/api/projects/${projectId}/tasks`).set(as(leader))
    .send({ title, assigneeId })).body.id;
  const startAndSubmit = async (id, who, file = 'bao-cao.docx') => {
    await request(app).patch(`/api/tasks/${id}/move`).set(as(who)).send({ status: 'in_progress' });
    return request(app).post(`/api/tasks/${id}/submit`).set(as(who)).attach('files', Buffer.from('x'), file);
  };

  test('gửi báo cáo phải có file; không gửi thay người khác', async () => {
    const id = await newTask('Chương 1', memberId);
    await request(app).patch(`/api/tasks/${id}/move`).set(as(member)).send({ status: 'in_progress' });
    const noFile = await request(app).post(`/api/tasks/${id}/submit`).set(as(member)).field('note', 'x');
    expect(noFile.status).toBe(400);
    const byLeader = await request(app).post(`/api/tasks/${id}/submit`).set(as(leader)).attach('files', Buffer.from('x'), 'a.docx');
    expect(byLeader.status).toBe(403);
    const startByLeader = await request(app).patch(`/api/tasks/${(await newTask('Chương 1b', memberId))}/move`).set(as(leader)).send({ status: 'in_progress' });
    expect(startByLeader.status).toBe(403);
  });

  test('bài thành viên: tự sang Review, trưởng nhóm nhận xét; thành viên khác không xét được', async () => {
    const id = await newTask('ERD', memberId);
    const sub = await startAndSubmit(id, member);
    expect(sub.body.task.status).toBe('review');
    const leaderNotif = await request(app).get('/api/notifications').set(as(leader));
    expect(leaderNotif.body.items[0].message).toContain('mời bạn nhận xét');

    const byOther = await request(app).post(`/api/tasks/${id}/review`).set(as(otherMember)).send({ decision: 'approve' });
    expect(byOther.status).toBe(403);
    const self = await request(app).post(`/api/tasks/${id}/review`).set(as(member)).send({ decision: 'approve' });
    expect(self.status).toBe(403);

    const noNote = await request(app).post(`/api/tasks/${id}/review`).set(as(leader)).send({ decision: 'reject' });
    expect(noNote.status).toBe(400);
    const rejected = await request(app).post(`/api/tasks/${id}/review`).set(as(leader))
      .send({ decision: 'reject', goodPoints: 'Bố cục rõ ràng', improvements: 'Thiếu bảng reports' });
    expect(rejected.body.status).toBe('in_progress');
    expect(rejected.body.submittedAt).toBeNull();
    const notif = await request(app).get('/api/notifications').set(as(member));
    expect(notif.body.items[0].message).toContain('Ổn: Bố cục rõ ràng');
    expect(notif.body.items[0].message).toContain('Cần bổ sung: Thiếu bảng reports');

    await request(app).post(`/api/tasks/${id}/submit`).set(as(member)).attach('files', Buffer.from('x'), 'erd-v2.png');
    const ok = await request(app).post(`/api/tasks/${id}/review`).set(as(leader)).send({ decision: 'approve', goodPoints: 'Tốt' });
    expect(ok.body.status).toBe('done');
    const detail = await request(app).get(`/api/tasks/${id}`).set(as(member));
    expect(detail.body.reviews.map((r) => r.decision)).toEqual(['approve', 'reject']);
  });

  test('bài trưởng nhóm: các thành viên nhận xét, góp ý không đổi trạng thái', async () => {
    const id = await newTask('Slide tổng hợp', leaderId);
    const sub = await startAndSubmit(id, leader, 'slide.pptx');
    expect(sub.body.task.status).toBe('review');
    const memberNotif = await request(app).get('/api/notifications').set(as(otherMember));
    expect(memberNotif.body.items[0].message).toContain('mời bạn nhận xét');

    const self = await request(app).post(`/api/tasks/${id}/review`).set(as(leader)).send({ decision: 'approve' });
    expect(self.status).toBe(403);
    const comment = await request(app).post(`/api/tasks/${id}/review`).set(as(otherMember))
      .send({ decision: 'comment', improvements: 'Thêm slide demo' });
    expect(comment.body.status).toBe('review');
    const approve = await request(app).post(`/api/tasks/${id}/review`).set(as(member)).send({ decision: 'approve', goodPoints: 'Slide đẹp' });
    expect(approve.body.status).toBe('done');
    const leaderNotif = await request(app).get('/api/notifications').set(as(leader));
    expect(leaderNotif.body.items[0].message).toContain('ĐẠT');
  });

  test('chỉ trưởng nhóm mở lại được việc đã Done', async () => {
    const id = await newTask('Mở lại', memberId);
    await startAndSubmit(id, member);
    await request(app).post(`/api/tasks/${id}/review`).set(as(leader)).send({ decision: 'approve' });
    const byMember = await request(app).patch(`/api/tasks/${id}/move`).set(as(member)).send({ status: 'in_progress' });
    expect(byMember.status).toBe(403);
    const byLeader = await request(app).patch(`/api/tasks/${id}/move`).set(as(leader)).send({ status: 'in_progress' });
    expect(byLeader.status).toBe(200);
  });
});

describe('Nhắc hạn tự động', () => {
  const { checkDeadlines, vnDate } = require('../src/services/deadlines');
  let memberId;

  beforeAll(async () => {
    memberId = (await request(app).get('/api/auth/me').set(as(member))).body.id;
  });

  test('sắp đến hạn: nhắc người làm 1 lần; quá hạn: nhắc người làm + trưởng nhóm, mỗi ngày 1 lần', async () => {
    await request(app).post(`/api/projects/${projectId}/tasks`).set(as(leader))
      .send({ title: 'Việc sắp hạn', assigneeId: memberId, dueDate: vnDate(1) });
    await request(app).post(`/api/projects/${projectId}/tasks`).set(as(leader))
      .send({ title: 'Việc quá hạn', assigneeId: memberId, dueDate: vnDate(-2) });

    await checkDeadlines();
    const memberMsgs = (await request(app).get('/api/notifications').set(as(member))).body.items.map((n) => n.message);
    expect(memberMsgs.some((m) => m.includes('Sắp đến hạn: "Việc sắp hạn"'))).toBe(true);
    expect(memberMsgs.some((m) => m.includes('Quá hạn: "Việc quá hạn"'))).toBe(true);
    const leaderMsgs = (await request(app).get('/api/notifications').set(as(leader))).body.items.map((n) => n.message);
    expect(leaderMsgs.some((m) => m.includes('"Việc quá hạn"') && m.includes('đã quá hạn'))).toBe(true);

    // chạy lại trong cùng ngày thì không nhắc trùng
    const before = (await request(app).get('/api/notifications').set(as(member))).body.unread;
    await checkDeadlines();
    const after = (await request(app).get('/api/notifications').set(as(member))).body.unread;
    expect(after).toBe(before);

    // sang ngày hôm sau vẫn quá hạn → nhắc tiếp
    await checkDeadlines(Date.now() + 864e5);
    const nextDay = (await request(app).get('/api/notifications').set(as(member))).body.unread;
    expect(nextDay).toBeGreaterThan(after);
  });
});

describe('Thông tin thành viên', () => {
  test('tự cập nhật hồ sơ; cả nhóm xem được kèm thống kê công việc', async () => {
    const res = await request(app).put('/api/users/me').set(as(member)).send({
      studentCode: 'B22DCCN001', className: 'D22CQCN01-B', phone: '0912 345 678', dateOfBirth: '2004-05-20', bio: 'React, Node',
    });
    expect(res.status).toBe(200);
    expect(res.body.studentCode).toBe('B22DCCN001');

    const bad = await request(app).put('/api/users/me').set(as(member)).send({ phone: 'abc' });
    expect(bad.status).toBe(400);

    const project = await request(app).get(`/api/projects/${projectId}`).set(as(leader));
    const m = project.body.members.find((x) => x.email === 'member@test.local');
    expect(m).toMatchObject({ studentCode: 'B22DCCN001', className: 'D22CQCN01-B', phone: '0912 345 678' });
    expect(m.stats.total).toBeGreaterThan(0);
    expect(m.passwordHash).toBeUndefined();
  });
});

describe('Đăng nhập bằng Google', () => {
  const google = require('../src/services/googleAuth');
  let fakeProfile;

  beforeAll(() => {
    process.env.GOOGLE_CLIENT_ID = '123-test.apps.googleusercontent.com';
    jest.spyOn(google, 'verifyCredential').mockImplementation(async (c) => (c === 'hop-le' ? fakeProfile : null));
  });
  afterAll(() => { delete process.env.GOOGLE_CLIENT_ID; });

  test('trang đăng nhập biết có bật Google hay không', async () => {
    const res = await request(app).get('/api/auth/config');
    expect(res.body.googleClientId).toBe('123-test.apps.googleusercontent.com');
  });

  test('token Google giả bị từ chối', async () => {
    const res = await request(app).post('/api/auth/google').send({ credential: 'gia-mao' });
    expect(res.status).toBe(400);
  });

  test('Gmail mới: tự tạo tài khoản, tự vào dự án đã được mời; chưa có mật khẩu nên đặt lần đầu không cần mật khẩu cũ', async () => {
    await request(app).post(`/api/projects/${projectId}/members`).set(as(leader)).send({ emails: 'gg.moi@gmail.com' });
    fakeProfile = { sub: 'g-1', email: 'gg.moi@gmail.com', email_verified: true, name: 'Người Google' };
    const res = await request(app).post('/api/auth/google').send({ credential: 'hop-le' });
    expect(res.status).toBe(201);
    expect(res.body.user.fullName).toBe('Người Google');
    expect(res.body.user.hasPassword).toBe(false);
    expect(res.body.joinedProjects).toBe(1);

    const pwLogin = await request(app).post('/api/auth/login').send({ email: 'gg.moi@gmail.com', password: 'bat-ky' });
    expect(pwLogin.status).toBe(400);
    expect(pwLogin.body.message).toContain('Google');

    const setPw = await request(app).put('/api/users/me').set(as(res.body.token)).send({ newPassword: 'matkhau1', confirmPassword: 'matkhau1' });
    expect(setPw.status).toBe(200);
    const pwLogin2 = await request(app).post('/api/auth/login').send({ email: 'gg.moi@gmail.com', password: 'matkhau1' });
    expect(pwLogin2.status).toBe(200);
  });

  test('Gmail đã có tài khoản (đăng ký bằng mật khẩu): đăng nhập vào đúng tài khoản cũ', async () => {
    fakeProfile = { sub: 'g-2', email: 'leader@test.local', email_verified: true, name: 'Tên khác' };
    const res = await request(app).post('/api/auth/google').send({ credential: 'hop-le' });
    expect(res.status).toBe(200);
    expect(res.body.user.fullName).toBe('Trưởng nhóm');
    const pw = await request(app).post('/api/auth/login').send({ email: 'leader@test.local', password: '123456' });
    expect(pw.status).toBe(200); // mật khẩu cũ vẫn dùng được
  });
});

describe('Admin tạo link đặt lại mật khẩu', () => {
  test('link dùng 1 lần, mật khẩu nhập lại phải khớp, phiên cũ bị đăng xuất', async () => {
    const { User } = require('../src/models');
    const adminToken = await register('Quản trị', 'qt@test.local');
    await User.update({ systemRole: 'admin' }, { where: { email: 'qt@test.local' } });
    const victim = await register('Hay quên', 'quen@test.local');
    const victimId = (await request(app).get('/api/auth/me').set(as(victim))).body.id;

    const byMember = await request(app).post(`/api/admin/users/${victimId}/reset-link`).set(as(member));
    expect(byMember.status).toBe(403);
    const res = await request(app).post(`/api/admin/users/${victimId}/reset-link`).set(as(adminToken));
    const token = res.body.link.split('token=')[1];

    const mismatch = await request(app).post('/api/auth/reset-password').send({ token, password: 'moi12345', confirmPassword: 'khac' });
    expect(mismatch.status).toBe(400);
    await new Promise((r) => setTimeout(r, 1100));
    const ok = await request(app).post('/api/auth/reset-password').send({ token, password: 'moi12345', confirmPassword: 'moi12345' });
    expect(ok.status).toBe(200);
    const reuse = await request(app).post('/api/auth/reset-password').send({ token, password: 'xyz12345', confirmPassword: 'xyz12345' });
    expect(reuse.status).toBe(400);
    expect((await request(app).get('/api/auth/me').set(as(victim))).status).toBe(401);
  });
});

describe('Giao một công việc cho nhiều người', () => {
  let ids;
  let third;

  beforeAll(async () => {
    third = await register('Người thứ ba', 'ba@test.local');
    await request(app).post(`/api/projects/${projectId}/members`).set(as(leader)).send({ emails: 'ba@test.local' });
    const me = async (t) => (await request(app).get('/api/auth/me').set(as(t))).body.id;
    ids = { member: await me(member), third: await me(third), leader: await me(leader) };
  });

  test('cả nhóm được giao đều nhận thông báo, ai cũng bắt đầu / gửi báo cáo được, người ngoài nhóm thì không', async () => {
    const task = await request(app).post(`/api/projects/${projectId}/tasks`).set(as(leader))
      .send({ title: 'Làm slide nhóm', assigneeIds: [ids.member, ids.third] });
    expect(task.status).toBe(201);
    for (const t of [member, third]) {
      const n = await request(app).get('/api/notifications').set(as(t));
      expect(n.body.items[0].message).toContain('cùng 1 người khác');
    }
    const list = await request(app).get(`/api/projects/${projectId}/tasks?assigneeId=${ids.third}`).set(as(leader));
    const found = list.body.find((t) => t.id === task.body.id);
    expect(found.assignees.map((a) => a.id).sort()).toEqual([ids.member, ids.third].sort());

    const outsider = await register('Ngoài nhóm', 'ngoai@test.local');
    await request(app).post(`/api/projects/${projectId}/members`).set(as(leader)).send({ emails: 'ngoai@test.local' });
    const blocked = await request(app).patch(`/api/tasks/${task.body.id}/move`).set(as(outsider)).send({ status: 'in_progress' });
    expect(blocked.status).toBe(403);

    const start = await request(app).patch(`/api/tasks/${task.body.id}/move`).set(as(third)).send({ status: 'in_progress' });
    expect(start.status).toBe(200);
    const sub = await request(app).post(`/api/tasks/${task.body.id}/submit`).set(as(member)).attach('files', Buffer.from('x'), 'slide.pptx');
    expect(sub.body.task.status).toBe('review');

    // người trong nhóm làm không tự duyệt được; trưởng nhóm duyệt → cả 2 người nhận thông báo
    const self = await request(app).post(`/api/tasks/${task.body.id}/review`).set(as(third)).send({ decision: 'approve' });
    expect(self.status).toBe(403);
    await request(app).post(`/api/tasks/${task.body.id}/review`).set(as(leader)).send({ decision: 'approve', goodPoints: 'Đẹp' });
    for (const t of [member, third]) {
      const n = await request(app).get('/api/notifications').set(as(t));
      expect(n.body.items[0].message).toContain('ĐẠT');
    }
  });

  test('sửa danh sách người làm: chỉ người mới thêm nhận thông báo giao việc', async () => {
    const task = await request(app).post(`/api/projects/${projectId}/tasks`).set(as(leader))
      .send({ title: 'Viết kết luận', assigneeIds: [ids.member] });
    const before = (await request(app).get('/api/notifications').set(as(member))).body.unread;
    const res = await request(app).put(`/api/tasks/${task.body.id}`).set(as(leader)).send({ assigneeIds: [ids.member, ids.third] });
    expect(res.status).toBe(200);
    expect((await request(app).get('/api/notifications').set(as(member))).body.unread).toBe(before);
    const n = await request(app).get('/api/notifications').set(as(third));
    expect(n.body.items[0].message).toContain('Viết kết luận');
  });
});

describe('Tiến độ dự án ở danh sách dự án', () => {
  test('mỗi dự án có % hoàn thành và số việc Đã làm / Đang làm / Chuẩn bị làm', async () => {
    const created = await request(app).post('/api/projects').set(as(leader)).send({ name: 'Dự án đếm tiến độ' });
    const pid = created.body.id;
    const meId = (await request(app).get('/api/auth/me').set(as(leader))).body.id;
    const mk = (title) => request(app).post(`/api/projects/${pid}/tasks`).set(as(leader)).send({ title, assigneeIds: [meId] });
    const t1 = (await mk('A')).body.id;
    await mk('B');
    await mk('C');
    await request(app).patch(`/api/tasks/${t1}/move`).set(as(leader)).send({ status: 'in_progress' });

    let list = await request(app).get('/api/projects').set(as(leader));
    let p = list.body.find((x) => x.id === pid);
    expect(p.progress).toMatchObject({ total: 3, done: 0, doing: 1, todo: 2, percent: 0, state: 'in_progress' });

    const empty = (await request(app).post('/api/projects').set(as(leader)).send({ name: 'Dự án trống' })).body.id;
    list = await request(app).get('/api/projects').set(as(leader));
    p = list.body.find((x) => x.id === empty);
    expect(p.progress).toMatchObject({ total: 0, percent: 0, state: 'not_started' });
  });
});

describe('Mời thành viên', () => {
  test('mời nhiều email: người có tài khoản vào ngay, người chưa có tự vào khi đăng ký', async () => {
    await register('Có sẵn', 'san@test.local');
    const res = await request(app).post(`/api/projects/${projectId}/members`).set(as(leader))
      .send({ emails: 'san@test.local, moi@test.local\nsai-email' });
    const byEmail = Object.fromEntries(res.body.results.map((r) => [r.email, r.status]));
    expect(byEmail).toEqual({ 'san@test.local': 'added', 'moi@test.local': 'invited', 'sai-email': 'invalid' });

    const reg = await request(app).post('/api/auth/register').send({ fullName: 'Người mới', email: 'moi@test.local', password: '123456' });
    expect(reg.body.joinedProjects).toBe(1);
    const tasks = await request(app).get(`/api/projects/${projectId}/tasks`).set(as(reg.body.token));
    expect(tasks.status).toBe(200);
  });

  test('bấm link mời là vào dự án', async () => {
    const res = await request(app).post(`/api/projects/${projectId}/members`).set(as(leader)).send({ emails: 'link@test.local' });
    const { token } = res.body.results[0];
    const info = await request(app).get(`/api/invitations/${token}`);
    expect(info.body.project.name).toBe('Dự án test');

    const other = await register('Người khác', 'khac@test.local');
    const wrong = await request(app).post(`/api/invitations/${token}/accept`).set(as(other));
    expect(wrong.status).toBe(403);

    // Lời mời vẫn còn hiệu lực cho đúng người
    const right = await request(app).post('/api/auth/register').send({ fullName: 'Đúng người', email: 'link@test.local', password: '123456' });
    expect(right.body.joinedProjects).toBe(1);
  });

  test('thành viên thường không mời được', async () => {
    const res = await request(app).post(`/api/projects/${projectId}/members`).set(as(member)).send({ emails: 'x@test.local' });
    expect(res.status).toBe(403);
  });
});

describe('Báo cáo tuần', () => {
  test('nộp xong thì không sửa được, trưởng nhóm nhận xét được', async () => {
    const submitted = await request(app).post(`/api/projects/${projectId}/reports`).set(as(member))
      .send({ weekStart: '2026-10-07', doneText: '- Việc 1', submit: true });
    expect(submitted.status).toBe(200);
    expect(submitted.body.weekStart).toBe('2026-10-05');

    const edit = await request(app).post(`/api/projects/${projectId}/reports`).set(as(member))
      .send({ weekStart: '2026-10-05', doneText: 'sửa' });
    expect(edit.status).toBe(400);

    const reviewed = await request(app).patch(`/api/reports/${submitted.body.id}/review`).set(as(leader))
      .send({ feedback: 'Tốt', score: 9 });
    expect(reviewed.body.status).toBe('reviewed');
  });
});
