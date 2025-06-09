// src/services/adbuilder/meta-campaign.service.js
const axios = require('axios');
const Campaign = require('../../models/Campaign');
const MetaConnection = require('../../models/MetaConnection');

class MetaCampaignService {
  constructor() {
    this.baseURL = 'https://graph.facebook.com/v18.0';
    this.apiVersion = 'v18.0';
  }

  /**
   * Create a campaign in Meta
   * @param {String} campaignId - Local campaign ID
   * @returns {Promise<Object>} Meta campaign response
   */
  async createMetaCampaign(campaignId) {
    const campaign = await Campaign.findById(campaignId).populate('metaConnectionId');
    if (!campaign) {
      throw new Error('Campaign not found');
    }

    const metaConnection = campaign.metaConnectionId;
    if (!metaConnection || !metaConnection.accessToken) {
      throw new Error('No valid Meta connection found');
    }

    try {
      // Step 1: Create Campaign
      const campaignResponse = await this.createCampaignObject(campaign, metaConnection);
      
      // Step 2: Create Ad Set
      const adSetResponse = await this.createAdSet(
        campaign, 
        campaignResponse.id, 
        metaConnection
      );

      // Update local campaign with Meta IDs
      campaign.metaCampaignId = campaignResponse.id;
      campaign.metaAdSetId = adSetResponse.id;
      campaign.status = 'active';
      await campaign.save();

      return {
        campaignId: campaignResponse.id,
        adSetId: adSetResponse.id
      };
    } catch (error) {
      // Update campaign status to error
      campaign.status = 'error';
      campaign.lastError = {
        message: error.message,
        code: error.response?.data?.error?.code,
        timestamp: new Date(),
        details: error.response?.data?.error
      };
      await campaign.save();
      
      throw error;
    }
  }

  /**
   * Create campaign object in Meta
   */
  async createCampaignObject(campaign, metaConnection) {
    const url = `${this.baseURL}/act_${campaign.metaAdAccountId}/campaigns`;
    
    const params = {
      name: campaign.name,
      objective: campaign.objective,
      status: 'PAUSED', // Always create as paused initially
      special_ad_categories: ['NONE'], // Update based on event type
      access_token: metaConnection.accessToken
    };

    const response = await axios.post(url, null, { params });
    return response.data;
  }

  /**
   * Create ad set with targeting
   */
  async createAdSet(campaign, metaCampaignId, metaConnection) {
    const url = `${this.baseURL}/act_${campaign.metaAdAccountId}/adsets`;
    
    // Build targeting spec
    const targeting = this.buildTargeting(campaign);
    
    // Calculate budget
    const budgetAmount = Math.round(campaign.budget.amount * 100); // Convert to cents
    
    const params = {
      name: `${campaign.name} - Ad Set`,
      campaign_id: metaCampaignId,
      billing_event: 'IMPRESSIONS',
      optimization_goal: this.getOptimizationGoal(campaign.objective),
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      targeting: JSON.stringify(targeting),
      start_time: new Date(campaign.schedule.startDate).toISOString(),
      end_time: new Date(campaign.schedule.endDate).toISOString(),
      status: 'PAUSED',
      access_token: metaConnection.accessToken
    };

    // Add budget based on type
    if (campaign.budget.type === 'daily') {
      params.daily_budget = budgetAmount;
    } else {
      params.lifetime_budget = budgetAmount;
    }

    const response = await axios.post(url, null, { params });
    return response.data;
  }

  /**
   * Build targeting specification
   */
  buildTargeting(campaign) {
    const targeting = {
      age_min: campaign.audience.age_min || 18,
      age_max: campaign.audience.age_max || 65,
      targeting_automation: {
        advantage_audience: 1 // Enable Meta's automated targeting
      }
    };

    // Add location targeting
    if (campaign.audience.locations && campaign.audience.locations.length > 0) {
      targeting.geo_locations = {
        location_types: ['home', 'recent'],
        custom_locations: campaign.audience.locations.map(loc => ({
          latitude: loc.latitude || 4.570868, // Default to Bogotá
          longitude: loc.longitude || -74.297333,
          radius: loc.radius || 25,
          distance_unit: loc.distance_unit || 'kilometer'
        }))
      };
    }

    // Add gender targeting
    if (campaign.audience.genders && campaign.audience.genders.length > 0 && 
        !campaign.audience.genders.includes(0)) {
      targeting.genders = campaign.audience.genders;
    }

    // Add language targeting
    if (campaign.audience.languages && campaign.audience.languages.length > 0) {
      targeting.locales = campaign.audience.languages.map(lang => {
        // Map language codes to Meta locale IDs
        const localeMap = {
          'es': 31, // Spanish
          'en': 51, // English
          'pt': 25  // Portuguese
        };
        return localeMap[lang] || 31;
      });
    }

    return targeting;
  }

  /**
   * Pause a campaign
   */
  async pauseCampaign(campaignId) {
    const campaign = await Campaign.findById(campaignId).populate('metaConnectionId');
    if (!campaign || !campaign.metaCampaignId) {
      throw new Error('Campaign not found or not launched');
    }

    const metaConnection = campaign.metaConnectionId;
    const url = `${this.baseURL}/${campaign.metaCampaignId}`;
    
    const params = {
      status: 'PAUSED',
      access_token: metaConnection.accessToken
    };

    await axios.post(url, null, { params });
    
    campaign.status = 'paused';
    await campaign.save();
    
    return campaign;
  }

  /**
   * Resume a campaign
   */
  async resumeCampaign(campaignId) {
    const campaign = await Campaign.findById(campaignId).populate('metaConnectionId');
    if (!campaign || !campaign.metaCampaignId) {
      throw new Error('Campaign not found or not launched');
    }

    const metaConnection = campaign.metaConnectionId;
    const url = `${this.baseURL}/${campaign.metaCampaignId}`;
    
    const params = {
      status: 'ACTIVE',
      access_token: metaConnection.accessToken
    };

    await axios.post(url, null, { params });
    
    campaign.status = 'active';
    await campaign.save();
    
    return campaign;
  }

  /**
   * Update campaign budget
   */
  async updateBudget(campaignId, newBudget) {
    const campaign = await Campaign.findById(campaignId).populate('metaConnectionId');
    if (!campaign || !campaign.metaAdSetId) {
      throw new Error('Campaign not found or not launched');
    }

    const metaConnection = campaign.metaConnectionId;
    const url = `${this.baseURL}/${campaign.metaAdSetId}`;
    
    const budgetAmount = Math.round(newBudget.amount * 100);
    const params = {
      access_token: metaConnection.accessToken
    };

    if (newBudget.type === 'daily') {
      params.daily_budget = budgetAmount;
    } else {
      params.lifetime_budget = budgetAmount;
    }

    await axios.post(url, null, { params });
    
    campaign.budget = newBudget;
    await campaign.save();
    
    return campaign;
  }

  /**
   * Fetch campaign insights
   */
  async getCampaignInsights(campaignId, dateRange = 'last_7d') {
    const campaign = await Campaign.findById(campaignId).populate('metaConnectionId');
    if (!campaign || !campaign.metaCampaignId) {
      throw new Error('Campaign not found or not launched');
    }

    const metaConnection = campaign.metaConnectionId;
    const url = `${this.baseURL}/${campaign.metaCampaignId}/insights`;
    
    const params = {
      fields: 'impressions,reach,clicks,spend,cpm,cpc,ctr,actions,frequency',
      date_preset: dateRange,
      access_token: metaConnection.accessToken
    };

    try {
      const response = await axios.get(url, { params });
      const insights = response.data.data[0] || {};
      
      // Map Meta insights to our schema
      const metrics = {
        impressions: parseInt(insights.impressions) || 0,
        reach: parseInt(insights.reach) || 0,
        clicks: parseInt(insights.clicks) || 0,
        spend: parseFloat(insights.spend) || 0,
        cpm: parseFloat(insights.cpm) || 0,
        cpc: parseFloat(insights.cpc) || 0,
        ctr: parseFloat(insights.ctr) || 0,
        frequency: parseFloat(insights.frequency) || 0,
        actions: insights.actions || [],
        lastSyncedAt: new Date()
      };

      // Update campaign metrics
      await Campaign.findByIdAndUpdate(campaignId, { metrics });
      
      return metrics;
    } catch (error) {
      console.error('Failed to fetch insights:', error);
      throw error;
    }
  }

  /**
   * Create custom audience from customer list
   */
  async createCustomAudience(organizationId, audienceData) {
    const metaConnection = await MetaConnection.findOne({ organizationId });
    if (!metaConnection) {
      throw new Error('No Meta connection found');
    }

    const adAccountId = metaConnection.getDefaultAdAccount()?.id;
    if (!adAccountId) {
      throw new Error('No ad account available');
    }

    const url = `${this.baseURL}/act_${adAccountId}/customaudiences`;
    
    const params = {
      name: audienceData.name,
      description: audienceData.description,
      subtype: 'CUSTOM',
      customer_file_source: 'USER_PROVIDED_ONLY',
      access_token: metaConnection.accessToken
    };

    const response = await axios.post(url, null, { params });
    return response.data;
  }

  /**
   * Estimate audience size
   */
  async estimateAudienceSize(adAccountId, targeting, accessToken) {
    const url = `${this.baseURL}/act_${adAccountId}/reachestimate`;
    
    const params = {
      targeting_spec: JSON.stringify(targeting),
      optimization_goal: 'REACH',
      access_token: accessToken
    };

    try {
      const response = await axios.get(url, { params });
      return response.data.data[0];
    } catch (error) {
      console.error('Failed to estimate audience:', error);
      return null;
    }
  }

  // Helper methods

  getOptimizationGoal(objective) {
    const goalMap = {
      'OUTCOME_TRAFFIC': 'LINK_CLICKS',
      'OUTCOME_AWARENESS': 'REACH',
      'OUTCOME_ENGAGEMENT': 'POST_ENGAGEMENT',
      'OUTCOME_LEADS': 'LEAD_GENERATION',
      'OUTCOME_SALES': 'CONVERSIONS',
      'OUTCOME_APP_PROMOTION': 'APP_INSTALLS'
    };
    return goalMap[objective] || 'LINK_CLICKS';
  }

  /**
   * Validate Meta API response
   */
  validateResponse(response) {
    if (response.error) {
      const error = new Error(response.error.message);
      error.code = response.error.code;
      error.type = response.error.type;
      throw error;
    }
    return response;
  }

  /**
   * Handle Meta API errors
   */
  handleMetaError(error) {
    if (error.response?.data?.error) {
      const metaError = error.response.data.error;
      const errorMessage = `Meta API Error: ${metaError.message} (Code: ${metaError.code})`;
      
      // Log detailed error for debugging
      console.error('Meta API Error Details:', {
        message: metaError.message,
        type: metaError.type,
        code: metaError.code,
        subcode: metaError.error_subcode,
        fbtraceId: metaError.fbtrace_id
      });

      // Check for specific error types
      if (metaError.code === 190) {
        throw new Error('Meta access token expired. Please reconnect your account.');
      }
      if (metaError.code === 100) {
        throw new Error('Invalid parameters sent to Meta. Please check your campaign settings.');
      }
      if (metaError.code === 200) {
        throw new Error('Permission denied. Please ensure you have the necessary permissions.');
      }

      throw new Error(errorMessage);
    }
    
    throw error;
  }
}

module.exports = new MetaCampaignService();