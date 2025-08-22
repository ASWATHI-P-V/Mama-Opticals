'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { sanitize } = require('@strapi/utils');

module.exports = createCoreController('api::frame-shape.frame-shape', ({ strapi }) => ({

    async find(ctx) {
    const { locale } = ctx.query;

    try {
      const queryOptions = {
        locale: locale || 'en',
        populate: ['image'], 
      };

      const frameShapes = await strapi.entityService.findMany(
        'api::frame-shape.frame-shape',
        queryOptions
      );

      if (!frameShapes || frameShapes.length === 0) {
        return ctx.notFound({
          success: false,
          message: 'No frame shapes found for the specified locale.',
          data: [],
        });
      }

      const sanitizedFrameShapes = await Promise.all(
        frameShapes.map(shape =>
          sanitize.contentAPI.output(
            shape,
            strapi.contentType('api::frame-shape.frame-shape')
          )
        )
      );

      return ctx.send({
        success: true,
        message: 'Frame shapes retrieved successfully.',
        data: sanitizedFrameShapes,
      });

    } catch (error) {
      console.error(error);
      ctx.status = 500;
      return ctx.send({
        success: false,
        message: 'An unexpected error occurred.',
        data: null,
      });
    }
  },

  async findOne(ctx) {
    const { id } = ctx.params;
    const { locale } = ctx.query;

    try {
      const defaultLocale = 'en';
      const frameShape = await strapi.entityService.findOne(
        'api::frame-shape.frame-shape',
        id,
        {
          populate: ['localizations', 'image'],
          locale: defaultLocale,
        }
      );

      if (!frameShape) {
        return ctx.notFound({
          success: false,
          message: 'Frame shape not found.',
          data: null,
        });
      }

      let localizedFrameShape = frameShape;

      if (locale && locale !== defaultLocale) {
        const foundLocalization = frameShape.localizations.find(loc => loc.locale === locale);

        if (foundLocalization) {
          localizedFrameShape = await strapi.entityService.findOne(
            'api::frame-shape.frame-shape',
            foundLocalization.id,
            { populate: ['image'],locale: locale }
          );
        }
      }

      const sanitizedFrameShape = await sanitize.contentAPI.output(
        localizedFrameShape,
        strapi.contentType("api::frame-shape.frame-shape")
      );

      return ctx.send({
        success: true,
        message: 'Frame shape retrieved successfully.',
        data: sanitizedFrameShape,
      });

    } catch (error) {
      console.error(error);
      ctx.status = 500;
      return ctx.send({
        success: false,
        message: 'An unexpected error occurred.',
        data: null,
      });
    }
  }
}));