'use strict';

/**
 * customer-support service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::customer-support.customer-support');
