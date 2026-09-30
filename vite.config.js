import { defineConfig } from "vite";

// VINEXT=main loads the build of cloudflare/vinext main installed as vinext-main
const { default: vinext } = await import(process.env.VINEXT === "main" ? "vinext-main" : "vinext");

export default defineConfig({
  plugins: [vinext()],
});
