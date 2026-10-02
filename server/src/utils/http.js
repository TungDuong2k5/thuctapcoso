class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Bọc controller async để lỗi được chuyển tới errorHandler thay vì làm sập server
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Trả về ngày thứ 2 (YYYY-MM-DD) của tuần chứa ngày truyền vào
function mondayOf(input) {
  const d = input ? new Date(`${String(input).slice(0, 10)}T00:00:00Z`) : new Date();
  if (Number.isNaN(d.getTime())) throw new HttpError(400, 'Ngày không hợp lệ');
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - day + 1);
  return d.toISOString().slice(0, 10);
}

module.exports = { HttpError, asyncHandler, mondayOf };
