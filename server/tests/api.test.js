// Mặc định chạy test trên SQLite trong bộ nhớ.
// TEST_DB=mssql: chạy trên database SQL Server riêng TaskFlow_Test (KHÔNG đụng database TaskFlow thật)
if (process.env.TEST_DB === 'mssql') {
  require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
  process.env.DB_DIALECT = 'mssql';
  process.env.MSSQL_DB = 'TaskFlow_Test';
  jest.setTimeout(60000); // tạo/xóa bảng trên SQL Server chậm hơn SQLite trong bộ nhớ
} else {
  process.env.DB_DIALECT = 'sqlite';
  process.env.DB_STORAGE = ':memory:';
}
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

// Trưởng nhóm mời email vào dự án, người được mời bấm "Tham gia"
async function inviteAndJoin(email, userToken, pid = projectId) {
  await request(app).post(`/api/projects/${pid}/members`).set(as(leader)).send({ emails: email });
  const mine = await request(app).get('/api/invitations/mine').set(as(userToken));
  const inv = mine.body.find((i) => i.project.id === pid);
  return request(app).post(`/api/invitations/${inv.token}/accept`).set(as(userToken));
}

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

    const joined = await inviteAndJoin('member@test.local', member);
    expect(joined.status).toBe(200);
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
    await inviteAndJoin('tv2@test.local', otherMember);
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

  test('hết hạn hôm nay / quá hạn là thông báo KHẨN; việc trễ của trưởng nhóm không báo cho thành viên', async () => {
    const leaderId = (await request(app).get('/api/auth/me').set(as(leader))).body.id;
    await request(app).post(`/api/projects/${projectId}/tasks`).set(as(leader))
      .send({ title: 'Việc hạn hôm nay', assigneeId: memberId, dueDate: vnDate(0) });
    await request(app).post(`/api/projects/${projectId}/tasks`).set(as(leader))
      .send({ title: 'Việc trưởng nhóm trễ', assigneeId: leaderId, dueDate: vnDate(-1) });
    await checkDeadlines();

    const res = (await request(app).get('/api/notifications').set(as(member))).body;
    const urgent = res.urgent.map((n) => n.message);
    expect(urgent.some((m) => m.includes('KHẨN') && m.includes('"Việc hạn hôm nay"') && m.includes('HÔM NAY'))).toBe(true);
    expect(urgent.some((m) => m.includes('"Việc trưởng nhóm trễ"'))).toBe(false); // thành viên không theo dõi người khác
    const leaderUrgent = (await request(app).get('/api/notifications').set(as(leader))).body.urgent.map((n) => n.message);
    expect(leaderUrgent.some((m) => m.includes('Quá hạn: "Việc trưởng nhóm trễ"'))).toBe(true);

    // đọc rồi thì không còn trong danh sách khẩn
    await request(app).patch('/api/notifications/read').set(as(member));
    expect((await request(app).get('/api/notifications').set(as(member))).body.urgent).toHaveLength(0);
  });

  test('còn dưới 3 tiếng mà chưa nộp: nhắc khẩn lặp lại mỗi 15 phút', async () => {
    const now = Date.now();
    const due = new Date(now + 2 * 3600 * 1000); // hết hạn sau 2 tiếng (giờ Việt Nam)
    const dueDate = due.toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
    const dueTime = due.toLocaleTimeString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' });
    await request(app).post(`/api/projects/${projectId}/tasks`).set(as(leader))
      .send({ title: 'Việc còn 2 tiếng', assigneeId: memberId, dueDate, dueTime });
    const count = async () => (await request(app).get('/api/notifications').set(as(member))).body.urgent
      .filter((n) => n.message.includes('"Việc còn 2 tiếng"')).length;

    await checkDeadlines(now);
    expect(await count()).toBe(1);
    const msg = (await request(app).get('/api/notifications').set(as(member))).body.urgent[0].message;
    expect(msg).toContain('Chỉ còn');
    await checkDeadlines(now + 5 * 60 * 1000); // 5 phút sau: chưa nhắc lại
    expect(await count()).toBe(1);
    await checkDeadlines(now + 16 * 60 * 1000); // 16 phút sau: nhắc lại
    expect(await count()).toBe(2);
    await checkDeadlines(now + 32 * 60 * 1000);
    expect(await count()).toBe(3);
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
    expect(m).toMatchObject({ studentCode: 'B22DCCN001', className: 'D22CQCN01-B', phone: '0912345678' }); // lưu dạng chuẩn
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

  test('Gmail mới: tự tạo tài khoản, thấy lời mời đang chờ; chưa có mật khẩu nên đặt lần đầu không cần mật khẩu cũ', async () => {
    await request(app).post(`/api/projects/${projectId}/members`).set(as(leader)).send({ emails: 'gg.moi@gmail.com' });
    fakeProfile = { sub: 'g-1', email: 'gg.moi@gmail.com', email_verified: true, name: 'Người Google' };
    const res = await request(app).post('/api/auth/google').send({ credential: 'hop-le' });
    expect(res.status).toBe(201);
    expect(res.body.user.fullName).toBe('Người Google');
    expect(res.body.user.hasPassword).toBe(false);
    expect(res.body.pendingInvitations).toBe(1);

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
    await inviteAndJoin('ba@test.local', third);
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
    await inviteAndJoin('ngoai@test.local', outsider);
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

describe('Mời thành viên: người được mời bấm Tham gia / Từ chối', () => {
  test('mời người đã có tài khoản: chưa vào ngay, có thông báo + lời mời; bấm Tham gia mới vào dự án', async () => {
    const san = await register('Có sẵn', 'san@test.local');
    const res = await request(app).post(`/api/projects/${projectId}/members`).set(as(leader))
      .send({ emails: 'san@test.local, moi@test.local\nsai-email' });
    const byEmail = Object.fromEntries(res.body.results.map((r) => [r.email, r.status]));
    expect(byEmail).toEqual({ 'san@test.local': 'invited', 'moi@test.local': 'invited_new', 'sai-email': 'invalid' });

    // chưa phải thành viên
    expect((await request(app).get(`/api/projects/${projectId}/tasks`).set(as(san))).status).toBe(403);
    const notif = await request(app).get('/api/notifications').set(as(san));
    expect(notif.body.items[0].message).toContain('Tham gia / Từ chối');

    const mine = await request(app).get('/api/invitations/mine').set(as(san));
    expect(mine.body).toHaveLength(1);
    expect(mine.body[0].project.name).toBe('Dự án test');

    // mời lại khi đang chờ → không tạo trùng
    const again = await request(app).post(`/api/projects/${projectId}/members`).set(as(leader)).send({ emails: 'san@test.local' });
    expect(again.body.results[0].status).toBe('already_invited');

    const accept = await request(app).post(`/api/invitations/${mine.body[0].token}/accept`).set(as(san));
    expect(accept.body.projectId).toBe(projectId);
    expect((await request(app).get(`/api/projects/${projectId}/tasks`).set(as(san))).status).toBe(200);
    expect((await request(app).get('/api/invitations/mine').set(as(san))).body).toHaveLength(0);
    const leaderNotif = await request(app).get('/api/notifications').set(as(leader));
    expect(leaderNotif.body.items[0].message).toContain('đã tham gia');
  });

  test('người chưa có tài khoản: đăng ký xong thấy lời mời, bấm Từ chối thì không vào dự án và trưởng nhóm được báo', async () => {
    const reg = await request(app).post('/api/auth/register').send({ fullName: 'Người mới', email: 'moi@test.local', password: '123456' });
    expect(reg.body.pendingInvitations).toBe(1);
    const mine = await request(app).get('/api/invitations/mine').set(as(reg.body.token));
    const decline = await request(app).post(`/api/invitations/${mine.body[0].token}/decline`).set(as(reg.body.token));
    expect(decline.status).toBe(200);

    expect((await request(app).get(`/api/projects/${projectId}/tasks`).set(as(reg.body.token))).status).toBe(403);
    const leaderNotif = await request(app).get('/api/notifications').set(as(leader));
    expect(leaderNotif.body.items[0].message).toContain('từ chối');
    // đã từ chối thì không bấm tham gia lại bằng lời mời cũ được
    const late = await request(app).post(`/api/invitations/${mine.body[0].token}/accept`).set(as(reg.body.token));
    expect(late.status).toBe(400);
  });

  test('link mời chỉ dành cho đúng email được mời', async () => {
    const res = await request(app).post(`/api/projects/${projectId}/members`).set(as(leader)).send({ emails: 'link@test.local' });
    const { token } = res.body.results[0];
    const info = await request(app).get(`/api/invitations/${token}`);
    expect(info.body.project.name).toBe('Dự án test');

    const other = await register('Người khác', 'khac@test.local');
    expect((await request(app).post(`/api/invitations/${token}/accept`).set(as(other))).status).toBe(403);
    expect((await request(app).post(`/api/invitations/${token}/decline`).set(as(other))).status).toBe(403);

    const right = await register('Đúng người', 'link@test.local');
    expect((await request(app).post(`/api/invitations/${token}/accept`).set(as(right))).status).toBe(200);
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

describe('Nhãn, ưu tiên, @nhắc tên, thống kê', () => {
  test('dự án mới có sẵn 4 nhãn; gắn nhãn và lọc theo nhãn', async () => {
    const labels = await request(app).get(`/api/projects/${projectId}/labels`).set(as(member));
    expect(labels.body.map((l) => l.name)).toEqual(['Bug', 'Tính năng', 'Tài liệu', 'Thiết kế']);
    const bug = labels.body[0];

    expect((await request(app).post(`/api/projects/${projectId}/labels`).set(as(member)).send({ name: 'X' })).status).toBe(403);
    const ui = await request(app).post(`/api/projects/${projectId}/labels`).set(as(leader)).send({ name: 'UI', color: '#ff8800' });
    expect(ui.status).toBe(201);

    const task = await request(app).post(`/api/projects/${projectId}/tasks`).set(as(leader)).send({
      title: 'Sửa lỗi đăng nhập', priority: 'urgent', startDate: '2026-10-01', dueDate: '2026-10-05', labelIds: [bug.id, ui.body.id],
    });
    expect(task.status).toBe(201);
    expect(task.body.priority).toBe('urgent');

    const bad = await request(app).post(`/api/projects/${projectId}/tasks`).set(as(leader))
      .send({ title: 'Sai ngày', startDate: '2026-10-09', dueDate: '2026-10-05' });
    expect(bad.status).toBe(400);

    const filtered = await request(app).get(`/api/projects/${projectId}/tasks?labelId=${bug.id}`).set(as(member));
    expect(filtered.body.map((t) => t.id)).toEqual([task.body.id]);
    expect(filtered.body[0].labels).toHaveLength(2);

    // xóa nhãn thì gỡ khỏi công việc
    expect((await request(app).delete(`/api/labels/${ui.body.id}`).set(as(leader))).status).toBe(200);
    const after = await request(app).get(`/api/tasks/${task.body.id}`).set(as(member));
    expect(after.body.labels.map((l) => l.name)).toEqual(['Bug']);
  });

  test('chỉ còn mức ưu tiên Thường / Khẩn cấp', async () => {
    const res = await request(app).post(`/api/projects/${projectId}/tasks`).set(as(leader)).send({ title: 'x', priority: 'high' });
    expect(res.status).toBe(400);
  });

  test('@nhắc tên trong bình luận gửi thông báo', async () => {
    const task = await request(app).post(`/api/projects/${projectId}/tasks`).set(as(leader)).send({ title: 'Bàn bạc' });
    const me = await request(app).get('/api/auth/me').set(as(member));
    await request(app).post(`/api/tasks/${task.body.id}/comments`).set(as(leader))
      .send({ content: `@${me.body.fullName} xem giúp`, mentionIds: [me.body.id] });
    const notes = await request(app).get('/api/notifications').set(as(member));
    const list = notes.body.items || notes.body;
    expect(list.some((n) => n.type === 'mention')).toBe(true);
  });

  test('thống kê có đúng hạn / trễ hạn', async () => {
    const res = await request(app).get(`/api/projects/${projectId}/stats`).set(as(leader));
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('onTime');
    expect(res.body).toHaveProperty('late');
    expect(res.body.urgentOpen).toBeGreaterThanOrEqual(1);
    // thành viên không xem được thống kê tiến độ cả nhóm
    expect((await request(app).get(`/api/projects/${projectId}/stats`).set(as(member))).status).toBe(403);
  });
});

describe('Quyền theo dõi tiến độ và hạn nộp có giờ', () => {
  let member2;
  let member2Id;
  let memberId;

  beforeAll(async () => {
    member2 = await register('Thành viên hai', 'member2@test.local');
    await inviteAndJoin('member2@test.local', member2);
    member2Id = (await request(app).get('/api/auth/me').set(as(member2))).body.id;
    memberId = (await request(app).get('/api/auth/me').set(as(member))).body.id;
  });

  test('thành viên chỉ thấy việc của mình; trưởng nhóm thấy hết', async () => {
    const other = await request(app).post(`/api/projects/${projectId}/tasks`).set(as(leader))
      .send({ title: 'Việc riêng của thành viên hai', assigneeIds: [member2Id] });
    const mine = await request(app).post(`/api/projects/${projectId}/tasks`).set(as(leader))
      .send({ title: 'Việc của thành viên một', assigneeIds: [memberId] });

    const memberList = (await request(app).get(`/api/projects/${projectId}/tasks`).set(as(member))).body.map((x) => x.id);
    expect(memberList).toContain(mine.body.id);
    expect(memberList).not.toContain(other.body.id);
    expect((await request(app).get(`/api/tasks/${other.body.id}`).set(as(member))).status).toBe(403);
    expect((await request(app).post(`/api/tasks/${other.body.id}/comments`).set(as(member)).send({ content: 'x' })).status).toBe(403);

    const leaderList = (await request(app).get(`/api/projects/${projectId}/tasks`).set(as(leader))).body.map((x) => x.id);
    expect(leaderList).toEqual(expect.arrayContaining([mine.body.id, other.body.id]));

    // tiến độ từng người: thành viên chỉ thấy của mình, trưởng nhóm thấy tất cả (kể cả trưởng nhóm)
    const asMember = await request(app).get(`/api/projects/${projectId}`).set(as(member));
    expect(asMember.body.members.filter((m) => m.stats).map((m) => m.id)).toEqual([memberId]);
    const asLeader = await request(app).get(`/api/projects/${projectId}`).set(as(leader));
    expect(asLeader.body.members.every((m) => m.stats && typeof m.stats.percent === 'number')).toBe(true);

    // Tổng quan tất cả dự án
    const ovLeader = (await request(app).get('/api/overview').set(as(leader))).body;
    expect(ovLeader.leaderOf).toBeGreaterThan(0);
    const m2 = ovLeader.people.find((x) => x.userId === member2Id);
    expect(m2.total).toBeGreaterThan(0);
    expect(m2.projects[0]).toHaveProperty('percent');
    expect(ovLeader.people.some((x) => x.isMe)).toBe(true); // có cả trưởng nhóm
    expect(ovLeader.daily).toHaveLength(14);
    expect(ovLeader.weekly).toHaveLength(8);
    expect(ovLeader.monthly).toHaveLength(6);
    expect(ovLeader.weekly.reduce((s, w) => s + w.done, 0)).toBeGreaterThanOrEqual(0);
    expect(m2).toHaveProperty('doneThisWeek');
    const ovMember = (await request(app).get('/api/overview').set(as(member))).body;
    expect(ovMember.people.map((x) => x.userId)).toEqual([memberId]);
  });

  test('hạn có giờ: nộp sau giờ hạn vẫn nhận nhưng ghi NỘP MUỘN', async () => {
    const bad = await request(app).post(`/api/projects/${projectId}/tasks`).set(as(leader))
      .send({ title: 'Sai giờ', dueDate: '2026-10-10', dueTime: '25:00' });
    expect(bad.status).toBe(400);

    const task = await request(app).post(`/api/projects/${projectId}/tasks`).set(as(leader))
      .send({ title: 'Nộp trễ giờ', assigneeIds: [member2Id], dueDate: '2026-01-05', dueTime: '17:00' });
    expect(task.body.dueTime).toBe('17:00');
    await request(app).patch(`/api/tasks/${task.body.id}/move`).set(as(member2)).send({ status: 'in_progress' });
    const sent = await request(app).post(`/api/tasks/${task.body.id}/submit`).set(as(member2))
      .attach('files', Buffer.from('bai'), 'bai.docx');
    expect(sent.status).toBe(201);
    expect(sent.body.task.status).toBe('review');
    expect(sent.body.task.submittedLateMinutes).toBeGreaterThan(0);

    const leaderMsgs = (await request(app).get('/api/notifications').set(as(leader))).body.items.map((n) => n.message);
    expect(leaderMsgs.some((m) => m.includes('"Nộp trễ giờ"') && m.includes('NỘP MUỘN'))).toBe(true);

    const onTime = await request(app).post(`/api/projects/${projectId}/tasks`).set(as(leader))
      .send({ title: 'Nộp đúng giờ', assigneeIds: [member2Id], dueDate: '2099-01-01', dueTime: '08:00' });
    await request(app).patch(`/api/tasks/${onTime.body.id}/move`).set(as(member2)).send({ status: 'in_progress' });
    const ok = await request(app).post(`/api/tasks/${onTime.body.id}/submit`).set(as(member2))
      .attach('files', Buffer.from('bai'), 'bai.docx');
    expect(ok.body.task.submittedLateMinutes).toBe(0);
  });
});

describe('Khách (chỉ xem) và xóa dự án', () => {
  test('khách xem được nhưng không tạo / bình luận / kéo thả', async () => {
    const guest = await register('Khách', 'guest@test.local');
    await request(app).post(`/api/projects/${projectId}/members`).set(as(leader)).send({ emails: 'guest@test.local', role: 'guest' });
    const inv = (await request(app).get('/api/invitations/mine').set(as(guest))).body[0];
    expect(inv.role).toBe('guest');
    await request(app).post(`/api/invitations/${inv.token}/accept`).set(as(guest));

    const tasks = await request(app).get(`/api/projects/${projectId}/tasks`).set(as(guest));
    expect(tasks.status).toBe(200);
    const id = tasks.body[0].id;
    expect((await request(app).post(`/api/projects/${projectId}/tasks`).set(as(guest)).send({ title: 'x' })).status).toBe(403);
    expect((await request(app).post(`/api/tasks/${id}/comments`).set(as(guest)).send({ content: 'x' })).status).toBe(403);
    expect((await request(app).patch(`/api/tasks/${id}/move`).set(as(guest)).send({ status: 'in_progress' })).status).toBe(403);

    const me = await request(app).get('/api/auth/me').set(as(guest));
    const assign = await request(app).post(`/api/projects/${projectId}/tasks`).set(as(leader)).send({ title: 'Giao khách', assigneeIds: [me.body.id] });
    expect(assign.status).toBe(400);
  });

  test('xóa dự án phải gõ đúng tên, chỉ người tạo', async () => {
    const p = await request(app).post('/api/projects').set(as(leader)).send({ name: 'Dự án sẽ xóa' });
    await request(app).post(`/api/projects/${p.body.id}/tasks`).set(as(leader))
      .send({ title: 'Việc', labelIds: [(await request(app).get(`/api/projects/${p.body.id}/labels`).set(as(leader))).body[0].id] });

    expect((await request(app).delete(`/api/projects/${p.body.id}`).set(as(leader)).send({ confirmName: 'sai tên' })).status).toBe(400);
    const ok = await request(app).delete(`/api/projects/${p.body.id}`).set(as(leader)).send({ confirmName: 'Dự án sẽ xóa' });
    expect(ok.status).toBe(200);
    expect((await request(app).get(`/api/projects/${p.body.id}`).set(as(leader))).status).toBe(404);
  });
});

describe('Trò chuyện và gọi nhóm', () => {
  test('cả nhóm nhắn tin trong dự án; người ngoài không đọc được', async () => {
    const sent = await request(app).post(`/api/projects/${projectId}/messages`).set(as(member)).send({ content: 'Chào cả nhóm' });
    expect(sent.status).toBe(201);
    expect(sent.body.author.fullName).toBe('Thành viên');
    expect((await request(app).post(`/api/projects/${projectId}/messages`).set(as(member)).send({ content: '  ' })).status).toBe(400);

    const list = await request(app).get(`/api/projects/${projectId}/messages`).set(as(leader));
    expect(list.body.items.at(-1).content).toBe('Chào cả nhóm');

    const outsider = await register('Người lạ chat', 'la-chat@test.local');
    expect((await request(app).get(`/api/projects/${projectId}/messages`).set(as(outsider))).status).toBe(403);
  });

  test('chỉ trưởng nhóm mở phòng gọi; thành viên vào bằng mã phòng + mật khẩu được gửi qua thông báo', async () => {
    expect((await request(app).post(`/api/projects/${projectId}/calls`).set(as(member)).send({})).status).toBe(403);

    const room = await request(app).post(`/api/projects/${projectId}/calls`).set(as(leader)).send({ title: 'Họp tuần', password: 'hop2026' });
    expect(room.status).toBe(201);
    expect(room.body.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(room.body.password).toBe('hop2026');
    // chỉ 1 phòng đang mở mỗi dự án
    expect((await request(app).post(`/api/projects/${projectId}/calls`).set(as(leader)).send({})).status).toBe(400);

    const notes = (await request(app).get('/api/notifications').set(as(member))).body.items;
    const invite = notes.find((n) => n.type === 'call_invite');
    expect(invite.message).toContain(room.body.code);
    expect(invite.message).toContain('hop2026');

    // thành viên xem danh sách phòng không thấy mật khẩu
    const rooms = await request(app).get(`/api/projects/${projectId}/calls`).set(as(member));
    expect(rooms.body[0].password).toBeUndefined();

    expect((await request(app).post('/api/calls/join').set(as(member)).send({ code: room.body.code, password: 'sai' })).status).toBe(400);
    const ok = await request(app).post('/api/calls/join').set(as(member)).send({ code: room.body.code.toLowerCase(), password: 'hop2026' });
    expect(ok.status).toBe(200);
    expect(ok.body.token).toBeTruthy();

    const outsider = await register('Người lạ gọi', 'la-goi@test.local');
    expect((await request(app).post('/api/calls/join').set(as(outsider)).send({ code: room.body.code, password: 'hop2026' })).status).toBe(403);

    expect((await request(app).post(`/api/calls/${room.body.id}/end`).set(as(member))).status).toBe(403);
    expect((await request(app).post(`/api/calls/${room.body.id}/end`).set(as(leader))).status).toBe(200);
    expect((await request(app).post('/api/calls/join').set(as(member)).send({ code: room.body.code, password: 'hop2026' })).status).toBe(400);
  });
});

describe('Cách tính % hoàn thành', () => {
  const { personStats, taskPercent } = require('../src/services/progress');
  test('To do 0%, In progress theo mức cập nhật (10–90%), Review 90%, Done 100%; % người = trung bình', () => {
    expect(taskPercent({ status: 'todo', progress: 50 })).toBe(0);
    expect(taskPercent({ status: 'in_progress', progress: 0 })).toBe(10);
    expect(taskPercent({ status: 'in_progress', progress: 60 })).toBe(60);
    expect(taskPercent({ status: 'in_progress', progress: 100 })).toBe(90);
    expect(taskPercent({ status: 'review' })).toBe(90);
    expect(taskPercent({ status: 'done' })).toBe(100);
    const s = personStats([{ status: 'todo' }, { status: 'in_progress', progress: 40 }, { status: 'review' }, { status: 'done' }]);
    expect(s.percent).toBe(58); // (0 + 40 + 90 + 100) / 4 = 57.5 → 58
  });

  test('chỉ người được giao (hoặc trưởng nhóm) mới cập nhật mức hoàn thành', async () => {
    const m2 = await register('Người thứ ba', 'thu3@test.local');
    await inviteAndJoin('thu3@test.local', m2);
    const memberId = (await request(app).get('/api/auth/me').set(as(member))).body.id;
    const task = await request(app).post(`/api/projects/${projectId}/tasks`).set(as(leader)).send({ title: 'Việc có tiến độ', assigneeIds: [memberId] });
    expect((await request(app).put(`/api/tasks/${task.body.id}`).set(as(member)).send({ progress: 50 })).status).toBe(200);
    expect((await request(app).put(`/api/tasks/${task.body.id}`).set(as(leader)).send({ progress: 60 })).status).toBe(200);
  });
});

describe('Nhắn tin riêng trong công việc', () => {
  test('người được giao và trưởng nhóm nhắn riêng; có số chưa đọc; người không liên quan bị chặn', async () => {
    const leaderId = (await request(app).get('/api/auth/me').set(as(leader))).body.id;
    const memberId = (await request(app).get('/api/auth/me').set(as(member))).body.id;
    const task = await request(app).post(`/api/projects/${projectId}/tasks`).set(as(leader))
      .send({ title: 'Việc có nhắn riêng', assigneeIds: [memberId] });

    const contacts = await request(app).get(`/api/tasks/${task.body.id}/dm`).set(as(member));
    expect(contacts.body.map((c) => c.id)).toContain(leaderId);

    const sent = await request(app).post(`/api/tasks/${task.body.id}/dm/${leaderId}`).set(as(member)).send({ content: 'Anh ơi em hỏi chút' });
    expect(sent.status).toBe(201);
    expect((await request(app).post(`/api/tasks/${task.body.id}/dm/${leaderId}`).set(as(member)).send({ content: ' ' })).status).toBe(400);

    // trưởng nhóm thấy 1 tin chưa đọc trên thẻ công việc và ở danh sách liên hệ
    const list = await request(app).get(`/api/projects/${projectId}/tasks`).set(as(leader));
    expect(list.body.find((x) => x.id === task.body.id).dmUnread).toBe(1);
    const lc = await request(app).get(`/api/tasks/${task.body.id}/dm`).set(as(leader));
    expect(lc.body.find((c) => c.id === memberId).unread).toBe(1);
    const notes = (await request(app).get('/api/notifications').set(as(leader))).body.items;
    expect(notes.some((n) => n.type === 'dm' && n.link.includes(`dm=${memberId}`))).toBe(true);

    // mở cuộc trò chuyện → đã đọc
    const th = await request(app).get(`/api/tasks/${task.body.id}/dm/${memberId}`).set(as(leader));
    expect(th.body.map((m) => m.content)).toEqual(['Anh ơi em hỏi chút']);
    const after = await request(app).get(`/api/projects/${projectId}/tasks`).set(as(leader));
    expect(after.body.find((x) => x.id === task.body.id).dmUnread).toBe(0);
    await request(app).post(`/api/tasks/${task.body.id}/dm/${memberId}`).set(as(leader)).send({ content: 'Ừ em hỏi đi' });
    const th2 = await request(app).get(`/api/tasks/${task.body.id}/dm/${leaderId}`).set(as(member));
    expect(th2.body).toHaveLength(2);

    // không nhắn cho chính mình; người ngoài dự án bị chặn
    expect((await request(app).post(`/api/tasks/${task.body.id}/dm/${memberId}`).set(as(member)).send({ content: 'x' })).status).toBe(400);
    const outsider = await register('Người ngoài nhắn', 'ngoai-dm@test.local');
    expect((await request(app).get(`/api/tasks/${task.body.id}/dm/${leaderId}`).set(as(outsider))).status).toBe(403);
  });
});

describe('Dự án hoàn thành đúng / chậm tiến độ và tự tắt thông báo khẩn', () => {
  const { checkDeadlines } = require('../src/services/deadlines');

  test('đánh dấu hoàn thành sau ngày kết thúc → chậm tiến độ; trước ngày kết thúc → đúng tiến độ', async () => {
    const late = await request(app).post('/api/projects').set(as(leader)).send({ name: 'Dự án xong trễ', startDate: '2026-01-01', endDate: '2026-01-10' });
    const ok = await request(app).post('/api/projects').set(as(leader)).send({ name: 'Dự án xong đúng hạn', startDate: '2026-01-01', endDate: '2099-12-31' });
    await request(app).put(`/api/projects/${late.body.id}`).set(as(leader)).send({ status: 'archived' });
    await request(app).put(`/api/projects/${ok.body.id}`).set(as(leader)).send({ status: 'archived' });
    const list = (await request(app).get('/api/projects?archived=1').set(as(leader))).body;
    const a = list.find((p) => p.id === late.body.id).finish;
    const b = list.find((p) => p.id === ok.body.id).finish;
    expect(a.finished && a.late && a.lateDays > 0).toBe(true);
    expect(b.finished && !b.late).toBe(true);
    // mở lại → không còn là đã hoàn thành
    await request(app).put(`/api/projects/${ok.body.id}`).set(as(leader)).send({ status: 'active' });
    const again = (await request(app).get('/api/projects?archived=1').set(as(leader))).body.find((p) => p.id === ok.body.id);
    expect(again.finish.finished).toBe(false);
  });

  test('nộp bài xong thì thông báo khẩn của việc đó tự tắt', async () => {
    const memberId = (await request(app).get('/api/auth/me').set(as(member))).body.id;
    const task = await request(app).post(`/api/projects/${projectId}/tasks`).set(as(leader))
      .send({ title: 'Việc quá hạn sẽ nộp', assigneeIds: [memberId], dueDate: '2026-01-02' });
    await checkDeadlines();
    const urgentOf = async () => (await request(app).get('/api/notifications').set(as(member))).body.urgent
      .filter((n) => n.link.endsWith(`?task=${task.body.id}`)).length;
    expect(await urgentOf()).toBeGreaterThan(0);
    await request(app).patch(`/api/tasks/${task.body.id}/move`).set(as(member)).send({ status: 'in_progress' });
    await request(app).post(`/api/tasks/${task.body.id}/submit`).set(as(member)).attach('files', Buffer.from('x'), 'bai.docx');
    expect(await urgentOf()).toBe(0);
  });
});

describe('Trang chủ (dashboard)', () => {
  test('việc của tôi chưa xong và bài chờ tôi nhận xét', async () => {
    const memberId = (await request(app).get('/api/auth/me').set(as(member))).body.id;
    const t = await request(app).post(`/api/projects/${projectId}/tasks`).set(as(leader))
      .send({ title: 'Việc trên trang chủ', assigneeIds: [memberId], dueDate: '2099-01-01' });
    const m = (await request(app).get('/api/dashboard').set(as(member))).body;
    expect(m.activeProjects).toBeGreaterThan(0);
    expect(m.myTasks.some((x) => x.id === t.body.id && x.projectName)).toBe(true);

    await request(app).patch(`/api/tasks/${t.body.id}/move`).set(as(member)).send({ status: 'in_progress' });
    await request(app).post(`/api/tasks/${t.body.id}/submit`).set(as(member)).attach('files', Buffer.from('x'), 'a.docx');
    const l = (await request(app).get('/api/dashboard').set(as(leader))).body;
    expect(l.reviews.some((x) => x.id === t.body.id)).toBe(true);
    const m2 = (await request(app).get('/api/dashboard').set(as(member))).body;
    expect(m2.reviews.some((x) => x.id === t.body.id)).toBe(false);
  });
});
