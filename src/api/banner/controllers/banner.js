// path: ./src/api/banner/controllers/banner.js

'use strict';

/**
 * banner controller
 */

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::banner.banner', ({ strapi }) => ({
  async find(ctx) {
    // Call the default `find` action to get the data
    const { data, meta } = await super.find(ctx);

    // Transform the data to the desired format
    const transformedData = data.map(item => {
      // Extract attributes and remove the 'attributes' wrapper
      const { id, attributes } = item;
      const imageUrl = attributes.image && attributes.image.data ?
                       strapi.config.get('server.url') + attributes.image.data.attributes.url : null;

      return {
        id: id,
        image_url: imageUrl, // Provide direct URL to the image
        isActive: attributes.isActive,
        createdAt: attributes.createdAt,
        updatedAt: attributes.updatedAt,
      };
    });

    return ctx.send({
      success: true,
      message: 'Banners fetched successfully',
      data: transformedData,
    });
  },

  // You might want to override findOne similarly if needed
  async findOne(ctx) {
    const { id } = ctx.params; // Get the ID from the URL params

    // Fetch the single banner entry
    const entity = await strapi.db.query('api::banner.banner').findOne({
      where: { id },
      populate: { image: true }, // Populate the image relation
    });

    if (!entity) {
      return ctx.notFound('Banner not found');
    }

    // Transform the data to the desired format
    const imageUrl = entity.image ?
                     strapi.config.get('server.url') + entity.image.url : null;

    const transformedData = {
      id: entity.id,
      image_url: imageUrl,
      isActive: entity.isActive,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };

    return ctx.send({
      success: true,
      message: 'Banner fetched successfully',
      data: transformedData,
    });
  },
}));