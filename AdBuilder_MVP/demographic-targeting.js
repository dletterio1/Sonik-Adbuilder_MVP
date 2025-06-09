// src/components/advertising/AudienceBuilder/DemographicTargeting.js
import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Slider,
  FormControl,
  FormLabel,
  FormGroup,
  FormControlLabel,
  Checkbox,
  Select,
  MenuItem,
  Chip,
  TextField,
  Autocomplete,
  Card,
  CardContent,
  Grid,
  InputLabel,
  Alert,
  Button,
  Collapse,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider
} from '@mui/material';
import {
  Person,
  Language,
  Category,
  ExpandMore,
  ExpandLess,
  Info,
  MusicNote,
  SportsSoccer,
  Restaurant,
  Nightlife,
  FitnessCenter,
  TheaterComedy
} from '@mui/icons-material';

// Popular Meta interest categories for LATAM
const INTEREST_CATEGORIES = {
  'Entertainment': {
    icon: <TheaterComedy />,
    interests: [
      { id: '6003139266461', name: 'Music festivals' },
      { id: '6003107902433', name: 'Live music' },
      { id: '6003146212372', name: 'Nightlife' },
      { id: '6003248297843', name: 'Electronic music' },
      { id: '6003189863584', name: 'Reggaeton' },
      { id: '6003156370433', name: 'Latin music' },
      { id: '6003020834893', name: 'Concerts' },
      { id: '6003396543357', name: 'DJs' }
    ]
  },
  'Lifestyle': {
    icon: <FitnessCenter />,
    interests: [
      { id: '6003176678152', name: 'Fitness and wellness' },
      { id: '6003185241345', name: 'Yoga' },
      { id: '6003397143643', name: 'Healthy lifestyle' },
      { id: '6003659041877', name: 'Meditation' },
      { id: '6003128153867', name: 'Organic food' },
      { id: '6003195797768', name: 'Veganism' }
    ]
  },
  'Food & Beverage': {
    icon: <Restaurant />,
    interests: [
      { id: '6003506230101', name: 'Restaurants' },
      { id: '6003384157498', name: 'Coffee' },
      { id: '6003139377544', name: 'Craft beer' },
      { id: '6003503426244', name: 'Wine' },
      { id: '6003195413050', name: 'Cocktails' },
      { id: '6003251487534', name: 'Food festivals' }
    ]
  },
  'Sports': {
    icon: <SportsSoccer />,
    interests: [
      { id: '6003146370127', name: 'Football (Soccer)' },
      { id: '6003165841322', name: 'Running' },
      { id: '6003584507741', name: 'Cycling' },
      { id: '6003128329514', name: 'Extreme sports' },
      { id: '6003277229371', name: 'Basketball' },
      { id: '6003631756173', name: 'CrossFit' }
    ]
  }
};

const LANGUAGES = [
  { code: 'es', name: 'Spanish' },
  { code: 'en', name: 'English' },
  { code: 'pt', name: 'Portuguese' }
];

export default function DemographicTargeting({ campaignData, onChange }) {
  const [demographics, setDemographics] = useState({
    age_min: campaignData.audience?.age_min || 18,
    age_max: campaignData.audience?.age_max || 65,
    genders: campaignData.audience?.genders || [0], // 0 = all
    languages: campaignData.audience?.languages || ['es'],
    interests: campaignData.audience?.interests || []
  });
  
  const [expandedCategory, setExpandedCategory] = useState('');
  const [customInterest, setCustomInterest] = useState('');

  useEffect(() => {
    updateCampaignData(demographics);
  }, [demographics]);

  const updateCampaignData = (updatedDemographics) => {
    onChange({
      audience: {
        ...campaignData.audience,
        ...updatedDemographics
      }
    });
  };

  const handleAgeChange = (event, newValue) => {
    setDemographics({
      ...demographics,
      age_min: newValue[0],
      age_max: newValue[1]
    });
  };

  const handleGenderChange = (gender) => {
    let newGenders = [...demographics.genders];
    
    if (gender === 0) {
      // If "All" is selected, clear other selections
      newGenders = [0];
    } else {
      // Remove "All" if specific gender is selected
      newGenders = newGenders.filter(g => g !== 0);
      
      const index = newGenders.indexOf(gender);
      if (index > -1) {
        newGenders.splice(index, 1);
      } else {
        newGenders.push(gender);
      }
      
      // If no gender selected, default to "All"
      if (newGenders.length === 0) {
        newGenders = [0];
      }
    }
    
    setDemographics({
      ...demographics,
      genders: newGenders
    });
  };

  const handleLanguageChange = (event) => {
    setDemographics({
      ...demographics,
      languages: event.target.value
    });
  };

  const handleInterestToggle = (interest) => {
    const currentInterests = [...demographics.interests];
    const index = currentInterests.findIndex(i => i.id === interest.id);
    
    if (index > -1) {
      currentInterests.splice(index, 1);
    } else {
      currentInterests.push(interest);
    }
    
    setDemographics({
      ...demographics,
      interests: currentInterests
    });
  };

  const handleAddCustomInterest = () => {
    if (customInterest.trim()) {
      const newInterest = {
        id: `custom_${Date.now()}`,
        name: customInterest.trim(),
        custom: true
      };
      
      setDemographics({
        ...demographics,
        interests: [...demographics.interests, newInterest]
      });
      
      setCustomInterest('');
    }
  };

  const calculateAudienceNarrowing = () => {
    let narrowing = 0;
    
    // Age range narrowing
    const ageRange = demographics.age_max - demographics.age_min;
    if (ageRange < 47) { // Less than full range
      narrowing += (47 - ageRange) * 0.5;
    }
    
    // Gender narrowing
    if (!demographics.genders.includes(0) && demographics.genders.length === 1) {
      narrowing += 20;
    }
    
    // Interest narrowing
    narrowing += demographics.interests.length * 5;
    
    // Language narrowing
    if (demographics.languages.length === 1 && demographics.languages[0] !== 'es') {
      narrowing += 15;
    }
    
    return Math.min(100, narrowing);
  };

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Demographic Targeting
      </Typography>

      {/* Age Range */}
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <FormLabel component="legend" sx={{ mb: 2 }}>
            <Box display="flex" alignItems="center" gap={1}>
              <Person />
              Age Range
            </Box>
          </FormLabel>
          
          <Box sx={{ px: 2 }}>
            <Slider
              value={[demographics.age_min, demographics.age_max]}
              onChange={handleAgeChange}
              valueLabelDisplay="auto"
              min={13}
              max={65}
              marks={[
                { value: 13, label: '13' },
                { value: 18, label: '18' },
                { value: 25, label: '25' },
                { value: 35, label: '35' },
                { value: 45, label: '45' },
                { value: 55, label: '55' },
                { value: 65, label: '65+' }
              ]}
            />
          </Box>
          
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            Selected: {demographics.age_min} - {demographics.age_max === 65 ? '65+' : demographics.age_max} years old
          </Typography>
        </CardContent>
      </Card>

      {/* Gender */}
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <FormControl component="fieldset">
            <FormLabel component="legend" sx={{ mb: 1 }}>
              Gender
            </FormLabel>
            <FormGroup row>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={demographics.genders.includes(0)}
                    onChange={() => handleGenderChange(0)}
                  />
                }
                label="All"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={demographics.genders.includes(1)}
                    onChange={() => handleGenderChange(1)}
                  />
                }
                label="Male"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={demographics.genders.includes(2)}
                    onChange={() => handleGenderChange(2)}
                  />
                }
                label="Female"
              />
            </FormGroup>
          </FormControl>
        </CardContent>
      </Card>

      {/* Language */}
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <FormControl fullWidth>
            <InputLabel>
              <Box display="flex" alignItems="center" gap={1}>
                <Language />
                Languages
              </Box>
            </InputLabel>
            <Select
              multiple
              value={demographics.languages}
              onChange={handleLanguageChange}
              renderValue={(selected) => (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {selected.map((value) => (
                    <Chip 
                      key={value} 
                      label={LANGUAGES.find(l => l.code === value)?.name || value} 
                      size="small" 
                    />
                  ))}
                </Box>
              )}
            >
              {LANGUAGES.map((language) => (
                <MenuItem key={language.code} value={language.code}>
                  {language.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </CardContent>
      </Card>

      {/* Interests */}
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <FormLabel component="legend" sx={{ mb: 2 }}>
            <Box display="flex" alignItems="center" gap={1}>
              <Category />
              Interests & Behaviors
            </Box>
          </FormLabel>

          {/* Selected Interests Summary */}
          {demographics.interests.length > 0 && (
            <Box mb={2}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Selected interests ({demographics.interests.length}):
              </Typography>
              <Box display="flex" flexWrap="wrap" gap={1}>
                {demographics.interests.map((interest) => (
                  <Chip
                    key={interest.id}
                    label={interest.name}
                    onDelete={() => handleInterestToggle(interest)}
                    color="primary"
                    size="small"
                  />
                ))}
              </Box>
            </Box>
          )}

          <Divider sx={{ my: 2 }} />

          {/* Interest Categories */}
          {Object.entries(INTEREST_CATEGORIES).map(([category, data]) => (
            <Box key={category} mb={1}>
              <Button
                fullWidth
                variant="text"
                onClick={() => setExpandedCategory(
                  expandedCategory === category ? '' : category
                )}
                startIcon={data.icon}
                endIcon={expandedCategory === category ? <ExpandLess /> : <ExpandMore />}
                sx={{ justifyContent: 'space-between', textAlign: 'left' }}
              >
                {category}
              </Button>
              
              <Collapse in={expandedCategory === category}>
                <List dense sx={{ pl: 4 }}>
                  {data.interests.map((interest) => (
                    <ListItem 
                      key={interest.id}
                      button
                      onClick={() => handleInterestToggle(interest)}
                      selected={demographics.interests.some(i => i.id === interest.id)}
                    >
                      <ListItemIcon>
                        <Checkbox
                          edge="start"
                          checked={demographics.interests.some(i => i.id === interest.id)}
                          tabIndex={-1}
                          disableRipple
                        />
                      </ListItemIcon>
                      <ListItemText primary={interest.name} />
                    </ListItem>
                  ))}
                </List>
              </Collapse>
            </Box>
          ))}

          {/* Custom Interest Input */}
          <Box mt={2}>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={9}>
                <TextField
                  fullWidth
                  size="small"
                  label="Add custom interest"
                  value={customInterest}
                  onChange={(e) => setCustomInterest(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleAddCustomInterest();
                    }
                  }}
                />
              </Grid>
              <Grid item xs={3}>
                <Button
                  fullWidth
                  variant="outlined"
                  onClick={handleAddCustomInterest}
                  disabled={!customInterest.trim()}
                >
                  Add
                </Button>
              </Grid>
            </Grid>
          </Box>
        </CardContent>
      </Card>

      {/* Audience Size Indicator */}
      <Alert 
        severity={calculateAudienceNarrowing() > 75 ? "warning" : "info"}
        icon={<Info />}
      >
        <Box>
          <Typography variant="body2" gutterBottom>
            <strong>Audience Narrowing: {calculateAudienceNarrowing()}%</strong>
          </Typography>
          <Typography variant="body2">
            {calculateAudienceNarrowing() > 75 
              ? "Your audience may be too narrow. Consider broadening your targeting for better reach."
              : calculateAudienceNarrowing() > 50
              ? "Good balance between reach and relevance."
              : "Broad targeting. Consider adding interests for more relevant audience."}
          </Typography>
        </Box>
      </Alert>

      {/* Best Practices */}
      <Alert severity="success" sx={{ mt: 2 }}>
        <AlertTitle>Best Practices for Colombia</AlertTitle>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li>Spanish is the primary language (95%+ reach)</li>
          <li>Peak engagement ages: 18-34 for nightlife, 25-45 for wellness</li>
          <li>Urban audiences respond well to interest-based targeting</li>
          <li>Consider local cultural interests and festivals</li>
        </ul>
      </Alert>
    </Box>
  );
}