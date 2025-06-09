// =====================================
// src/workers/index.js
// =====================================
// Main worker initialization file

const attributionProcessor = require('./attribution-processor.worker');
const campaignSync = require('./campaign-sync.worker');

/**
 * Initialize all background workers
 */
async function initializeWorkers() {
  try {
    console.log('Initializing background workers...');

    // Start attribution processor
    attributionProcessor.start();
    console.log('✓ Attribution processor worker started');

    // Start campaign sync worker  
    campaignSync.start();
    console.log('✓ Campaign sync worker started');

    // Setup graceful shutdown
    process.on('SIGTERM', async () => {
      console.log('SIGTERM received, shutting down workers...');
      await shutdownWorkers();
    });

    process.on('SIGINT', async () => {
      console.log('SIGINT received, shutting down workers...');
      await shutdownWorkers();
    });

  } catch (error) {
    console.error('Failed to initialize workers:', error);
    process.exit(1);
  }
}

/**
 * Shutdown all workers gracefully
 */
async function shutdownWorkers() {
  try {
    await Promise.all([
      attributionProcessor.stop(),
      campaignSync.stop()
    ]);
    console.log('All workers shut down successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error shutting down workers:', error);
    process.exit(1);
  }
}

/**
 * Get health status of all workers
 */
async function getWorkersHealth() {
  try {
    const [attributionHealth, syncHealth] = await Promise.all([
      attributionProcessor.getHealth(),
      campaignSync.getHealth()
    ]);

    return {
      attribution: attributionHealth,
      campaignSync: syncHealth,
      overall: 'healthy'
    };
  } catch (error) {
    return {
      overall: 'unhealthy',
      error: error.message
    };
  }
}

module.exports = {
  initializeWorkers,
  shutdownWorkers,
  getWorkersHealth
};

// =====================================
// src/routes/webhooks/index.js
// =====================================
// Webhook routes aggregator

const express = require('express');
const router = express.Router();
const metaWebhookRoutes = require('./meta.routes');

// Register webhook routes
router.use('/', metaWebhookRoutes);

// Health check endpoint for webhooks
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    webhooks: {
      meta: 'active'
    }
  });
});

module.exports = router;

// =====================================
// src/server.js (modifications)
// =====================================
// Add these modifications to your main server file

const { initializeWorkers } = require('./workers');
const webhookRoutes = require('./routes/webhooks');
const templateRoutes = require('./routes/adbuilder/template.routes');

// ... existing code ...

// Register webhook routes (no auth required)
app.use('/api/v1/webhooks', webhookRoutes);

// Register template routes (requires auth)
app.use('/api/v1/advertising/templates', authenticate, templateRoutes);

// ... existing code ...

// Initialize workers after database connection
mongoose.connection.once('open', async () => {
  console.log('Connected to MongoDB');
  
  // Initialize background workers
  if (process.env.ENABLE_WORKERS === 'true') {
    await initializeWorkers();
  }
});

// =====================================
// .env (additions)
// =====================================
// Add these environment variables to your .env file

# Attribution Worker
ATTRIBUTION_WINDOW_DAYS=28
ATTRIBUTION_PROCESSING_BATCH_SIZE=100

# Meta Webhooks
META_WEBHOOK_SECRET=your_webhook_secret_from_meta
META_WEBHOOK_VERIFY_TOKEN=your_verify_token_for_meta
META_WEBHOOK_ENDPOINT=https://api.sonik.app/api/v1/webhooks/meta

# Campaign Templates
DEFAULT_TEMPLATE_BUDGET_MIN=250000
DEFAULT_TEMPLATE_BUDGET_MAX=5000000

# Workers
ENABLE_WORKERS=true

// =====================================
// src/scripts/register-webhook.js
// =====================================
// Script to register webhook with Meta

const axios = require('axios');
require('dotenv').config();

async function registerMetaWebhook() {
  try {
    const { META_APP_ID, META_APP_SECRET, META_WEBHOOK_ENDPOINT, META_WEBHOOK_VERIFY_TOKEN } = process.env;

    // Get app access token
    const tokenResponse = await axios.get(
      `https://graph.facebook.com/oauth/access_token?client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&grant_type=client_credentials`
    );

    const accessToken = tokenResponse.data.access_token;

    // Subscribe to webhook events
    const subscribeResponse = await axios.post(
      `https://graph.facebook.com/${META_APP_ID}/subscriptions`,
      {
        object: 'ad_account',
        callback_url: META_WEBHOOK_ENDPOINT,
        fields: 'campaigns,ads,ad_account,ad_account_invalid',
        verify_token: META_WEBHOOK_VERIFY_TOKEN,
        access_token: accessToken
      }
    );

    console.log('Webhook registered successfully:', subscribeResponse.data);

  } catch (error) {
    console.error('Failed to register webhook:', error.response?.data || error.message);
  }
}

// Run if called directly
if (require.main === module) {
  registerMetaWebhook();
}

module.exports = { registerMetaWebhook };

// =====================================
// src/scripts/seed-templates.js
// =====================================
// Script to seed initial campaign templates

const mongoose = require('mongoose');
const CampaignTemplate = require('../models/CampaignTemplate');
require('dotenv').config();

const defaultTemplates = [
  {
    name: 'Festival Launch',
    description: 'Perfect for multi-day music festivals and large events',
    category: 'festival',
    tags: ['music', 'outdoor', 'multiday'],
    config: {
      objective: 'OUTCOME_TRAFFIC',
      budget: {
        daily: { min: 500000, max: 2000000 },
        lifetime: { min: 5000000, max: 20000000 },
        currency: 'COP'
      },
      duration: { min: 14, max: 60, recommended: 30 },
      audience: {
        age_min: 18,
        age_max: 35,
        interests: [
          { id: '6003139266461', name: 'Music festivals' },
          { id: '6003107902433', name: 'Electronic music' }
        ]
      }
    },
    benchmarks: {
      ctr: { min: 1.5, max: 3.5, average: 2.5 },
      conversionRate: { min: 2, max: 5, average: 3.5 }
    },
    isPublic: true
  },
  {
    name: 'Club Night Promotion',
    description: 'Drive ticket sales for weekly club events',
    category: 'club_night',
    tags: ['nightlife', 'weekly', 'local'],
    config: {
      objective: 'OUTCOME_SALES',
      budget: {
        daily: { min: 250000, max: 1000000 },
        lifetime: { min: 1000000, max: 5000000 },
        currency: 'COP'
      },
      duration: { min: 3, max: 7, recommended: 5 },
      audience: {
        age_min: 21,
        age_max: 35,
        locations: [{
          key: 'Bogotá',
          name: 'Bogotá, Colombia',
          type: 'city',
          radius: 25,
          distance_unit: 'kilometer'
        }]
      }
    },
    isPublic: true
  },
  {
    name: 'Wellness Workshop',
    description: 'Attract attendees to yoga, meditation, and wellness events',
    category: 'wellness',
    tags: ['wellness', 'yoga', 'meditation'],
    config: {
      objective: 'OUTCOME_LEADS',
      budget: {
        daily: { min: 150000, max: 500000 },
        currency: 'COP'
      },
      audience: {
        age_min: 25,
        age_max: 55,
        genders: [2], // Female
        interests: [
          { id: '6003631561427', name: 'Yoga' },
          { id: '6003589241117', name: 'Meditation' }
        ]
      }
    },
    isPublic: true
  }
];

async function seedTemplates() {
  try {
    await mongoose.connect(process.env.MONGODB_URL);
    console.log('Connected to MongoDB');

    // Get system user ID (you might need to adjust this)
    const systemUserId = new mongoose.Types.ObjectId('000000000000000000000000');

    for (const templateData of defaultTemplates) {
      const existing = await CampaignTemplate.findOne({ 
        name: templateData.name,
        isPublic: true 
      });

      if (!existing) {
        const template = new CampaignTemplate({
          ...templateData,
          organizationId: systemUserId, // System templates
          createdBy: systemUserId,
          isActive: true
        });

        await template.save();
        console.log(`Created template: ${template.name}`);
      } else {
        console.log(`Template already exists: ${templateData.name}`);
      }
    }

    console.log('Template seeding completed');
    process.exit(0);

  } catch (error) {
    console.error('Error seeding templates:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  seedTemplates();
}

module.exports = { seedTemplates };

// =====================================
// package.json (script additions)
// =====================================
// Add these scripts to your package.json

{
  "scripts": {
    // ... existing scripts ...
    "workers:start": "node src/workers/index.js",
    "webhook:register": "node src/scripts/register-webhook.js",
    "templates:seed": "node src/scripts/seed-templates.js"
  }
}