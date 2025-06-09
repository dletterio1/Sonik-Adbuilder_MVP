# Sonik Campaign Manager - Project Status Summary

## 🎯 Project Goal

**Sonik Campaign Manager** is an integrated Meta (Facebook/Instagram) advertising platform built directly into Sonik's event ticketing system. The platform enables event organizers to:

1. **Create and manage Meta ad campaigns** without leaving Sonik
2. **Track actual ticket sales attribution** from ads to purchases
3. **Optimize campaigns using real revenue data** (not just clicks/impressions)
4. **Build custom and lookalike audiences** from ticket purchasers
5. **Coordinate with dynamic pricing** for revenue maximization

### Ultimate Vision
- **Phase 1** (Current): Basic campaign management with attribution
- **Phase 2**: Multi-armed bandit optimization for automatic budget allocation
- **Phase 3**: AI-powered campaign + pricing optimization (35-70% revenue increase)

## ✅ Components Completed

### 1. **Meta Authentication Service** ✓
- **File**: `src/services/adbuilder/meta-auth.service.js`
- **Features**: OAuth flow, token management, business asset discovery
- **Status**: Fully implemented and documented

### 2. **Database Models** ✓
- **MetaConnection**: `src/models/MetaConnection.js` - Encrypted credential storage
- **Campaign**: `src/models/Campaign.js` - Complete schema with metrics
- **Customer Update**: Marketing consent fields added
- **Status**: All schemas complete with proper indexes

### 3. **Campaign Service** ✓
- **File**: `src/services/adbuilder/campaign.service.js`
- **Features**: CRUD operations, validation, caching, ROI calculations
- **Status**: Full business logic implemented

### 4. **Campaign API Routes** ✓
- **File**: `src/routes/adbuilder/campaign.routes.js`
- **Endpoints**: Create, list, update, launch campaigns
- **Status**: RESTful API with permission controls

### 5. **Campaign UI Components** ✓
- **Creation Wizard**: Multi-step form with validation
- **List Page**: `src/pages/advertising/campaigns/index.js`
- **Detail Page**: `src/pages/advertising/campaigns/[id].js`
- **Status**: React components with Material-UI

### 6. **Audience Builder UI** ✓
- **Components**: Geographic, demographic, interest targeting
- **Files**: `src/components/advertising/AudienceBuilder/*`
- **Status**: Complete targeting interface

### 7. **Attribution Service & Middleware** ✓
- **Service**: `src/services/adbuilder/attribution.service.js`
- **Middleware**: `src/middleware/attribution.js`
- **Features**: UTM tracking, session attribution
- **Status**: Core attribution logic complete

### 8. **Meta Audience Service** ✓ (NEW)
- **File**: `src/services/adbuilder/meta-audience.service.js`
- **Features**: Custom audiences, lookalike audiences, SHA256 hashing
- **Status**: Production-ready with full error handling

### 9. **Campaign Sync Worker** ✓ (NEW)
- **File**: `src/workers/campaign-sync.worker.js`
- **Features**: 15-minute sync, batch processing, token management
- **Status**: Bull queue implementation complete

### 10. **Audience API Routes** ✓ (NEW)
- **File**: `src/routes/adbuilder/audience.routes.js`
- **Endpoints**: Create custom/lookalike audiences, manage audiences
- **Status**: Complete with permissions

## 🔧 Remaining Components (3)

### 1. **Attribution Processor Worker** (PRIORITY: HIGH)
**Purpose**: Process order completions and attribute them to campaigns

**Key Requirements**:
- Subscribe to `order.completed` events via EventBus
- Match UTM parameters from customer session
- Update campaign conversion metrics
- Calculate attribution windows (1-day, 7-day, 28-day)
- Update ROI/ROAS in real-time

**References to Use**:
```javascript
// EventBus subscription pattern from:
- src/events/EventBus.js (Bull queue setup)
- EventBus.subscribe() method pattern

// Attribution logic from:
- src/services/adbuilder/attribution.service.js
- AttributionService.trackConversion() method

// Campaign metrics update from:
- src/models/Campaign.js (ticketAttribution schema)
- Campaign.calculateROI() method

// Order/Transaction model:
- Referenced as TicketTransaction in attribution service
- Has _eventUTM field for UTM tracking
```

### 2. **Meta Webhook Handler** (PRIORITY: MEDIUM)
**Purpose**: Receive real-time updates from Meta about campaigns

**Key Requirements**:
- Webhook signature verification using crypto
- Handle campaign status changes
- Process budget alerts
- Policy violation notifications
- Ad approval/rejection updates

**References to Use**:
```javascript
// Webhook signature verification pattern:
- crypto.timingSafeEqual() usage in codebase
- Similar to Bold webhook implementation

// Response formatting:
- src/utils/responseFormatter.js
- ResponseFormatter.success() and .error()

// Required endpoints:
POST /api/v1/webhooks/meta
POST /api/v1/webhooks/meta/verify

// Environment variables needed:
META_WEBHOOK_SECRET=your_webhook_secret
```

### 3. **Campaign Templates** (PRIORITY: LOW)
**Purpose**: Allow saving and reusing campaign configurations

**Key Requirements**:
- Schema based on Campaign model
- Organization-scoped templates
- Pre-configured targeting and budgets
- Template categories (e.g., "Festival", "Club Night")

**References to Use**:
```javascript
// Base schema structure from:
- src/models/Campaign.js (copy relevant fields)
- Remove execution-specific fields (metrics, status)

// Organization scoping pattern from:
- All models use organizationId for multi-tenancy

// CRUD service pattern from:
- src/services/adbuilder/campaign.service.js
```

## 📚 Key Implementation Patterns to Follow

### 1. **Service Pattern**
```javascript
class ServiceName {
  constructor() {
    // Singleton pattern
  }
  
  async method() {
    try {
      // Use mongoose sessions for transactions
      const session = await mongoose.startSession();
      await session.withTransaction(async () => {
        // Operation logic
      });
    } catch (error) {
      // Use createError from http-errors
      throw createError(statusCode, message);
    }
  }
}

module.exports = new ServiceName();
```

### 2. **Worker Pattern**
```javascript
const Bull = require('bull');

class WorkerName {
  constructor() {
    this.queue = new Bull('queue-name', {
      redis: process.env.REDIS_URL,
      defaultJobOptions: {
        removeOnComplete: true,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 }
      }
    });
    this.setupWorker();
  }
  
  setupWorker() {
    this.queue.process(async (job) => {
      // Process job
    });
  }
}
```

### 3. **API Route Pattern**
```javascript
router.post('/endpoint',
  authenticate,
  checkPermission('permission:name'),
  async (req, res) => {
    try {
      const result = await service.method(req.body);
      res.json(ResponseFormatter.success(result, 'Success message'));
    } catch (error) {
      res.status(error.status || 500).json(ResponseFormatter.error(error));
    }
  }
);
```

## 🔑 Critical Integration Points

### For Attribution Processor:
1. **EventBus Integration**
   - Subscribe to: `order.completed`, `order.updated`
   - Publish: `campaign.conversion`, `attribution.processed`

2. **Session/Cookie Data**
   - Read: `req.session.utmParams`
   - Cookie: `sonik_session`, `sonik_visitor`

3. **Database Updates**
   - Campaign: Update ticketAttribution metrics
   - Order: Mark as attributed
   - Customer: Link to campaign

### For Webhook Handler:
1. **Security**
   - Verify: `X-Hub-Signature-256` header
   - Use: `crypto.timingSafeEqual()`
   - Secret: `process.env.META_WEBHOOK_SECRET`

2. **Event Types**
   - `campaigns`: Status changes
   - `adsets`: Budget updates
   - `ads`: Approval status

### For Campaign Templates:
1. **Schema Design**
   - Include: audience, budget, schedule configs
   - Exclude: metrics, IDs, timestamps
   - Add: category, tags, usage count

## 🚀 Quick Implementation Checklist

### Attribution Processor Worker:
- [ ] Create `src/workers/attribution-processor.worker.js`
- [ ] Set up EventBus subscriptions
- [ ] Implement conversion tracking logic
- [ ] Add attribution window calculations
- [ ] Update campaign ROI metrics
- [ ] Add to worker initialization

### Meta Webhook Handler:
- [ ] Create `src/routes/webhooks/meta.routes.js`
- [ ] Implement signature verification
- [ ] Add webhook event processors
- [ ] Create verification endpoint
- [ ] Update campaign status handler
- [ ] Add to route registration

### Campaign Templates:
- [ ] Create `src/models/CampaignTemplate.js`
- [ ] Add template service methods
- [ ] Create CRUD endpoints
- [ ] Add template selection to wizard
- [ ] Implement usage tracking

## 📊 Success Metrics

When complete, the system should:
1. **Attribution**: Track 95%+ of campaign-driven purchases
2. **Sync**: Update metrics every 15 minutes reliably
3. **Webhooks**: Process events in < 500ms
4. **Templates**: Reduce campaign creation time by 50%
5. **ROI**: Show accurate ROAS within 1% margin

## 🎯 Final Integration

Once all components are complete:
1. **Test end-to-end flow**: Campaign → Ad → Click → Purchase → Attribution
2. **Monitor performance**: Worker health, API latency, attribution accuracy
3. **Document API**: Update Swagger/OpenAPI specifications
4. **Deploy gradually**: Feature flag for organization rollout