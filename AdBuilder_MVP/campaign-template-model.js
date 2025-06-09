// src/models/CampaignTemplate.js
const mongoose = require('mongoose');

const campaignTemplateSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    maxlength: 500
  },
  category: {
    type: String,
    enum: ['festival', 'club_night', 'concert', 'wellness', 'sports', 'conference', 'other'],
    default: 'other',
    index: true
  },
  tags: [{
    type: String,
    lowercase: true,
    trim: true
  }],
  // Template configuration
  config: {
    // Campaign objective
    objective: {
      type: String,
      enum: [
        'OUTCOME_TRAFFIC',
        'OUTCOME_AWARENESS', 
        'OUTCOME_ENGAGEMENT',
        'OUTCOME_LEADS',
        'OUTCOME_SALES',
        'OUTCOME_APP_PROMOTION'
      ],
      default: 'OUTCOME_TRAFFIC'
    },
    // Budget recommendations
    budget: {
      daily: {
        min: { type: Number, default: 250000 },
        max: { type: Number, default: 2000000 }
      },
      lifetime: {
        min: { type: Number, default: 1000000 },
        max: { type: Number, default: 10000000 }
      },
      currency: { type: String, default: 'COP' }
    },
    // Duration recommendation
    duration: {
      min: { type: Number, default: 3 }, // days
      max: { type: Number, default: 30 },
      recommended: { type: Number, default: 7 }
    },
    // Audience template
    audience: {
      locations: [{
        key: String,
        name: String,
        type: {
          type: String,
          enum: ['country', 'region', 'city', 'zip']
        },
        radius: Number,
        distance_unit: {
          type: String,
          enum: ['kilometer', 'mile'],
          default: 'kilometer'
        }
      }],
      age_min: { type: Number, default: 18 },
      age_max: { type: Number, default: 65 },
      genders: [{
        type: Number,
        enum: [0, 1, 2] // 0=all, 1=male, 2=female
      }],
      languages: [String],
      interests: [{
        id: String,
        name: String
      }],
      behaviors: [{
        id: String,
        name: String
      }]
    },
    // Creative guidelines
    creative: {
      formats: [{
        type: String,
        enum: ['image', 'video', 'carousel', 'collection']
      }],
      dimensions: [{
        format: String,
        width: Number,
        height: Number,
        aspectRatio: String
      }],
      copyGuidelines: {
        headline: {
          maxLength: Number,
          examples: [String]
        },
        primaryText: {
          maxLength: Number,
          examples: [String]
        },
        callToAction: {
          type: String,
          enum: ['LEARN_MORE', 'SHOP_NOW', 'SIGN_UP', 'BOOK_NOW', 'GET_TICKETS']
        }
      },
      tips: [String]
    }
  },
  // Performance benchmarks (based on historical data)
  benchmarks: {
    ctr: { min: Number, max: Number, average: Number },
    cpc: { min: Number, max: Number, average: Number },
    conversionRate: { min: Number, max: Number, average: Number },
    roas: { min: Number, max: Number, average: Number }
  },
  // Usage tracking
  usage: {
    count: { type: Number, default: 0 },
    lastUsedAt: Date,
    lastUsedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    // Performance tracking
    performance: {
      totalCampaigns: { type: Number, default: 0 },
      averageRoas: { type: Number, default: 0 },
      totalRevenue: { type: Number, default: 0 }
    }
  },
  // Template metadata
  isPublic: { type: Boolean, default: false }, // Organization templates vs system templates
  isActive: { type: Boolean, default: true },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Indexes
campaignTemplateSchema.index({ organizationId: 1, category: 1 });
campaignTemplateSchema.index({ organizationId: 1, 'usage.count': -1 });
campaignTemplateSchema.index({ tags: 1 });
campaignTemplateSchema.index({ isPublic: 1, isActive: 1 });

// Virtual for popularity score
campaignTemplateSchema.virtual('popularityScore').get(function() {
  const recencyScore = this.usage.lastUsedAt ? 
    Math.max(0, 30 - Math.floor((Date.now() - this.usage.lastUsedAt) / (1000 * 60 * 60 * 24))) : 0;
  const usageScore = Math.min(this.usage.count * 2, 100);
  const performanceScore = this.usage.performance.averageRoas * 10;
  
  return recencyScore + usageScore + performanceScore;
});

// Instance methods
campaignTemplateSchema.methods.incrementUsage = async function(userId) {
  this.usage.count += 1;
  this.usage.lastUsedAt = new Date();
  this.usage.lastUsedBy = userId;
  return this.save();
};

campaignTemplateSchema.methods.updatePerformance = async function(campaignResult) {
  const { roas, revenue } = campaignResult;
  
  this.usage.performance.totalCampaigns += 1;
  this.usage.performance.totalRevenue += revenue;
  
  // Calculate new average ROAS
  const currentTotal = this.usage.performance.averageRoas * (this.usage.performance.totalCampaigns - 1);
  this.usage.performance.averageRoas = (currentTotal + roas) / this.usage.performance.totalCampaigns;
  
  return this.save();
};

// Static methods
campaignTemplateSchema.statics.getPopularTemplates = function(organizationId, limit = 5) {
  return this.find({
    $or: [
      { organizationId, isActive: true },
      { isPublic: true, isActive: true }
    ]
  })
  .sort({ 'usage.count': -1, 'usage.lastUsedAt': -1 })
  .limit(limit)
  .populate('createdBy', 'name email');
};

campaignTemplateSchema.statics.getTemplatesByCategory = function(organizationId, category, limit = 10) {
  return this.find({
    $or: [
      { organizationId, category, isActive: true },
      { isPublic: true, category, isActive: true }
    ]
  })
  .sort({ 'usage.count': -1 })
  .limit(limit);
};

campaignTemplateSchema.statics.searchTemplates = function(organizationId, searchTerm, filters = {}) {
  const query = {
    $or: [
      { organizationId, isActive: true },
      { isPublic: true, isActive: true }
    ]
  };
  
  // Add search conditions
  if (searchTerm) {
    query.$and = [
      {
        $or: [
          { name: new RegExp(searchTerm, 'i') },
          { description: new RegExp(searchTerm, 'i') },
          { tags: new RegExp(searchTerm, 'i') }
        ]
      }
    ];
  }
  
  // Add filters
  if (filters.category) {
    query.category = filters.category;
  }
  
  if (filters.tags && filters.tags.length > 0) {
    query.tags = { $in: filters.tags };
  }
  
  return this.find(query)
    .sort({ 'usage.count': -1 })
    .limit(20);
};

const CampaignTemplate = mongoose.model('CampaignTemplate', campaignTemplateSchema);

module.exports = CampaignTemplate;

// =====================================
// src/services/adbuilder/campaign.service.js (additions)
// =====================================
// Add these methods to the existing campaign.service.js file

const CampaignTemplate = require('../../models/CampaignTemplate');

/**
 * Create campaign from template
 * @param {String} templateId - Template ID
 * @param {Object} eventDetails - Event details
 * @param {String} userId - User ID
 * @param {String} organizationId - Organization ID
 * @returns {Promise<Object>} Created campaign
 */
async createCampaignFromTemplate(templateId, eventDetails, userId, organizationId) {
  const session = await mongoose.startSession();
  
  try {
    let campaign = null;
    
    await session.withTransaction(async () => {
      // Get template
      const template = await CampaignTemplate.findOne({
        _id: templateId,
        $or: [
          { organizationId },
          { isPublic: true }
        ],
        isActive: true
      }).session(session);
      
      if (!template) {
        throw createError(404, 'Template not found');
      }
      
      // Increment template usage
      await template.incrementUsage(userId);
      
      // Get Meta connection
      const metaConnection = await this._getActiveMetaConnection(organizationId, session);
      
      // Build campaign data from template
      const campaignData = {
        organizationId,
        eventId: eventDetails.eventId,
        metaConnectionId: metaConnection._id,
        metaAdAccountId: metaConnection.getDefaultAdAccount().id,
        name: `${eventDetails.eventName} - ${template.name}`,
        objective: template.config.objective,
        status: 'draft',
        budget: {
          amount: template.config.budget.daily.min,
          currency: template.config.budget.currency,
          type: 'daily'
        },
        schedule: {
          startDate: eventDetails.startDate || new Date(),
          endDate: eventDetails.endDate || new Date(Date.now() + template.config.duration.recommended * 24 * 60 * 60 * 1000),
          timezone: eventDetails.timezone || 'America/Bogota'
        },
        audience: template.config.audience,
        attribution: {
          utm_source: 'meta',
          utm_medium: 'paid',
          utm_campaign: `sonik_${eventDetails.eventId}_${Date.now()}`
        },
        createdBy: userId
      };
      
      // Create campaign
      campaign = new Campaign(campaignData);
      await campaign.save({ session });
      
      // Clear cache
      await redis.del(`campaigns:${organizationId}:list`);
      
      // Log template usage
      console.log(`Campaign created from template ${templateId} for event ${eventDetails.eventId}`);
    });
    
    return campaign;
    
  } catch (error) {
    console.error('Error creating campaign from template:', error);
    throw error;
  } finally {
    await session.endSession();
  }
}

/**
 * Get recommended templates for event
 * @param {Object} eventDetails - Event details
 * @param {String} organizationId - Organization ID
 * @returns {Promise<Array>} Recommended templates
 */
async getRecommendedTemplates(eventDetails, organizationId) {
  try {
    const { category, tags, audienceSize } = eventDetails;
    
    // Get templates by category
    let templates = await CampaignTemplate.getTemplatesByCategory(
      organizationId,
      category || 'other',
      10
    );
    
    // If not enough templates, get popular ones
    if (templates.length < 3) {
      const popularTemplates = await CampaignTemplate.getPopularTemplates(
        organizationId,
        5
      );
      
      // Merge without duplicates
      const templateIds = new Set(templates.map(t => t._id.toString()));
      popularTemplates.forEach(t => {
        if (!templateIds.has(t._id.toString())) {
          templates.push(t);
        }
      });
    }
    
    // Sort by relevance
    templates.sort((a, b) => {
      // Prioritize matching category
      if (a.category === category && b.category !== category) return -1;
      if (a.category !== category && b.category === category) return 1;
      
      // Then by popularity score
      return b.popularityScore - a.popularityScore;
    });
    
    return templates.slice(0, 5);
    
  } catch (error) {
    console.error('Error getting recommended templates:', error);
    return [];
  }
}

/**
 * Create custom template from campaign
 * @param {String} campaignId - Campaign ID
 * @param {Object} templateData - Template details
 * @param {String} userId - User ID
 * @param {String} organizationId - Organization ID
 * @returns {Promise<Object>} Created template
 */
async createTemplateFromCampaign(campaignId, templateData, userId, organizationId) {
  try {
    // Get campaign
    const campaign = await Campaign.findOne({
      _id: campaignId,
      _organization: organizationId
    });
    
    if (!campaign) {
      throw createError(404, 'Campaign not found');
    }
    
    // Extract configuration from campaign
    const template = new CampaignTemplate({
      organizationId,
      name: templateData.name,
      description: templateData.description,
      category: templateData.category || 'other',
      tags: templateData.tags || [],
      config: {
        objective: campaign.objective,
        budget: {
          daily: {
            min: campaign.budget.amount,
            max: campaign.budget.amount * 2
          },
          currency: campaign.budget.currency
        },
        audience: campaign.audience,
        creative: templateData.creativeGuidelines || {}
      },
      createdBy: userId
    });
    
    await template.save();
    
    return template;
    
  } catch (error) {
    console.error('Error creating template from campaign:', error);
    throw error;
  }
}