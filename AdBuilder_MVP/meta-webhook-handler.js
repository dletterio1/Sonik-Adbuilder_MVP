// src/routes/webhooks/meta.routes.js
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Campaign = require('../../models/Campaign');
const MetaConnection = require('../../models/MetaConnection');
const EventBus = require('../../events/EventBus');
const { ResponseFormatter } = require('../../utils/responseFormatter');
const { redis } = require('../../services/redis.service');
const createError = require('http-errors');

/**
 * Verify webhook signature from Meta
 * @param {Object} req - Express request
 * @returns {Boolean} Whether signature is valid
 */
function verifyWebhookSignature(req) {
  const signature = req.headers['x-hub-signature-256'];
  
  if (!signature) {
    return false;
  }

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

/**
 * @route GET /api/v1/webhooks/meta
 * @desc Webhook verification endpoint for Meta
 * @access Public
 */
router.get('/meta', (req, res) => {
  try {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    
    console.log('Meta webhook verification request:', { mode, token: token ? 'present' : 'missing' });
    
    if (mode === 'subscribe' && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
      console.log('Meta webhook verified successfully');
      res.status(200).send(challenge);
    } else {
      console.error('Meta webhook verification failed');
      res.sendStatus(403);
    }
  } catch (error) {
    console.error('Meta webhook verification error:', error);
    res.sendStatus(500);
  }
});

/**
 * @route POST /api/v1/webhooks/meta
 * @desc Main webhook endpoint for Meta updates
 * @access Public (with signature verification)
 */
router.post('/meta', async (req, res) => {
  try {
    // Verify webhook signature
    if (!verifyWebhookSignature(req)) {
      console.error('Invalid Meta webhook signature');
      return res.status(401).json(
        ResponseFormatter.error(new Error('Invalid signature'), 401)
      );
    }
    
    const { object, entry } = req.body;
    
    // Acknowledge receipt immediately
    res.sendStatus(200);
    
    // Process different object types
    if (object === 'ad_account') {
      await processAdAccountWebhook(entry);
    } else if (object === 'page') {
      await processPageWebhook(entry);
    } else {
      console.log('Unhandled webhook object type:', object);
    }
    
  } catch (error) {
    console.error('Meta webhook error:', error);
    // Still return 200 to prevent Meta from retrying
    res.sendStatus(200);
  }
});

/**
 * Process ad account webhook events
 * @param {Array} entries - Webhook entries
 */
async function processAdAccountWebhook(entries) {
  for (const entry of entries) {
    try {
      const { id: adAccountId, changes } = entry;
      
      for (const change of changes) {
        const eventKey = `webhook:meta:processed:${change.value.id || crypto.randomBytes(8).toString('hex')}`;
        
        // Check if already processed
        const isProcessed = await redis.get(eventKey);
        if (isProcessed) {
          console.log('Webhook event already processed:', eventKey);
          continue;
        }
        
        // Mark as processed (1 hour TTL)
        await redis.setex(eventKey, 3600, '1');
        
        switch (change.field) {
          case 'campaigns':
            await handleCampaignChange(adAccountId, change.value);
            break;
            
          case 'ads':
            await handleAdChange(adAccountId, change.value);
            break;
            
          case 'ad_account':
            await handleAccountChange(adAccountId, change.value);
            break;
            
          case 'ad_account_invalid':
            await handleAccountInvalid(adAccountId, change.value);
            break;
            
          default:
            console.log('Unhandled change field:', change.field);
        }
      }
    } catch (error) {
      console.error('Error processing ad account webhook entry:', error);
    }
  }
}

/**
 * Handle campaign status changes
 * @param {String} adAccountId - Ad account ID
 * @param {Object} data - Change data
 */
async function handleCampaignChange(adAccountId, data) {
  try {
    const { campaign_id, status, updated_time } = data;
    
    if (!campaign_id) return;
    
    // Find campaign by Meta campaign ID
    const campaign = await Campaign.findOne({
      metaCampaignId: campaign_id,
      metaAdAccountId: adAccountId
    });
    
    if (!campaign) {
      console.log(`Campaign not found for Meta ID: ${campaign_id}`);
      return;
    }
    
    // Map Meta status to our status
    const statusMap = {
      'ACTIVE': 'active',
      'PAUSED': 'paused',
      'DELETED': 'completed',
      'ARCHIVED': 'completed'
    };
    
    const newStatus = statusMap[status] || campaign.status;
    
    // Update status if changed
    if (campaign.status !== newStatus) {
      campaign.updateStatus(newStatus, null, 'Updated via Meta webhook');
      
      // Update last sync time
      campaign.metrics.lastSyncedAt = new Date(updated_time || Date.now());
      
      await campaign.save();
      
      // Publish status change event
      await EventBus.publish('campaign.status.changed', {
        campaignId: campaign._id,
        oldStatus: campaign.status,
        newStatus,
        source: 'meta_webhook'
      });
      
      console.log(`Campaign ${campaign._id} status updated to ${newStatus}`);
    }
  } catch (error) {
    console.error('Error handling campaign change:', error);
  }
}

/**
 * Handle ad approval/rejection
 * @param {String} adAccountId - Ad account ID
 * @param {Object} data - Change data
 */
async function handleAdChange(adAccountId, data) {
  try {
    const { ad_id, effective_status, review_feedback } = data;
    
    if (!ad_id) return;
    
    // Find campaign with this ad
    const campaign = await Campaign.findOne({
      metaAdAccountId: adAccountId,
      'creatives.metaCreativeId': ad_id
    });
    
    if (!campaign) {
      console.log(`Campaign not found for ad ID: ${ad_id}`);
      return;
    }
    
    // Update creative status
    const creative = campaign.creatives.find(c => c.metaCreativeId === ad_id);
    if (creative) {
      creative.status = effective_status;
      
      // Handle disapproved ads
      if (effective_status === 'DISAPPROVED' && review_feedback) {
        campaign.lastError = {
          message: `Ad disapproved: ${review_feedback.join(', ')}`,
          code: 'AD_DISAPPROVED',
          timestamp: new Date(),
          details: { ad_id, review_feedback }
        };
        
        // Update campaign status if all ads are disapproved
        const allDisapproved = campaign.creatives.every(c => c.status === 'DISAPPROVED');
        if (allDisapproved) {
          campaign.updateStatus('error', null, 'All ads disapproved');
        }
      }
      
      await campaign.save();
      
      console.log(`Ad ${ad_id} status updated to ${effective_status}`);
    }
  } catch (error) {
    console.error('Error handling ad change:', error);
  }
}

/**
 * Handle ad account status changes
 * @param {String} adAccountId - Ad account ID
 * @param {Object} data - Change data
 */
async function handleAccountChange(adAccountId, data) {
  try {
    const { account_status, disable_reason } = data;
    
    // Update MetaConnection status
    const connection = await MetaConnection.findOne({
      'adAccounts.id': adAccountId
    });
    
    if (!connection) {
      console.log(`MetaConnection not found for ad account: ${adAccountId}`);
      return;
    }
    
    // Update ad account status
    const adAccount = connection.adAccounts.find(acc => acc.id === adAccountId);
    if (adAccount) {
      adAccount.account_status = account_status;
      
      // If account is disabled, update connection status
      if (account_status === 2) { // Disabled
        connection.status = 'disconnected';
        connection.disconnectedAt = new Date();
        
        // Pause all active campaigns
        await Campaign.updateMany(
          {
            metaAdAccountId: adAccountId,
            status: 'active'
          },
          {
            $set: {
              status: 'paused',
              'lastError.message': `Ad account disabled: ${disable_reason || 'Unknown reason'}`,
              'lastError.code': 'ACCOUNT_DISABLED',
              'lastError.timestamp': new Date()
            }
          }
        );
      }
      
      await connection.save();
      
      console.log(`Ad account ${adAccountId} status updated to ${account_status}`);
    }
  } catch (error) {
    console.error('Error handling account change:', error);
  }
}

/**
 * Handle invalid ad account webhook
 * @param {String} adAccountId - Ad account ID  
 * @param {Object} data - Change data
 */
async function handleAccountInvalid(adAccountId, data) {
  try {
    console.error('Ad account marked as invalid:', adAccountId, data);
    
    // Mark connection as expired
    await MetaConnection.updateOne(
      { 'adAccounts.id': adAccountId },
      {
        $set: {
          status: 'expired',
          'lastError': {
            message: 'Ad account access invalidated',
            code: 'ACCOUNT_INVALID',
            timestamp: new Date(),
            details: data
          }
        }
      }
    );
    
    // Notify via EventBus
    await EventBus.publish('meta.connection.expired', {
      adAccountId,
      reason: 'account_invalid'
    });
    
  } catch (error) {
    console.error('Error handling invalid account:', error);
  }
}

/**
 * Process page webhook events
 * @param {Array} entries - Webhook entries
 */
async function processPageWebhook(entries) {
  // Handle page-related webhooks if needed
  console.log('Page webhook received:', entries.length, 'entries');
}

module.exports = router;