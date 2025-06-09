// src/routes/adbuilder/audience.routes.js
const express = require('express');
const router = express.Router();
const metaAudienceService = require('../../services/adbuilder/meta-audience.service');
const { ResponseFormatter } = require('../../utils/responseFormatter');
const { authenticate } = require('../../middleware/auth');
const { checkPermission } = require('../../middleware/permission');

// All routes require authentication
router.use(authenticate);

/**
 * @route POST /api/v1/advertising/audiences
 * @desc Create a custom audience
 * @access Private - requires advertising:audiences:create permission
 */
router.post('/',
  checkPermission('advertising:audiences:create'),
  async (req, res) => {
    try {
      const { organizationId } = req.user;
      const { name, description, customerFilters, adAccountId } = req.body;

      // Validate required fields
      if (!name || !adAccountId) {
        return res.status(400).json(
          ResponseFormatter.error(new Error('Name and ad account ID are required'), 400)
        );
      }

      // Get customers based on filters
      const customers = await metaAudienceService.getCustomersWithConsent(
        organizationId,
        customerFilters || {}
      );

      if (customers.length === 0) {
        return res.status(400).json(
          ResponseFormatter.error(new Error('No customers found with marketing consent'), 400)
        );
      }

      // Hash customer data
      const hashedData = metaAudienceService.hashCustomerData(customers);

      // Create audience
      const audience = await metaAudienceService.createCustomAudience(
        name,
        description,
        hashedData,
        organizationId,
        adAccountId
      );

      res.status(201).json(
        ResponseFormatter.success(audience, 'Custom audience created successfully')
      );
    } catch (error) {
      console.error('Create audience error:', error);
      res.status(error.status || 500).json(ResponseFormatter.error(error));
    }
  }
);

/**
 * @route POST /api/v1/advertising/audiences/lookalike
 * @desc Create a lookalike audience
 * @access Private - requires advertising:audiences:create permission
 */
router.post('/lookalike',
  checkPermission('advertising:audiences:create'),
  async (req, res) => {
    try {
      const { organizationId } = req.user;
      const { sourceAudienceId, country, ratio, adAccountId } = req.body;

      // Validate required fields
      if (!sourceAudienceId || !country || !ratio || !adAccountId) {
        return res.status(400).json(
          ResponseFormatter.error(new Error('All fields are required'), 400)
        );
      }

      const lookalike = await metaAudienceService.createLookalikeAudience(
        sourceAudienceId,
        country,
        ratio,
        organizationId,
        adAccountId
      );

      res.status(201).json(
        ResponseFormatter.success(lookalike, 'Lookalike audience created successfully')
      );
    } catch (error) {
      console.error('Create lookalike error:', error);
      res.status(error.status || 500).json(ResponseFormatter.error(error));
    }
  }
);

/**
 * @route POST /api/v1/advertising/audiences/from-campaign
 * @desc Create audience from high-value campaign customers
 * @access Private - requires advertising:audiences:create permission
 */
router.post('/from-campaign',
  checkPermission('advertising:audiences:create'),
  async (req, res) => {
    try {
      const { organizationId } = req.user;
      const { campaignId, minRevenue, name, adAccountId } = req.body;

      if (!campaignId || !name || !adAccountId) {
        return res.status(400).json(
          ResponseFormatter.error(new Error('Campaign ID, name, and ad account ID are required'), 400)
        );
      }

      // Get high-value customers from campaign
      const customers = await metaAudienceService.getHighValueCustomersFromCampaign(
        campaignId,
        minRevenue || 0
      );

      if (customers.length === 0) {
        return res.status(400).json(
          ResponseFormatter.error(new Error('No qualifying customers found'), 400)
        );
      }

      // Hash customer data
      const hashedData = metaAudienceService.hashCustomerData(customers);

      // Create audience
      const audience = await metaAudienceService.createCustomAudience(
        name,
        `High-value customers from campaign with min revenue ${minRevenue}`,
        hashedData,
        organizationId,
        adAccountId
      );

      res.status(201).json(
        ResponseFormatter.success({
          audience,
          customerCount: customers.length
        }, 'Audience created from campaign customers')
      );
    } catch (error) {
      console.error('Create campaign audience error:', error);
      res.status(error.status || 500).json(ResponseFormatter.error(error));
    }
  }
);

/**
 * @route PUT /api/v1/advertising/audiences/:id
 * @desc Update audience with new customers
 * @access Private - requires advertising:audiences:manage permission
 */
router.put('/:id',
  checkPermission('advertising:audiences:manage'),
  async (req, res) => {
    try {
      const { organizationId } = req.user;
      const { id } = req.params;
      const { customerFilters } = req.body;

      // Get new customers
      const newCustomers = await metaAudienceService.getCustomersWithConsent(
        organizationId,
        customerFilters || {}
      );

      if (newCustomers.length === 0) {
        return res.status(400).json(
          ResponseFormatter.error(new Error('No new customers found'), 400)
        );
      }

      const result = await metaAudienceService.updateAudience(
        id,
        newCustomers,
        organizationId
      );

      res.json(
        ResponseFormatter.success(result, 'Audience updated successfully')
      );
    } catch (error) {
      console.error('Update audience error:', error);
      res.status(error.status || 500).json(ResponseFormatter.error(error));
    }
  }
);

/**
 * @route GET /api/v1/advertising/audiences/:id/size
 * @desc Get audience size estimation
 * @access Private - requires advertising:audiences:view permission
 */
router.get('/:id/size',
  checkPermission('advertising:audiences:view'),
  async (req, res) => {
    try {
      const { organizationId } = req.user;
      const { id } = req.params;

      // Get Meta connection to get access token
      const MetaConnection = require('../../models/MetaConnection');
      const connection = await MetaConnection.findOne({
        organizationId,
        status: 'active'
      });

      if (!connection) {
        return res.status(404).json(
          ResponseFormatter.error(new Error('Meta connection not found'), 404)
        );
      }

      const sizeData = await metaAudienceService.getAudienceSize(
        id,
        connection.accessToken
      );

      res.json(
        ResponseFormatter.success(sizeData, 'Audience size retrieved')
      );
    } catch (error) {
      console.error('Get audience size error:', error);
      res.status(error.status || 500).json(ResponseFormatter.error(error));
    }
  }
);

/**
 * @route DELETE /api/v1/advertising/audiences/:id
 * @desc Delete an audience
 * @access Private - requires advertising:audiences:delete permission
 */
router.delete('/:id',
  checkPermission('advertising:audiences:delete'),
  async (req, res) => {
    try {
      const { organizationId } = req.user;
      const { id } = req.params;

      await metaAudienceService.deleteAudience(id, organizationId);

      res.json(
        ResponseFormatter.success({ deleted: true }, 'Audience deleted successfully')
      );
    } catch (error) {
      console.error('Delete audience error:', error);
      res.status(error.status || 500).json(ResponseFormatter.error(error));
    }
  }
);

module.exports = router;