// src/components/advertising/AudienceBuilder/CustomerListSelector.js
import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Button,
  Alert,
  AlertTitle,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Checkbox,
  TextField,
  InputAdornment,
  CircularProgress,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions
} from '@mui/material';
import {
  Search,
  FilterList,
  Download,
  People,
  LocalOffer,
  Event,
  Info,
  Privacy,
  CheckCircle
} from '@mui/icons-material';
import apiClient from '../../../utils/apiClient';
import { showNotification } from '../../../utils/notifications';

export default function CustomerListSelector({ campaignData, onChange, organizationId }) {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCustomers, setSelectedCustomers] = useState(new Set());
  const [filters, setFilters] = useState({
    search: '',
    tags: [],
    eventId: '',
    purchaseHistory: 'all'
  });
  const [tags, setTags] = useState([]);
  const [events, setEvents] = useState([]);
  const [privacyDialog, setPrivacyDialog] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    withEmail: 0,
    withPhone: 0,
    avgLifetimeValue: 0
  });

  useEffect(() => {
    fetchInitialData();
  }, [organizationId]);

  useEffect(() => {
    // Update campaign data when selection changes
    onChange({
      customAudience: {
        customerIds: Array.from(selectedCustomers),
        count: selectedCustomers.size
      }
    });
  }, [selectedCustomers]);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      
      // Fetch customers
      const [customersRes, tagsRes, eventsRes] = await Promise.all([
        apiClient.get('/api/v1/customers', {
          params: { organizationId, limit: 1000 }
        }),
        apiClient.get('/api/v1/tags', {
          params: { type: 'customer' }
        }),
        apiClient.get('/api/v1/events', {
          params: { organizationId, status: ['completed', 'active'] }
        })
      ]);

      setCustomers(customersRes.data.data.items || []);
      setTags(tagsRes.data.data || []);
      setEvents(eventsRes.data.data.items || []);
      
      calculateStats(customersRes.data.data.items || []);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      showNotification('error', 'Failed to load customer data');
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (customerList) => {
    const stats = customerList.reduce((acc, customer) => {
      acc.total++;
      if (customer.email) acc.withEmail++;
      if (customer.phone) acc.withPhone++;
      acc.totalLifetimeValue += customer.lifetimeValue || 0;
      return acc;
    }, { total: 0, withEmail: 0, withPhone: 0, totalLifetimeValue: 0 });

    stats.avgLifetimeValue = stats.total > 0 
      ? stats.totalLifetimeValue / stats.total 
      : 0;

    setStats(stats);
  };

  const handleSelectAll = (event) => {
    if (event.target.checked) {
      const allIds = filteredCustomers.map(c => c._id);
      setSelectedCustomers(new Set(allIds));
    } else {
      setSelectedCustomers(new Set());
    }
  };

  const handleSelectCustomer = (customerId) => {
    const newSelection = new Set(selectedCustomers);
    if (newSelection.has(customerId)) {
      newSelection.delete(customerId);
    } else {
      newSelection.add(customerId);
    }
    setSelectedCustomers(newSelection);
  };

  const filteredCustomers = customers.filter(customer => {
    // Search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      const matchesSearch = 
        customer.firstName?.toLowerCase().includes(searchLower) ||
        customer.lastName?.toLowerCase().includes(searchLower) ||
        customer.email?.toLowerCase().includes(searchLower) ||
        customer.phone?.includes(filters.search);
      
      if (!matchesSearch) return false;
    }

    // Tags filter
    if (filters.tags.length > 0) {
      const customerTags = customer.tags || [];
      const hasTag = filters.tags.some(tag => customerTags.includes(tag));
      if (!hasTag) return false;
    }

    // Event filter
    if (filters.eventId) {
      const attendedEvent = customer.eventsAttended?.includes(filters.eventId);
      if (!attendedEvent) return false;
    }

    // Purchase history filter
    if (filters.purchaseHistory === 'buyers') {
      if (!customer.lifetimeValue || customer.lifetimeValue === 0) return false;
    } else if (filters.purchaseHistory === 'highValue') {
      if (!customer.lifetimeValue || customer.lifetimeValue < stats.avgLifetimeValue) {
        return false;
      }
    }

    return true;
  });

  const exportCustomerList = () => {
    const selectedData = customers
      .filter(c => selectedCustomers.has(c._id))
      .map(c => ({
        email: c.email,
        phone: c.phone,
        firstName: c.firstName,
        lastName: c.lastName,
        lifetimeValue: c.lifetimeValue
      }));

    const csv = [
      'email,phone,firstName,lastName,lifetimeValue',
      ...selectedData.map(c => 
        `${c.email || ''},${c.phone || ''},${c.firstName || ''},${c.lastName || ''},${c.lifetimeValue || 0}`
      )
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `customer-list-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" p={4}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h6">
          Select Customer Audience
        </Typography>
        <Button
          variant="text"
          startIcon={<Privacy />}
          onClick={() => setPrivacyDialog(true)}
          size="small"
        >
          Privacy Notice
        </Button>
      </Box>

      {/* Stats Summary */}
      <Box display="flex" gap={2} mb={3}>
        <Card variant="outlined" sx={{ flex: 1 }}>
          <CardContent sx={{ py: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Total Customers
            </Typography>
            <Typography variant="h6">
              {stats.total.toLocaleString()}
            </Typography>
          </CardContent>
        </Card>
        <Card variant="outlined" sx={{ flex: 1 }}>
          <CardContent sx={{ py: 2 }}>
            <Typography variant="body2" color="text.secondary">
              With Email
            </Typography>
            <Typography variant="h6">
              {stats.withEmail.toLocaleString()}
            </Typography>
          </CardContent>
        </Card>
        <Card variant="outlined" sx={{ flex: 1 }}>
          <CardContent sx={{ py: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Selected
            </Typography>
            <Typography variant="h6" color="primary.main">
              {selectedCustomers.size.toLocaleString()}
            </Typography>
          </CardContent>
        </Card>
      </Box>

      {/* Filters */}
      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={3}>
            <TextField
              fullWidth
              size="small"
              placeholder="Search customers..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search />
                  </InputAdornment>
                )
              }}
            />
          </Grid>

          <Grid item xs={12} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Tags</InputLabel>
              <Select
                multiple
                value={filters.tags}
                onChange={(e) => setFilters({ ...filters, tags: e.target.value })}
                renderValue={(selected) => (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {selected.map((value) => (
                      <Chip key={value} label={value} size="small" />
                    ))}
                  </Box>
                )}
              >
                {tags.map((tag) => (
                  <MenuItem key={tag._id} value={tag.name}>
                    {tag.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Event Attended</InputLabel>
              <Select
                value={filters.eventId}
                onChange={(e) => setFilters({ ...filters, eventId: e.target.value })}
              >
                <MenuItem value="">All Events</MenuItem>
                {events.map((event) => (
                  <MenuItem key={event._id} value={event._id}>
                    {event.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Purchase History</InputLabel>
              <Select
                value={filters.purchaseHistory}
                onChange={(e) => setFilters({ ...filters, purchaseHistory: e.target.value })}
              >
                <MenuItem value="all">All Customers</MenuItem>
                <MenuItem value="buyers">Previous Buyers</MenuItem>
                <MenuItem value="highValue">High Value</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Paper>

      {/* Customer Table */}
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox">
                <Checkbox
                  indeterminate={
                    selectedCustomers.size > 0 && 
                    selectedCustomers.size < filteredCustomers.length
                  }
                  checked={
                    filteredCustomers.length > 0 &&
                    selectedCustomers.size === filteredCustomers.length
                  }
                  onChange={handleSelectAll}
                />
              </TableCell>
              <TableCell>Name</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Phone</TableCell>
              <TableCell>Tags</TableCell>
              <TableCell align="right">Lifetime Value</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredCustomers.slice(0, 100).map((customer) => (
              <TableRow
                key={customer._id}
                selected={selectedCustomers.has(customer._id)}
                hover
              >
                <TableCell padding="checkbox">
                  <Checkbox
                    checked={selectedCustomers.has(customer._id)}
                    onChange={() => handleSelectCustomer(customer._id)}
                  />
                </TableCell>
                <TableCell>
                  {customer.firstName} {customer.lastName}
                </TableCell>
                <TableCell>
                  {customer.email || '-'}
                </TableCell>
                <TableCell>
                  {customer.phone || '-'}
                </TableCell>
                <TableCell>
                  <Box display="flex" gap={0.5}>
                    {(customer.tags || []).slice(0, 2).map((tag) => (
                      <Chip key={tag} label={tag} size="small" />
                    ))}
                    {customer.tags?.length > 2 && (
                      <Chip 
                        label={`+${customer.tags.length - 2}`} 
                        size="small" 
                        variant="outlined"
                      />
                    )}
                  </Box>
                </TableCell>
                <TableCell align="right">
                  {customer.lifetimeValue 
                    ? `${customer.lifetimeValue.toLocaleString()} COP`
                    : '-'
                  }
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {filteredCustomers.length > 100 && (
        <Alert severity="info" sx={{ mt: 2 }}>
          Showing first 100 customers. Use filters to narrow your selection.
        </Alert>
      )}

      {/* Actions */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mt={3}>
        <Typography variant="body2" color="text.secondary">
          {selectedCustomers.size} customers selected
        </Typography>
        <Button
          variant="outlined"
          startIcon={<Download />}
          onClick={exportCustomerList}
          disabled={selectedCustomers.size === 0}
        >
          Export List
        </Button>
      </Box>

      {/* Privacy Dialog */}
      <Dialog open={privacyDialog} onClose={() => setPrivacyDialog(false)}>
        <DialogTitle>
          <Box display="flex" alignItems="center" gap={1}>
            <Privacy />
            Customer Data Privacy
          </Box>
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            When you create a custom audience:
          </DialogContentText>
          <List>
            <ListItem>
              <ListItemIcon>
                <CheckCircle color="success" />
              </ListItemIcon>
              <ListItemText 
                primary="Data is hashed before sending to Meta"
                secondary="Customer emails and phones are encrypted using SHA256"
              />
            </ListItem>
            <ListItem>
              <ListItemIcon>
                <CheckCircle color="success" />
              </ListItemIcon>
              <ListItemText 
                primary="Meta matches hashed data with their users"
                secondary="No personal information is stored by Meta"
              />
            </ListItem>
            <ListItem>
              <ListItemIcon>
                <CheckCircle color="success" />
              </ListItemIcon>
              <ListItemText 
                primary="Compliant with privacy regulations"
                secondary="GDPR and LGPD compliant data handling"
              />
            </ListItem>
          </List>
          <Alert severity="info" sx={{ mt: 2 }}>
            Only customers who have consented to marketing will be included.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPrivacyDialog(false)}>
            Understood
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}