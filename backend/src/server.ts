import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { trendRouter } from './routes/trends.js';
import { productRouter } from './routes/products.js';
import { automationRouter } from './routes/automation.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/trends', trendRouter);
app.use('/api/products', productRouter);
app.use('/api/automation', automationRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 Backend rodando na porta ${PORT}`);
});