'use strict';

/**
 * chat-recommendation service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::chat-recommendation.chat-recommendation');
