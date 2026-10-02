# TaskFlow – Hệ thống quản lý và báo cáo công việc nhóm

Đề tài Thực tập cơ sở: xây dựng web app giúp nhóm tạo dự án, giao việc trên bảng Kanban,
theo dõi tiến độ, nộp và duyệt báo cáo tuần, nhận thông báo thời gian thực.

## Công nghệ

- **Backend:** NodeJS, Express, Sequelize (MySQL hoặc SQLite), JWT, Socket.IO
- **Frontend:** ReactJS 18 (Vite), React Router, Axios, socket.io-client
- **Triển khai:** Docker, Docker Compose, Nginx
- **Kiểm thử:** Jest, Supertest

## Cách 1 – Chạy local (không cần cài MySQL)

Mặc định backend dùng SQLite nên chỉ cần NodeJS 18+.

```bash
cd server
npm install
copy .env.example .env      # macOS/Linux: cp .env.example .env
npm run seed                # tạo dữ liệu mẫu (XÓA dữ liệu cũ)
npm run dev                 # API: http://localhost:5050
```

Mở terminal thứ hai:

```bash
cd client
npm install
npm run dev                 # Giao diện: http://localhost:5180
```

## Cách 2 – Chạy bằng Docker Compose (MySQL)

```bash
docker compose up -d --build
docker compose exec api node src/seed.js   # tạo dữ liệu mẫu lần đầu
```

Mở http://localhost:8080.

## Tài khoản mẫu (sau khi seed, mật khẩu đều là `123456`)

| Email | Vai trò |
| --- | --- |
| admin@taskflow.local | Quản trị hệ thống |
| an@taskflow.local | Trưởng nhóm dự án mẫu |
| binh@taskflow.local | Thành viên |
| chi@taskflow.local | Thành viên |

Mẹo demo realtime: mở 2 trình duyệt (1 cửa sổ ẩn danh), đăng nhập `an` và `binh`,
kéo thẻ ở một bên và xem bên kia cập nhật ngay.

## Đăng nhập bằng Google

Trang đăng nhập/đăng ký có nút **Đăng nhập bằng Google** (vẫn giữ đăng nhập bằng email + mật khẩu).
Lần đầu đăng nhập bằng Google sẽ tự tạo tài khoản theo Gmail; nếu Gmail đó đã có tài khoản thì đăng nhập vào đúng tài khoản cũ.
Ai đã được mời vào dự án bằng Gmail đó sẽ tự vào dự án.

Bật nút này (làm 1 lần, miễn phí):

1. Vào https://console.cloud.google.com/ → tạo Project (VD: `TaskFlow`).
2. **APIs & Services → OAuth consent screen**: chọn *External*, điền tên app + email, lưu; mục *Test users* thêm Gmail của các thành viên.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID** → loại *Web application*.
   *Authorized JavaScript origins* thêm: `http://localhost:5180`, `http://localhost:5181`, `http://localhost:8080`.
4. Chép **Client ID** → bấm đúp `cau-hinh-google.bat` và dán vào → khởi động lại `chay-du-an.bat`.

Quên mật khẩu: đăng nhập bằng Google, hoặc nhờ admin bấm **Link đặt lại MK** ở trang Quản trị.

## Chạy test

```bash
cd server
npm test
```

## Cấu trúc thư mục

```
taskflow/
├── docker-compose.yml
├── server/                 # REST API + Socket.IO
│   ├── src/
│   │   ├── config/         # kết nối CSDL
│   │   ├── models/         # Sequelize models + quan hệ
│   │   ├── routes/         # khai báo endpoint
│   │   ├── controllers/    # xử lý request
│   │   ├── services/       # phân quyền dự án, gửi thông báo
│   │   ├── middlewares/    # xác thực JWT, xử lý lỗi
│   │   ├── sockets/        # Socket.IO
│   │   ├── utils/
│   │   ├── app.js, server.js, seed.js
│   └── tests/
└── client/                 # React SPA
    └── src/
        ├── api/            # axios + socket
        ├── context/        # AuthContext
        ├── components/     # Board, TaskModal, ReportsTab, StatsTab...
        └── pages/          # Login, Projects, ProjectPage, AdminUsers...
```

## Tiến độ chức năng

| Mã | Chức năng | Trạng thái |
| --- | --- | --- |
| F01–F02 | Đăng ký, đăng nhập, hồ sơ (MSSV, lớp, SĐT…), đổi mật khẩu, đăng nhập bằng Google | Xong |
| F03 | Quản trị người dùng (khóa, đổi vai trò) | Xong |
| F04–F05 | Dự án, thành viên, vai trò; mời nhiều email một lúc, link mời, tự vào dự án khi đăng ký | Xong |
| F06–F08 | Task, Kanban kéo–thả, lọc/tìm kiếm | Xong |
| F09 | Bình luận, cập nhật % tiến độ, nộp kết quả nhiều file (Word, PDF, Excel, ảnh, zip...) | Xong · checklist: chưa làm |
| F10 | Lịch sử thay đổi task | Xong |
| F11–F13 | Báo cáo tuần, duyệt/chấm điểm, gợi ý từ task Done; trưởng nhóm duyệt bài từng công việc với nhận xét "Ổn / Cần bổ sung" | Xong |
| F14 | Xuất PDF/Excel | Chưa làm |
| F15 | Thông báo realtime | Xong |
| F16–F17 | Dashboard thống kê, biểu đồ theo tuần | Xong (biểu đồ CSS, có thể thay Recharts) |
| F18 | Nhắc hạn tự động (sắp đến hạn, quá hạn, bài chờ duyệt quá hạn) qua thông báo trong app | Xong · gửi email: chưa làm |
