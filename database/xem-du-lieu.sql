-- Xem nhanh dữ liệu TaskFlow trong SQL Server
-- Bấm Execute (F5) để chạy cả file, hoặc bôi đen 1 câu rồi F5 để chạy riêng câu đó.
USE [TaskFlow];
GO

-- 1. Số dòng của từng bảng
SELECT t.name AS bang, SUM(p.rows) AS so_dong
FROM sys.tables t
JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0, 1)
GROUP BY t.name
ORDER BY t.name;

-- 2. Tài khoản
SELECT id, full_name AS ho_ten, email, student_code AS mssv, class_name AS lop, phone AS sdt, system_role AS vai_tro_he_thong, created_at
FROM users
ORDER BY id;

-- 3. Dự án + trưởng nhóm + số thành viên + % hoàn thành
SELECT p.id, p.name AS du_an, u.full_name AS nguoi_tao, p.start_date, p.end_date,
       (SELECT COUNT(*) FROM project_members m WHERE m.project_id = p.id) AS so_thanh_vien,
       (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS tong_cong_viec,
       (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'done') AS da_xong,
       CASE WHEN (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) = 0 THEN 0
            ELSE 100 * (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'done')
                     / (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) END AS phan_tram_hoan_thanh
FROM projects p
LEFT JOIN users u ON u.id = p.owner_id
ORDER BY p.id;

-- 4. Thành viên từng dự án
SELECT p.name AS du_an, u.full_name AS thanh_vien, u.email,
       CASE m.role WHEN 'leader' THEN N'Trưởng nhóm' ELSE N'Thành viên' END AS vai_tro
FROM project_members m
JOIN projects p ON p.id = m.project_id
JOIN users u ON u.id = m.user_id
ORDER BY p.name, m.role DESC, u.full_name;

-- 5. Công việc + người làm (nhiều người ghép bằng dấu phẩy) + trạng thái
SELECT t.id, p.name AS du_an, t.title AS cong_viec,
       CASE t.status WHEN 'todo' THEN N'Chuẩn bị làm' WHEN 'in_progress' THEN N'Đang làm'
                     WHEN 'review' THEN N'Chờ nhận xét' ELSE N'Đã xong' END AS trang_thai,
       t.priority AS uu_tien, t.due_date AS han,
       STRING_AGG(u.full_name, N', ') AS nguoi_lam
FROM tasks t
JOIN projects p ON p.id = t.project_id
LEFT JOIN task_assignees a ON a.task_id = t.id
LEFT JOIN users u ON u.id = a.user_id
GROUP BY t.id, p.name, t.title, t.status, t.priority, t.due_date
ORDER BY p.name, t.id;

-- 6. Nhận xét bài (phần ổn / cần bổ sung)
SELECT t.title AS cong_viec, u.full_name AS nguoi_nhan_xet, r.decision AS quyet_dinh,
       r.good_points AS phan_on, r.improvements AS can_bo_sung, r.created_at
FROM task_reviews r
JOIN tasks t ON t.id = r.task_id
JOIN users u ON u.id = r.reviewer_id
ORDER BY r.created_at DESC;

-- 7. File đã nộp
SELECT t.title AS cong_viec, f.original_name AS ten_file, u.full_name AS nguoi_nop, f.size AS kich_thuoc_byte, f.created_at
FROM attachments f
JOIN tasks t ON t.id = f.task_id
JOIN users u ON u.id = f.uploader_id
ORDER BY f.created_at DESC;

-- 8. Lời mời tham gia dự án
SELECT p.name AS du_an, i.email, i.status AS trang_thai, u.full_name AS nguoi_moi, i.created_at
FROM project_invitations i
JOIN projects p ON p.id = i.project_id
LEFT JOIN users u ON u.id = i.invited_by
ORDER BY i.created_at DESC;
