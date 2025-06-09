// src/pages/advertising/campaigns/create.js
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { 
  Box, 
  Stepper, 
  Step, 
  StepLabel, 
  StepContent,
  Button,
  Paper,
  Typography,
  Container,
  Alert,
  CircularProgress
} from '@mui/material';
import { ArrowBack, ArrowForward } from '@mui/icons-material';

// Import wizard steps
import ObjectiveStep from '../../../components/advertising/CampaignWizard/ObjectiveStep';
import EventStep from '../../../components/advertising/CampaignWizard/EventStep';
import BudgetStep from '../../../components/advertising/CampaignWizard/BudgetStep';
import ReviewStep from '../../../components/advertising/CampaignWizard/ReviewStep';

// API client
import apiClient from '../../../utils/apiClient';
import { showNotification } from '../../../utils/notifications';

const steps = [
  { label: 'Campaign Objective', component: ObjectiveStep },
  { label: 'Select Event', component: EventStep },
  { label: 'Budget & Schedule', component: BudgetStep },
  { label: 'Review & Launch', component: ReviewStep }
];

export default function CreateCampaignPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [activeStep, setActiveStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [metaConnection, setMetaConnection] = useState(null);
  
  // Campaign data state
  const [campaignData, setCampaignData] = useState({
    objective: '',
    eventId: '',
    metaConnectionId: '',
    name: '',
    budget: {
      amount: 250000, // Default minimum
      currency: 'COP',
      type: 'lifetime'
    },
    schedule: {
      startDate: new Date().toISOString().split('T')[0],
      endDate: null
    },
    audience: {
      locations: [],
      age_min: 18,
      age_max: 65,
      genders: [0] // All genders by default
    }
  });

  // Check Meta connection on mount
  useEffect(() => {
    checkMetaConnection();
  }, []);

  const checkMetaConnection = async () => {
    try {
      const response = await apiClient.get('/api/v1/advertising/meta/status');
      if (response.data.data.connected) {
        setMetaConnection(response.data.data.connection);
        setCampaignData(prev => ({
          ...prev,
          metaConnectionId: response.data.data.connection._id
        }));
      } else {
        setError('Please connect your Meta account before creating campaigns');
      }
    } catch (err) {
      console.error('Failed to check Meta connection:', err);
      setError('Failed to verify Meta connection');
    }
  };

  const handleNext = () => {
    setActiveStep((prevStep) => prevStep + 1);
  };

  const handleBack = () => {
    setActiveStep((prevStep) => prevStep - 1);
  };

  const handleStepData = (data) => {
    setCampaignData(prev => ({
      ...prev,
      ...data
    }));
  };

  const handleCreateCampaign = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.post('/api/v1/advertising/campaigns', campaignData);
      
      showNotification('success', 'Campaign created successfully!');
      
      // Redirect to campaign detail or list
      router.push(`/advertising/campaigns/${response.data.data._id}`);
    } catch (err) {
      console.error('Campaign creation failed:', err);
      setError(err.response?.data?.message || 'Failed to create campaign');
      showNotification('error', 'Failed to create campaign');
    } finally {
      setLoading(false);
    }
  };

  const isStepValid = () => {
    switch (activeStep) {
      case 0:
        return !!campaignData.objective;
      case 1:
        return !!campaignData.eventId;
      case 2:
        return campaignData.budget.amount >= 250000 && 
               campaignData.schedule.startDate && 
               campaignData.schedule.endDate;
      case 3:
        return true; // Review step is always valid
      default:
        return false;
    }
  };

  const StepComponent = steps[activeStep].component;

  if (error && !metaConnection) {
    return (
      <Container maxWidth="md" sx={{ mt: 4 }}>
        <Alert 
          severity="error" 
          action={
            <Button 
              color="inherit" 
              size="small"
              onClick={() => router.push('/advertising/meta-connect')}
            >
              Connect Meta Account
            </Button>
          }
        >
          {error}
        </Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ mb: 4 }}>
        <Button
          startIcon={<ArrowBack />}
          onClick={() => router.push('/advertising/campaigns')}
          sx={{ mb: 2 }}
        >
          Back to Campaigns
        </Button>
        
        <Typography variant="h4" component="h1" gutterBottom>
          Create New Campaign
        </Typography>
        
        {metaConnection && (
          <Typography variant="body2" color="text.secondary">
            Connected as: {metaConnection.businessName} ({metaConnection.metaUserEmail})
          </Typography>
        )}
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Paper elevation={3} sx={{ p: 3 }}>
        <Stepper activeStep={activeStep} orientation="vertical">
          {steps.map((step, index) => (
            <Step key={step.label}>
              <StepLabel>{step.label}</StepLabel>
              <StepContent>
                <Box sx={{ mb: 2 }}>
                  <StepComponent
                    data={campaignData}
                    onChange={handleStepData}
                    organizationId={session?.user?.organizationId}
                  />
                </Box>
                
                <Box sx={{ mb: 2 }}>
                  <Button
                    variant="contained"
                    onClick={activeStep === steps.length - 1 ? handleCreateCampaign : handleNext}
                    disabled={!isStepValid() || loading}
                    endIcon={activeStep === steps.length - 1 ? null : <ArrowForward />}
                    sx={{ mt: 1, mr: 1 }}
                  >
                    {activeStep === steps.length - 1 ? (
                      loading ? <CircularProgress size={24} /> : 'Create Campaign'
                    ) : 'Continue'}
                  </Button>
                  
                  <Button
                    disabled={activeStep === 0}
                    onClick={handleBack}
                    sx={{ mt: 1, mr: 1 }}
                  >
                    Back
                  </Button>
                </Box>
              </StepContent>
            </Step>
          ))}
        </Stepper>
      </Paper>
    </Container>
  );
}