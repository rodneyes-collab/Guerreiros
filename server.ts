import express from 'express';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';

const app = express();
app.use(cors());
app.use(express.json());

// API Routes
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Vite Integration
async function startServer() {
    console.log('Starting server...');
    if (process.env.NODE_ENV !== 'production') {
        console.log('Running in development mode with Vite middleware');
        try {
            const vite = await createViteServer({
                server: { middlewareMode: true },
                appType: 'spa',
            });
            app.use(vite.middlewares);
            console.log('Vite middleware integrated');
        } catch (error) {
            console.error('Error creating Vite server:', error);
        }
    } else {
        console.log('Running in production mode');
        const distPath = path.join(process.cwd(), 'dist');
        app.use(express.static(distPath));
        app.get('*', (req, res) => {
            res.sendFile(path.join(distPath, 'index.html'));
        });
    }

    const PORT = 3000;
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server running on http://0.0.0.0:${PORT}`);
    });
}

startServer().catch(err => {
    console.error('Failed to start server:', err);
});
