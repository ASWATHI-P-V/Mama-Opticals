// src/api/spectacles-mise/controllers/spectacles-mise.js

'use strict';

module.exports = {
  findAllOptions: async (ctx) => {
    try {
      // Fetch all colors
      const colors = await strapi.entityService.findMany('api::color.color', {
        fields: ['id', 'name'],
        sort: { name: 'asc' },
      });

      // Fetch all frame sizes
      const frameSizes = await strapi.entityService.findMany('api::frame-size.frame-size', {
        fields: ['id', 'name'],
        sort: { name: 'asc' },
      });

      ctx.body = {
        success: true,
        message: 'All colors and frame sizes retrieved successfully.',
        data: {
          colors: colors,
          frame_sizes: frameSizes,
        },
      };
    } catch (err) {
      console.error(err);
      ctx.status = 500;
      ctx.body = {
        success: false,
        message: 'An internal server error occurred.',
        data: null,
      };
    }
  },
};