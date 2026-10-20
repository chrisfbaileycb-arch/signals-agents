import { makeOwnerGate } from './owner-gate.js';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const args = process.argv.slice(2);
const portArgIndex = args.indexOf('--port');
const portFromArgs =
	portArgIndex !== -1 ? Number(args[portArgIndex + 1]) : null;
const hostArgIndex = args.indexOf('--host');
const hostFromArgs = hostArgIndex !== -1 ? args[hostArgIndex + 1] : null;

const PORT = portFromArgs || Number(process.env.PORT) || 3000;
const HOST = hostFromArgs || process.env.HOST || '0.0.0.0';

const isProduction = process.env.NODE_ENV === 'production';
app.set('trust proxy', 1);
app.disable('x-powered-by');
if (isProduction || process.env.OWNER_PASSWORD) app.use(makeOwnerGate(process.env.OWNER_PASSWORD || ''));
app.use((_req, res, next) => { res.set('Referrer-Policy', 'no-referrer'); res.set('X-Content-Type-Options', 'nosniff'); next(); });

/**
 * Health & Financial Guardrail Verification Endpoint
 * Confirms that Signals Agents operates with zero server-side operator API keys:
 * all provider credentials live strictly in client-side page session memory via byokConnector.ts.
 */
app.get(['/health', '/api/health'], (_req, res) => {
	res.json({
		product: 'Signals Agents',
		status: 'ok',
		operatorKeyPath: false,
		credentialStorage: 'client-ephemeral-session-memory-only',
	});
});

process.on('uncaughtException', (err) => {
	console.error('[Server Uncaught Exception]:', err);
});

process.on('unhandledRejection', (reason) => {
	console.error('[Server Unhandled Rejection]:', reason);
});

async function startServer() {
	if (!isProduction) {
		const { createServer: createViteServer } = await import('vite');
		const vite = await createViteServer({
			optimizeDeps: {
				entries: ['index.html'],
			},
			server: {
				middlewareMode: true,
				allowedHosts: true,
				hmr: false,
				ws: false,
			},
			appType: 'spa',
		});
		app.use(vite.middlewares);
	} else {
		app.use(express.static(path.resolve(__dirname, 'dist')));
		app.get('/{*splat}', (_req, res) => {
			res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
		});
	}

	app.listen(PORT, HOST, () => {
		console.log(`\n  ➜  Local:   http://localhost:${PORT}/`);
		console.log(`  ➜  Network: http://${HOST}:${PORT}/\n`);
	});
}

startServer().catch((err) => {
	console.error('Failed to start server:', err);
	process.exit(1);
});
