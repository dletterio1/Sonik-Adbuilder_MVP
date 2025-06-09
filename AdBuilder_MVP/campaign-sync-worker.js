// src/workers/campaign-sync.worker.js
const Bull = require('bull');
const mongoose = require('mongoose');
const Campaign = require('../models/Campaign');
const MetaConnection = require('../models/MetaConnection');
const { redis } = require('../services/redis.service');
const metaCampaignService = require('../services/adbuilder/meta-campaign.service');
const axios = require('axios');

/**
 * Campaign Sync Worker
 * Synchronizes campaign metrics from Meta Marketing API
 */
class CampaignSyncWorker {
  constructor() {
    this.queue = new Bull('campaign-sync', {
      redis: process.env.REDIS_URL,
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: false,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000
        }
      }
    });

    this.metaApiVersion = 'v18.0';
    this.baseUrl = `https://graph.facebook.com/${this.metaApiVersion}`;
    this.batchSize = 50; // Process campaigns in batches
    this.syncInterval = 15 * 60 * 1000; // 15 minutes
    
    this.setupWorker();
  }

  /**
   * Setup queue processor and scheduled jobs
   */
  setupWorker() {
    // Process sync jobs
    this.queue.process('sync-campaigns', this.batchSize, async (job) => {
      return await this.processSyncJob(job.data);
    });

    // Process single campaign sync
    this.queue.process('sync-single-campaign', async (job) => {
      return await this.syncSingleCampaign(job.data.campaignId);
    });

    // Setup recurring sync job
    this.queue.add('sync-campaigns', {}, {
      repeat: {
        every: this.syncInterval
      }
    });

    // Queue event handlers
    this.queue.on('completed', (job, result) => {
      console.log(`Campaign sync job ${job.id} completed:`, result);
    });

    this.queue.on('failed', (job, err) => {
      console.error(`Campaign sync job ${job.id} failed:`, err);
      this.handleFailedJob(job, err);
    });

    // Health check
    this.queue.on('error', (error) => {
      console.error('Campaign sync queue error:', error);
    });

    console.log('Campaign sync worker initialized');
  }

  /**
   * Process batch sync job
   * @param {Object} jobData - Job data
   * @returns {Promise<Object>} Sync results
   */
  async processSyncJob(jobData) {
    const startTime = Date.now();
    const results = {
      processed: 0,
      successful: 0,
      failed: 0,
      errors: []
    };

    try {
      // Find campaigns needing sync
      const campaigns = await Campaign.findNeedingSync(this.batchSize);
      
      console.log(`Found ${campaigns.length} campaigns needing sync`);

      // Group campaigns by Meta connection
      const campaignsByConnection = this.groupCampaignsByConnection(campaigns);

      // Process each connection's campaigns
      for (const [connectionId, connectionCampaigns] of campaignsByConnection) {
        try {
          const connection = await MetaConnection.findById(connectionId);
          if (!connection || connection.status !== 'active') {
            console.warn(`Skipping inactive connection: ${connectionId}`);
            continue;
          }

          // Check token expiry
          if (new Date(connection.tokenExpiresAt) <= new Date()) {
            console.warn(`Token expired for connection: ${connectionId}`);
            await this.markConnectionExpired(connectionId);
            continue;
          }

          // Sync campaigns for this connection
          await this.syncCampaignsForConnection(
            connection,
            connectionCampaigns,
            results
          );
        } catch (error) {
          console.error(`Error processing connection ${connectionId}:`, error);
          results.errors.push({
            connectionId,
            error: error.message
          });
        }
      }

      // Update overall sync metrics
      await this.updateSyncMetrics(results);

      const duration = Date.now() - startTime;
      console.log(`Campaign sync completed in ${duration}ms:`, results);

      return results;
    } catch (error) {
      console.error('Campaign sync job error:', error);
      throw error;
    }
  }

  /**
   * Sync campaigns for a specific Meta connection
   * @param {Object} connection - Meta connection
   * @param {Array} campaigns - Campaigns to sync
   * @param {Object} results - Results accumulator
   */
  async syncCampaignsForConnection(connection, campaigns, results) {
    const accessToken = connection.accessToken;
    const campaignIds = campaigns.map(c => c.metaCampaignId).filter(Boolean);

    if (campaignIds.length === 0) {
      console.warn('No Meta campaign IDs found');
      return;
    }

    try {
      // Batch request for campaign insights
      const insights = await this.fetchCampaignInsights(campaignIds, accessToken);
      
      // Process each campaign
      for (const campaign of campaigns) {
        results.processed++;

        try {
          const campaignInsights = insights[campaign.metaCampaignId];
          
          if (!campaignInsights) {
            console.warn(`No insights found for campaign ${campaign._id}`);
            continue;
          }

          await this.updateCampaignMetrics(campaign, campaignInsights);
          results.successful++;
        } catch (error) {
          console.error(`Error updating campaign ${campaign._id}:`, error);
          results.failed++;
          results.errors.push({
            campaignId: campaign._id,
            error: error.message
          });
        }
      }
    } catch (error) {
      // Handle rate limiting
      if (error.response?.status === 429) {
        console.warn('Meta API rate limit hit, backing off...');
        await this.handleRateLimit(connection, campaigns);
      } else {
        throw error;
      }
    }
  }

  /**
   * Fetch campaign insights from Meta API
   * @param {Array} campaignIds - Meta campaign IDs
   * @param {String} accessToken - Access token
   * @returns {Promise<Object>} Campaign insights keyed by ID
   */
  async fetchCampaignInsights(campaignIds, accessToken) {
    const insights = {};
    const fields = [
      'campaign_id',
      'impressions',
      'clicks',
      'spend',
      'reach',
      'frequency',
      'ctr',
      'cpm',
      'cpp',
      'actions',
      'action_values',
      'cost_per_action_type'
    ].join(',');

    // Batch API request
    const batch = campaignIds.map(id => ({
      method: 'GET',
      relative_url: `${id}/insights?fields=${fields}&date_preset=lifetime`
    }));

    try {
      const response = await axios.post(
        `${this.baseUrl}/`,
        {
          batch: JSON.stringify(batch),
          access_token: accessToken
        }
      );

      // Process batch response
      response.data.forEach((item, index) => {
        if (item.code === 200) {
          const data = JSON.parse(item.body);
          if (data.data && data.data.length > 0) {
            insights[campaignIds[index]] = data.data[0];
          }
        }
      });

      return insights;
    } catch (error) {
      console.error('Error fetching campaign insights:', error);
      throw error;
    }
  }

  /**
   * Update campaign metrics in database
   * @param {Object} campaign - Campaign document
   * @param {Object} insights - Meta insights data
   */
  async updateCampaignMetrics(campaign, insights) {
    const session = await mongoose.startSession();

    try {
      await session.withTransaction(async () => {
        // Parse Meta metrics
        const metrics = {
          impressions: parseInt(insights.impressions || 0),
          clicks: parseInt(insights.clicks || 0),
          spend: parseFloat(insights.spend || 0) * 100, // Convert to cents
          reach: parseInt(insights.reach || 0),
          frequency: parseFloat(insights.frequency || 0),
          ctr: parseFloat(insights.ctr || 0),
          cpm: parseFloat(insights.cpm || 0) * 100, // Convert to cents
          cpp: parseFloat(insights.cpp || 0) * 100, // Convert to cents
          lastSyncedAt: new Date()
        };

        // Extract conversions from actions
        let conversions = 0;
        if (insights.actions) {
          const purchaseAction = insights.actions.find(
            action => action.action_type === 'purchase' || 
                     action.action_type === 'offsite_conversion.fb_pixel_purchase'
          );
          conversions = parseInt(purchaseAction?.value || 0);
        }
        
        metrics.conversions = conversions;

        // Update campaign
        await Campaign.findByIdAndUpdate(
          campaign._id,
          {
            $set: { 
              metrics,
              'statusHistory.$[elem].syncedAt': new Date()
            }
          },
          {
            session,
            arrayFilters: [{ 'elem.status': campaign.status }]
          }
        );

        // Clear cache
        await this.clearCampaignCache(campaign._id);

        // Log successful sync
        console.log(`Synced campaign ${campaign._id}: ${metrics.impressions} impressions, ${metrics.clicks} clicks`);
      });
    } catch (error) {
      console.error(`Error updating campaign metrics for ${campaign._id}:`, error);
      throw error;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Sync single campaign on demand
   * @param {String} campaignId - Campaign ID
   * @returns {Promise<Object>} Sync result
   */
  async syncSingleCampaign(campaignId) {
    try {
      const campaign = await Campaign.findById(campaignId)
        .populate('metaConnectionId');

      if (!campaign) {
        throw new Error('Campaign not found');
      }

      if (!campaign.metaCampaignId) {
        throw new Error('Campaign not published to Meta');
      }

      const connection = campaign.metaConnectionId;
      if (!connection || connection.status !== 'active') {
        throw new Error('Meta connection not active');
      }

      // Fetch insights
      const insights = await this.fetchCampaignInsights(
        [campaign.metaCampaignId],
        connection.accessToken
      );

      const campaignInsights = insights[campaign.metaCampaignId];
      if (!campaignInsights) {
        throw new Error('No insights available');
      }

      // Update metrics
      await this.updateCampaignMetrics(campaign, campaignInsights);

      return {
        success: true,
        campaignId: campaign._id,
        lastSynced: new Date()
      };
    } catch (error) {
      console.error(`Error syncing single campaign ${campaignId}:`, error);
      throw error;
    }
  }

  /**
   * Handle rate limiting with exponential backoff
   * @param {Object} connection - Meta connection
   * @param {Array} campaigns - Campaigns to retry
   */
  async handleRateLimit(connection, campaigns) {
    const retryAfter = 60; // Default 60 seconds
    
    // Mark campaigns for retry
    for (const campaign of campaigns) {
      await this.queue.add(
        'sync-single-campaign',
        { campaignId: campaign._id },
        {
          delay: retryAfter * 1000,
          attempts: 5,
          backoff: {
            type: 'exponential',
            delay: 10000
          }
        }
      );
    }

    // Log rate limit event
    console.warn(`Rate limited for connection ${connection._id}, retrying ${campaigns.length} campaigns after ${retryAfter}s`);
  }

  /**
   * Handle failed sync jobs
   * @param {Object} job - Failed job
   * @param {Error} error - Error that caused failure
   */
  async handleFailedJob(job, error) {
    // Log to monitoring service
    console.error('Campaign sync job failed:', {
      jobId: job.id,
      attempts: job.attemptsMade,
      error: error.message,
      data: job.data
    });

    // If this was a single campaign sync, notify
    if (job.name === 'sync-single-campaign') {
      const { campaignId } = job.data;
      
      // Update campaign with error status
      await Campaign.findByIdAndUpdate(campaignId, {
        $push: {
          statusHistory: {
            status: 'sync_error',
            changedAt: new Date(),
            reason: `Sync failed: ${error.message}`
          }
        }
      });
    }

    // TODO: Send alert if critical campaigns fail repeatedly
  }

  /**
   * Group campaigns by Meta connection
   * @param {Array} campaigns - Campaigns to group
   * @returns {Map} Campaigns grouped by connection ID
   */
  groupCampaignsByConnection(campaigns) {
    const grouped = new Map();
    
    for (const campaign of campaigns) {
      const connectionId = campaign.metaConnectionId.toString();
      
      if (!grouped.has(connectionId)) {
        grouped.set(connectionId, []);
      }
      
      grouped.get(connectionId).push(campaign);
    }
    
    return grouped;
  }

  /**
   * Mark Meta connection as expired
   * @param {String} connectionId - Connection ID
   */
  async markConnectionExpired(connectionId) {
    await MetaConnection.findByIdAndUpdate(connectionId, {
      status: 'expired',
      statusChangedAt: new Date()
    });
  }

  /**
   * Update overall sync metrics
   * @param {Object} results - Sync results
   */
  async updateSyncMetrics(results) {
    const metricsKey = 'campaign:sync:metrics';
    const today = new Date().toISOString().split('T')[0];
    
    await redis.hincrby(`${metricsKey}:${today}`, 'processed', results.processed);
    await redis.hincrby(`${metricsKey}:${today}`, 'successful', results.successful);
    await redis.hincrby(`${metricsKey}:${today}`, 'failed', results.failed);
    
    // Set expiry to 7 days
    await redis.expire(`${metricsKey}:${today}`, 7 * 24 * 60 * 60);
  }

  /**
   * Clear campaign cache
   * @param {String} campaignId - Campaign ID
   */
  async clearCampaignCache(campaignId) {
    const cacheKeys = [
      `campaign:${campaignId}`,
      `campaign:metrics:${campaignId}`,
      `campaign:activity:${campaignId}`
    ];
    
    for (const key of cacheKeys) {
      await redis.del(key);
    }
  }

  /**
   * Start the worker
   */
  start() {
    console.log('Starting campaign sync worker...');
    // Queue is automatically started when created
  }

  /**
   * Stop the worker gracefully
   */
  async stop() {
    console.log('Stopping campaign sync worker...');
    await this.queue.close();
  }

  /**
   * Get worker health status
   * @returns {Promise<Object>} Health status
   */
  async getHealth() {
    const [waiting, active, completed, failed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount()
    ]);

    return {
      status: 'healthy',
      queue: {
        waiting,
        active,
        completed,
        failed
      },
      lastSync: await redis.get('campaign:sync:last'),
      uptime: process.uptime()
    };
  }
}

// Export singleton instance
module.exports = new CampaignSyncWorker();