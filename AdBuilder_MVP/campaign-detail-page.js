// src/pages/advertising/campaigns/[id].js
import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import {
  Box,
  Container,
  Typography,
  Button,
  Card,
  CardContent,
  Grid,
  Paper,
  Chip,
  IconButton,
  Breadcrumbs,
  Link,
  Alert,
  Skeleton,
  Tooltip,
  ToggleButton,
  ToggleButtonGroup,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogContentText,
  Collapse,
  Divider,
  LinearProgress,
  Menu,
  Tab,
  Tabs,
  Stack,
  TextField,
  InputAdornment
} from '@mui/material';
import {
  ArrowBack,
  Refresh,
  PlayArrow,
  Pause,
  Edit,
  TrendingUp,
  TrendingDown,
  Info,
  Download,
  FilterList,
  ExpandMore,
  ExpandLess,
  CheckCircle,
  Warning,
  Error as ErrorIcon,
  Timeline,
  PieChart,
  ShowChart,
  Facebook,
  Instagram,
  ContentCopy,
  MoreVert,
  AttachMoney,
  Visibility,
  ShoppingCart,
  Campaign as CampaignIcon,
  LocalOffer,
  Person,
  CalendarToday,
  LocationOn,
  Search
} from '@mui/icons-material';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart as RePieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  FunnelChart,
  Funnel,
  LabelList
} from 'recharts';
import { format, parseISO, subDays, differenceInMinutes, startOfDay, endOfDay } from 'date-fns';
import apiClient from '../../../utils/apiClient';
import { showNotification } from '../../../utils/notifications';
import { formatCurrency, formatNumber } from '../../../utils/formatters';

// Status configuration (reuse from list page)
const STATUS_CONFIG = {
  draft: { color: 'default', icon: <Edit fontSize="small" /> },
  pending: { color: 'warning', icon: <Warning fontSize="small" /> },
  active: { color: 'success', icon: <CheckCircle fontSize="small" /> },
  paused: { color: 'info', icon: <Pause fontSize="small" /> },
  completed: { color: 'default', icon: <CheckCircle fontSize="small" /> },
  error: { color: 'error', icon: <ErrorIcon fontSize="small" /> }
};

// Chart colors
const CHART_COLORS = {
  primary: '#5D4E99',
  secondary: '#7B68B3',
  success: '#4CAF50',
  warning: '#FF9800',
  error: '#F44336',
  info: '#2196F3'
};

// Tab panels
function TabPanel({ children, value, index }) {
  return (
    <div hidden={value !== index}>
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
}

// Main Component
export default function CampaignDetailPage() {
  const router = useRouter();
  const { id } = router.query;
  const { data: session } = useSession();
  
  // State
  const [campaign, setCampaign] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [dateRange, setDateRange] = useState('7d');
  const [chartType, setChartType] = useState('timeline');
  const [metrics, setMetrics] = useState(null);
  const [attribution, setAttribution] = useState({ data: [], total: 0 });
  const [activity, setActivity] = useState([]);
  const [expandedSettings, setExpandedSettings] = useState({});
  
  // Attribution table state
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('purchaseDate');
  const [sortOrder, setSortOrder] = useState('desc');
  
  // Dialogs
  const [pauseDialog, setPauseDialog] = useState(false);
  const [pauseReason, setPauseReason] = useState('');

  // Fetch campaign data
  useEffect(() => {
    if (id) {
      fetchCampaignDetails();
    }
  }, [id]);

  // Fetch metrics when date range changes
  useEffect(() => {
    if (campaign && activeTab === 0) {
      fetchMetrics();
    }
  }, [campaign, dateRange, activeTab]);

  // Fetch attribution when tab changes
  useEffect(() => {
    if (campaign && activeTab === 1) {
      fetchAttribution();
    }
  }, [campaign, activeTab, page, rowsPerPage, searchTerm]);

  // Fetch activity when tab changes
  useEffect(() => {
    if (campaign && activeTab === 2) {
      fetchActivity();
    }
  }, [campaign, activeTab]);

  const fetchCampaignDetails = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get(`/api/v1/advertising/campaigns/${id}`);
      setCampaign(response.data.data);
    } catch (error) {
      console.error('Failed to fetch campaign:', error);
      showNotification('error', 'Failed to load campaign details');
      router.push('/advertising/campaigns');
    } finally {
      setLoading(false);
    }
  };

  const fetchMetrics = async () => {
    try {
      const endDate = new Date();
      const startDate = dateRange === '7d' 
        ? subDays(endDate, 7)
        : dateRange === '30d'
        ? subDays(endDate, 30)
        : new Date(campaign.schedule.startDate);

      const response = await apiClient.get(`/api/v1/advertising/campaigns/${id}/metrics`, {
        params: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString()
        }
      });
      setMetrics(response.data.data);
    } catch (error) {
      console.error('Failed to fetch metrics:', error);
      showNotification('error', 'Failed to load metrics');
    }
  };

  const fetchAttribution = async () => {
    try {
      const response = await apiClient.get(`/api/v1/advertising/campaigns/${id}/attribution`, {
        params: {
          page: page + 1,
          limit: rowsPerPage,
          search: searchTerm,
          sortBy,
          sortOrder
        }
      });
      setAttribution(response.data.data);
    } catch (error) {
      console.error('Failed to fetch attribution:', error);
      showNotification('error', 'Failed to load attribution data');
    }
  };

  const fetchActivity = async () => {
    try {
      const response = await apiClient.get(`/api/v1/advertising/campaigns/${id}/activity`);
      setActivity(response.data.data);
    } catch (error) {
      console.error('Failed to fetch activity:', error);
      showNotification('error', 'Failed to load activity log');
    }
  };

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      await apiClient.post(`/api/v1/advertising/campaigns/${id}/refresh`);
      showNotification('success', 'Metrics refresh started');
      
      // Refresh data after delay
      setTimeout(async () => {
        await Promise.all([
          fetchCampaignDetails(),
          fetchMetrics()
        ]);
        setRefreshing(false);
      }, 3000);
    } catch (error) {
      showNotification('error', 'Failed to refresh metrics');
      setRefreshing(false);
    }
  };

  const handlePause = async () => {
    try {
      await apiClient.post(`/api/v1/advertising/campaigns/${id}/pause`, {
        reason: pauseReason
      });
      showNotification('success', 'Campaign paused successfully');
      setPauseDialog(false);
      setPauseReason('');
      fetchCampaignDetails();
    } catch (error) {
      showNotification('error', 'Failed to pause campaign');
    }
  };

  const handleResume = async () => {
    try {
      await apiClient.post(`/api/v1/advertising/campaigns/${id}/resume`);
      showNotification('success', 'Campaign resumed successfully');
      fetchCampaignDetails();
    } catch (error) {
      showNotification('error', 'Failed to resume campaign');
    }
  };

  const copyUTM = () => {
    const utm = `utm_source=meta&utm_medium=paid&utm_campaign=${campaign.attribution.utm_campaign}`;
    navigator.clipboard.writeText(utm);
    showNotification('success', 'UTM parameters copied to clipboard');
  };

  const exportAttribution = async () => {
    try {
      const response = await apiClient.get(`/api/v1/advertising/campaigns/${id}/attribution/export`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `attribution-${campaign.name}-${format(new Date(), 'yyyy-MM-dd')}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      showNotification('success', 'Attribution data exported');
    } catch (error) {
      showNotification('error', 'Failed to export data');
    }
  };

  // Calculate derived metrics
  const calculateBurnRate = () => {
    if (!campaign?.metrics?.spend || !campaign?.schedule?.startDate) return 0;
    const daysSinceStart = Math.max(1, Math.floor(
      (new Date() - new Date(campaign.schedule.startDate)) / (1000 * 60 * 60 * 24)
    ));
    return campaign.metrics.spend / daysSinceStart;
  };

  const calculateDaysRemaining = () => {
    if (!campaign?.schedule?.endDate) return '∞';
    const remaining = Math.ceil(
      (new Date(campaign.schedule.endDate) - new Date()) / (1000 * 60 * 60 * 24)
    );
    return remaining > 0 ? remaining : 0;
  };

  // Prepare chart data
  const prepareTimelineData = () => {
    if (!metrics?.daily) return [];
    
    return metrics.daily.map(day => ({
      date: format(parseISO(day.date), 'MMM d'),
      impressions: day.impressions,
      clicks: day.clicks,
      spend: day.spend / 100,
      conversions: day.conversions,
      revenue: day.revenue / 100
    }));
  };

  const prepareFunnelData = () => {
    if (!campaign) return [];
    
    return [
      { name: 'Impressions', value: campaign.metrics.impressions || 0 },
      { name: 'Clicks', value: campaign.metrics.clicks || 0 },
      { name: 'Event Views', value: campaign.ticketAttribution.views || 0 },
      { name: 'Add to Cart', value: campaign.ticketAttribution.addedToCart || 0 },
      { name: 'Purchases', value: campaign.ticketAttribution.purchases || 0 }
    ];
  };

  const prepareAudienceData = () => {
    if (!metrics?.audience) return [];
    
    return Object.entries(metrics.audience.byAge || {}).map(([age, data]) => ({
      name: age,
      value: data.conversions || 0,
      spend: data.spend || 0
    }));
  };

  // Loading state
  if (loading) {
    return (
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Skeleton variant="text" width={200} height={40} />
        <Grid container spacing={3} sx={{ mt: 2 }}>
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Grid item xs={12} md={4} key={i}>
              <Skeleton variant="rectangular" height={120} />
            </Grid>
          ))}
        </Grid>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      {/* Header */}
      <Box mb={3}>
        <Breadcrumbs aria-label="breadcrumb" sx={{ mb: 2 }}>
          <Link
            component="button"
            variant="body2"
            onClick={() => router.push('/advertising/campaigns')}
            underline="hover"
            color="inherit"
          >
            Campaigns
          </Link>
          <Typography color="text.primary">{campaign?.name}</Typography>
        </Breadcrumbs>

        <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2}>
          <Box display="flex" alignItems="center" gap={2}>
            <IconButton onClick={() => router.push('/advertising/campaigns')} size="large">
              <ArrowBack />
            </IconButton>
            <Box>
              <Box display="flex" alignItems="center" gap={2}>
                <Typography variant="h4">{campaign?.name}</Typography>
                <Chip
                  label={campaign?.status}
                  color={STATUS_CONFIG[campaign?.status]?.color || 'default'}
                  icon={STATUS_CONFIG[campaign?.status]?.icon}
                  size="small"
                />
                <Chip
                  label={campaign?.objective.replace(/_/g, ' ')}
                  variant="outlined"
                  size="small"
                />
              </Box>
              <Typography variant="body2" color="text.secondary">
                Last synced: {campaign?.metrics?.lastSyncedAt
                  ? format(new Date(campaign.metrics.lastSyncedAt), 'MMM d, yyyy h:mm a')
                  : 'Never'}
              </Typography>
            </Box>
          </Box>

          <Box display="flex" gap={1}>
            <Tooltip title="Copy UTM parameters">
              <IconButton onClick={copyUTM}>
                <ContentCopy />
              </IconButton>
            </Tooltip>
            
            <Button
              startIcon={refreshing ? <CircularProgress size={20} /> : <Refresh />}
              onClick={handleRefresh}
              disabled={refreshing}
              variant="outlined"
            >
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </Button>

            {campaign?.status === 'active' && (
              <Button
                startIcon={<Pause />}
                onClick={() => setPauseDialog(true)}
                variant="contained"
                color="warning"
              >
                Pause
              </Button>
            )}

            {campaign?.status === 'paused' && (
              <Button
                startIcon={<PlayArrow />}
                onClick={handleResume}
                variant="contained"
                color="success"
              >
                Resume
              </Button>
            )}

            {['draft', 'paused'].includes(campaign?.status) && (
              <Button
                startIcon={<Edit />}
                onClick={() => router.push(`/advertising/campaigns/${campaign._id}/edit`)}
                variant="contained"
              >
                Edit
              </Button>
            )}
          </Box>
        </Box>
      </Box>

      {/* Performance Metrics Grid */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={2}>
          <Card>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="start">
                <Box>
                  <Typography color="text.secondary" variant="body2" gutterBottom>
                    Reach
                  </Typography>
                  <Typography variant="h5">
                    {formatNumber(campaign?.metrics?.reach || 0)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {formatNumber(campaign?.metrics?.impressions || 0)} impressions
                  </Typography>
                </Box>
                <Visibility color="primary" />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={2}>
          <Card>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="start">
                <Box>
                  <Typography color="text.secondary" variant="body2" gutterBottom>
                    Engagement
                  </Typography>
                  <Typography variant="h5">
                    {formatNumber(campaign?.metrics?.clicks || 0)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {campaign?.metrics?.ctr?.toFixed(2) || 0}% CTR
                  </Typography>
                </Box>
                <TrendingUp color="success" />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={2}>
          <Card>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="start">
                <Box>
                  <Typography color="text.secondary" variant="body2" gutterBottom>
                    Budget Used
                  </Typography>
                  <Typography variant="h5">
                    {formatCurrency(campaign?.metrics?.spend || 0, 'COP')}
                  </Typography>
                  <LinearProgress 
                    variant="determinate" 
                    value={Math.min(100, (campaign?.metrics?.spend / campaign?.budget?.amount) * 100 || 0)}
                    sx={{ mt: 1 }}
                  />
                </Box>
                <AttachMoney color="warning" />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={2}>
          <Card>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="start">
                <Box>
                  <Typography color="text.secondary" variant="body2" gutterBottom>
                    Conversions
                  </Typography>
                  <Typography variant="h5">
                    {campaign?.ticketAttribution?.purchases || 0}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {campaign?.ticketAttribution?.overallConversionRate?.toFixed(2) || 0}% rate
                  </Typography>
                </Box>
                <ShoppingCart color="success" />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={2}>
          <Card>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="start">
                <Box>
                  <Typography color="text.secondary" variant="body2" gutterBottom>
                    ROI
                  </Typography>
                  <Typography variant="h5" color={campaign?.ticketAttribution?.roi > 0 ? 'success.main' : 'error.main'}>
                    {campaign?.ticketAttribution?.roi?.toFixed(0) || 0}%
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {campaign?.ticketAttribution?.roas?.toFixed(2) || 0}x ROAS
                  </Typography>
                </Box>
                <TrendingUp color={campaign?.ticketAttribution?.roi > 0 ? 'success' : 'error'} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={2}>
          <Card>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="start">
                <Box>
                  <Typography color="text.secondary" variant="body2" gutterBottom>
                    Cost Efficiency
                  </Typography>
                  <Typography variant="h5">
                    {formatCurrency(campaign?.metrics?.cpc || 0, 'COP')}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {formatCurrency(campaign?.metrics?.cpm || 0, 'COP')} CPM
                  </Typography>
                </Box>
                <LocalOffer color="info" />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Tabs */}
      <Paper sx={{ mb: 3 }}>
        <Tabs value={activeTab} onChange={(e, v) => setActiveTab(v)}>
          <Tab label="Performance" icon={<Timeline />} iconPosition="start" />
          <Tab label="Attribution" icon={<ShoppingCart />} iconPosition="start" />
          <Tab label="Activity" icon={<Info />} iconPosition="start" />
          <Tab label="Settings" icon={<Edit />} iconPosition="start" />
        </Tabs>
      </Paper>

      {/* Performance Tab */}
      <TabPanel value={activeTab} index={0}>
        <Box mb={3} display="flex" justifyContent="space-between" alignItems="center">
          <ToggleButtonGroup
            value={chartType}
            exclusive
            onChange={(e, v) => v && setChartType(v)}
            size="small"
          >
            <ToggleButton value="timeline">
              <ShowChart sx={{ mr: 1 }} /> Timeline
            </ToggleButton>
            <ToggleButton value="funnel">
              <FilterList sx={{ mr: 1 }} /> Funnel
            </ToggleButton>
            <ToggleButton value="audience">
              <PieChart sx={{ mr: 1 }} /> Audience
            </ToggleButton>
          </ToggleButtonGroup>

          <FormControl size="small" sx={{ minWidth: 120 }}>
            <Select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              displayEmpty
            >
              <MenuItem value="7d">Last 7 days</MenuItem>
              <MenuItem value="30d">Last 30 days</MenuItem>
              <MenuItem value="all">All time</MenuItem>
            </Select>
          </FormControl>
        </Box>

        {/* Charts */}
        <Paper sx={{ p: 3 }}>
          {chartType === 'timeline' && (
            <Box>
              <Typography variant="h6" gutterBottom>Performance Timeline</Typography>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={prepareTimelineData()}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <RechartsTooltip />
                  <Legend />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="impressions"
                    stroke={CHART_COLORS.primary}
                    name="Impressions"
                  />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="clicks"
                    stroke={CHART_COLORS.secondary}
                    name="Clicks"
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="conversions"
                    stroke={CHART_COLORS.success}
                    name="Conversions"
                  />
                </LineChart>
              </ResponsiveContainer>
            </Box>
          )}

          {chartType === 'funnel' && (
            <Box>
              <Typography variant="h6" gutterBottom>Conversion Funnel</Typography>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart
                  data={prepareFunnelData()}
                  layout="horizontal"
                  margin={{ left: 100 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" />
                  <RechartsTooltip />
                  <Bar dataKey="value" fill={CHART_COLORS.primary}>
                    <LabelList dataKey="value" position="right" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Box>
          )}

          {chartType === 'audience' && (
            <Box>
              <Typography variant="h6" gutterBottom>Audience Performance</Typography>
              <ResponsiveContainer width="100%" height={400}>
                <RePieChart>
                  <Pie
                    data={prepareAudienceData()}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={(entry) => `${entry.name}: ${entry.value}`}
                    outerRadius={150}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {prepareAudienceData().map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={Object.values(CHART_COLORS)[index % Object.values(CHART_COLORS).length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                </RePieChart>
              </ResponsiveContainer>
            </Box>
          )}
        </Paper>
      </TabPanel>

      {/* Attribution Tab */}
      <TabPanel value={activeTab} index={1}>
        <Box mb={2} display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h6">Conversion Details</Typography>
          <Box display="flex" gap={2}>
            <TextField
              size="small"
              placeholder="Search by email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search />
                  </InputAdornment>
                )
              }}
            />
            <Button
              startIcon={<Download />}
              onClick={exportAttribution}
              variant="outlined"
            >
              Export
            </Button>
          </Box>
        </Box>

        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Customer</TableCell>
                <TableCell>Purchase Date</TableCell>
                <TableCell>Tickets</TableCell>
                <TableCell align="right">Revenue</TableCell>
                <TableCell>Time to Purchase</TableCell>
                <TableCell>Device</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {attribution.data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">
                      No conversions tracked yet
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                attribution.data.map((row) => (
                  <TableRow key={row._id} hover>
                    <TableCell>
                      <Typography variant="body2">
                        {row.customerEmail.replace(/(.{3}).*(@.*)/, '$1***$2')}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {format(parseISO(row.purchaseDate), 'MMM d, yyyy h:mm a')}
                    </TableCell>
                    <TableCell>{row.ticketCount}</TableCell>
                    <TableCell align="right">
                      {formatCurrency(row.revenue, 'COP')}
                    </TableCell>
                    <TableCell>
                      {row.timeToConversion < 60 
                        ? `${row.timeToConversion}m`
                        : row.timeToConversion < 1440
                        ? `${Math.floor(row.timeToConversion / 60)}h`
                        : `${Math.floor(row.timeToConversion / 1440)}d`
                      }
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={row.device} 
                        size="small" 
                        variant="outlined"
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <TablePagination
            component="div"
            count={attribution.total}
            page={page}
            onPageChange={(e, newPage) => setPage(newPage)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => {
              setRowsPerPage(parseInt(e.target.value, 10));
              setPage(0);
            }}
          />
        </TableContainer>
      </TabPanel>

      {/* Activity Tab */}
      <TabPanel value={activeTab} index={2}>
        <Typography variant="h6" gutterBottom>Campaign Activity</Typography>
        <Paper>
          {activity.length === 0 ? (
            <Box p={4} textAlign="center">
              <Typography color="text.secondary">
                No activity recorded yet
              </Typography>
            </Box>
          ) : (
            activity.map((item, index) => (
              <Box key={index} p={2} borderBottom={1} borderColor="divider">
                <Box display="flex" justifyContent="space-between" alignItems="start">
                  <Box display="flex" gap={2}>
                    <Box>
                      {item.type === 'status_change' && <Info color="primary" />}
                      {item.type === 'metric_sync' && <Refresh color="info" />}
                      {item.type === 'error' && <ErrorIcon color="error" />}
                      {item.type === 'budget_change' && <AttachMoney color="warning" />}
                    </Box>
                    <Box>
                      <Typography variant="body2">{item.description}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {format(parseISO(item.timestamp), 'MMM d, yyyy h:mm a')}
                        {item.user && ` by ${item.user.name}`}
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              </Box>
            ))
          )}
        </Paper>
      </TabPanel>

      {/* Settings Tab */}
      <TabPanel value={activeTab} index={3}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3 }}>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                <Typography variant="h6">Budget & Schedule</Typography>
                {campaign?.canEdit && (
                  <IconButton 
                    size="small"
                    onClick={() => router.push(`/advertising/campaigns/${campaign._id}/edit?step=2`)}
                  >
                    <Edit fontSize="small" />
                  </IconButton>
                )}
              </Box>
              <Stack spacing={2}>
                <Box display="flex" justifyContent="space-between">
                  <Typography color="text.secondary">Budget Type</Typography>
                  <Typography>{campaign?.budget?.type}</Typography>
                </Box>
                <Box display="flex" justifyContent="space-between">
                  <Typography color="text.secondary">Budget Amount</Typography>
                  <Typography>{formatCurrency(campaign?.budget?.amount || 0, 'COP')}</Typography>
                </Box>
                <Box display="flex" justifyContent="space-between">
                  <Typography color="text.secondary">Daily Burn Rate</Typography>
                  <Typography>{formatCurrency(calculateBurnRate(), 'COP')}/day</Typography>
                </Box>
                <Box display="flex" justifyContent="space-between">
                  <Typography color="text.secondary">Days Remaining</Typography>
                  <Typography>{calculateDaysRemaining()}</Typography>
                </Box>
                <Divider />
                <Box display="flex" justifyContent="space-between">
                  <Typography color="text.secondary">Start Date</Typography>
                  <Typography>
                    {campaign?.schedule?.startDate 
                      ? format(parseISO(campaign.schedule.startDate), 'MMM d, yyyy')
                      : '-'
                    }
                  </Typography>
                </Box>
                <Box display="flex" justifyContent="space-between">
                  <Typography color="text.secondary">End Date</Typography>
                  <Typography>
                    {campaign?.schedule?.endDate 
                      ? format(parseISO(campaign.schedule.endDate), 'MMM d, yyyy')
                      : 'No end date'
                    }
                  </Typography>
                </Box>
              </Stack>
            </Paper>
          </Grid>

          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3 }}>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                <Typography variant="h6">Audience Targeting</Typography>
                {campaign?.canEdit && (
                  <IconButton 
                    size="small"
                    onClick={() => router.push(`/advertising/campaigns/${campaign._id}/edit?step=3`)}
                  >
                    <Edit fontSize="small" />
                  </IconButton>
                )}
              </Box>
              <Stack spacing={2}>
                <Box display="flex" alignItems="center" gap={1}>
                  <LocationOn color="action" fontSize="small" />
                  <Typography variant="body2">
                    {campaign?.audience?.locations?.map(l => l.name).join(', ') || 'All locations'}
                  </Typography>
                </Box>
                <Box display="flex" alignItems="center" gap={1}>
                  <Person color="action" fontSize="small" />
                  <Typography variant="body2">
                    Ages {campaign?.audience?.ageMin || 18} - {campaign?.audience?.ageMax || 65}
                  </Typography>
                </Box>
                <Box display="flex" alignItems="center" gap={1}>
                  <Person color="action" fontSize="small" />
                  <Typography variant="body2">
                    {campaign?.audience?.gender === 'all' ? 'All genders' : campaign?.audience?.gender}
                  </Typography>
                </Box>
                {campaign?.audience?.interests?.length > 0 && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">Interests:</Typography>
                    <Box display="flex" gap={0.5} flexWrap="wrap" mt={0.5}>
                      {campaign.audience.interests.map((interest, i) => (
                        <Chip key={i} label={interest} size="small" />
                      ))}
                    </Box>
                  </Box>
                )}
              </Stack>
            </Paper>
          </Grid>

          <Grid item xs={12}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>Attribution Settings</Typography>
              <Stack spacing={2}>
                <Box display="flex" justifyContent="space-between">
                  <Typography color="text.secondary">UTM Campaign</Typography>
                  <Box display="flex" alignItems="center" gap={1}>
                    <Typography fontFamily="monospace" variant="body2">
                      {campaign?.attribution?.utm_campaign}
                    </Typography>
                    <IconButton size="small" onClick={copyUTM}>
                      <ContentCopy fontSize="small" />
                    </IconButton>
                  </Box>
                </Box>
                <Box display="flex" justifyContent="space-between">
                  <Typography color="text.secondary">Attribution Window</Typography>
                  <Typography>{campaign?.attribution?.window || '7-day click, 1-day view'}</Typography>
                </Box>
                <Box display="flex" justifyContent="space-between">
                  <Typography color="text.secondary">Tracking URL</Typography>
                  <Typography 
                    variant="body2" 
                    sx={{ 
                      maxWidth: 400,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      fontFamily: 'monospace'
                    }}
                  >
                    https://sonik.app/events/{campaign?.eventId}?utm_source=meta&utm_medium=paid&utm_campaign={campaign?.attribution?.utm_campaign}
                  </Typography>
                </Box>
              </Stack>
            </Paper>
          </Grid>
        </Grid>
      </TabPanel>

      {/* Pause Dialog */}
      <Dialog open={pauseDialog} onClose={() => setPauseDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Pause Campaign</DialogTitle>
        <DialogContent>
          <DialogContentText gutterBottom>
            Are you sure you want to pause this campaign? You can resume it at any time.
          </DialogContentText>
          <TextField
            fullWidth
            multiline
            rows={3}
            label="Reason for pausing (optional)"
            value={pauseReason}
            onChange={(e) => setPauseReason(e.target.value)}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPauseDialog(false)}>Cancel</Button>
          <Button onClick={handlePause} color="warning" variant="contained">
            Pause Campaign
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}