// src/services/adbuilder/meta-audience.service.js
const crypto = require('crypto');
const mongoose = require('mongoose');
const createError = require('http-errors');
const MetaConnection = require('../../models/MetaConnection');
const Campaign = require('../../models/Campaign');
const Customer = require('../../models/Customer');
const Organization = require('../../models/Organization');
const { redis } = require('../redis.service');
const metaAuthService = require('./meta-auth.service');

class MetaAudienceService {
  constructor() {
    this.metaApiVersion = 'v18.0';
    this.baseUrl = `https://graph.facebook.com/${this.metaApiVersion}`;
    this.batchSize = 10000; // Meta's recommended batch size
    this.hashAlgorithm = 'sha256';
  }

  /**
   * Hash customer data according to Meta's requirements
   * @param {Array} customers - Array of customer objects
   * @returns {Array} Hashed customer data
   */
  hashCustomerData(customers) {
    return customers.map(customer => {
      const hashedData = {};

      // Hash email
      if (customer.email) {
        hashedData.email = this._hashValue(customer.email.toLowerCase().trim());
      }

      // Hash phone
      if (customer.phone) {
        // Remove all non-numeric characters and add country code if missing
        let phone = customer.phone.replace(/\D/g, '');
        if (!phone.startsWith('57')) { // Colombia country code
          phone = '57' + phone;
        }
        hashedData.phone = this._hashValue(phone);
      }

      // Hash first name
      if (customer.firstName) {
        hashedData.fn = this._hashValue(customer.firstName.toLowerCase().trim());
      }

      // Hash last name
      if (customer.lastName) {
        hashedData.ln = this._hashValue(customer.lastName.toLowerCase().trim());
      }

      // Hash date of birth (YYYYMMDD format)
      if (customer.dateOfBirth) {
        const dob = new Date(customer.dateOfBirth);
        const dobString = `${dob.getFullYear()}${String(dob.getMonth() + 1).padStart(2, '0')}${String(dob.getDate()).padStart(2, '0')}`;
        hashedData.doby = this._hashValue(dobString);
      }

      // Hash city
      if (customer.city) {
        hashedData.ct = this._hashValue(customer.city.toLowerCase().trim());
      }

      // Hash state/region
      if (customer.state) {
        hashedData.st = this._hashValue(customer.state.toLowerCase().trim());
      }

      // Hash zip code
      if (customer.zipCode) {
        hashedData.zip = this._hashValue(customer.zipCode.toLowerCase().trim());
      }

      // Country code (not hashed)
      hashedData.country = customer.country || 'co'; // Default to Colombia

      return hashedData;
    });
  }

  /**
   * Create a custom audience in Meta
   * @param {String} name - Audience name
   * @param {String} description - Audience description
   * @param {Array} customerData - Array of customer data to upload
   * @param {String} organizationId - Organization ID
   * @param {String} adAccountId - Meta Ad Account ID
   * @returns {Promise<Object>} Created audience details
   */
  async createCustomAudience(name, description, customerData, organizationId, adAccountId) {
    const session = await mongoose.startSession();

    try {
      let audience;

      await session.withTransaction(async () => {
        // Get Meta connection
        const metaConnection = await MetaConnection.findOne({
          organizationId,
          status: 'active'
        }).session(session);

        if (!metaConnection) {
          throw createError(404, 'Meta connection not found');
        }

        // Validate ad account
        if (!metaConnection.adAccounts.find(acc => acc.id === adAccountId)) {
          throw createError(400, 'Invalid ad account ID');
        }

        // Create audience via Meta API
        const accessToken = metaConnection.accessToken;
        const audienceData = {
          name: `Sonik - ${name}`,
          description: description || `Custom audience created via Sonik on ${new Date().toLocaleDateString()}`,
          subtype: 'CUSTOM',
          customer_file_source: 'USER_PROVIDED_ONLY',
          access_token: accessToken
        };

        const response = await this._makeMetaRequest(
          `POST`,
          `/${adAccountId}/customaudiences`,
          audienceData
        );

        audience = {
          id: response.id,
          name: response.name,
          description: audienceData.description,
          approximateCount: 0,
          status: 'PENDING',
          createdAt: new Date()
        };

        // Cache audience metadata
        await this._cacheAudienceMetadata(audience.id, {
          organizationId,
          adAccountId,
          name: audience.name,
          customerCount: customerData.length
        });

        // Upload customer data in batches
        if (customerData && customerData.length > 0) {
          await this.uploadCustomerList(audience.id, customerData, accessToken);
        }
      });

      return audience;
    } catch (error) {
      console.error('Create custom audience error:', error);
      throw error;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Upload customer list to existing audience
   * @param {String} audienceId - Meta audience ID
   * @param {Array} hashedData - Pre-hashed customer data
   * @param {String} accessToken - Meta access token
   * @returns {Promise<Object>} Upload result
   */
  async uploadCustomerList(audienceId, hashedData, accessToken) {
    try {
      const totalCustomers = hashedData.length;
      let uploadedCount = 0;
      const results = [];

      // Process in batches
      for (let i = 0; i < hashedData.length; i += this.batchSize) {
        const batch = hashedData.slice(i, i + this.batchSize);
        
        const payload = {
          payload: {
            schema: ['EMAIL', 'PHONE', 'FN', 'LN', 'CT', 'ST', 'ZIP', 'COUNTRY', 'DOBY'],
            data: batch.map(customer => [
              customer.email || '',
              customer.phone || '',
              customer.fn || '',
              customer.ln || '',
              customer.ct || '',
              customer.st || '',
              customer.zip || '',
              customer.country || '',
              customer.doby || ''
            ])
          },
          access_token: accessToken
        };

        const response = await this._makeMetaRequest(
          'POST',
          `/${audienceId}/users`,
          payload
        );

        uploadedCount += batch.length;
        results.push({
          batchNumber: Math.floor(i / this.batchSize) + 1,
          processed: batch.length,
          sessionId: response.session_id,
          numReceived: response.num_received,
          numInvalidEntries: response.num_invalid_entries || 0
        });

        // Update progress in cache
        await this._updateUploadProgress(audienceId, uploadedCount, totalCustomers);
      }

      return {
        success: true,
        totalUploaded: uploadedCount,
        batches: results,
        audienceId
      };
    } catch (error) {
      console.error('Upload customer list error:', error);
      throw error;
    }
  }

  /**
   * Create a lookalike audience from source audience
   * @param {String} sourceAudienceId - Source custom audience ID
   * @param {String} country - Target country code
   * @param {Number} ratio - Lookalike ratio (1-10, where 1 is 1% most similar)
   * @param {String} organizationId - Organization ID
   * @param {String} adAccountId - Meta Ad Account ID
   * @returns {Promise<Object>} Lookalike audience details
   */
  async createLookalikeAudience(sourceAudienceId, country, ratio, organizationId, adAccountId) {
    try {
      // Get Meta connection
      const metaConnection = await MetaConnection.findOne({
        organizationId,
        status: 'active'
      });

      if (!metaConnection) {
        throw createError(404, 'Meta connection not found');
      }

      // Validate ratio
      if (ratio < 1 || ratio > 10) {
        throw createError(400, 'Lookalike ratio must be between 1 and 10');
      }

      const accessToken = metaConnection.accessToken;
      
      // Get source audience details first
      const sourceAudience = await this.getAudienceDetails(sourceAudienceId, accessToken);
      
      const lookalikeData = {
        name: `Sonik LAL - ${sourceAudience.name} (${ratio}%)`,
        origin_audience_id: sourceAudienceId,
        lookalike_spec: {
          type: 'similarity',
          country: country.toUpperCase(),
          ratio: ratio / 100 // Convert to decimal (1% = 0.01)
        },
        access_token: accessToken
      };

      const response = await this._makeMetaRequest(
        'POST',
        `/${adAccountId}/customaudiences`,
        lookalikeData
      );

      const lookalikeAudience = {
        id: response.id,
        name: response.name,
        sourceAudienceId,
        country,
        ratio,
        approximateCount: response.approximate_count || 0,
        status: response.delivery_status?.status || 'PENDING',
        createdAt: new Date()
      };

      // Cache lookalike metadata
      await this._cacheAudienceMetadata(lookalikeAudience.id, {
        type: 'lookalike',
        sourceAudienceId,
        organizationId,
        adAccountId,
        country,
        ratio
      });

      return lookalikeAudience;
    } catch (error) {
      console.error('Create lookalike audience error:', error);
      throw error;
    }
  }

  /**
   * Get audience size estimate
   * @param {String} audienceId - Audience ID
   * @param {String} accessToken - Meta access token
   * @returns {Promise<Number>} Estimated audience size
   */
  async getAudienceSize(audienceId, accessToken) {
    try {
      // Check cache first
      const cacheKey = `audience:size:${audienceId}`;
      const cachedSize = await redis.get(cacheKey);
      
      if (cachedSize) {
        return parseInt(cachedSize);
      }

      const response = await this._makeMetaRequest(
        'GET',
        `/${audienceId}`,
        { fields: 'approximate_count,delivery_status', access_token: accessToken }
      );

      const size = response.approximate_count || 0;
      
      // Cache for 1 hour
      await redis.setex(cacheKey, 3600, size.toString());

      return size;
    } catch (error) {
      console.error('Get audience size error:', error);
      throw error;
    }
  }

  /**
   * Update existing audience with new customers
   * @param {String} audienceId - Audience ID
   * @param {Array} newCustomers - New customers to add
   * @param {String} organizationId - Organization ID
   * @returns {Promise<Object>} Update result
   */
  async updateAudience(audienceId, newCustomers, organizationId) {
    try {
      // Get Meta connection
      const metaConnection = await MetaConnection.findOne({
        organizationId,
        status: 'active'
      });

      if (!metaConnection) {
        throw createError(404, 'Meta connection not found');
      }

      // Hash new customer data
      const hashedData = this.hashCustomerData(newCustomers);

      // Upload to existing audience
      const result = await this.uploadCustomerList(
        audienceId, 
        hashedData, 
        metaConnection.accessToken
      );

      // Update cache
      await this._updateAudienceCache(audienceId, {
        lastUpdated: new Date(),
        addedCustomers: newCustomers.length
      });

      return result;
    } catch (error) {
      console.error('Update audience error:', error);
      throw error;
    }
  }

  /**
   * Delete audience
   * @param {String} audienceId - Audience ID
   * @param {String} organizationId - Organization ID
   * @returns {Promise<Boolean>} Success status
   */
  async deleteAudience(audienceId, organizationId) {
    try {
      const metaConnection = await MetaConnection.findOne({
        organizationId,
        status: 'active'
      });

      if (!metaConnection) {
        throw createError(404, 'Meta connection not found');
      }

      await this._makeMetaRequest(
        'DELETE',
        `/${audienceId}`,
        { access_token: metaConnection.accessToken }
      );

      // Clear cache
      await this._clearAudienceCache(audienceId);

      return true;
    } catch (error) {
      console.error('Delete audience error:', error);
      throw error;
    }
  }

  /**
   * Get audience details
   * @param {String} audienceId - Audience ID
   * @param {String} accessToken - Meta access token
   * @returns {Promise<Object>} Audience details
   */
  async getAudienceDetails(audienceId, accessToken) {
    try {
      const response = await this._makeMetaRequest(
        'GET',
        `/${audienceId}`,
        {
          fields: 'id,name,description,approximate_count,delivery_status,operation_status,time_created,time_updated',
          access_token: accessToken
        }
      );

      return {
        id: response.id,
        name: response.name,
        description: response.description,
        approximateCount: response.approximate_count || 0,
        status: response.delivery_status?.status || 'UNKNOWN',
        operationStatus: response.operation_status,
        createdAt: response.time_created,
        updatedAt: response.time_updated
      };
    } catch (error) {
      console.error('Get audience details error:', error);
      throw error;
    }
  }

  /**
   * Get all audiences for organization
   * @param {String} organizationId - Organization ID
   * @param {String} adAccountId - Ad account ID
   * @returns {Promise<Array>} List of audiences
   */
  async getOrganizationAudiences(organizationId, adAccountId) {
    try {
      const metaConnection = await MetaConnection.findOne({
        organizationId,
        status: 'active'
      });

      if (!metaConnection) {
        throw createError(404, 'Meta connection not found');
      }

      const response = await this._makeMetaRequest(
        'GET',
        `/${adAccountId}/customaudiences`,
        {
          fields: 'id,name,description,approximate_count,delivery_status,time_created',
          access_token: metaConnection.accessToken,
          limit: 100
        }
      );

      return response.data.map(audience => ({
        id: audience.id,
        name: audience.name,
        description: audience.description,
        approximateCount: audience.approximate_count || 0,
        status: audience.delivery_status?.status || 'UNKNOWN',
        createdAt: audience.time_created
      }));
    } catch (error) {
      console.error('Get organization audiences error:', error);
      throw error;
    }
  }

  /**
   * Private helper to hash values
   * @private
   */
  _hashValue(value) {
    return crypto
      .createHash(this.hashAlgorithm)
      .update(value)
      .digest('hex');
  }

  /**
   * Private helper to make Meta API requests
   * @private
   */
  async _makeMetaRequest(method, endpoint, data) {
    try {
      const url = `${this.baseUrl}${endpoint}`;
      const options = {
        method,
        headers: {
          'Content-Type': 'application/json'
        }
      };

      if (method === 'GET') {
        const params = new URLSearchParams(data);
        options.url = `${url}?${params.toString()}`;
      } else {
        options.url = url;
        options.data = data;
      }

      const response = await axios(options);
      return response.data;
    } catch (error) {
      if (error.response?.data?.error) {
        const metaError = error.response.data.error;
        throw createError(400, `Meta API Error: ${metaError.message} (Code: ${metaError.code})`);
      }
      throw error;
    }
  }

  /**
   * Private helper to cache audience metadata
   * @private
   */
  async _cacheAudienceMetadata(audienceId, metadata) {
    const cacheKey = `audience:meta:${audienceId}`;
    await redis.setex(cacheKey, 3600, JSON.stringify(metadata)); // 1 hour TTL
  }

  /**
   * Private helper to update upload progress
   * @private
   */
  async _updateUploadProgress(audienceId, uploaded, total) {
    const cacheKey = `audience:upload:${audienceId}`;
    const progress = {
      uploaded,
      total,
      percentage: Math.round((uploaded / total) * 100),
      updatedAt: new Date()
    };
    await redis.setex(cacheKey, 300, JSON.stringify(progress)); // 5 min TTL
  }

  /**
   * Private helper to update audience cache
   * @private
   */
  async _updateAudienceCache(audienceId, updates) {
    const cacheKey = `audience:meta:${audienceId}`;
    const existing = await redis.get(cacheKey);
    
    if (existing) {
      const metadata = JSON.parse(existing);
      const updated = { ...metadata, ...updates };
      await redis.setex(cacheKey, 3600, JSON.stringify(updated));
    }
  }

  /**
   * Private helper to clear audience cache
   * @private
   */
  async _clearAudienceCache(audienceId) {
    const keys = [
      `audience:meta:${audienceId}`,
      `audience:size:${audienceId}`,
      `audience:upload:${audienceId}`
    ];
    
    for (const key of keys) {
      await redis.del(key);
    }
  }
}

module.exports = new MetaAudienceService();