import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import fs from 'fs';
import { defineConfig } from 'vite';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    server: {
        host: true,
        https: {
            key: fs.readFileSync(resolve(__dirname, 'certs/key.pem')),
            cert: fs.readFileSync(resolve(__dirname, 'certs/cert.pem'))
        },
        proxy: {
            '/socket.io': {
                target: 'http://localhost:3000',
                ws: true,
                changeOrigin: true
            },
            '/livekit-token': {
                target: 'http://localhost:3000',
                changeOrigin: true
            }
        }
    }
});