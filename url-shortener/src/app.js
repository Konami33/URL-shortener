const express = require('express');
const winston = require('winston');
const config = require('./config');
const urlRoutes = require('./routes/urlRoutes');

const app = express();

// Logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console()],
});

// Middleware
app.use(express.json());
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`);
  next();
});

// Health Check
app.get('/health', (req, res) => res.status(200).json({ status: 'OK' }));

// Routes
app.use('/api', urlRoutes);

// Error Handler
app.use((err, req, res, next) => {
  logger.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Start Server
app.listen(config.port, () => {
  logger.info(`Server running on port ${config.port}`);
});