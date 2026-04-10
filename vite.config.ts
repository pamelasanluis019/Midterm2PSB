import { defineConfig } from "vite";

export default defineConfig({
  base: "/",     // ← Este es el nombre de tu repo
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
      },
    },
  },
});
