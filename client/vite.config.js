import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Chạy xong tự mở web bằng Microsoft Edge (không có Edge thì mở trình duyệt mặc định).
// Muốn tắt: đặt biến môi trường TASKFLOW_NO_OPEN=1
function openInEdge() {
  return {
    name: 'taskflow-open-edge',
    apply: 'serve',
    configureServer(server) {
      if (process.env.TASKFLOW_NO_OPEN || process.env.__TASKFLOW_OPENED) return;
      server.httpServer?.once('listening', () => {
        process.env.__TASKFLOW_OPENED = '1'; // Vite khởi động lại (sửa config) thì không mở thêm tab
        const url = `http://localhost:${server.config.server.port}`;
        const edge = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles]
          .filter(Boolean)
          .map((dir) => path.join(dir, 'Microsoft', 'Edge', 'Application', 'msedge.exe'))
          .find((file) => fs.existsSync(file));
        if (edge) spawn(edge, [url], { detached: true, stdio: 'ignore' }).unref();
        else server.openBrowser();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), openInEdge()],
  server: {
    port: 5180,
    // Cho phép mở qua đường hầm Cloudflare (link *.trycloudflare.com)
    allowedHosts: ['.trycloudflare.com'],
    proxy: {
      '/api': 'http://localhost:5050',
      '/socket.io': { target: 'http://localhost:5050', ws: true },
    },
  },
});
