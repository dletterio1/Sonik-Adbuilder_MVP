// src/services/adbuilder/campaign.service.js
const Campaign = require('../../models/Campaign');
const MetaConnection = require('../../models/MetaConnection');
const Event = require('../../models/Event');
const Organization = require('../../models/Organization');
const RedisClient = require('../redis.service');
const ResponseFormatter = require('../../utils/responseFormatter');
const { startSession } = require('mongoose');

class CampaignService {
  constructor() {
    this.CACHE_TTL = 900; // 15 minutes
    this.MIN_BUDGET_COP = 250000; // Minimum budget in COP
  }

  /**
   * Create a new campaign
   * @param {Object} campaignData - Campaign creation data
   * @param {String} userId - User creating the campaign
   * @param {String} organizationId - Organization context
   * @returns {Promise<Object>} Created campaign
   */
  async createCampaign(campaignData, userId, organizationId) {
    const session = await startSession();
    
    try {
      session.startTransaction();

      // Validate organization membership
      const organization = await Organization.findById(organizationId);
      if (!organization) {
        throw new Error('Organization not found');
      }

      // Validate Meta connection
      const metaConnection = await MetaConnection.findOne({ 
        organizationId,
        _id: campaignData.metaConnectionId 
      });
      
      if (!metaConnection) {
        throw new Error('Meta connection not found or unauthorized');
      }

      // Validate event ownership
      const event = await Event.findOne({
        _id: campaignData.eventId,
        organizationId
      });

      if (!event) {
        throw new Error('Event not found or unauthorized');
      }

      // Validate budget
      if (campaignData.budget.amount < this.MIN_BUDGET_COP) {
        throw new Error(`Minimum budget is ${this.MIN_BUDGET_COP.toLocaleString()} COP`);
      }

      // Validate dates
      const now = new Date();
      const startDate = new Date(campaignData.schedule.startDate);
      const endDate = new Date(campaignData.schedule.endDate);
      const eventDate = new Date(event.dateTime);

      if (startDate < now) {
        throw new Error('Campaign start date cannot be in the past');
      }

      if (endDate > eventDate) {
        throw new Error('Campaign cannot run after event date');
      }

      // Generate campaign name if not provided
      if (!campaignData.name) {
        campaignData.name = `${event.name} - ${this.getObjectiveName(campaignData.objective)}`;
      }

      // Set Meta ad account
      campaignData.metaAdAccountId = campaignData.metaAdAccountId || 
        metaConnection.getDefaultAdAccount()?.id;

      if (!campaignData.metaAdAccountId) {
        throw new Error('No Meta ad account available');
      }

      // Create campaign
      const campaign = new Campaign({
        ...campaignData,
        organizationId,
        createdBy: userId,
        updatedBy: userId,
        statusHistory: [{
          status: 'draft',
          changedAt: new Date(),
          changedBy: userId,
          reason: 'Campaign created'
        }]
      });

      // Set default audience based on event location if not provided
      if (!campaign.audience.locations || campaign.audience.locations.length === 0) {
        campaign.audience.locations = [{
          key: event.venue?.city || 'Bogotá',
          name: event.venue?.city || 'Bogotá',
          type: 'city',
          radius: 25,
          distance_unit: 'kilometer'
        }];
      }

      await campaign.save({ session });
      
      // Clear campaign list cache
      await this.clearCampaignCache(organizationId);

      await session.commitTransaction();

      // Populate references for response
      await campaign.populate([
        { path: 'eventId', select: 'name dateTime venue' },
        { path: 'createdBy', select: 'firstName lastName email' }
      ]);

      return campaign;

    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Get campaigns for an organization
   * @param {String} organizationId - Organization ID
   * @param {Object} filters - Query filters
   * @param {Object} options - Pagination options
   * @returns {Promise<Object>} Paginated campaigns
   */
  async getCampaigns(organizationId, filters = {}, options = {}) {
    const { 
      page = 1, 
      limit = 20, 
      sortBy = 'createdAt', 
      sortOrder = 'desc',
      status,
      eventId,
      startDate,
      endDate
    } = options;

    // Try cache first
    const cacheKey = `campaigns:${organizationId}:${JSON.stringify({ filters, options })}`;
    const cached = await RedisClient.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Build query
    const query = { organizationId };
    
    if (status) {
      query.status = Array.isArray(status) ? { $in: status } : status;
    }
    
    if (eventId) {
      query.eventId = eventId;
    }
    
    if (startDate || endDate) {
      query['schedule.startDate'] = {};
      if (startDate) query['schedule.startDate'].$gte = new Date(startDate);
      if (endDate) query['schedule.startDate'].$lte = new Date(endDate);
    }

    // Execute query
    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    const [campaigns, total] = await Promise.all([
      Campaign.find(query)
        .populate('eventId', 'name dateTime venue')
        .populate('createdBy', 'firstName lastName')
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      Campaign.countDocuments(query)
    ]);

    const result = {
      campaigns,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    };

    // Cache result
    await RedisClient.setex(cacheKey, this.CACHE_TTL, JSON.stringify(result));

    return result;
  }

  /**
   * Get single campaign by ID
   * @param {String} campaignId - Campaign ID
   * @param {String} organizationId - Organization ID for authorization
   * @returns {Promise<Object>} Campaign details
   */
  async getCampaignById(campaignId, organizationId) {
    const campaign = await Campaign.findOne({
      _id: campaignId,
      organizationId
    })
    .populate('eventId')
    .populate('metaConnectionId', 'businessName metaUserName')
    .populate('createdBy', 'firstName lastName email')
    .populate('updatedBy', 'firstName lastName email');

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    return campaign;
  }

  /**
   * Update campaign
   * @param {String} campaignId - Campaign ID
   * @param {Object} updates - Fields to update
   * @param {String} userId - User making the update
   * @param {String} organizationId - Organization context
   * @returns {Promise<Object>} Updated campaign
   */
  async updateCampaign(campaignId, updates, userId, organizationId) {
    const campaign = await Campaign.findOne({
      _id: campaignId,
      organizationId
    });

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    // Check if campaign can be edited
    if (!campaign.canEdit()) {
      throw new Error(`Cannot edit campaign in ${campaign.status} status`);
    }

    // Validate budget if updating
    if (updates.budget?.amount && updates.budget.amount < this.MIN_BUDGET_COP) {
      throw new Error(`Minimum budget is ${this.MIN_BUDGET_COP.toLocaleString()} COP`);
    }

    // Validate dates if updating
    if (updates.schedule) {
      const event = await Event.findById(campaign.eventId);
      const eventDate = new Date(event.dateTime);
      
      if (updates.schedule.endDate && new Date(updates.schedule.endDate) > eventDate) {
        throw new Error('Campaign cannot run after event date');
      }
    }

    // Update allowed fields
    const allowedUpdates = [
      'name', 'budget', 'schedule', 'audience', 
      'attribution.utm_content', 'attribution.utm_term'
    ];

    allowedUpdates.forEach(field => {
      if (updates[field] !== undefined) {
        if (field.includes('.')) {
          const [parent, child] = field.split('.');
          campaign[parent][child] = updates[field];
        } else {
          campaign[field] = updates[field];
        }
      }
    });

    campaign.updatedBy = userId;
    await campaign.save();

    // Clear cache
    await this.clearCampaignCache(organizationId);

    return campaign;
  }

  /**
   * Update campaign status
   * @param {String} campaignId - Campaign ID
   * @param {String} newStatus - New status
   * @param {String} userId - User making the change
   * @param {String} organizationId - Organization context
   * @param {String} reason - Reason for status change
   * @returns {Promise<Object>} Updated campaign
   */
  async updateCampaignStatus(campaignId, newStatus, userId, organizationId, reason = null) {
    const campaign = await Campaign.findOne({
      _id: campaignId,
      organizationId
    });

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    // Validate status transition
    const validTransitions = {
      'draft': ['pending', 'error'],
      'pending': ['active', 'error'],
      'active': ['paused', 'completed'],
      'paused': ['active', 'completed'],
      'error': ['draft']
    };

    if (!validTransitions[campaign.status]?.includes(newStatus)) {
      throw new Error(`Cannot transition from ${campaign.status} to ${newStatus}`);
    }

    // Update status with history
    campaign.updateStatus(newStatus, userId, reason);
    await campaign.save();

    // Clear cache
    await this.clearCampaignCache(organizationId);

    return campaign;
  }

  /**
   * Delete a campaign (only drafts)
   * @param {String} campaignId - Campaign ID
   * @param {String} organizationId - Organization context
   * @returns {Promise<Boolean>} Success
   */
  async deleteCampaign(campaignId, organizationId) {
    const campaign = await Campaign.findOne({
      _id: campaignId,
      organizationId
    });

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    if (!campaign.canDelete()) {
      throw new Error('Only draft campaigns can be deleted');
    }

    await campaign.deleteOne();
    
    // Clear cache
    await this.clearCampaignCache(organizationId);

    return true;
  }

  /**
   * Get campaign metrics
   * @param {String} campaignId - Campaign ID
   * @param {String} organizationId - Organization context
   * @returns {Promise<Object>} Campaign with metrics
   */
  async getCampaignMetrics(campaignId, organizationId) {
    const campaign = await Campaign.findOne({
      _id: campaignId,
      organizationId
    })
    .select('name status metrics ticketAttribution budget schedule')
    .lean();

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    // Calculate additional metrics
    const daysRunning = Math.max(0, 
      Math.floor((new Date() - new Date(campaign.schedule.startDate)) / (1000 * 60 * 60 * 24))
    );
    
    const daysRemaining = Math.max(0,
      Math.floor((new Date(campaign.schedule.endDate) - new Date()) / (1000 * 60 * 60 * 24))
    );

    const budgetUtilization = campaign.budget.type === 'lifetime' 
      ? (campaign.metrics.spend / campaign.budget.amount) * 100
      : (campaign.metrics.spend / (campaign.budget.amount * daysRunning)) * 100;

    const avgDailySpend = daysRunning > 0 
      ? campaign.metrics.spend / daysRunning 
      : 0;

    return {
      ...campaign,
      calculated: {
        daysRunning,
        daysRemaining,
        budgetUtilization,
        avgDailySpend,
        projectedTotalSpend: avgDailySpend * (daysRunning + daysRemaining),
        costPerPurchase: campaign.ticketAttribution.purchases > 0 
          ? campaign.metrics.spend / campaign.ticketAttribution.purchases 
          : 0
      }
    };
  }

  /**
   * Get campaign analytics summary
   * @param {String} organizationId - Organization ID
   * @returns {Promise<Object>} Analytics summary
   */
  async getCampaignAnalytics(organizationId) {
    const campaigns = await Campaign.find({ organizationId }).lean();
    
    const analytics = {
      total: campaigns.length,
      byStatus: {},
      totalSpend: 0,
      totalRevenue: 0,
      totalPurchases: 0,
      avgROI: 0,
      avgCTR: 0,
      topPerformers: []
    };

    // Calculate aggregates
    campaigns.forEach(campaign => {
      // Status breakdown
      analytics.byStatus[campaign.status] = (analytics.byStatus[campaign.status] || 0) + 1;
      
      // Financial metrics
      analytics.totalSpend += campaign.metrics.spend || 0;
      analytics.totalRevenue += campaign.ticketAttribution.revenue || 0;
      analytics.totalPurchases += campaign.ticketAttribution.purchases || 0;
    });

    // Calculate averages
    const activeCampaigns = campaigns.filter(c => c.metrics.impressions > 0);
    if (activeCampaigns.length > 0) {
      analytics.avgCTR = activeCampaigns.reduce((sum, c) => sum + (c.metrics.ctr || 0), 0) / activeCampaigns.length;
      analytics.avgROI = analytics.totalSpend > 0 
        ? ((analytics.totalRevenue - analytics.totalSpend) / analytics.totalSpend) * 100 
        : 0;
    }

    // Top performers by ROI
    analytics.topPerformers = campaigns
      .filter(c => c.ticketAttribution.roi > 0)
      .sort((a, b) => b.ticketAttribution.roi - a.ticketAttribution.roi)
      .slice(0, 5)
      .map(c => ({
        id: c._id,
        name: c.name,
        roi: c.ticketAttribution.roi,
        revenue: c.ticketAttribution.revenue,
        spend: c.metrics.spend
      }));

    return analytics;
  }

  /**
   * Pause a campaign
   * @param {String} campaignId - Campaign ID
   * @param {String} userId - User ID
   * @param {String} organizationId - Organization ID
   * @param {String} reason - Reason for pausing
   * @returns {Promise<Object>} Updated campaign
   */
  async pauseCampaign(campaignId, userId, organizationId, reason = 'User requested pause') {
    return this.updateCampaignStatus(campaignId, 'paused', userId, organizationId, reason);
  }

  /**
   * Resume a campaign
   * @param {String} campaignId - Campaign ID
   * @param {String} userId - User ID
   * @param {String} organizationId - Organization ID
   * @returns {Promise<Object>} Updated campaign
   */
  async resumeCampaign(campaignId, userId, organizationId) {
    return this.updateCampaignStatus(campaignId, 'active', userId, organizationId, 'User requested resume');
  }

  /**
   * Update campaign metrics (called by sync worker)
   * @param {String} campaignId - Campaign ID
   * @param {Object} metrics - Metrics from Meta API
   * @returns {Promise<Object>} Updated campaign
   */
  async updateCampaignMetrics(campaignId, metrics) {
    const campaign = await Campaign.findById(campaignId);
    if (!campaign) {
      throw new Error('Campaign not found');
    }

    // Update metrics
    Object.assign(campaign.metrics, metrics);
    campaign.metrics.lastSyncedAt = new Date();
    
    // Calculate derived metrics
    if (campaign.metrics.impressions > 0) {
      campaign.metrics.ctr = (campaign.metrics.clicks / campaign.metrics.impressions) * 100;
    }
    if (campaign.metrics.clicks > 0) {
      campaign.metrics.cpc = campaign.metrics.spend / campaign.metrics.clicks;
    }
    if (campaign.metrics.impressions > 0) {
      campaign.metrics.cpm = (campaign.metrics.spend / campaign.metrics.impressions) * 1000;
    }

    await campaign.save();
    
    // Clear cache
    await this.clearCampaignCache(campaign.organizationId);

    return campaign;
  }

  /**
   * Update ticket attribution for a campaign
   * @param {String} utmCampaign - UTM campaign identifier
   * @param {String} eventType - Type of event (view, cart, purchase)
   * @param {Object} data - Event data
   * @returns {Promise<Object>} Updated campaign
   */
  async updateAttribution(utmCampaign, eventType, data = {}) {
    const campaign = await Campaign.findOne({ 'attribution.utm_campaign': utmCampaign });
    if (!campaign) {
      return null; // Not all traffic comes from campaigns
    }

    switch (eventType) {
      case 'view':
        campaign.ticketAttribution.views += 1;
        if (data.visitorId && !campaign.ticketAttribution.uniqueVisitors.includes(data.visitorId)) {
          campaign.ticketAttribution.uniqueVisitors += 1;
        }
        break;
        
      case 'cart':
        campaign.ticketAttribution.addedToCart += 1;
        campaign.ticketAttribution.cartValue += data.value || 0;
        break;
        
      case 'purchase':
        campaign.ticketAttribution.purchases += 1;
        campaign.ticketAttribution.revenue += data.amount || 0;
        if (data.customerId) {
          campaign.ticketAttribution.customers.push({
            customerId: data.customerId,
            purchaseDate: new Date(),
            amount: data.amount,
            ticketTypes: data.ticketTypes || []
          });
        }
        break;
    }

    await campaign.save();
    return campaign;
  }

  // Helper methods

  /**
   * Get human-readable objective name
   * @param {String} objective - Meta objective constant
   * @returns {String} Human-readable name
   */
  getObjectiveName(objective) {
    const names = {
      'OUTCOME_TRAFFIC': 'Traffic',
      'OUTCOME_AWARENESS': 'Brand Awareness',
      'OUTCOME_ENGAGEMENT': 'Engagement',
      'OUTCOME_LEADS': 'Lead Generation',
      'OUTCOME_SALES': 'Conversions',
      'OUTCOME_APP_PROMOTION': 'App Installs'
    };
    return names[objective] || objective;
  }

  /**
   * Clear campaign cache for an organization
   * @param {String} organizationId - Organization ID
   * @returns {Promise<void>}
   */
  async clearCampaignCache(organizationId) {
    const pattern = `campaigns:${organizationId}:*`;
    const keys = await RedisClient.keys(pattern);
    if (keys.length > 0) {
      await RedisClient.del(...keys);
    }
  }

  /**
   * Validate campaign creation data
   * @param {Object} data - Campaign data
   * @returns {Object} Validation result
   */
  validateCampaignData(data) {
    const errors = [];

    // Required fields
    const required = ['eventId', 'objective', 'budget', 'schedule'];
    required.forEach(field => {
      if (!data[field]) {
        errors.push(`${field} is required`);
      }
    });

    // Budget validation
    if (data.budget) {
      if (!data.budget.amount || data.budget.amount < this.MIN_BUDGET_COP) {
        errors.push(`Budget must be at least ${this.MIN_BUDGET_COP.toLocaleString()} COP`);
      }
      if (!['daily', 'lifetime'].includes(data.budget.type)) {
        errors.push('Budget type must be either daily or lifetime');
      }
    }

    // Date validation
    if (data.schedule) {
      const start = new Date(data.schedule.startDate);
      const end = new Date(data.schedule.endDate);
      if (start >= end) {
        errors.push('End date must be after start date');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

module.exports = new CampaignService();