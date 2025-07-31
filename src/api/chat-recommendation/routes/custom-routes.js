'use strict';

/**
 * chat-recommendation router
 */

const { createCoreRouter } = require('@strapi/strapi').factories;

module.exports = createCoreRouter('api::chat-recommendation.chat-recommendation', {
  routes: [
    {
      method: 'GET',
      path: '/chat-recommendations',
      handler: 'api::chat-recommendation.chat-recommendation.find',
    },
    {
      method: 'GET',
      path: '/chat-recommendations/:id',
      handler: 'api::chat-recommendation.chat-recommendation.findOne',
    }, 
  ],
});