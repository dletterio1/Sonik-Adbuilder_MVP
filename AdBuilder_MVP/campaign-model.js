// src/models/Campaign.js
const mongoose = require('mongoose');

const campaignSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: true,
    index: true
  },
  metaConnectionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MetaConnection',
    required: true
  },
  // Meta-specific IDs
  metaCampaignId: {
    type: String,
    sparse: true,
    index: true
  },
  metaAdSetId: String,
  metaAdAccountId: {
    type: String,
    required: true
  },
  // Campaign basics
  name: {
    type: String,
    required: true,
    trim: true
  },
  objective: {
    type: String,
    required: true,
    enum: [
      'OUTCOME_TRAFFIC',
      'OUTCOME_AWARENESS', 
      'OUTCOME_ENGAGEMENT',
      'OUTCOME_LEADS',
      'OUTCOME_SALES',
      'OUTCOME_APP_PROMOTION'
    ]
  },
  status: {
    type: String,
    required: true,
    enum: ['draft', 'pending', 'active', 'paused', 'completed', 'error'],
    default: 'draft',
    index: true
  },
  statusHistory: [{
    status: String,
    changedAt: { type: Date, default: Date.now },
    changedBy: mongoose.Schema.Types.ObjectId,
    reason: String
  }],
  // Budget configuration
  budget: {
    amount: {
      type: Number,
      required: true,
      min: 250000 // Min 250,000 COP
    },
    currency: {
      type: String,
      required: true,
      default: 'COP'
    },
    type: {
      type: String,
      required: true,
      enum: ['daily', 'lifetime']
    }
  },
  // Schedule
  schedule: {
    startDate: {
      type: Date,
      required: true,
      index: true
    },
    endDate: {
      type: Date,
      required: true,
      validate: {
        validator: function(endDate) {
          return endDate > this.schedule.startDate;
        },
        message: 'End date must be after start date'
      }
    },
    timezone: {
      type: String,
      default: 'America/Bogota'
    }
  },
  // Audience configuration (saved for reference)
  audience: {
    name: String,
    metaAudienceId: String,
    type: {
      type: String,
      enum: ['custom', 'lookalike', 'saved', 'event_based'],
      default: 'event_based'
    },
    // Geographic targeting
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
    // Demographics
    age_min: {
      type: Number,
      min: 13,
      default: 18
    },
    age_max: {
      type: Number,
      max: 65,
      default: 65
    },
    genders: [{
      type: Number,
      enum: [0, 1, 2] // 0=all, 1=male, 2=female
    }],
    languages: [String],
    // Interests and behaviors
    interests: [{
      id: String,
      name: String
    }],
    behaviors: [{
      id: String,
      name: String
    }],
    // Custom audiences
    custom_audiences: [String],
    excluded_custom_audiences: [String],
    // Estimated reach
    estimate: {
      daily_outcomes_curve: [{
        spend: Number,
        reach: Number,
        impressions: Number,
        actions: Number
      }],
      estimate_ready: Boolean,
      lastUpdated: Date
    }
  },
  // Attribution configuration
  attribution: {
    utm_source: {
      type: String,
      default: 'meta'
    },
    utm_medium: {
      type: String,
      default: 'paid'
    },
    utm_campaign: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    utm_content: String,
    utm_term: String,
    pixelId: String,
    conversionEvents: [{
      eventName: String,
      eventId: String,
      isActive: Boolean
    }]
  },
  // Performance metrics (synced from Meta)
  metrics: {
    impressions: { type: Number, default: 0 },
    reach: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    spend: { type: Number, default: 0 },
    cpm: { type: Number, default: 0 }, // Cost per 1000 impressions
    cpc: { type: Number, default: 0 }, // Cost per click
    ctr: { type: Number, default: 0 }, // Click-through rate
    frequency: { type: Number, default: 0 },
    // Meta-specific metrics
    actions: [{
      action_type: String,
      value: Number
    }],
    lastSyncedAt: Date,
    syncErrors: [{
      timestamp: Date,
      error: String,
      resolved: Boolean
    }]
  },
  // Sonik-specific attribution
  ticketAttribution: {
    // Page views with campaign UTM
    views: { type: Number, default: 0 },
    uniqueVisitors: { type: Number, default: 0 },
    // Add to cart events
    addedToCart: { type: Number, default: 0 },
    cartValue: { type: Number, default: 0 },
    // Completed purchases
    purchases: { type: Number, default: 0 },
    revenue: { type: Number, default: 0 },
    // Customer details for lookalike audiences
    customers: [{
      customerId: mongoose.Schema.Types.ObjectId,
      purchaseDate: Date,
      amount: Number,
      ticketTypes: [String]
    }],
    // Conversion rates
    viewToCartRate: { type: Number, default: 0 },
    cartToPurchaseRate: { type: Number, default: 0 },
    overallConversionRate: { type: Number, default: 0 },
    // ROI calculations
    roi: { type: Number, default: 0 },
    roas: { type: Number, default: 0 }, // Return on ad spend
    customerAcquisitionCost: { type: Number, default: 0 }
  },
  // Creative assets (for future use)
  creatives: [{
    type: {
      type: String,
      enum: ['image', 'video', 'carousel', 'collection']
    },
    metaCreativeId: String,
    name: String,
    status: String,
    thumbnail_url: String,
    preview_url: String
  }],
  // Error handling
  lastError: {
    message: String,
    code: String,
    timestamp: Date,
    details: mongoose.Schema.Types.Mixed
  },
  // Metadata
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

// Indexes for performance
campaignSchema.index({ organizationId: 1, status: 1 });
campaignSchema.index({ organizationId: 1, createdAt: -1 });
campaignSchema.index({ eventId: 1, status: 1 });
campaignSchema.index({ 'schedule.startDate': 1, 'schedule.endDate': 1 });
campaignSchema.index({ 'metrics.lastSyncedAt': 1 });

// Virtual for checking if campaign needs sync
campaignSchema.virtual('needsSync').get(function() {
  if (!this.metrics.lastSyncedAt) return true;
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
  return this.metrics.lastSyncedAt < fifteenMinutesAgo;
});

// Virtual for campaign age
campaignSchema.virtual('daysRunning').get(function() {
  if (this.status !== 'active' || !this.schedule.startDate) return 0;
  const now = new Date();
  const start = new Date(this.schedule.startDate);
  return Math.floor((now - start) / (1000 * 60 * 60 * 24));
});

// Instance method to calculate ROI
campaignSchema.methods.calculateROI = function() {
  if (!this.metrics.spend || this.metrics.spend === 0) {
    return { roi: 0, roas: 0, cac: 0 };
  }
  
  const revenue = this.ticketAttribution.revenue || 0;
  const spend = this.metrics.spend || 0;
  const purchases = this.ticketAttribution.purchases || 0;
  
  return {
    roi: ((revenue - spend) / spend) * 100,
    roas: revenue / spend,
    cac: purchases > 0 ? spend / purchases : 0
  };
};

// Instance method to update status with history
campaignSchema.methods.updateStatus = function(newStatus, userId, reason = null) {
  this.statusHistory.push({
    status: this.status,
    changedAt: new Date(),
    changedBy: userId,
    reason
  });
  this.status = newStatus;
  this.updatedBy = userId;
};

// Instance method to check if campaign can be edited
campaignSchema.methods.canEdit = function() {
  return ['draft', 'paused'].includes(this.status);
};

// Instance method to check if campaign can be deleted
campaignSchema.methods.canDelete = function() {
  return this.status === 'draft';
};

// Static method to find campaigns needing sync
campaignSchema.statics.findNeedingSync = function(limit = 100) {
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
  return this.find({
    status: 'active',
    $or: [
      { 'metrics.lastSyncedAt': { $exists: false } },
      { 'metrics.lastSyncedAt': { $lt: fifteenMinutesAgo } }
    ]
  })
  .limit(limit)
  .sort({ 'metrics.lastSyncedAt': 1 });
};

// Pre-save middleware
campaignSchema.pre('save', function(next) {
  // Auto-generate UTM campaign if not provided
  if (!this.attribution.utm_campaign && this.name) {
    this.attribution.utm_campaign = `sonik_${this._id}_${this.name.toLowerCase().replace(/\s+/g, '_')}`;
  }
  
  // Calculate conversion rates if we have data
  if (this.ticketAttribution.views > 0) {
    this.ticketAttribution.viewToCartRate = 
      (this.ticketAttribution.addedToCart / this.ticketAttribution.views) * 100;
  }
  
  if (this.ticketAttribution.addedToCart > 0) {
    this.ticketAttribution.cartToPurchaseRate = 
      (this.ticketAttribution.purchases / this.ticketAttribution.addedToCart) * 100;
  }
  
  if (this.ticketAttribution.views > 0) {
    this.ticketAttribution.overallConversionRate = 
      (this.ticketAttribution.purchases / this.ticketAttribution.views) * 100;
  }
  
  // Calculate ROI metrics
  const roiMetrics = this.calculateROI();
  this.ticketAttribution.roi = roiMetrics.roi;
  this.ticketAttribution.roas = roiMetrics.roas;
  this.ticketAttribution.customerAcquisitionCost = roiMetrics.cac;
  
  next();
});

const Campaign = mongoose.model('Campaign', campaignSchema);

module.exports = Campaign;