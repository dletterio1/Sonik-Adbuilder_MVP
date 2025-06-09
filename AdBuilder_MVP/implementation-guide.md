# Implementation Guide: Meta Audience Service & Campaign Sync Worker

## 🚀 Quick Start

### 1. Update Customer Model
First, update your Customer model with the marketing consent fields:

```bash
# Run the migration to add marketing consent to existing customers
node scripts/migrations/add-marketing-consent.js
```

### 2. Start the Campaign Sync Worker
Add to your main application startup:

```javascript
// server.js or app.js
const initializeWorkers = require('./src/workers');

mongoose.connection.once('open', () => {
  const workers = initializeWorkers();
  console.log('Background workers started');
});
```

### 3. Register New Routes
Add the audience routes to your API:

```javascript
// src/routes/index.js
const audienceRoutes = require('./adbuilder/audience.routes');
app.use('/api/v1/advertising/audiences', audienceRoutes);
```

## 📋 Feature Usage Examples

### Meta Audience Service

#### Create Custom Audience from Event Attendees
```javascript
// POST /api/v1/advertising/audiences
{
  "name": "Summer Festival 2024 Attendees",
  "description": "All customers who purchased tickets to Summer Festival",
  "adAccountId": "act_123456789",
  "customerFilters": {
    "events": ["eventId123"],
    "purchasedAfter": "2024-01-01"
  }
}
```

#### Create Lookalike Audience
```javascript
// POST /api/v1/advertising/audiences/lookalike
{
  "sourceAudienceId": "23850394851640123",
  "country": "CO",
  "ratio": 1,  // 1% lookalike (most similar)
  "adAccountId": "act_123456789"
}
```

#### Create Audience from High-Value Customers
```javascript
// POST /api/v1/advertising/audiences/from-campaign
{
  "campaignId": "campaign123",
  "minRevenue": 500000,  // 500,000 COP minimum
  "name": "High Value Festival Customers",
  "adAccountId": "act_123456789"
}
```

### Campaign Sync Worker

#### Force Sync Single Campaign
```javascript
// Programmatically trigger sync
const campaignSyncWorker = require('./src/workers/campaign-sync.worker');
await campaignSyncWorker.queue.add('sync-single-campaign', {
  campaignId: 'campaign123'
});
```

#### Monitor Worker Health
```javascript
// GET /api/v1/health/workers
{
  "status": "ok",
  "workers": {
    "campaignSync": {
      "status": "healthy",
      "queue": {
        "waiting": 0,
        "active": 2,
        "completed": 1543,
        "failed": 3
      },
      "lastSync": "2024-03-15T10:30:00Z",
      "uptime": 86400
    }
  }
}
```

## 🔧 Configuration

### Environment Variables
```env
# Meta API Configuration
META_API_VERSION=v18.0
META_APP_ID=your_app_id
META_APP_SECRET=your_app_secret
META_TOKEN_SECRET=your_encryption_secret

# Worker Configuration
CAMPAIGN_SYNC_INTERVAL=900000  # 15 minutes in ms
CAMPAIGN_SYNC_BATCH_SIZE=50
META_API_RETRY_ATTEMPTS=3
META_API_RETRY_DELAY=5000  # 5 seconds

# Redis Configuration
REDIS_URL=redis://localhost:6379
```

### Permission Configuration
Add these permissions to your permission constants:

```javascript
// src/consts/permission.const.js
{
  // ... existing permissions ...
  
  // Advertising Audiences
  'advertising:audiences:create': 'Create advertising audiences',
  'advertising:audiences:view': 'View advertising audiences',
  'advertising:audiences:manage': 'Manage advertising audiences',
  'advertising:audiences:delete': 'Delete advertising audiences',
}
```

## 🏗️ Architecture Decisions

### 1. Data Privacy & Hashing
- All customer PII is SHA256 hashed before sending to Meta
- Hashing happens server-side to ensure consistency
- Colombia phone numbers automatically get +57 prefix

### 2. Batch Processing
- Customer uploads are batched at 10,000 records (Meta's limit)
- Campaign syncs are grouped by Meta connection for efficiency
- Exponential backoff for API rate limit handling

### 3. Caching Strategy
- Audience size cached for 5 minutes
- Audience metadata cached for 24 hours
- Campaign metrics cache cleared after each sync
- Upload progress tracked in Redis

### 4. Error Handling
- Token expiration automatically marks connections as expired
- Failed syncs are retried 3 times with exponential backoff
- Sync errors are logged in campaign document for debugging

## 📊 Performance Considerations

### Campaign Sync Worker
- Processes up to 50 campaigns per batch
- Groups campaigns by connection to minimize API calls
- 15-minute sync interval (configurable)
- Handles ~3,000 campaigns/hour

### Audience Service
- Batch upload supports 1M+ customers
- Progress tracking for large uploads
- Efficient hashing with streaming
- Minimal memory footprint

## 🔍 Monitoring & Debugging

### Key Metrics to Track
1. **Campaign Sync Success Rate**
   ```javascript
   const metrics = await redis.hgetall('campaign:sync:metrics:2024-03-15');
   const successRate = metrics.successful / metrics.processed;
   ```

2. **Audience Upload Progress**
   ```javascript
   const progress = await redis.get('audience:upload:progress:audienceId');
   ```

3. **Token Expiration**
   - Monitor connections with status='expired'
   - Set up alerts for token refresh failures

### Common Issues & Solutions

#### Issue: "Meta connection token expired"
**Solution**: User needs to reconnect their Meta account through OAuth flow

#### Issue: "Audience size shows 0"
**Solution**: Wait 10-15 minutes for Meta to process the audience

#### Issue: "Campaign metrics not updating"
**Solution**: Check Meta connection status and campaign sync worker health

## 🔒 Security Best Practices

1. **Token Encryption**: All Meta access tokens are encrypted at rest
2. **Signature Verification**: Webhook signatures verified with timing-safe comparison
3. **Rate Limiting**: Built-in retry logic respects Meta's rate limits
4. **Audit Logging**: All audience operations logged for compliance

## 📈 Next Steps

With these components implemented, you're ready to:
1. Create targeted custom audiences from your customer base
2. Build lookalike audiences to find similar customers
3. Keep campaign metrics synchronized automatically
4. Track ROI with accurate attribution data

The remaining components (Attribution Processor, Webhook Handler, Campaign Templates) can be added following the same patterns established here.