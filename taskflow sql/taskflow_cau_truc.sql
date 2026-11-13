-- ============================================================================
-- TaskFlow – Cơ sở dữ liệu SQL Server (dựng theo đúng code: server/src/models/index.js)
-- CHỈ CẤU TRÚC 17 bảng (không có dữ liệu). Ứng dụng tự tạo dữ liệu khi sử dụng.
--
-- AN TOÀN: KHÔNG có lệnh xóa. Bảng đã có thì bỏ qua, bảng đã có dữ liệu thì không chèn thêm.
-- => Bấm Execute (F5) bao nhiêu lần cũng không lỗi và không mất dữ liệu.
-- ============================================================================
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO
IF DB_ID(N'TaskFlow') IS NULL CREATE DATABASE [TaskFlow];
GO
USE [TaskFlow];
GO

-- ===================== 17 BẢNG =====================

-- Bảng users
IF OBJECT_ID(N'users', N'U') IS NULL
BEGIN
  CREATE TABLE [users] (
    [id] INT IDENTITY(1,1) NOT NULL,
    [full_name] NVARCHAR(100) NOT NULL,
    [email] NVARCHAR(150) NULL,
    [password_hash] NVARCHAR(255) NOT NULL,
    [system_role] NVARCHAR(255) NULL DEFAULT N'user' CHECK ([system_role] IN (N'admin', N'user')),
    [is_active] BIT NULL DEFAULT 1,
    [student_code] NVARCHAR(20) NULL,
    [class_name] NVARCHAR(50) NULL,
    [phone] NVARCHAR(15) NULL,
    [date_of_birth] DATE NULL,
    [bio] NVARCHAR(500) NULL,
    [avatar_url] NVARCHAR(255) NULL,
    [google_id] NVARCHAR(64) NULL,
    [has_password] BIT NULL DEFAULT 1,
    [reset_token_hash] NVARCHAR(64) NULL,
    [reset_token_expires] DATETIMEOFFSET NULL,
    [password_changed_at] DATETIMEOFFSET NULL,
    [created_at] DATETIMEOFFSET NOT NULL,
    [updated_at] DATETIMEOFFSET NOT NULL,
    CONSTRAINT [PK_users] PRIMARY KEY ([id])
  );
  CREATE UNIQUE INDEX [UQ_users_email] ON [users] ([email]) WHERE [email] IS NOT NULL;
END
GO

-- Bảng projects
IF OBJECT_ID(N'projects', N'U') IS NULL
BEGIN
  CREATE TABLE [projects] (
    [id] INT IDENTITY(1,1) NOT NULL,
    [name] NVARCHAR(150) NOT NULL,
    [description] NVARCHAR(MAX) NULL,
    [start_date] DATE NULL,
    [end_date] DATE NULL,
    [status] NVARCHAR(255) NULL DEFAULT N'active' CHECK ([status] IN (N'active', N'archived')),
    [completed_at] DATETIMEOFFSET NULL,
    [invite_code] NVARCHAR(48) NULL,
    [created_at] DATETIMEOFFSET NOT NULL,
    [updated_at] DATETIMEOFFSET NOT NULL,
    [owner_id] INT NULL,
    CONSTRAINT [PK_projects] PRIMARY KEY ([id]),
    CONSTRAINT [FK_projects_owner_id] FOREIGN KEY ([owner_id]) REFERENCES [users] ([id])
  );
END
GO

-- Bảng project_members
IF OBJECT_ID(N'project_members', N'U') IS NULL
BEGIN
  CREATE TABLE [project_members] (
    [project_id] INT NOT NULL,
    [user_id] INT NOT NULL,
    [role] NVARCHAR(255) NULL DEFAULT N'member' CHECK ([role] IN (N'leader', N'member', N'guest')),
    [created_at] DATETIMEOFFSET NOT NULL,
    [updated_at] DATETIMEOFFSET NOT NULL,
    CONSTRAINT [PK_project_members] PRIMARY KEY ([project_id], [user_id]),
    CONSTRAINT [FK_project_members_project_id] FOREIGN KEY ([project_id]) REFERENCES [projects] ([id]),
    CONSTRAINT [FK_project_members_user_id] FOREIGN KEY ([user_id]) REFERENCES [users] ([id])
  );
END
GO

-- Bảng project_invitations
IF OBJECT_ID(N'project_invitations', N'U') IS NULL
BEGIN
  CREATE TABLE [project_invitations] (
    [id] INT IDENTITY(1,1) NOT NULL,
    [email] NVARCHAR(150) NOT NULL,
    [role] NVARCHAR(255) NULL DEFAULT N'member' CHECK ([role] IN (N'leader', N'member', N'guest')),
    [token] NVARCHAR(64) NOT NULL,
    [status] NVARCHAR(255) NULL DEFAULT N'pending' CHECK ([status] IN (N'pending', N'accepted', N'declined', N'cancelled')),
    [created_at] DATETIMEOFFSET NOT NULL,
    [updated_at] DATETIMEOFFSET NOT NULL,
    [project_id] INT NULL,
    [invited_by] INT NULL,
    CONSTRAINT [PK_project_invitations] PRIMARY KEY ([id]),
    CONSTRAINT [FK_project_invitations_project_id] FOREIGN KEY ([project_id]) REFERENCES [projects] ([id]),
    CONSTRAINT [FK_project_invitations_invited_by] FOREIGN KEY ([invited_by]) REFERENCES [users] ([id])
  );
  CREATE UNIQUE INDEX [UQ_project_invitations_token] ON [project_invitations] ([token]) WHERE [token] IS NOT NULL;
END
GO

-- Bảng labels
IF OBJECT_ID(N'labels', N'U') IS NULL
BEGIN
  CREATE TABLE [labels] (
    [id] INT IDENTITY(1,1) NOT NULL,
    [name] NVARCHAR(30) NOT NULL,
    [color] NVARCHAR(7) NULL DEFAULT N'#64748b',
    [created_at] DATETIMEOFFSET NOT NULL,
    [updated_at] DATETIMEOFFSET NOT NULL,
    [project_id] INT NULL,
    CONSTRAINT [PK_labels] PRIMARY KEY ([id]),
    CONSTRAINT [FK_labels_project_id] FOREIGN KEY ([project_id]) REFERENCES [projects] ([id])
  );
END
GO

-- Bảng tasks
IF OBJECT_ID(N'tasks', N'U') IS NULL
BEGIN
  CREATE TABLE [tasks] (
    [id] INT IDENTITY(1,1) NOT NULL,
    [title] NVARCHAR(200) NOT NULL,
    [description] NVARCHAR(MAX) NULL,
    [status] NVARCHAR(255) NULL DEFAULT N'todo' CHECK ([status] IN (N'todo', N'in_progress', N'review', N'done')),
    [priority] NVARCHAR(255) NULL DEFAULT N'medium' CHECK ([priority] IN (N'low', N'medium', N'high', N'urgent')),
    [start_date] DATE NULL,
    [due_date] DATE NULL,
    [due_time] NVARCHAR(5) NULL,
    [submitted_late_minutes] INT NULL DEFAULT 0,
    [position] INT NULL DEFAULT 0,
    [progress] INT NULL DEFAULT 0,
    [submitted_at] DATETIMEOFFSET NULL,
    [reminded_soon_for] DATE NULL,
    [overdue_reminded_on] DATE NULL,
    [due_today_reminded_for] DATE NULL,
    [last_urgent_at] DATETIMEOFFSET NULL,
    [completed_at] DATETIMEOFFSET NULL,
    [created_at] DATETIMEOFFSET NOT NULL,
    [updated_at] DATETIMEOFFSET NOT NULL,
    [project_id] INT NULL,
    [assignee_id] INT NULL,
    [creator_id] INT NULL,
    CONSTRAINT [PK_tasks] PRIMARY KEY ([id]),
    CONSTRAINT [FK_tasks_project_id] FOREIGN KEY ([project_id]) REFERENCES [projects] ([id]),
    CONSTRAINT [FK_tasks_assignee_id] FOREIGN KEY ([assignee_id]) REFERENCES [users] ([id]),
    CONSTRAINT [FK_tasks_creator_id] FOREIGN KEY ([creator_id]) REFERENCES [users] ([id])
  );
END
GO

-- Bảng task_assignees
IF OBJECT_ID(N'task_assignees', N'U') IS NULL
BEGIN
  CREATE TABLE [task_assignees] (
    [task_id] INT NOT NULL,
    [user_id] INT NOT NULL,
    [created_at] DATETIMEOFFSET NOT NULL,
    [updated_at] DATETIMEOFFSET NOT NULL,
    CONSTRAINT [PK_task_assignees] PRIMARY KEY ([task_id], [user_id]),
    CONSTRAINT [FK_task_assignees_task_id] FOREIGN KEY ([task_id]) REFERENCES [tasks] ([id]),
    CONSTRAINT [FK_task_assignees_user_id] FOREIGN KEY ([user_id]) REFERENCES [users] ([id])
  );
END
GO

-- Bảng task_labels
IF OBJECT_ID(N'task_labels', N'U') IS NULL
BEGIN
  CREATE TABLE [task_labels] (
    [task_id] INT NOT NULL,
    [label_id] INT NOT NULL,
    [created_at] DATETIMEOFFSET NOT NULL,
    [updated_at] DATETIMEOFFSET NOT NULL,
    CONSTRAINT [PK_task_labels] PRIMARY KEY ([task_id], [label_id]),
    CONSTRAINT [FK_task_labels_task_id] FOREIGN KEY ([task_id]) REFERENCES [tasks] ([id]),
    CONSTRAINT [FK_task_labels_label_id] FOREIGN KEY ([label_id]) REFERENCES [labels] ([id])
  );
END
GO

-- Bảng attachments
IF OBJECT_ID(N'attachments', N'U') IS NULL
BEGIN
  CREATE TABLE [attachments] (
    [id] INT IDENTITY(1,1) NOT NULL,
    [original_name] NVARCHAR(255) NOT NULL,
    [stored_name] NVARCHAR(255) NOT NULL,
    [mime_type] NVARCHAR(150) NULL,
    [size] INT NULL,
    [note] NVARCHAR(500) NULL,
    [created_at] DATETIMEOFFSET NOT NULL,
    [updated_at] DATETIMEOFFSET NOT NULL,
    [task_id] INT NULL,
    [uploader_id] INT NULL,
    CONSTRAINT [PK_attachments] PRIMARY KEY ([id]),
    CONSTRAINT [FK_attachments_task_id] FOREIGN KEY ([task_id]) REFERENCES [tasks] ([id]),
    CONSTRAINT [FK_attachments_uploader_id] FOREIGN KEY ([uploader_id]) REFERENCES [users] ([id])
  );
END
GO

-- Bảng task_reviews
IF OBJECT_ID(N'task_reviews', N'U') IS NULL
BEGIN
  CREATE TABLE [task_reviews] (
    [id] INT IDENTITY(1,1) NOT NULL,
    [decision] NVARCHAR(255) NOT NULL CHECK ([decision] IN (N'start', N'comment', N'approve', N'reject')),
    [good_points] NVARCHAR(MAX) NULL,
    [improvements] NVARCHAR(MAX) NULL,
    [created_at] DATETIMEOFFSET NOT NULL,
    [updated_at] DATETIMEOFFSET NOT NULL,
    [task_id] INT NULL,
    [reviewer_id] INT NULL,
    CONSTRAINT [PK_task_reviews] PRIMARY KEY ([id]),
    CONSTRAINT [FK_task_reviews_task_id] FOREIGN KEY ([task_id]) REFERENCES [tasks] ([id]),
    CONSTRAINT [FK_task_reviews_reviewer_id] FOREIGN KEY ([reviewer_id]) REFERENCES [users] ([id])
  );
END
GO

-- Bảng comments
IF OBJECT_ID(N'comments', N'U') IS NULL
BEGIN
  CREATE TABLE [comments] (
    [id] INT IDENTITY(1,1) NOT NULL,
    [content] NVARCHAR(MAX) NOT NULL,
    [created_at] DATETIMEOFFSET NOT NULL,
    [updated_at] DATETIMEOFFSET NOT NULL,
    [task_id] INT NULL,
    [user_id] INT NULL,
    CONSTRAINT [PK_comments] PRIMARY KEY ([id]),
    CONSTRAINT [FK_comments_task_id] FOREIGN KEY ([task_id]) REFERENCES [tasks] ([id]),
    CONSTRAINT [FK_comments_user_id] FOREIGN KEY ([user_id]) REFERENCES [users] ([id])
  );
END
GO

-- Bảng activity_logs
IF OBJECT_ID(N'activity_logs', N'U') IS NULL
BEGIN
  CREATE TABLE [activity_logs] (
    [id] INT IDENTITY(1,1) NOT NULL,
    [action] NVARCHAR(50) NOT NULL,
    [detail] NVARCHAR(255) NULL,
    [created_at] DATETIMEOFFSET NOT NULL,
    [updated_at] DATETIMEOFFSET NOT NULL,
    [task_id] INT NULL,
    [user_id] INT NULL,
    CONSTRAINT [PK_activity_logs] PRIMARY KEY ([id]),
    CONSTRAINT [FK_activity_logs_task_id] FOREIGN KEY ([task_id]) REFERENCES [tasks] ([id]),
    CONSTRAINT [FK_activity_logs_user_id] FOREIGN KEY ([user_id]) REFERENCES [users] ([id])
  );
END
GO

-- Bảng direct_messages
IF OBJECT_ID(N'direct_messages', N'U') IS NULL
BEGIN
  CREATE TABLE [direct_messages] (
    [id] INT IDENTITY(1,1) NOT NULL,
    [content] NVARCHAR(MAX) NOT NULL,
    [read_at] DATETIMEOFFSET NULL,
    [created_at] DATETIMEOFFSET NOT NULL,
    [updated_at] DATETIMEOFFSET NOT NULL,
    [task_id] INT NULL,
    [sender_id] INT NULL,
    [receiver_id] INT NULL,
    CONSTRAINT [PK_direct_messages] PRIMARY KEY ([id]),
    CONSTRAINT [FK_direct_messages_task_id] FOREIGN KEY ([task_id]) REFERENCES [tasks] ([id]),
    CONSTRAINT [FK_direct_messages_sender_id] FOREIGN KEY ([sender_id]) REFERENCES [users] ([id]),
    CONSTRAINT [FK_direct_messages_receiver_id] FOREIGN KEY ([receiver_id]) REFERENCES [users] ([id])
  );
END
GO

-- Bảng chat_messages
IF OBJECT_ID(N'chat_messages', N'U') IS NULL
BEGIN
  CREATE TABLE [chat_messages] (
    [id] INT IDENTITY(1,1) NOT NULL,
    [content] NVARCHAR(MAX) NOT NULL,
    [created_at] DATETIMEOFFSET NOT NULL,
    [updated_at] DATETIMEOFFSET NOT NULL,
    [project_id] INT NULL,
    [user_id] INT NULL,
    CONSTRAINT [PK_chat_messages] PRIMARY KEY ([id]),
    CONSTRAINT [FK_chat_messages_project_id] FOREIGN KEY ([project_id]) REFERENCES [projects] ([id]),
    CONSTRAINT [FK_chat_messages_user_id] FOREIGN KEY ([user_id]) REFERENCES [users] ([id])
  );
END
GO

-- Bảng call_rooms
IF OBJECT_ID(N'call_rooms', N'U') IS NULL
BEGIN
  CREATE TABLE [call_rooms] (
    [id] INT IDENTITY(1,1) NOT NULL,
    [title] NVARCHAR(100) NULL,
    [code] NVARCHAR(8) NOT NULL,
    [password] NVARCHAR(20) NOT NULL,
    [status] NVARCHAR(255) NULL DEFAULT N'active' CHECK ([status] IN (N'active', N'ended')),
    [ended_at] DATETIMEOFFSET NULL,
    [created_at] DATETIMEOFFSET NOT NULL,
    [updated_at] DATETIMEOFFSET NOT NULL,
    [project_id] INT NULL,
    [host_id] INT NULL,
    CONSTRAINT [PK_call_rooms] PRIMARY KEY ([id]),
    CONSTRAINT [FK_call_rooms_project_id] FOREIGN KEY ([project_id]) REFERENCES [projects] ([id]),
    CONSTRAINT [FK_call_rooms_host_id] FOREIGN KEY ([host_id]) REFERENCES [users] ([id])
  );
  CREATE UNIQUE INDEX [UQ_call_rooms_code] ON [call_rooms] ([code]) WHERE [code] IS NOT NULL;
END
GO

-- Bảng weekly_reports
IF OBJECT_ID(N'weekly_reports', N'U') IS NULL
BEGIN
  CREATE TABLE [weekly_reports] (
    [id] INT IDENTITY(1,1) NOT NULL,
    [week_start] DATE NOT NULL,
    [done_text] NVARCHAR(MAX) NULL,
    [plan_text] NVARCHAR(MAX) NULL,
    [issues_text] NVARCHAR(MAX) NULL,
    [status] NVARCHAR(255) NULL DEFAULT N'draft' CHECK ([status] IN (N'draft', N'submitted', N'reviewed')),
    [feedback] NVARCHAR(MAX) NULL,
    [score] FLOAT NULL,
    [created_at] DATETIMEOFFSET NOT NULL,
    [updated_at] DATETIMEOFFSET NOT NULL,
    [project_id] INT NULL,
    [user_id] INT NULL,
    [reviewed_by] INT NULL,
    CONSTRAINT [PK_weekly_reports] PRIMARY KEY ([id]),
    CONSTRAINT [FK_weekly_reports_project_id] FOREIGN KEY ([project_id]) REFERENCES [projects] ([id]),
    CONSTRAINT [FK_weekly_reports_user_id] FOREIGN KEY ([user_id]) REFERENCES [users] ([id]),
    CONSTRAINT [FK_weekly_reports_reviewed_by] FOREIGN KEY ([reviewed_by]) REFERENCES [users] ([id])
  );
END
GO

-- Bảng notifications
IF OBJECT_ID(N'notifications', N'U') IS NULL
BEGIN
  CREATE TABLE [notifications] (
    [id] INT IDENTITY(1,1) NOT NULL,
    [type] NVARCHAR(50) NOT NULL,
    [message] NVARCHAR(255) NOT NULL,
    [link] NVARCHAR(255) NULL,
    [is_read] BIT NULL DEFAULT 0,
    [created_at] DATETIMEOFFSET NOT NULL,
    [updated_at] DATETIMEOFFSET NOT NULL,
    [user_id] INT NULL,
    CONSTRAINT [PK_notifications] PRIMARY KEY ([id]),
    CONSTRAINT [FK_notifications_user_id] FOREIGN KEY ([user_id]) REFERENCES [users] ([id])
  );
END
GO

PRINT N'Xong: database TaskFlow đủ 17 bảng.';
GO
