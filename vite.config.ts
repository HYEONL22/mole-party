import { defineConfig } from 'vite';

// 개발 중에는 /ws 요청을 게임 서버(3001)로 넘긴다. 배포 시에는 서버가 화면까지 함께 제공.
export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/ws': { target: 'ws://localhost:3001', ws: true },
    },
  },
});
