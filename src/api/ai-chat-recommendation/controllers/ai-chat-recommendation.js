'use strict';

/**
 * ai-chat-recommendation controller
 */

const { createCoreController } = require('@strapi/strapi').factories;
const { NotFoundError } = require('@strapi/utils').errors;

module.exports = createCoreController('api::ai-chat-recommendation.ai-chat-recommendation', ({ strapi }) => ({

  // Override the default find method to format response
  async find(ctx) {
    const { data, meta } = await super.find(ctx);

    const formattedData = data.map(item => ({
      id: item.id,
      title: item.attributes.title,
      content: item.attributes.content,
      category: item.attributes.category,
    }));

    return ctx.send({
      success: true,
      message: 'Chat recommendations retrieved successfully.',
      data: formattedData
    }, 200);
  },

  // Override findOne for consistent formatting
  async findOne(ctx) {
    const { id } = ctx.params;
    const { data } = await super.findOne(ctx);

    if (!data) {
        throw new NotFoundError('Recommendation not found.');
    }

    const formattedData = {
        id: data.id,
        title: data.attributes.title,
        content: data.attributes.content,
        category: data.attributes.category,
    };

    return ctx.send({
        success: true,
        message: 'Chat recommendation retrieved successfully.',
        data: formattedData
    }, 200);
  }

}));