import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
// https://vite.dev/config/
export default defineConfig({
    plugins: [react()],
    define: {
        // Fix for: Uncaught ReferenceError: __HMR_CONFIG_NAME__ is not defined
        __HMR_CONFIG_NAME__: JSON.stringify('vite'),
    },
    server: {
        host: true,
        port: 5173,
        hmr: {
            host: 'localhost',
            port: 5173,
            protocol: 'ws',
        },
        proxy: {
            '/api': {
                target: 'http://localhost:8080',
                changeOrigin: true,
                secure: false,
            },
        },
    },
});
