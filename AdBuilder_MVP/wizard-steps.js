// src/components/advertising/CampaignWizard/ObjectiveStep.js
import React from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  RadioGroup,
  FormControlLabel,
  Radio,
  Grid,
  Chip
} from '@mui/material';
import {
  TrendingUp,
  Visibility,
  ThumbUp,
  Email,
  ShoppingCart,
  Smartphone
} from '@mui/icons-material';

const objectives = [
  {
    value: 'OUTCOME_TRAFFIC',
    label: 'Traffic',
    description: 'Send people to your event page',
    icon: <TrendingUp />,
    recommended: true
  },
  {
    value: 'OUTCOME_AWARENESS',
    label: 'Brand Awareness',
    description: 'Increase awareness of your event',
    icon: <Visibility />
  },
  {
    value: 'OUTCOME_ENGAGEMENT',
    label: 'Engagement',
    description: 'Get more event responses and interactions',
    icon: <ThumbUp />,
    recommended: true
  },
  {
    value: 'OUTCOME_LEADS',
    label: 'Lead Generation',
    description: 'Collect emails for future events',
    icon: <Email />
  },
  {
    value: 'OUTCOME_SALES',
    label: 'Conversions',
    description: 'Optimize for ticket purchases',
    icon: <ShoppingCart />,
    recommended: true
  },
  {
    value: 'OUTCOME_APP_PROMOTION',
    label: 'App Promotion',
    description: 'Drive app downloads',
    icon: <Smartphone />
  }
];

export default function ObjectiveStep({ data, onChange }) {
  const handleObjectiveChange = (event) => {
    onChange({ objective: event.target.value });
  };

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        What's your campaign goal?
      </Typography>
      <Typography variant="body2" color="text.secondary" paragraph>
        Choose an objective that aligns with what you want people to do when they see your ads.
      </Typography>

      <RadioGroup value={data.objective} onChange={handleObjectiveChange}>
        <Grid container spacing={2}>
          {objectives.map((objective) => (
            <Grid item xs={12} md={6} key={objective.value}>
              <Card 
                variant="outlined" 
                sx={{ 
                  cursor: 'pointer',
                  border: data.objective === objective.value ? 2 : 1,
                  borderColor: data.objective === objective.value ? 'primary.main' : 'divider',
                  '&:hover': {
                    borderColor: 'primary.main',
                    bgcolor: 'action.hover'
                  }
                }}
                onClick={() => onChange({ objective: objective.value })}
              >
                <CardContent>
                  <Box display="flex" alignItems="flex-start">
                    <FormControlLabel
                      value={objective.value}
                      control={<Radio />}
                      label=""
                      sx={{ mr: 1 }}
                    />
                    <Box flex={1}>
                      <Box display="flex" alignItems="center" gap={1} mb={1}>
                        {objective.icon}
                        <Typography variant="subtitle1" fontWeight="medium">
                          {objective.label}
                        </Typography>
                        {objective.recommended && (
                          <Chip label="Recommended" size="small" color="primary" />
                        )}
                      </Box>
                      <Typography variant="body2" color="text.secondary">
                        {objective.description}
                      </Typography>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </RadioGroup>
    </Box>
  );
}

// src/components/advertising/CampaignWizard/EventStep.js
import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  RadioGroup,
  FormControlLabel,
  Radio,
  Card,
  CardContent,
  Grid,
  Chip,
  CircularProgress,
  Alert,
  TextField,
  InputAdornment
} from '@mui/material';
import { Search, CalendarToday, LocationOn, ConfirmationNumber } from '@mui/icons-material';
import apiClient from '../../../utils/apiClient';

export default function EventStep({ data, onChange, organizationId }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchEvents();
  }, [organizationId]);

  const fetchEvents = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/api/v1/events', {
        params: {
          organizationId,
          status: 'upcoming',
          limit: 50
        }
      });
      
      // Filter to only show future events
      const futureEvents = response.data.data.filter(event => 
        new Date(event.dateTime) > new Date()
      );
      
      setEvents(futureEvents);
    } catch (err) {
      console.error('Failed to fetch events:', err);
      setError('Failed to load events');
    } finally {
      setLoading(false);
    }
  };

  const handleEventSelect = (eventId) => {
    const selectedEvent = events.find(e => e._id === eventId);
    onChange({ 
      eventId,
      // Auto-set campaign end date to event date
      schedule: {
        ...data.schedule,
        endDate: new Date(selectedEvent.dateTime).toISOString().split('T')[0]
      }
    });
  };

  const filteredEvents = events.filter(event =>
    event.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" p={4}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  if (events.length === 0) {
    return (
      <Alert severity="info">
        No upcoming events found. Please create an event first.
      </Alert>
    );
  }

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Select Event to Promote
      </Typography>
      <Typography variant="body2" color="text.secondary" paragraph>
        Choose which event you want to advertise. The campaign will automatically end on the event date.
      </Typography>

      <TextField
        fullWidth
        variant="outlined"
        placeholder="Search events..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        sx={{ mb: 3 }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <Search />
            </InputAdornment>
          )
        }}
      />

      <RadioGroup value={data.eventId} onChange={(e) => handleEventSelect(e.target.value)}>
        <Grid container spacing={2}>
          {filteredEvents.map((event) => (
            <Grid item xs={12} key={event._id}>
              <Card 
                variant="outlined"
                sx={{
                  cursor: 'pointer',
                  border: data.eventId === event._id ? 2 : 1,
                  borderColor: data.eventId === event._id ? 'primary.main' : 'divider',
                  '&:hover': {
                    borderColor: 'primary.main',
                    bgcolor: 'action.hover'
                  }
                }}
                onClick={() => handleEventSelect(event._id)}
              >
                <CardContent>
                  <Box display="flex" alignItems="flex-start">
                    <FormControlLabel
                      value={event._id}
                      control={<Radio />}
                      label=""
                      sx={{ mr: 2 }}
                    />
                    <Box flex={1}>
                      <Typography variant="h6" gutterBottom>
                        {event.name}
                      </Typography>
                      
                      <Box display="flex" gap={2} flexWrap="wrap">
                        <Box display="flex" alignItems="center" gap={0.5}>
                          <CalendarToday fontSize="small" color="action" />
                          <Typography variant="body2">
                            {new Date(event.dateTime).toLocaleDateString()}
                          </Typography>
                        </Box>
                        
                        <Box display="flex" alignItems="center" gap={0.5}>
                          <LocationOn fontSize="small" color="action" />
                          <Typography variant="body2">
                            {event.venue?.name || event.location}
                          </Typography>
                        </Box>
                        
                        <Box display="flex" alignItems="center" gap={0.5}>
                          <ConfirmationNumber fontSize="small" color="action" />
                          <Typography variant="body2">
                            {event.ticketTypes?.length || 0} ticket types
                          </Typography>
                        </Box>
                      </Box>
                      
                      {event.tags && event.tags.length > 0 && (
                        <Box mt={1}>
                          {event.tags.map((tag) => (
                            <Chip 
                              key={tag} 
                              label={tag} 
                              size="small" 
                              sx={{ mr: 0.5 }}
                            />
                          ))}
                        </Box>
                      )}
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </RadioGroup>
    </Box>
  );
}

// src/components/advertising/CampaignWizard/BudgetStep.js
import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Grid,
  Paper,
  Alert,
  InputAdornment,
  FormHelperText,
  Divider
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { AttachMoney, CalendarToday, Info } from '@mui/icons-material';

const MIN_BUDGET_COP = 250000;
const MIN_DAILY_BUDGET_COP = 50000;

export default function BudgetStep({ data, onChange }) {
  const [budgetError, setBudgetError] = useState('');
  const [dateError, setDateError] = useState('');

  useEffect(() => {
    validateBudget();
  }, [data.budget]);

  useEffect(() => {
    validateDates();
  }, [data.schedule]);

  const validateBudget = () => {
    const minBudget = data.budget.type === 'daily' ? MIN_DAILY_BUDGET_COP : MIN_BUDGET_COP;
    if (data.budget.amount < minBudget) {
      setBudgetError(`Minimum ${data.budget.type} budget is ${minBudget.toLocaleString()} COP`);
    } else {
      setBudgetError('');
    }
  };

  const validateDates = () => {
    if (!data.schedule.startDate || !data.schedule.endDate) {
      setDateError('Please select both start and end dates');
      return;
    }

    const start = new Date(data.schedule.startDate);
    const end = new Date(data.schedule.endDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (start < today) {
      setDateError('Start date cannot be in the past');
    } else if (end <= start) {
      setDateError('End date must be after start date');
    } else {
      setDateError('');
    }
  };

  const handleBudgetTypeChange = (event, newType) => {
    if (newType) {
      onChange({
        budget: {
          ...data.budget,
          type: newType,
          // Adjust amount if switching to daily and current amount is too high
          amount: newType === 'daily' && data.budget.amount > 100000 
            ? MIN_DAILY_BUDGET_COP 
            : data.budget.amount
        }
      });
    }
  };

  const handleBudgetAmountChange = (event) => {
    const amount = parseInt(event.target.value) || 0;
    onChange({
      budget: {
        ...data.budget,
        amount
      }
    });
  };

  const handleDateChange = (field, value) => {
    onChange({
      schedule: {
        ...data.schedule,
        [field]: value ? value.toISOString().split('T')[0] : null
      }
    });
  };

  const calculateCampaignDuration = () => {
    if (!data.schedule.startDate || !data.schedule.endDate) return 0;
    const start = new Date(data.schedule.startDate);
    const end = new Date(data.schedule.endDate);
    return Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
  };

  const calculateTotalBudget = () => {
    if (data.budget.type === 'lifetime') {
      return data.budget.amount;
    }
    return data.budget.amount * calculateCampaignDuration();
  };

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Set Your Budget & Schedule
      </Typography>
      <Typography variant="body2" color="text.secondary" paragraph>
        Define how much you want to spend and when your campaign should run.
      </Typography>

      {/* Budget Type Selection */}
      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom fontWeight="medium">
          Budget Type
        </Typography>
        
        <ToggleButtonGroup
          value={data.budget.type}
          exclusive
          onChange={handleBudgetTypeChange}
          fullWidth
        >
          <ToggleButton value="daily">
            Daily Budget
          </ToggleButton>
          <ToggleButton value="lifetime">
            Lifetime Budget
          </ToggleButton>
        </ToggleButtonGroup>

        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {data.budget.type === 'daily' 
            ? 'Set a maximum amount to spend per day'
            : 'Set a total amount to spend over the campaign duration'
          }
        </Typography>
      </Paper>

      {/* Budget Amount */}
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <TextField
            fullWidth
            label={`${data.budget.type === 'daily' ? 'Daily' : 'Lifetime'} Budget`}
            type="number"
            value={data.budget.amount}
            onChange={handleBudgetAmountChange}
            error={!!budgetError}
            helperText={budgetError}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <AttachMoney />
                </InputAdornment>
              ),
              endAdornment: (
                <InputAdornment position="end">COP</InputAdornment>
              )
            }}
          />
          
          {data.budget.type === 'daily' && calculateCampaignDuration() > 0 && (
            <FormHelperText>
              Total spend: {calculateTotalBudget().toLocaleString()} COP over {calculateCampaignDuration()} days
            </FormHelperText>
          )}
        </Grid>
      </Grid>

      <Divider sx={{ my: 3 }} />

      {/* Schedule */}
      <Typography variant="subtitle1" gutterBottom fontWeight="medium">
        Campaign Schedule
      </Typography>
      
      <LocalizationProvider dateAdapter={AdapterDateFns}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <DatePicker
              label="Start Date"
              value={data.schedule.startDate ? new Date(data.schedule.startDate) : null}
              onChange={(value) => handleDateChange('startDate', value)}
              renderInput={(params) => 
                <TextField 
                  {...params} 
                  fullWidth 
                  error={!!dateError && !data.schedule.startDate}
                />
              }
              minDate={new Date()}
            />
          </Grid>
          
          <Grid item xs={12} md={6}>
            <DatePicker
              label="End Date"
              value={data.schedule.endDate ? new Date(data.schedule.endDate) : null}
              onChange={(value) => handleDateChange('endDate', value)}
              renderInput={(params) => 
                <TextField 
                  {...params} 
                  fullWidth 
                  error={!!dateError && !data.schedule.endDate}
                  helperText="Campaign will end on event date"
                />
              }
              minDate={data.schedule.startDate ? new Date(data.schedule.startDate) : new Date()}
              disabled={!data.schedule.startDate}
            />
          </Grid>
        </Grid>
      </LocalizationProvider>

      {dateError && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {dateError}
        </Alert>
      )}

      {/* Budget Recommendations */}
      <Alert severity="info" icon={<Info />} sx={{ mt: 3 }}>
        <Typography variant="body2">
          <strong>Budget Recommendations:</strong>
        </Typography>
        <Typography variant="body2" component="ul" sx={{ mb: 0, pl: 2 }}>
          <li>Minimum daily budget: {MIN_DAILY_BUDGET_COP.toLocaleString()} COP</li>
          <li>Minimum lifetime budget: {MIN_BUDGET_COP.toLocaleString()} COP</li>
          <li>For events, we recommend a lifetime budget of 5-10% of expected ticket revenue</li>
          <li>Start campaigns at least 2 weeks before your event for best results</li>
        </Typography>
      </Alert>
    </Box>
  );
}

// src/components/advertising/CampaignWizard/ReviewStep.js
import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Divider,
  Chip,
  Alert,
  FormControlLabel,
  Checkbox,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  CircularProgress
} from '@mui/material';
import {
  Campaign,
  Event,
  AttachMoney,
  CalendarToday,
  LocationOn,
  Link,
  CheckCircle
} from '@mui/icons-material';
import apiClient from '../../../utils/apiClient';

export default function ReviewStep({ data, onChange }) {
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [termsAccepted, setTermsAccepted] = useState(false);

  useEffect(() => {
    if (data.eventId) {
      fetchEventDetails();
    }
  }, [data.eventId]);

  const fetchEventDetails = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get(`/api/v1/events/${data.eventId}`);
      setEvent(response.data.data);
    } catch (err) {
      console.error('Failed to fetch event:', err);
    } finally {
      setLoading(false);
    }
  };

  const getObjectiveLabel = (objective) => {
    const labels = {
      'OUTCOME_TRAFFIC': 'Traffic',
      'OUTCOME_AWARENESS': 'Brand Awareness',
      'OUTCOME_ENGAGEMENT': 'Engagement',
      'OUTCOME_LEADS': 'Lead Generation',
      'OUTCOME_SALES': 'Conversions',
      'OUTCOME_APP_PROMOTION': 'App Promotion'
    };
    return labels[objective] || objective;
  };

  const calculateDuration = () => {
    if (!data.schedule.startDate || !data.schedule.endDate) return 0;
    const start = new Date(data.schedule.startDate);
    const end = new Date(data.schedule.endDate);
    return Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
  };

  const calculateTotalBudget = () => {
    if (data.budget.type === 'lifetime') {
      return data.budget.amount;
    }
    return data.budget.amount * calculateDuration();
  };

  const generateUTMPreview = () => {
    const campaignName = data.name || `sonik_${event?.name?.toLowerCase().replace(/\s+/g, '_')}`;
    return `https://sonik.app/events/${data.eventId}?utm_source=meta&utm_medium=paid&utm_campaign=${campaignName}`;
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
      <Typography variant="h6" gutterBottom>
        Review Your Campaign
      </Typography>
      <Typography variant="body2" color="text.secondary" paragraph>
        Please review your campaign settings before launching.
      </Typography>

      {/* Campaign Summary */}
      <Grid container spacing={3}>
        {/* Objective */}
        <Grid item xs={12} md={6}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Box display="flex" alignItems="center" gap={1} mb={1}>
              <Campaign color="primary" />
              <Typography variant="subtitle2" fontWeight="medium">
                Campaign Objective
              </Typography>
            </Box>
            <Typography variant="body1">
              {getObjectiveLabel(data.objective)}
            </Typography>
          </Paper>
        </Grid>

        {/* Event */}
        <Grid item xs={12} md={6}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Box display="flex" alignItems="center" gap={1} mb={1}>
              <Event color="primary" />
              <Typography variant="subtitle2" fontWeight="medium">
                Event
              </Typography>
            </Box>
            <Typography variant="body1">
              {event?.name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {new Date(event?.dateTime).toLocaleDateString()}
            </Typography>
          </Paper>
        </Grid>

        {/* Budget */}
        <Grid item xs={12} md={6}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Box display="flex" alignItems="center" gap={1} mb={1}>
              <AttachMoney color="primary" />
              <Typography variant="subtitle2" fontWeight="medium">
                Budget
              </Typography>
            </Box>
            <Typography variant="body1">
              {data.budget.amount.toLocaleString()} COP
              <Chip 
                label={data.budget.type} 
                size="small" 
                sx={{ ml: 1 }} 
              />
            </Typography>
            {data.budget.type === 'daily' && (
              <Typography variant="body2" color="text.secondary">
                Total: {calculateTotalBudget().toLocaleString()} COP
              </Typography>
            )}
          </Paper>
        </Grid>

        {/* Schedule */}
        <Grid item xs={12} md={6}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Box display="flex" alignItems="center" gap={1} mb={1}>
              <CalendarToday color="primary" />
              <Typography variant="subtitle2" fontWeight="medium">
                Schedule
              </Typography>
            </Box>
            <Typography variant="body1">
              {new Date(data.schedule.startDate).toLocaleDateString()} - {new Date(data.schedule.endDate).toLocaleDateString()}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {calculateDuration()} days
            </Typography>
          </Paper>
        </Grid>

        {/* Targeting */}
        <Grid item xs={12}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Box display="flex" alignItems="center" gap={1} mb={1}>
              <LocationOn color="primary" />
              <Typography variant="subtitle2" fontWeight="medium">
                Targeting
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary">
              Default targeting will be applied based on your event location. 
              You can customize audience targeting after campaign creation.
            </Typography>
            <Box mt={1}>
              <Chip label={`${event?.venue?.city || 'Event location'} + 25km`} size="small" />
              <Chip label="Ages 18-65" size="small" sx={{ ml: 0.5 }} />
              <Chip label="All genders" size="small" sx={{ ml: 0.5 }} />
            </Box>
          </Paper>
        </Grid>

        {/* UTM Tracking */}
        <Grid item xs={12}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Box display="flex" alignItems="center" gap={1} mb={1}>
              <Link color="primary" />
              <Typography variant="subtitle2" fontWeight="medium">
                Tracking URL Preview
              </Typography>
            </Box>
            <Typography 
              variant="body2" 
              sx={{ 
                wordBreak: 'break-all',
                bgcolor: 'grey.100',
                p: 1,
                borderRadius: 1,
                fontFamily: 'monospace'
              }}
            >
              {generateUTMPreview()}
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      <Divider sx={{ my: 3 }} />

      {/* What Happens Next */}
      <Typography variant="subtitle1" fontWeight="medium" gutterBottom>
        What happens next?
      </Typography>
      
      <List dense>
        <ListItem>
          <ListItemIcon>
            <CheckCircle color="success" />
          </ListItemIcon>
          <ListItemText 
            primary="Campaign will be created in draft status"
            secondary="You can review and edit before launching"
          />
        </ListItem>
        <ListItem>
          <ListItemIcon>
            <CheckCircle color="success" />
          </ListItemIcon>
          <ListItemText 
            primary="Automatic conversion tracking"
            secondary="We'll track ticket sales from your campaign"
          />
        </ListItem>
        <ListItem>
          <ListItemIcon>
            <CheckCircle color="success" />
          </ListItemIcon>
          <ListItemText 
            primary="Real-time performance metrics"
            secondary="Monitor impressions, clicks, and ROI"
          />
        </ListItem>
      </List>

      {/* Terms Acceptance */}
      <Alert severity="info" sx={{ mt: 3 }}>
        <FormControlLabel
          control={
            <Checkbox 
              checked={termsAccepted} 
              onChange={(e) => {
                setTermsAccepted(e.target.checked);
                onChange({ termsAccepted: e.target.checked });
              }}
            />
          }
          label={
            <Typography variant="body2">
              I understand that this campaign will be created in draft status and I'll need to launch it separately. 
              I also agree to Meta's advertising terms and Sonik's campaign management terms.
            </Typography>
          }
        />
      </Alert>
    </Box>
  );
}