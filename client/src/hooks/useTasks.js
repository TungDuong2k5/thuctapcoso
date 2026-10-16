import { useCallback, useEffect, useState } from 'react';
import api, { getSocket } from '../api/client';

// Tải danh sách công việc của dự án (kèm bộ lọc) và tự làm mới khi có người thay đổi
export default function useTasks(projectId, filter = {}) {
  const [tasks, setTasks] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const key = JSON.stringify(filter);

  const load = useCallback(() => {
    const query = Object.fromEntries(Object.entries(JSON.parse(key)).filter(([, v]) => v));
    return api.get(`/projects/${projectId}/tasks`, { params: query }).then((res) => {
      setTasks(res.data);
      setLoaded(true);
    });
  }, [projectId, key]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const socket = getSocket();
    socket.on('task:changed', load);
    // tin nhắn riêng mới / đã đọc → cập nhật số chưa đọc trên thẻ công việc
    socket.on('dm:new', load);
    socket.on('dm:read', load);
    return () => {
      socket.off('task:changed', load);
      socket.off('dm:new', load);
      socket.off('dm:read', load);
    };
  }, [load]);

  return { tasks, loaded, reload: load };
}
