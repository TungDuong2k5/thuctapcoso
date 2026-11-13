// Máy chủ demo (SQLite trong bộ nhớ, cổng 5099) với dữ liệu mẫu để chụp ảnh giao diện cho báo cáo.
// Tắt gửi mail để không gửi nhầm tới địa chỉ giả.
process.env.DB_DIALECT = 'sqlite'; process.env.DB_STORAGE = ':memory:';
process.env.JWT_SECRET = `demo-${Math.random()}`;
process.env.SMTP_USER = ''; process.env.SMTP_PASS = '';
process.env.UPLOAD_DIR = `${require('os').tmpdir()}/taskflow-demo-uploads`;
const P = 'C:/Users/doant/OneDrive/NCKH/taskflow/server/';
const fs = require('fs');
const http = require('http');
const app = require(`${P}src/app`);
const { Task, Project } = require(`${P}src/models`);
const { initSocket } = require(`${P}src/sockets`);
const { ensureSchema } = require(`${P}src/config/schema`);
const { checkDeadlines } = require(`${P}src/services/deadlines`);

const pad = (n) => String(n).padStart(2, '0');
const dayIso = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
const daysAgo = (n, h = 15) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(h, 0, 0, 0); return d; };

(async () => {
  await ensureSchema();
  const srv = http.createServer(app); initSocket(srv);
  await new Promise((r) => srv.listen(5099, r));
  const B = 'http://127.0.0.1:5099/api';
  const pw = require('crypto').randomBytes(8).toString('hex');
  const call = async (m, p, tok, body) => {
    const r = await fetch(B + p, { method: m, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) }, body: body && JSON.stringify(body) });
    const j = await r.json(); if (!r.ok) throw new Error(`${m} ${p} ${JSON.stringify(j)}`); return j;
  };
  const submit = async (tok, taskId, files, note) => {
    const fd = new FormData();
    files.forEach((f) => fd.append('files', new Blob(['Nội dung báo cáo mẫu']), f));
    if (note) fd.append('note', note);
    const r = await fetch(`${B}/tasks/${taskId}/submit`, { method: 'POST', headers: { Authorization: `Bearer ${tok}` }, body: fd });
    if (!r.ok) throw new Error(`submit ${await r.text()}`);
  };
  const mk = (n, e) => call('POST', '/auth/register', null, { fullName: n, email: e, password: pw });
  const An = await mk('Nguyễn Văn An', 'an@demo.test');
  const Binh = await mk('Trần Thị Bình', 'binh@demo.test');
  const Chi = await mk('Lê Minh Chi', 'chi@demo.test');
  const Dung = await mk('Phạm Hoàng Dũng', 'dung@demo.test');
  await call('PUT', '/users/me', An.token, { studentCode: 'B23DCCN001', className: 'D23CQCN01-B', phone: '0912345678', bio: 'Trưởng nhóm, phụ trách tổng hợp báo cáo' });

  // ----- Dự án 1: An làm trưởng nhóm, mời cả nhóm bằng link mời chung -----
  const p1 = await call('POST', '/projects', An.token, { name: 'Hệ thống quản lý thư viện', description: 'Đồ án môn Phân tích thiết kế hệ thống', startDate: dayIso(-24), endDate: dayIso(25) });
  const { code } = await call('GET', `/projects/${p1.id}/invite-link`, An.token);
  for (const u of [Binh, Chi, Dung]) await call('POST', `/join/${code}`, u.token);
  const L = Object.fromEntries((await call('GET', `/projects/${p1.id}/labels`, An.token)).map((l) => [l.name, l.id]));
  const T = (who, title, extra = {}) => call('POST', `/projects/${p1.id}/tasks`, An.token, { title, assigneeIds: who.map((u) => u.user.id), ...extra });
  const start = async (u, t, pct) => {
    await call('PATCH', `/tasks/${t.id}/move`, u.token, { status: 'in_progress' });
    if (pct) await call('PUT', `/tasks/${t.id}`, u.token, { progress: pct });
  };

  // Việc đã xong (đúng hạn / nộp muộn)
  const done = [
    [Binh, 'Khảo sát yêu cầu người dùng', -20, -18, ['Tài liệu']],
    [Chi, 'Đặc tả use case Mượn sách', -14, -13, ['Tài liệu']],
    [Dung, 'Dựng khung dự án NodeJS + React', -10, -9, ['Tính năng']], // nộp muộn 1 ngày
    [Binh, 'Thiết kế giao diện trang chủ', -6, -4, ['Thiết kế']],
  ];
  const doneTasks = [];
  for (const [u, title, due, finished, labels] of done) {
    const t = await T([u], title, { startDate: dayIso(due - 6), dueDate: dayIso(due), labelIds: labels.map((l) => L[l]) });
    await start(u, t, 70);
    await submit(u.token, t.id, ['bao-cao.docx']);
    await call('POST', `/tasks/${t.id}/review`, An.token, { decision: 'approve', goodPoints: 'Đầy đủ, trình bày rõ ràng' });
    doneTasks.push([t.id, finished]);
  }

  const t3 = await T([Chi], 'Thiết kế cơ sở dữ liệu (ERD)', { startDate: dayIso(-3), dueDate: dayIso(2), dueTime: '17:00', labelIds: [L['Tài liệu']] });
  await start(Chi, t3, 60);
  const t4 = await T([Binh, Chi], 'Giao diện trang tìm kiếm sách', { startDate: dayIso(-1), dueDate: dayIso(6), labelIds: [L['Tính năng'], L['Thiết kế']] });
  await start(Binh, t4, 20);
  const t5 = await T([Dung], 'Xây dựng API mượn / trả sách', { priority: 'urgent', startDate: dayIso(-2), dueDate: dayIso(4), labelIds: [L['Tính năng']] });
  await start(Dung, t5, 40);
  const t6 = await T([Binh], 'Vẽ sơ đồ use case', { startDate: dayIso(-5), dueDate: dayIso(1), labelIds: [L['Thiết kế']] });
  await start(Binh, t6, 90);
  await submit(Binh.token, t6.id, ['so-do-use-case.png', 'mo-ta.docx'], 'Em đã vẽ đủ 8 use case chính');
  // Việc của trưởng nhóm sắp hết hạn (dưới 3 giờ) -> thông báo khẩn
  const soon = new Date(Date.now() + 90 * 60000);
  const t7 = await T([An], 'Tổng hợp báo cáo chương 2', { startDate: dayIso(-2), dueDate: soon.toLocaleDateString('sv-SE'), dueTime: `${pad(soon.getHours())}:${pad(soon.getMinutes())}`, labelIds: [L['Tài liệu']] });
  await start(An, t7, 50);
  await T([Dung], 'Sửa lỗi đăng nhập trên điện thoại', { startDate: dayIso(0), dueDate: dayIso(1), labelIds: [L.Bug] });
  await T([Chi], 'Viết kịch bản kiểm thử', { startDate: dayIso(3), dueDate: dayIso(10), labelIds: [L['Tài liệu']] });

  await call('POST', `/tasks/${t3.id}/comments`, An.token, { content: '@Lê Minh Chi nhớ thêm bảng phiếu mượn và chi tiết phiếu mượn nhé', mentionIds: [Chi.user.id] });
  await call('POST', `/tasks/${t3.id}/comments`, Chi.token, { content: 'Dạ em thêm rồi ạ, tối nay em cập nhật ảnh ERD' });
  for (const [u, c] of [[An, 'Chào cả nhóm, thứ 6 này mình họp tiến độ lúc 20:00 nhé'], [Binh, 'Ok anh, em sẽ chuẩn bị phần giao diện'], [Dung, 'API mượn sách em làm xong 40% rồi'], [Chi, 'Em gửi ERD bản nháp trong mục công việc rồi ạ']]) {
    await call('POST', `/projects/${p1.id}/messages`, u.token, { content: c });
  }
  await call('POST', `/tasks/${t4.id}/dm/${An.user.id}`, Binh.token, { content: 'Anh ơi phần tìm kiếm có cần lọc theo thể loại không ạ?' });
  await call('POST', `/tasks/${t4.id}/dm/${Binh.user.id}`, An.token, { content: 'Có em, thêm lọc theo thể loại và năm xuất bản nhé' });
  await call('POST', `/tasks/${t4.id}/dm/${An.user.id}`, Binh.token, { content: 'Dạ em hiểu rồi, chiều nay em gửi bản đầu tiên' });
  const sug = await call('GET', `/projects/${p1.id}/reports/suggest`, Binh.token).catch(() => ({}));
  await call('POST', `/projects/${p1.id}/reports`, Binh.token, {
    weekStart: dayIso(-7), doneText: sug.doneText || 'Hoàn thành thiết kế giao diện trang chủ', planText: 'Làm giao diện trang tìm kiếm sách', issuesText: 'Chưa thống nhất bộ lọc tìm kiếm', status: 'submitted',
  }).catch(() => {});

  // ----- Dự án 2: Bình làm trưởng nhóm, An là thành viên (mời qua email) -----
  const p2 = await call('POST', '/projects', Binh.token, { name: 'Website câu lạc bộ Tin học', description: 'Trang giới thiệu và đăng ký thành viên', startDate: dayIso(-10), endDate: dayIso(30) });
  await call('POST', `/projects/${p2.id}/members`, Binh.token, { emails: 'an@demo.test, dung@demo.test' });
  for (const u of [An, Dung]) {
    const inv = (await call('GET', '/invitations/mine', u.token)).find((i) => i.project.id === p2.id);
    await call('POST', `/invitations/${inv.token}/accept`, u.token);
  }
  const q1 = await call('POST', `/projects/${p2.id}/tasks`, Binh.token, { title: 'Trang đăng ký thành viên', assigneeIds: [An.user.id], startDate: dayIso(-2), dueDate: dayIso(5) });
  await start(An, q1, 30);
  await call('POST', `/projects/${p2.id}/tasks`, Binh.token, { title: 'Trang giới thiệu câu lạc bộ', assigneeIds: [Dung.user.id], dueDate: dayIso(8) });
  await call('POST', `/projects/${p2.id}/messages`, Binh.token, { content: 'Chào mọi người, tuần này hoàn thiện trang đăng ký nhé' });

  // ----- Dự án đã hoàn thành -----
  const p3 = await call('POST', '/projects', An.token, { name: 'Bài tập lớn Cơ sở dữ liệu', description: 'Đã nộp và bảo vệ', startDate: dayIso(-60), endDate: dayIso(-20) });
  await call('PUT', `/projects/${p3.id}`, An.token, { status: 'archived' });
  const p4 = await call('POST', '/projects', An.token, { name: 'Báo cáo thực tập nhóm', description: 'Đã nộp trước hạn', startDate: dayIso(-30), endDate: dayIso(10) });
  await call('PUT', `/projects/${p4.id}`, An.token, { status: 'archived' });
  await Project.unscoped().update({ completedAt: daysAgo(15) }, { where: { id: p3.id } });

  // Ngày hoàn thành của các việc đã xong (để biểu đồ tuần / tháng có số liệu)
  // Ngày nộp / hoàn thành thật của các việc đã xong; chỉ việc nộp sau hạn mới ghi "nộp muộn"
  for (const [i, [id, finished]] of doneTasks.entries()) {
    const due = done[i][2];
    const submittedAt = daysAgo(-finished, 10);
    const late = finished > due ? (finished - due) * 24 * 60 : 0;
    await Task.update({ completedAt: daysAgo(-finished), submittedAt, submittedLateMinutes: late }, { where: { id } });
  }

  const room = await call('POST', `/projects/${p1.id}/calls`, An.token, { title: 'Họp tiến độ tuần 9', password: '2468', notify: false });
  await checkDeadlines();

  fs.writeFileSync(`${__dirname}/demo.json`, JSON.stringify({
    an: An.token, binh: Binh.token, chi: Chi.token, dung: Dung.token, p1: p1.id, p2: p2.id, t4: t4.id, t6: t6.id, code, room: { code: room.code, password: '2468' },
  }));
  console.log('demo ready');
})().catch((e) => { console.error(e); process.exit(1); });
