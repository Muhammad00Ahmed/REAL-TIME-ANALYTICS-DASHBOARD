import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createClient } from 'redis';
import dotenv from 'dotenv';

// Import routes
import metricsRouter from './routes/metrics';
import dashboardRouter from './routes/dashboards';
import alertsRouter from './routes/alerts';
import usersRouter from './routes/users';

// Import middleware
import { errorHandler } from './middleware/errorHandler';
import { authenticate } from './middleware/auth';

// Import services
import { MetricsService } from './services/metricsService';
import { StreamProcessor } from './services/streamProcessor';

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true
  }
});

// Redis client
const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => console.error('Redis Client Error', err));
redisClient.connect();

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

// API Routes
app.use('/api/metrics', authenticate, metricsRouter);
app.use('/api/dashboards', authenticate, dashboardRouter);
app.use('/api/alerts', authenticate, alertsRouter);
app.use('/api/users', authenticate, usersRouter);

// WebSocket connection handling
io.use((socket, next) => {
  // Authentication middleware for WebSocket
  const token = socket.handshake.auth.token;
  if (token) {
    // Verify token here
    next();
  } else {
    next(new Error('Authentication error'));
  }
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Subscribe to metrics
  socket.on('subscribe', async (data) => {
    const { metric, interval = 1000 } = data;
    
    // Join room for this metric
    socket.join(`metric:${metric}`);
    
    // Start streaming data
    const streamInterval = setInterval(async () => {
      try {
        const metricsService = new MetricsService(redisClient);
        const metricData = await metricsService.getRealtimeData(metric);
        
        socket.emit('metric:update', {
          metric,
          data: metricData,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('Error streaming metric:', error);
      }
    }, interval);

    // Store interval ID for cleanup
    socket.data.intervals = socket.data.intervals || {};
    socket.data.intervals[metric] = streamInterval;
  });

  // Unsubscribe from metrics
  socket.on('unsubscribe', (data) => {
    const { metric } = data;
    socket.leave(`metric:${metric}`);
    
    // Clear interval
    if (socket.data.intervals && socket.data.intervals[metric]) {
      clearInterval(socket.data.intervals[metric]);
      delete socket.data.intervals[metric];
    }
  });

  // Handle dashboard updates
  socket.on('dashboard:update', async (data) => {
    // Broadcast dashboard update to all clients in the room
    io.to(`dashboard:${data.dashboardId}`).emit('dashboard:updated', data);
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    
    // Clear all intervals
    if (socket.data.intervals) {
      Object.values(socket.data.intervals).forEach((interval: any) => {
        clearInterval(interval);
      });
    }
  });
});

// Initialize stream processor
const streamProcessor = new StreamProcessor(redisClient, io);
streamProcessor.start();

// Error handling
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

const PORT = process.env.PORT || 5000;
const WS_PORT = process.env.WEBSOCKET_PORT || 3001;

server.listen(PORT, () => {
  console.log(`🚀 API Server running on port ${PORT}`);
  console.log(`📊 WebSocket Server running on port ${WS_PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing HTTP server');
  await redisClient.quit();
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

export { app, io, redisClient };