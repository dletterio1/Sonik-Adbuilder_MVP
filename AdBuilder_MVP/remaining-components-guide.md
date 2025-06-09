# Implementation Reference Guide - Remaining Components

## 🎯 Component 1: Attribution Processor Worker

### File to Create: `src/workers/attribution-processor.worker.js`

### Key Code Patterns to Follow:

#### EventBus Subscription Pattern
```javascript
// From src/events/EventBus.js pattern:
const Bull = require('bull');
const { EventEmitter } = require('events');

class AttributionProcessorWorker extends EventEmitter {
  constructor() {
    super();
    this.queue = new Bull('attribution-processor', {
      redis: process.env.REDIS_URL,
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: false,
        attempts: 3,
        backoff: {
          type: 'fixed',
          delay: 5000
        }
      }
    });
  }
}
```

#### Order Processing Pattern
```javascript
// From attribution service references:
async processOrderCompletion(orderId) {
  const order = await TicketTransaction.findById(orderId)
    .populate('_eventUTM _user _event');
    
  if (!order._eventUTM?.utm_campaign) {
    return; // No campaign attribution
  }
  
  // Find matching campaign
  const campaign = await Campaign.findOne({
    'attribution.utm_campaign': order._eventUTM.utm_campaign
  });
}
```

#### Campaign Metrics Update
```javascript
// Use the Campaign model's ticketAttribution structure:
campaign.ticketAttribution.purchases += 1;
campaign.ticketAttribution.revenue += order.priceBreakdown.total;
campaign.ticketAttribution.customers.push({
  customerId: order._user._id,
  purchaseDate: order.createdAt,
  amount: order.priceBreakdown.total,
  ticketTypes: order.tickets.map(t => t.type)
});

// Calculate conversion rates
campaign.ticketAttribution.viewToCartRate = 
  (campaign.ticketAttribution.addedToCart / campaign.ticketAttribution.views) * 100;

// Use the built-in ROI calculation
const roiMetrics = campaign.calculateROI();
```

### Required Dependencies:
- `TicketTransaction` model (for orders)
- `Campaign` model
- `redis` service
- `mongoose` for transactions

---

## 🔐 Component 2: Meta Webhook Handler

### File to Create: `src/routes/webhooks/meta.routes.js`

### Webhook Signature Verification Pattern
```javascript
// Based on crypto patterns in codebase:
const crypto = require('crypto');

function verifyWebhookSignature(req) {
  const signature = req.headers['x-hub-signature-256'];
  const payload = JSON.stringify(req.body);
  
  const expectedSignature = crypto
    .createHmac('sha256', process.env.META_WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');
  
  const expectedSig = `sha256=${expectedSignature}`;
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSig)
  );
}
```

### Webhook Route Structure
```javascript
// Following Sonik route patterns:
const express = require('express');
const router = express.Router();
const { ResponseFormatter } = require('../../utils/responseFormatter');

// Webhook verification endpoint (Meta requirement)
router.get('/meta', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  
  if (mode === 'subscribe' && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Main webhook endpoint
router.post('/meta', async (req, res) => {
  try {
    if (!verifyWebhookSignature(req)) {
      return res.status(401).json(
        ResponseFormatter.error(new Error('Invalid signature'), 401)
      );
    }
    
    // Process webhook events
    const { entry } = req.body;
    
    // Acknowledge receipt immediately
    res.sendStatus(200);
    
    // Process asynchronously
    processWebhookEvents(entry);
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json(ResponseFormatter.error(error));
  }
});
```

### Event Processing Pattern
```javascript
async function processWebhookEvents(entries) {
  for (const entry of entries) {
    const { changes } = entry;
    
    for (const change of changes) {
      switch (change.field) {
        case 'campaigns':
          await handleCampaignChange(change.value);
          break;
        case 'ads':
          await handleAdChange(change.value);
          break;
        case 'ad_account':
          await handleAccountChange(change.value);
          break;
      }
    }
  }
}
```

### Campaign Status Update Handler
```javascript
async function handleCampaignChange(data) {
  const campaign = await Campaign.findOne({
    metaCampaignId: data.campaign_id
  });
  
  if (!campaign) return;
  
  // Update status if changed
  if (data.status && campaign.status !== data.status.toLowerCase()) {
    campaign.statusHistory.push({
      status: data.status.toLowerCase(),
      changedAt: new Date(),
      reason: 'Updated via Meta webhook'
    });
    campaign.status = data.status.toLowerCase();
    await campaign.save();
  }
}
```

---

## 📋 Component 3: Campaign Templates

### File to Create: `src/models/CampaignTemplate.js`

### Schema Pattern (Based on Campaign Model)
```javascript
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
  description: String,
  category: {
    type: String,
    enum: ['festival', 'club_night', 'concert', 'wellness', 'other'],
    default: 'other'
  },
  tags: [String],
  // Copy targeting from Campaign model
  audience: {
    locations: [{
      key: String,
      name: String,
      type: String,
      radius: Number,
      distance_unit: String
    }],
    age_min: { type: Number, default: 18 },
    age_max: { type: Number, default: 65 },
    genders: [Number],
    languages: [String],
    interests: [{
      id: String,
      name: String
    }]
  },
  // Budget recommendations
  budgetRecommendation: {
    daily: { min: Number, max: Number },
    lifetime: { min: Number, max: Number },
    currency: { type: String, default: 'COP' }
  },
  // Creative guidelines
  creativeGuidelines: {
    formats: [String], // ['image', 'video', 'carousel']
    dimensions: [{
      format: String,
      width: Number,
      height: Number
    }],
    tips: [String]
  },
  // Usage tracking
  usageCount: { type: Number, default: 0 },
  lastUsedAt: Date,
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Instance methods
campaignTemplateSchema.methods.incrementUsage = function() {
  this.usageCount += 1;
  this.lastUsedAt = new Date();
  return this.save();
};

// Static methods
campaignTemplateSchema.statics.getPopularTemplates = function(organizationId, limit = 5) {
  return this.find({ organizationId })
    .sort({ usageCount: -1 })
    .limit(limit);
};
```

### Service Methods Pattern
```javascript
// In campaign.service.js, add:
async createCampaignFromTemplate(templateId, eventId, userId, organizationId) {
  const template = await CampaignTemplate.findOne({
    _id: templateId,
    organizationId
  });
  
  if (!template) {
    throw createError(404, 'Template not found');
  }
  
  // Create campaign with template values
  const campaignData = {
    eventId,
    name: `Campaign from ${template.name}`,
    audience: template.audience,
    budget: {
      amount: template.budgetRecommendation.daily.min,
      type: 'daily',
      currency: template.budgetRecommendation.currency
    },
    // ... other fields
  };
  
  // Increment template usage
  await template.incrementUsage();
  
  return this.createCampaign(campaignData, userId, organizationId);
}
```

### API Routes Pattern
```javascript
// In campaign.routes.js, add:
router.get('/templates',
  checkPermission('advertising:campaigns:view'),
  async (req, res) => {
    try {
      const { organizationId } = req.user;
      const { category, limit = 20 } = req.query;
      
      const query = { organizationId };
      if (category) query.category = category;
      
      const templates = await CampaignTemplate.find(query)
        .sort({ usageCount: -1 })
        .limit(parseInt(limit));
        
      res.json(ResponseFormatter.success(templates));
    } catch (error) {
      res.status(500).json(ResponseFormatter.error(error));
    }
  }
);
```

---

## 🔗 Integration Points Reference

### Database Collections Used:
- `campaigns` - Main campaign collection
- `metaconnections` - Meta auth tokens
- `customers` - For audience data
- `tickettransactions` - Order/purchase data
- `eventutms` - UTM tracking data (referenced in orders)

### Redis Keys Pattern:
```javascript
// Attribution processor
`attribution:processing:${orderId}` // Prevent duplicate processing
`attribution:stats:${campaignId}:${date}` // Daily stats

// Webhook handler
`webhook:processed:${eventId}` // Prevent duplicate events

// Templates
`templates:popular:${organizationId}` // Cache popular templates
```

### Event Names for EventBus:
```javascript
// Subscribe to:
'order.completed'
'order.updated'
'ticket.scanned'

// Publish:
'campaign.conversion'
'attribution.processed'
'campaign.status.changed'
```

### Environment Variables Needed:
```env
# Attribution
ATTRIBUTION_WINDOW_DAYS=28
ATTRIBUTION_PROCESSING_BATCH_SIZE=100

# Webhooks
META_WEBHOOK_SECRET=your_webhook_secret
META_WEBHOOK_VERIFY_TOKEN=your_verify_token
META_WEBHOOK_ENDPOINT=https://api.sonik.app/webhooks/meta

# Templates
DEFAULT_TEMPLATE_BUDGET_MIN=250000
DEFAULT_TEMPLATE_BUDGET_MAX=5000000
```

---

## ✅ Implementation Checklist

Use this checklist when implementing each component:

### Attribution Processor:
- [ ] Set up Bull queue with proper Redis config
- [ ] Subscribe to order.completed events
- [ ] Implement UTM matching logic
- [ ] Add attribution window calculations
- [ ] Update campaign metrics with transaction
- [ ] Handle edge cases (refunds, duplicates)
- [ ] Add monitoring/logging
- [ ] Test with sample orders

### Webhook Handler:
- [ ] Create verification endpoint (GET)
- [ ] Create main webhook endpoint (POST)
- [ ] Implement signature verification
- [ ] Add event type handlers
- [ ] Update campaign status logic
- [ ] Handle rate limiting
- [ ] Add error recovery
- [ ] Register webhook URL with Meta

### Campaign Templates:
- [ ] Create Mongoose schema
- [ ] Add service methods
- [ ] Create CRUD endpoints
- [ ] Add to campaign creation wizard
- [ ] Implement usage tracking
- [ ] Add template categories
- [ ] Create seed templates
- [ ] Update documentation