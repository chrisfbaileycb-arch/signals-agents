import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: {
			components: path.resolve(__dirname, 'src/components'),
			lib: path.resolve(__dirname, 'src/lib'),
			renderer: path.resolve(__dirname, 'src/renderer'),
			providers: path.resolve(__dirname, 'src/providers'),
			main: path.resolve(__dirname, 'src/main'),
			assets: path.resolve(__dirname, 'assets'),
			images: path.resolve(__dirname, 'images'),
		},
	},
	server: {
		host: '0.0.0.0',
		port: 3000,
		allowedHosts: true,
		hmr: false,
	},
});
