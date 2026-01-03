import React, { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { Grid, Paper, Typography, Box, CircularProgress } from '@mui/material';

interface MetricData {
  timestamp: string;
  value: number;
  label?: string;
}

interface DashboardProps {
  dashboardId: string;
  userId: string;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

const Dashboard: React.FC<DashboardProps> = ({ dashboardId, userId }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [realtimeData, setRealtimeData] = useState<Record<string, MetricData[]>>({});
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    // Initialize WebSocket connection
    const newSocket = io(process.env.REACT_APP_WS_URL || 'ws://localhost:3001', {
      auth: {
        token: localStorage.getItem('token')
      }
    });

    newSocket.on('connect', () => {
      console.log('Connected to WebSocket server');
      setConnected(true);
      setLoading(false);

      // Subscribe to metrics
      newSocket.emit('subscribe', { metric: 'sales', interval: 1000 });
      newSocket.emit('subscribe', { metric: 'users', interval: 2000 });
      newSocket.emit('subscribe', { metric: 'revenue', interval: 1000 });
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from WebSocket server');
      setConnected(false);
    });

    // Handle metric updates
    newSocket.on('metric:update', (data: any) => {
      setRealtimeData((prev) => {
        const metricData = prev[data.metric] || [];
        const newData = [...metricData, {
          timestamp: new Date(data.timestamp).toLocaleTimeString(),
          value: data.data.value,
          label: data.data.label
        }];

        // Keep only last 20 data points
        if (newData.length > 20) {
          newData.shift();
        }

        return {
          ...prev,
          [data.metric]: newData
        };
      });
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, [dashboardId]);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ flexGrow: 1, p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Real-Time Analytics Dashboard
      </Typography>
      
      <Box sx={{ mb: 2 }}>
        <Typography variant="body2" color={connected ? 'success.main' : 'error.main'}>
          {connected ? '🟢 Connected' : '🔴 Disconnected'}
        </Typography>
      </Box>

      <Grid container spacing={3}>
        {/* Sales Chart */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Real-Time Sales
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={realtimeData.sales || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="timestamp" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#8884d8"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        {/* Active Users Chart */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Active Users
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={realtimeData.users || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="timestamp" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#82ca9d"
                  fill="#82ca9d"
                  fillOpacity={0.6}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        {/* Revenue Chart */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Revenue Stream
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={realtimeData.revenue || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="timestamp" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar
                  dataKey="value"
                  fill="#ffc658"
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        {/* Metrics Summary */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Current Metrics
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={4}>
                <Box textAlign="center">
                  <Typography variant="h4" color="primary">
                    {realtimeData.sales?.slice(-1)[0]?.value || 0}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Sales
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={4}>
                <Box textAlign="center">
                  <Typography variant="h4" color="success.main">
                    {realtimeData.users?.slice(-1)[0]?.value || 0}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Users
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={4}>
                <Box textAlign="center">
                  <Typography variant="h4" color="warning.main">
                    ${realtimeData.revenue?.slice(-1)[0]?.value || 0}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Revenue
                  </Typography>
                </Box>
              </Grid>
            </Grid>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Dashboard;