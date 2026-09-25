# BÁO CÁO TIẾN ĐỘ HÀNG TUẦN

**Đề tài:** Hệ thống quản lý quán cà phê "Trạm Trà Chill"

- Họ và tên: ……………………………………  MSSV: ……………………
- Tuần báo cáo: ……  (từ ngày ……/……/…… đến ngày ……/……/……)
- Giảng viên hướng dẫn: ……………………………………

## 1. Mục tiêu của tuần

Hoàn thiện trải nghiệm nhập liệu khi bán hàng và giao diện dễ đọc, chuẩn bị chạy thử tại quán.

## 2. Công việc đã thực hiện

| STT | Nội dung | Kết quả |
|---|---|---|
| 1 | Ô nhập số lượng khi order | Sửa lỗi khó gõ số lượng: giờ bấm vào ô là bôi đen sẵn, xóa trống được để gõ số mới, chỉ nhận chữ số; áp dụng cho số lượng đồ uống, số lượng topping và ô số lượng trong giỏ hàng. Đã thử bằng thao tác gõ phím thật. |
| 2 | Nút thêm đồ uống vào hóa đơn | Số lượng bắt đầu từ 0 nên nút thêm bị khóa; đổi nút sang màu xám, chữ "Nhập số lượng trước" và dòng nhắc màu đỏ để nhân viên biết cần nhập số lượng. |
| 3 | Giao diện chữ trên ảnh nền | Chữ nằm trực tiếp trên ảnh nền chuyển sang màu trắng có viền bóng tối để nổi rõ trên cả vùng sáng và tối; chữ trong các khung trắng giữ màu tối. |
| 4 | Kiểm thử luồng bán hàng | Thử thêm cà phê, latte, americano vào hóa đơn và thanh toán; xóa đơn thử sau khi kiểm tra để không lẫn vào số liệu thật. |
| 5 | Báo cáo và git | Viết báo cáo tuần, đẩy lên repo GitHub riêng để gửi thầy. |

## 3. Công nghệ sử dụng

- Backend: Node.js, Express, Sequelize, cơ sở dữ liệu SQLite, xác thực JWT.
- Frontend: React 18, Vite, React Router.

## 4. Khó khăn và cách giải quyết

- Ô số lượng kiểu số của trình duyệt ép về 1 khi xóa trống nên gõ "25" ra "125": thay bằng ô nhập riêng cho phép xóa trống và bôi đen khi bấm vào.
- Chữ trên ảnh nền bị chìm ở vùng tối và vùng sáng: dùng chữ trắng kèm viền bóng tối.

## 5. Kế hoạch tuần sau

- Chạy thử toàn bộ quy trình bán hàng với nhân viên thật và ghi nhận lỗi.
- Kiểm thử phân quyền và số liệu báo cáo ca, báo cáo ngày.
- Viết tài liệu hướng dẫn sử dụng.
