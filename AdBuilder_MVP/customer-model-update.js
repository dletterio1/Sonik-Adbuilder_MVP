// src/models/Customer.js (UPDATE)
// Add this marketingConsent field to the existing Customer schema

// This should be added to the existing customerSchema definition:
const customerSchemaAddition = {
  // ... existing fields ...
  
  // Marketing consent tracking
  marketingConsent: {
    email: {
      type: Boolean,
      default: false
    },
    sms: {
      type: Boolean,
      default: false
    },
    ads: {
      type: Boolean,
      default: false
    },
    consentDate: {
      type: Date,
      default: null
    },
    ipAddress: {
      type: String,
      default: null
    },
    consentSource: {
      type: String,
      enum: ['checkout', 'profile', 'signup', 'campaign', 'import'],
      default: 'checkout'
    },
    consentText: {
      type: String,
      default: null
    }
  },
  
  // ... rest of existing schema ...
};

// Add these methods to the existing schema:

/**
 * Grant marketing consent
 * @param {Object} consentData - Consent details
 * @param {Boolean} consentData.email - Email consent
 * @param {Boolean} consentData.sms - SMS consent
 * @param {Boolean} consentData.ads - Ads consent
 * @param {String} consentData.ipAddress - IP address
 * @param {String} consentData.source - Consent source
 */
customerSchema.methods.grantMarketingConsent = function(consentData) {
  this.marketingConsent = {
    email: consentData.email || false,
    sms: consentData.sms || false,
    ads: consentData.ads || false,
    consentDate: new Date(),
    ipAddress: consentData.ipAddress,
    consentSource: consentData.source || 'checkout',
    consentText: consentData.consentText
  };
  
  return this.save();
};

/**
 * Revoke marketing consent
 * @param {Array<String>} types - Types to revoke ['email', 'sms', 'ads']
 */
customerSchema.methods.revokeMarketingConsent = function(types = ['email', 'sms', 'ads']) {
  types.forEach(type => {
    if (this.marketingConsent[type] !== undefined) {
      this.marketingConsent[type] = false;
    }
  });
  
  return this.save();
};

/**
 * Check if customer has specific marketing consent
 * @param {String} type - Consent type ('email', 'sms', 'ads')
 * @returns {Boolean}
 */
customerSchema.methods.hasMarketingConsent = function(type) {
  return this.marketingConsent && this.marketingConsent[type] === true;
};

/**
 * Static method to find customers with specific consent
 * @param {String} organizationId - Organization ID
 * @param {String} consentType - Type of consent ('email', 'sms', 'ads')
 * @param {Object} additionalFilters - Additional query filters
 * @returns {Promise<Array>} Customers with consent
 */
customerSchema.statics.findWithConsent = function(organizationId, consentType, additionalFilters = {}) {
  const query = {
    organization: organizationId,
    [`marketingConsent.${consentType}`]: true,
    ...additionalFilters
  };
  
  return this.find(query);
};

/**
 * Get customers for Meta advertising
 * @param {String} organizationId - Organization ID
 * @param {Object} filters - Additional filters
 * @returns {Promise<Array>} Customers with ad consent
 */
customerSchema.statics.getAdvertisingCustomers = function(organizationId, filters = {}) {
  return this.find({
    organization: organizationId,
    'marketingConsent.ads': true,
    email: { $exists: true, $ne: '' },
    ...filters
  })
  .select('email phone firstName lastName dateOfBirth city state zipCode country')
  .lean();
};

// Add index for efficient consent queries
customerSchema.index({ 
  organization: 1, 
  'marketingConsent.ads': 1,
  'marketingConsent.email': 1,
  'marketingConsent.sms': 1
});

// Migration script to add marketing consent to existing customers
// Run this separately as a migration:
/*
const addMarketingConsentToExistingCustomers = async () => {
  const result = await Customer.updateMany(
    { marketingConsent: { $exists: false } },
    { 
      $set: { 
        marketingConsent: {
          email: false,
          sms: false,
          ads: false,
          consentDate: null,
          ipAddress: null,
          consentSource: null,
          consentText: null
        }
      } 
    }
  );
  
  console.log(`Updated ${result.modifiedCount} customers with marketing consent fields`);
};
*/