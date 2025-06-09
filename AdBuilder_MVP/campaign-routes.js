// src/routes/adbuilder/campaign.routes.js
const express = require('express');
const router = express.Router();
const CampaignService = require('../../services/adbuilder/campaign.service');
const ResponseFormatter = require('../../utils/responseFormatter');
const { authenticate } = require('../../middleware/auth');
const { checkPermission } = require('../../middleware/permission');

// All routes require authentication
router.use(authenticate);

/**
 * @route POST /api/v1/advertising/campaigns
 * @desc Create a new campaign
 * @access Private - requires advertising:campaigns:create permission
 */
router.post('/', 
  checkPermission('advertising:campaigns:create'),
  async (req, res) => {
    try {
      const { organizationId, userId } = req.user;
      
      // Validate campaign data
      const validation = CampaignService.validateCampaignData(req.body);
      if (!validation.valid) {
        return res.status(400).json(
          ResponseFormatter.error(new Error(validation.errors.join(', ')), 400)
        );
      }

      const campaign = await CampaignService.createCampaign(
        req.body,
        userId,
        organizationId
      );

      res.status(201).json(
        ResponseFormatter.success(campaign, 'Campaign created successfully')
      );
    } catch (error) {
      console.error('Campaign creation error:', error);
      res.status(error.message.includes('not found') ? 404 : 400).json(
        ResponseFormatter.error(error, error.message.includes('not found') ? 404 : 400)
      );
    }
  }
);

/**
 * @route GET /api/v1/advertising/campaigns
 * @desc Get campaigns for organization
 * @access Private - requires advertising:campaigns:view permission
 */
router.get('/',
  checkPermission('advertising:campaigns:view'),
  async (req, res) => {
    try {
      const { organizationId } = req.user;
      const {
        page = 1,
        limit = 20,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        status,
        eventId,
        startDate,
        endDate
      } = req.query;

      const options = {
        page: parseInt(page),
        limit: parseInt(limit),
        sortBy,
        sortOrder,
        status,
        eventId,
        startDate,
        endDate
      };

      const result = await CampaignService.getCampaigns(
        organizationId,
        {},
        options
      );

      res.json(ResponseFormatter.success(result, 'Campaigns retrieved successfully'));
    } catch (error) {
      console.error('Get campaigns error:', error);
      res.status(500).json(ResponseFormatter.error(error));
    }
  }
);

/**
 * @route GET /api/v1/advertising/campaigns/analytics
 * @desc Get campaign analytics summary
 * @access Private - requires advertising:campaigns:view permission
 */
router.get('/analytics',
  checkPermission('advertising:campaigns:view'),
  async (req, res) => {
    try {
      const { organizationId } = req.user;
      
      const analytics = await CampaignService.getCampaignAnalytics(organizationId);
      
      res.json(ResponseFormatter.success(analytics, 'Analytics retrieved successfully'));
    } catch (error) {
      console.error('Get analytics error:', error);
      res.status(500).json(ResponseFormatter.error(error));
    }
  }
);

/**
 * @route GET /api/v1/advertising/campaigns/:id
 * @desc Get single campaign by ID
 * @access Private - requires advertising:campaigns:view permission
 */
router.get('/:id',
  checkPermission('advertising:campaigns:view'),
  async (req, res) => {
    try {
      const { organizationId } = req.user;
      const { id } = req.params;

      const campaign = await CampaignService.getCampaignById(id, organizationId);

      res.json(ResponseFormatter.success(campaign, 'Campaign retrieved successfully'));
    } catch (error) {
      console.error('Get campaign error:', error);
      res.status(error.message === 'Campaign not found' ? 404 : 500).json(
        ResponseFormatter.error(error, error.message === 'Campaign not found' ? 404 : 500)
      );
    }
  }
);

/**
 * @route GET /api/v1/advertising/campaigns/:id/metrics
 * @desc Get campaign metrics with calculations
 * @access Private - requires advertising:campaigns:view permission
 */
router.get('/:id/metrics',
  checkPermission('advertising:campaigns:view'),
  async (req, res) => {
    try {
      const { organizationId } = req.user;
      const { id } = req.params;

      const metrics = await CampaignService.getCampaignMetrics(id, organizationId);

      res.json(ResponseFormatter.success(metrics, 'Metrics retrieved successfully'));
    } catch (error) {
      console.error('Get metrics error:', error);
      res.status(error.message === 'Campaign not found' ? 404 : 500).json(
        ResponseFormatter.error(error, error.message === 'Campaign not found' ? 404 : 500)
      );
    }
  }
);

/**
 * @route PUT /api/v1/advertising/campaigns/:id
 * @desc Update campaign
 * @access Private - requires advertising:campaigns:manage permission
 */
router.put('/:id',
  checkPermission('advertising:campaigns:manage'),
  async (req, res) => {
    try {
      const { organizationId, userId } = req.user;
      const { id } = req.params;

      const campaign = await CampaignService.updateCampaign(
        id,
        req.body,
        userId,
        organizationId
      );

      res.json(ResponseFormatter.success(campaign, 'Campaign updated successfully'));
    } catch (error) {
      console.error('Update campaign error:', error);
      res.status(400).json(ResponseFormatter.error(error, 400));
    }
  }
);

/**
 * @route DELETE /api/v1/advertising/campaigns/:id
 * @desc Delete campaign (draft only)
 * @access Private - requires advertising:campaigns:manage permission
 */
router.delete('/:id',
  checkPermission('advertising:campaigns:manage'),
  async (req, res) => {
    try {
      const { organizationId } = req.user;
      const { id } = req.params;

      await CampaignService.deleteCampaign(id, organizationId);

      res.json(ResponseFormatter.success(null, 'Campaign deleted successfully'));
    } catch (error) {
      console.error('Delete campaign error:', error);
      res.status(400).json(ResponseFormatter.error(error, 400));
    }
  }
);

/**
 * @route POST /api/v1/advertising/campaigns/:id/pause
 * @desc Pause an active campaign
 * @access Private - requires advertising:campaigns:manage permission
 */
router.post('/:id/pause',
  checkPermission('advertising:campaigns:manage'),
  async (req, res) => {
    try {
      const { organizationId, userId } = req.user;
      const { id } = req.params;
      const { reason } = req.body;

      const campaign = await CampaignService.pauseCampaign(
        id,
        userId,
        organizationId,
        reason
      );

      res.json(ResponseFormatter.success(campaign, 'Campaign paused successfully'));
    } catch (error) {
      console.error('Pause campaign error:', error);
      res.status(400).json(ResponseFormatter.error(error, 400));
    }
  }
);

/**
 * @route POST /api/v1/advertising/campaigns/:id/resume
 * @desc Resume a paused campaign
 * @access Private - requires advertising:campaigns:manage permission
 */
router.post('/:id/resume',
  checkPermission('advertising:campaigns:manage'),
  async (req, res) => {
    try {
      const { organizationId, userId } = req.user;
      const { id } = req.params;

      const campaign = await CampaignService.resumeCampaign(
        id,
        userId,
        organizationId
      );

      res.json(ResponseFormatter.success(campaign, 'Campaign resumed successfully'));
    } catch (error) {
      console.error('Resume campaign error:', error);
      res.status(400).json(ResponseFormatter.error(error, 400));
    }
  }
);

/**
 * @route POST /api/v1/advertising/campaigns/:id/launch
 * @desc Launch a draft campaign (create in Meta)
 * @access Private - requires advertising:campaigns:manage permission
 */
router.post('/:id/launch',
  checkPermission('advertising:campaigns:manage'),
  async (req, res) => {
    try {
      const { organizationId, userId } = req.user;
      const { id } = req.params;

      // Get campaign
      const campaign = await CampaignService.getCampaignById(id, organizationId);
      
      if (campaign.status !== 'draft') {
        return res.status(400).json(
          ResponseFormatter.error(new Error('Only draft campaigns can be launched'), 400)
        );
      }

      // Update status to pending
      await CampaignService.updateCampaignStatus(
        id,
        'pending',
        userId,
        organizationId,
        'Campaign submitted for launch'
      );

      // Note: Actual Meta API call would be made by MetaCampaignService
      // For now, we just update the status
      
      res.json(ResponseFormatter.success(
        { id, status: 'pending' },
        'Campaign submitted for launch. It will be active shortly.'
      ));
    } catch (error) {
      console.error('Launch campaign error:', error);
      res.status(400).json(ResponseFormatter.error(error, 400));
    }
  }
);

/**
 * @route POST /api/v1/advertising/attribution
 * @desc Track attribution event (internal use)
 * @access Public - but validates UTM parameters
 */
router.post('/attribution',
  async (req, res) => {
    try {
      const { utm_campaign, event_type, data } = req.body;

      if (!utm_campaign || !event_type) {
        return res.status(400).json(
          ResponseFormatter.error(new Error('Missing required parameters'), 400)
        );
      }

      const result = await CampaignService.updateAttribution(
        utm_campaign,
        event_type,
        data
      );

      res.json(ResponseFormatter.success(
        { tracked: !!result },
        result ? 'Attribution tracked' : 'No matching campaign found'
      ));
    } catch (error) {
      console.error('Attribution tracking error:', error);
      res.status(500).json(ResponseFormatter.error(error));
    }
  }
);

module.exports = router;