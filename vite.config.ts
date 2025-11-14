// vite.config.ts
import { defineConfig, loadEnv } from "vite";
import { fileURLToPath } from "node:url";
import { URL } from "node:url";

export default defineConfig(({ mode }) => {
  // Viteはクライアント側で import.meta.env を使うので、ここで env は必須ではないけど、
  // 読みたい人向けに置いとく（未使用でもOK）
  loadEnv(mode, process.cwd(), "VITE_");

  return {
    // GitHub Pages などのサブパス配信でもアセットが 404 にならないよう
    // 相対パスでビルドされる base を指定しておく
    base: './',
    server: {
      host: true,
      // port: 5173, // 必要なら
    },
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)), // ← これで @ が src を指す
      },
    },
  };
});
