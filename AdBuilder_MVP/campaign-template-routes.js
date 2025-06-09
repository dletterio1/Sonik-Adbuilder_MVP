// src/routes/adbuilder/template.routes.js
const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/auth');
const { checkPermission } = require('../../middleware/rbac');
const { ResponseFormatter } = require('../../utils/responseFormatter');
const CampaignTemplate = require('../../models/CampaignTemplate');
const campaignService = require('../../services/adbuilder/campaign.service');
const { redis } = require('../../services/redis.service');
const createError = require('http-errors');

/**
 * @route GET /api/v1/advertising/templates
 * @desc Get campaign templates
 * @access Private - requires advertising:campaigns:view permission
 */
router.get('/',
  authenticate,
  checkPermission('advertising:campaigns:view'),
  async (req, res) => {
    try {
      const { organizationId } = req.user;
      const { 
        category, 
        search, 
        tags,
        limit = 20,
        page = 1,
        sortBy = 'usage'
      } = req.query;

      // Check cache
      const cacheKey = `templates:${organizationId}:${category || 'all'}:${page}`;
      const cached = await redis.get(cacheKey);
      
      if (cached && !search && !tags) {
        return res.json(ResponseFormatter.success(
          JSON.parse(cached),
          'Templates retrieved from cache'
        ));
      }

      let templates;
      
      if (search || tags) {
        // Search templates
        templates = await CampaignTemplate.searchTemplates(
          organizationId,
          search,
          { category, tags: tags ? tags.split(',') : [] }
        );
      } else if (category) {
        // Get by category
        templates = await CampaignTemplate.getTemplatesByCategory(
          organizationId,
          category,
          parseInt(limit)
        );
      } else {
        // Get all templates
        const query = {
          $or: [
            { organizationId, isActive: true },
            { isPublic: true, isActive: true }
          ]
        };

        // Determine sort order
        const sortOptions = {
          'usage': { 'usage.count': -1 },
          'recent': { 'usage.lastUsedAt': -1 },
          'name': { name: 1 },
          'created': { createdAt: -1 }
        };

        templates = await CampaignTemplate.find(query)
          .sort(sortOptions[sortBy] || sortOptions.usage)
          .limit(parseInt(limit))
          .skip((parseInt(page) - 1) * parseInt(limit))
          .populate('createdBy', 'name email');
      }

      // Cache results (5 minutes)
      if (!search && !tags) {
        await redis.setex(cacheKey, 300, JSON.stringify(templates));
      }

      res.json(ResponseFormatter.success({
        templates,
        total: templates.length,
        page: parseInt(page),
        limit: parseInt(limit)
      }, 'Templates retrieved successfully'));

    } catch (error) {
      console.error('Get templates error:', error);
      res.status(500).json(ResponseFormatter.error(error));
    }
  }
);

/**
 * @route GET /api/v1/advertising/templates/popular
 * @desc Get popular templates
 * @access Private - requires advertising:campaigns:view permission
 */
router.get('/popular',
  authenticate,
  checkPermission('advertising:campaigns:view'),
  async (req, res) => {
    try {
      const { organizationId } = req.user;
      const { limit = 5 } = req.query;

      const templates = await CampaignTemplate.getPopularTemplates(
        organizationId,
        parseInt(limit)
      );

      res.json(ResponseFormatter.success(
        templates,
        'Popular templates retrieved successfully'
      ));

    } catch (error) {
      console.error('Get popular templates error:', error);
      res.status(500).json(ResponseFormatter.error(error));
    }
  }
);

/**
 * @route GET /api/v1/advertising/templates/recommended
 * @desc Get recommended templates for an event
 * @access Private - requires advertising:campaigns:view permission
 */
router.get('/recommended',
  authenticate,
  checkPermission('advertising:campaigns:view'),
  async (req, res) => {
    try {
      const { organizationId } = req.user;
      const { eventId, category, audienceSize } = req.query;

      if (!eventId) {
        return res.status(400).json(
          ResponseFormatter.error(
            createError(400, 'Event ID is required'),
            400
          )
        );
      }

      const eventDetails = {
        eventId,
        category,
        audienceSize: parseInt(audienceSize) || 1000
      };

      const templates = await campaignService.getRecommendedTemplates(
        eventDetails,
        organizationId
      );

      res.json(ResponseFormatter.success(
        templates,
        'Recommended templates retrieved successfully'
      ));

    } catch (error) {
      console.error('Get recommended templates error:', error);
      res.status(500).json(ResponseFormatter.error(error));
    }
  }
);

/**
 * @route GET /api/v1/advertising/templates/:id
 * @desc Get single template
 * @access Private - requires advertising:campaigns:view permission
 */
router.get('/:id',
  authenticate,
  checkPermission('advertising:campaigns:view'),
  async (req, res) => {
    try {
      const { organizationId } = req.user;
      const { id } = req.params;

      const template = await CampaignTemplate.findOne({
        _id: id,
        $or: [
          { organizationId, isActive: true },
          { isPublic: true, isActive: true }
        ]
      }).populate('createdBy updatedBy', 'name email');

      if (!template) {
        return res.status(404).json(
          ResponseFormatter.error(
            createError(404, 'Template not found'),
            404
          )
        );
      }

      res.json(ResponseFormatter.success(
        template,
        'Template retrieved successfully'
      ));

    } catch (error) {
      console.error('Get template error:', error);
      res.status(500).json(ResponseFormatter.error(error));
    }
  }
);

/**
 * @route POST /api/v1/advertising/templates
 * @desc Create new template
 * @access Private - requires advertising:campaigns:create permission
 */
router.post('/',
  authenticate,
  checkPermission('advertising:campaigns:create'),
  async (req, res) => {
    try {
      const { organizationId, _id: userId } = req.user;
      const templateData = req.body;

      // Validate required fields
      if (!templateData.name) {
        return res.status(400).json(
          ResponseFormatter.error(
            createError(400, 'Template name is required'),
            400
          )
        );
      }

      // Create template
      const template = new CampaignTemplate({
        ...templateData,
        organizationId,
        createdBy: userId,
        isPublic: false // Organization templates are private by default
      });

      await template.save();

      // Clear cache
      await redis.del(`templates:${organizationId}:*`);

      res.status(201).json(ResponseFormatter.success(
        template,
        'Template created successfully'
      ));

    } catch (error) {
      console.error('Create template error:', error);
      res.status(500).json(ResponseFormatter.error(error));
    }
  }
);

/**
 * @route POST /api/v1/advertising/templates/from-campaign
 * @desc Create template from existing campaign
 * @access Private - requires advertising:campaigns:create permission
 */
router.post('/from-campaign',
  authenticate,
  checkPermission('advertising:campaigns:create'),
  async (req, res) => {
    try {
      const { organizationId, _id: userId } = req.user;
      const { campaignId, name, description, category, tags } = req.body;

      if (!campaignId || !name) {
        return res.status(400).json(
          ResponseFormatter.error(
            createError(400, 'Campaign ID and name are required'),
            400
          )
        );
      }

      const template = await campaignService.createTemplateFromCampaign(
        campaignId,
        { name, description, category, tags },
        userId,
        organizationId
      );

      res.status(201).json(ResponseFormatter.success(
        template,
        'Template created from campaign successfully'
      ));

    } catch (error) {
      console.error('Create template from campaign error:', error);
      res.status(500).json(ResponseFormatter.error(error));
    }
  }
);

/**
 * @route PUT /api/v1/advertising/templates/:id
 * @desc Update template
 * @access Private - requires advertising:campaigns:update permission
 */
router.put('/:id',
  authenticate,
  checkPermission('advertising:campaigns:update'),
  async (req, res) => {
    try {
      const { organizationId, _id: userId } = req.user;
      const { id } = req.params;
      const updates = req.body;

      // Find template
      const template = await CampaignTemplate.findOne({
        _id: id,
        organizationId,
        isActive: true
      });

      if (!template) {
        return res.status(404).json(
          ResponseFormatter.error(
            createError(404, 'Template not found'),
            404
          )
        );
      }

      // Update allowed fields
      const allowedUpdates = [
        'name', 'description', 'category', 'tags',
        'config', 'benchmarks', 'isActive'
      ];

      allowedUpdates.forEach(field => {
        if (updates[field] !== undefined) {
          template[field] = updates[field];
        }
      });

      template.updatedBy = userId;
      await template.save();

      // Clear cache
      await redis.del(`templates:${organizationId}:*`);

      res.json(ResponseFormatter.success(
        template,
        'Template updated successfully'
      ));

    } catch (error) {
      console.error('Update template error:', error);
      res.status(500).json(ResponseFormatter.error(error));
    }
  }
);

/**
 * @route DELETE /api/v1/advertising/templates/:id
 * @desc Delete template (soft delete)
 * @access Private - requires advertising:campaigns:delete permission
 */
router.delete('/:id',
  authenticate,
  checkPermission('advertising:campaigns:delete'),
  async (req, res) => {
    try {
      const { organizationId, _id: userId } = req.user;
      const { id } = req.params;

      const template = await CampaignTemplate.findOne({
        _id: id,
        organizationId,
        isActive: true
      });

      if (!template) {
        return res.status(404).json(
          ResponseFormatter.error(
            createError(404, 'Template not found'),
            404
          )
        );
      }

      // Soft delete
      template.isActive = false;
      template.updatedBy = userId;
      await template.save();

      // Clear cache
      await redis.del(`templates:${organizationId}:*`);

      res.json(ResponseFormatter.success(
        { id },
        'Template deleted successfully'
      ));

    } catch (error) {
      console.error('Delete template error:', error);
      res.status(500).json(ResponseFormatter.error(error));
    }
  }
);

/**
 * @route POST /api/v1/advertising/campaigns/from-template
 * @desc Create campaign from template
 * @access Private - requires advertising:campaigns:create permission
 */
router.post('/campaigns/from-template',
  authenticate,
  checkPermission('advertising:campaigns:create'),
  async (req, res) => {
    try {
      const { organizationId, _id: userId } = req.user;
      const { templateId, eventId, eventName, startDate, endDate, timezone } = req.body;

      if (!templateId || !eventId || !eventName) {
        return res.status(400).json(
          ResponseFormatter.error(
            createError(400, 'Template ID, event ID, and event name are required'),
            400
          )
        );
      }

      const eventDetails = {
        eventId,
        eventName,
        startDate,
        endDate,
        timezone
      };

      const campaign = await campaignService.createCampaignFromTemplate(
        templateId,
        eventDetails,
        userId,
        organizationId
      );

      res.status(201).json(ResponseFormatter.success(
        campaign,
        'Campaign created from template successfully'
      ));

    } catch (error) {
      console.error('Create campaign from template error:', error);
      res.status(500).json(ResponseFormatter.error(error));
    }
  }
);

module.exports = router;

// =====================================
// src/routes/index.js (addition)
// =====================================
// Add this line to register the template routes in your main routes file:

// const templateRoutes = require('./adbuilder/template.routes');
// app.use('/api/v1/advertising/templates', templateRoutes);