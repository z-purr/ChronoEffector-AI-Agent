import path from "path"
import { defineConfig } from 'vite'
import { TanStackRouterVite } from "@tanstack/router-plugin/vite"
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vite.dev/config/
export default defineConfig({
  plugins: [TanStackRouterVite(), react(), tailwindcss(), nodePolyfills()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
