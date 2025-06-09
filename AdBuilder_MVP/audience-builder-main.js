// src/components/advertising/AudienceBuilder/index.js
import React, { useState } from 'react';
import {
  Box,
  Tabs,
  Tab,
  Paper,
  Typography,
  Button,
  Divider,
  Alert,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Card,
  CardContent,
  Chip,
  useTheme,
  useMediaQuery
} from '@mui/material';
import {
  People,
  LocationOn,
  Person,
  CheckCircle,
  Save,
  NavigateNext,
  NavigateBefore
} from '@mui/icons-material';

// Import sub-components
import CustomerListSelector from './CustomerListSelector';
import GeographicTargeting from './GeographicTargeting';
import DemographicTargeting from './DemographicTargeting';

function TabPanel({ children, value, index, ...other }) {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`audience-tabpanel-${index}`}
      aria-labelledby={`audience-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
}

export default function AudienceBuilder({ 
  campaignData, 
  onChange, 
  organizationId,
  eventId,
  onSave,
  mode = 'wizard' // 'wizard' or 'tabs'
}) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [activeTab, setActiveTab] = useState(0);
  const [activeStep, setActiveStep] = useState(0);
  const [audienceData, setAudienceData] = useState({
    customAudience: campaignData.customAudience || {},
    audience: campaignData.audience || {}
  });

  const steps = [
    {
      label: 'Customer Lists',
      icon: <People />,
      component: CustomerListSelector,
      optional: true
    },
    {
      label: 'Geographic Targeting',
      icon: <LocationOn />,
      component: GeographicTargeting,
      required: true
    },
    {
      label: 'Demographics & Interests',
      icon: <Person />,
      component: DemographicTargeting,
      optional: true
    }
  ];

  const handleDataChange = (updates) => {
    const newData = { ...audienceData, ...updates };
    setAudienceData(newData);
    onChange(newData);
  };

  const handleNext = () => {
    setActiveStep((prevStep) => prevStep + 1);
  };

  const handleBack = () => {
    setActiveStep((prevStep) => prevStep - 1);
  };

  const handleSave = () => {
    if (onSave) {
      onSave(audienceData);
    }
  };

  const getAudienceSummary = () => {
    const summary = [];
    
    // Customer audience
    if (audienceData.customAudience?.count > 0) {
      summary.push(`${audienceData.customAudience.count} customers selected`);
    }
    
    // Geographic
    if (audienceData.audience?.locations?.length > 0) {
      const locationNames = audienceData.audience.locations.map(l => l.name).join(', ');
      summary.push(`Locations: ${locationNames}`);
    }
    
    // Demographics
    if (audienceData.audience?.age_min && audienceData.audience?.age_max) {
      summary.push(`Ages ${audienceData.audience.age_min}-${audienceData.audience.age_max}`);
    }
    
    // Interests
    if (audienceData.audience?.interests?.length > 0) {
      summary.push(`${audienceData.audience.interests.length} interests`);
    }
    
    return summary;
  };

  const renderWizardMode = () => (
    <Box>
      <Stepper activeStep={activeStep} orientation="vertical">
        {steps.map((step, index) => {
          const StepComponent = step.component;
          return (
            <Step key={step.label}>
              <StepLabel
                optional={
                  step.optional && (
                    <Typography variant="caption">Optional</Typography>
                  )
                }
                icon={step.icon}
              >
                {step.label}
              </StepLabel>
              <StepContent>
                <Box sx={{ mb: 2 }}>
                  <StepComponent
                    campaignData={audienceData}
                    onChange={handleDataChange}
                    organizationId={organizationId}
                    eventId={eventId}
                  />
                </Box>
                <Box sx={{ mb: 2 }}>
                  <Button
                    variant="contained"
                    onClick={handleNext}
                    sx={{ mt: 1, mr: 1 }}
                    endIcon={<NavigateNext />}
                  >
                    {index === steps.length - 1 ? 'Finish' : 'Continue'}
                  </Button>
                  <Button
                    disabled={index === 0}
                    onClick={handleBack}
                    sx={{ mt: 1, mr: 1 }}
                    startIcon={<NavigateBefore />}
                  >
                    Back
                  </Button>
                </Box>
              </StepContent>
            </Step>
          );
        })}
      </Stepper>
      
      {activeStep === steps.length && (
        <Card sx={{ mt: 3, bgcolor: 'success.light' }}>
          <CardContent>
            <Box display="flex" alignItems="center" gap={2} mb={2}>
              <CheckCircle color="success" />
              <Typography variant="h6">
                Audience Configuration Complete
              </Typography>
            </Box>
            
            <Typography variant="body2" paragraph>
              Your audience targeting is ready. Review the summary below:
            </Typography>
            
            <Box display="flex" flexWrap="wrap" gap={1} mb={2}>
              {getAudienceSummary().map((item, index) => (
                <Chip key={index} label={item} size="small" />
              ))}
            </Box>
            
            <Button
              variant="contained"
              color="success"
              onClick={handleSave}
              startIcon={<Save />}
            >
              Save Audience Configuration
            </Button>
          </CardContent>
        </Card>
      )}
    </Box>
  );

  const renderTabsMode = () => (
    <Box>
      <Paper sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs 
          value={activeTab} 
          onChange={(e, newValue) => setActiveTab(newValue)}
          variant={isMobile ? "scrollable" : "standard"}
          scrollButtons="auto"
        >
          <Tab 
            label="Customer Lists" 
            icon={<People />} 
            iconPosition="start"
          />
          <Tab 
            label="Geographic" 
            icon={<LocationOn />} 
            iconPosition="start"
          />
          <Tab 
            label="Demographics" 
            icon={<Person />} 
            iconPosition="start"
          />
        </Tabs>
      </Paper>

      <TabPanel value={activeTab} index={0}>
        <CustomerListSelector
          campaignData={audienceData}
          onChange={handleDataChange}
          organizationId={organizationId}
        />
      </TabPanel>

      <TabPanel value={activeTab} index={1}>
        <GeographicTargeting
          campaignData={audienceData}
          onChange={handleDataChange}
          eventId={eventId}
        />
      </TabPanel>

      <TabPanel value={activeTab} index={2}>
        <DemographicTargeting
          campaignData={audienceData}
          onChange={handleDataChange}
        />
      </TabPanel>

      {/* Summary Section */}
      <Divider sx={{ my: 3 }} />
      
      <Box display="flex" justifyContent="space-between" alignItems="center">
        <Box>
          <Typography variant="subtitle2" gutterBottom>
            Audience Summary
          </Typography>
          <Box display="flex" flexWrap="wrap" gap={1}>
            {getAudienceSummary().length > 0 ? (
              getAudienceSummary().map((item, index) => (
                <Chip key={index} label={item} size="small" variant="outlined" />
              ))
            ) : (
              <Typography variant="body2" color="text.secondary">
                No targeting configured yet
              </Typography>
            )}
          </Box>
        </Box>
        
        <Button
          variant="contained"
          onClick={handleSave}
          startIcon={<Save />}
          disabled={getAudienceSummary().length === 0}
        >
          Save Audience
        </Button>
      </Box>
    </Box>
  );

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Audience Builder
      </Typography>
      
      <Typography variant="body2" color="text.secondary" paragraph>
        Define your target audience using customer lists, geographic locations, and demographic filters.
      </Typography>

      {!audienceData.audience?.locations?.length && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          Geographic targeting is required. Please add at least one location.
        </Alert>
      )}

      {mode === 'wizard' ? renderWizardMode() : renderTabsMode()}
    </Box>
  );
}