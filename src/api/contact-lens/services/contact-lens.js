'use strict';

/**
 * contact-lens service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::contact-lens.contact-lens');
