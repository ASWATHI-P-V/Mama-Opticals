'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { sanitize } = require('@strapi/utils');

module.exports = createCoreController('api::frame-size.frame-size', ({ strapi }) => ({

    async find(ctx) {
    const { locale } = ctx.query;

    try {
      const queryOptions = {
        locale: locale || 'en',
      };

      const frameSizes = await strapi.entityService.findMany(
        'api::frame-size.frame-size',
        queryOptions
      );

      if (!frameSizes || frameSizes.length === 0) {
        return ctx.notFound({
          success: false,
          message: 'No frame sizes found for the specified locale.',
          data: [],
        });
      }

      const sanitizedFrameSizes = await Promise.all(
        frameSizes.map(size =>
          sanitize.contentAPI.output(
            size,
            strapi.contentType('api::frame-size.frame-size')
          )
        )
      );

      return ctx.send({
        success: true,
        message: 'Frame sizes retrieved successfully.',
        data: sanitizedFrameSizes,
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
      const frameSize = await strapi.entityService.findOne(
        'api::frame-size.frame-size',
        id,
        {
          populate: ['localizations'],
          locale: defaultLocale,
        }
      );

      if (!frameSize) {
        return ctx.notFound({
          success: false,
          message: 'Frame size not found.',
          data: null,
        });
      }

      let localizedFrameSize = frameSize;

      if (locale && locale !== defaultLocale) {
        const foundLocalization = frameSize.localizations.find(loc => loc.locale === locale);

        if (foundLocalization) {
          localizedFrameSize = await strapi.entityService.findOne(
            'api::frame-size.frame-size',
            foundLocalization.id,
            { locale: locale }
          );
        }
      }

      const sanitizedFrameSize = await sanitize.contentAPI.output(
        localizedFrameSize,
        strapi.contentType("api::frame-size.frame-size")
      );

      return ctx.send({
        success: true,
        message: 'Frame size retrieved successfully.',
        data: sanitizedFrameSize,
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