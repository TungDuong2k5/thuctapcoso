# BÁO CÁO TIẾN ĐỘ HÀNG TUẦN

**Đề tài:** Hệ thống quản lý quán cà phê "Trạm Trà Chill"

- Họ và tên: ……………………………………  MSSV: ……………………
- Tuần báo cáo: ……  (từ ngày ……/……/…… đến ngày ……/……/……)
- Giảng viên hướng dẫn: ……………………………………

## 1. Mục tiêu của tuần

Hoàn thiện các chức năng chính của hệ thống: bán hàng, ca làm việc, quản lý kho và giao diện, để có thể vận hành thử tại quán.

## 2. Công việc đã thực hiện

| STT | Nội dung | Kết quả |
|---|---|---|
| 1 | Giao diện và nhận diện thương hiệu | Đổi nền ảnh quán cà phê toàn màn hình cho cả quản lý và nhân viên, thay logo mới ở thanh điều hướng, trang đăng nhập và màn hình chào mừng; chỉnh màu chữ để dễ đọc trên nền ảnh. |
| 2 | Quy trình bán hàng | Chọn bán tại chỗ hoặc mang về; trang tùy chỉnh đồ uống riêng (size M/L, mức đường, mức đá, topping), quay lại đúng danh mục vừa chọn; nhân viên tự gõ số lượng; hóa đơn hiển thị tổng số lượng món. |
| 3 | Ca làm việc và két tiền | Nhân viên bấm "Mở ca" và nhập tiền két đầu ca; báo cáo ca tách riêng tiền két gốc, doanh thu tiền mặt và chi phát sinh; ghi khoản chi (VD: sửa máy, mua giấy ăn) do nhân viên nhập, quản lý duyệt hoặc từ chối. |
| 4 | Phân quyền quản lý và nhân viên | Quản lý theo dõi doanh thu, thực đơn, kho, bàn, đơn hàng và hủy đơn khi có sự cố; nhân viên chỉ bán hàng và xem số liệu ca của mình. |
| 5 | Quản lý thực đơn và bàn | Tải ảnh sản phẩm thật lên từ máy, hiển thị vừa khung; thêm và xóa bàn; bỏ thông tin sức chứa, chỉ còn tên bàn. |
| 6 | Kho | Giao diện kho chia 3 tab (tồn kho, lịch sử hôm nay, tổng hợp tháng); bánh và đồ ăn vặt tự động ghi xuất kho khi bán. |
| 7 | Cơ sở dữ liệu | Xuất toàn bộ cấu trúc và dữ liệu sang file SQL cho Microsoft SQL Server (T-SQL). |

## 3. Công nghệ sử dụng

- Backend: Node.js, Express, Sequelize, cơ sở dữ liệu SQLite, xác thực JWT.
- Frontend: React 18, Vite, React Router.

## 4. Khó khăn và cách giải quyết

- Cấu trúc bảng SQLite bị lỗi khi đồng bộ tự động: chuyển sang tạo bảng thông thường và viết script migrate thêm cột an toàn.
- Server bị dừng khi xóa dữ liệu có ràng buộc khóa ngoại: bọc toàn bộ route bằng bộ xử lý lỗi bất đồng bộ và trả thông báo rõ ràng.
- Mất dữ liệu do chạy lại lệnh nạp dữ liệu mẫu: khôi phục từ bản sao lưu và ghi chú không chạy lệnh này trên dữ liệu thật.

## 5. Kế hoạch tuần sau

- Chạy thử toàn bộ quy trình bán hàng với nhân viên thật và ghi nhận lỗi.
- Kiểm thử phân quyền và số liệu báo cáo ca, báo cáo ngày.
- Hoàn thiện tài liệu hướng dẫn sử dụng và báo cáo cuối kỳ.
