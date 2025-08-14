// path: ./src/api/banner/controllers/banner.js

'use strict';

/**
 * banner controller
 */

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::banner.banner', ({ strapi }) => ({
  async find(ctx) {
    const populate = {
      image: true,
    };
    const banners = await strapi.entityService.findMany(
      'api::banner.banner',
      { populate }
    );
    

    // Transform the data to the desired format
    const transformedData = banners.map(item => {
      // The image relation is now populated, so we can access the url
      const imageUrl = item.image ?
                       strapi.config.get('server.url') + item.image.url : null;

      return {
        id: item.id,
        image_url: imageUrl, // Provide direct URL to the image
        isActive: item.isActive,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
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