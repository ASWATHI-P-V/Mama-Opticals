'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { sanitize } = require('@strapi/utils');

module.exports = createCoreController('api::frame-weight.frame-weight', ({ strapi }) => ({

    async find(ctx) {
    const { locale } = ctx.query;

    try {
      const queryOptions = {
        locale: locale || 'en',
      };

      const frameWeights = await strapi.entityService.findMany(
        'api::frame-weight.frame-weight',
        queryOptions
      );

      if (!frameWeights || frameWeights.length === 0) {
        return ctx.notFound({
          success: false,
          message: 'No frame weights found for the specified locale.',
          data: [],
        });
      }

      const sanitizedFrameWeights = await Promise.all(
        frameWeights.map(weight =>
          sanitize.contentAPI.output(
            weight,
            strapi.contentType('api::frame-weight.frame-weight')
          )
        )
      );

      return ctx.send({
        success: true,
        message: 'Frame weights retrieved successfully.',
        data: sanitizedFrameWeights,
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
      const frameWeight = await strapi.entityService.findOne(
        'api::frame-weight.frame-weight',
        id,
        {
          populate: ['localizations'],
          locale: defaultLocale,
        }
      );

      if (!frameWeight) {
        return ctx.notFound({
          success: false,
          message: 'Frame weight not found.',
          data: null,
        });
      }

      let localizedFrameWeight = frameWeight;

      if (locale && locale !== defaultLocale) {
        const foundLocalization = frameWeight.localizations.find(loc => loc.locale === locale);

        if (foundLocalization) {
          localizedFrameWeight = await strapi.entityService.findOne(
            'api::frame-weight.frame-weight',
            foundLocalization.id,
            { locale: locale }
          );
        }
      }

      const sanitizedFrameWeight = await sanitize.contentAPI.output(
        localizedFrameWeight,
        strapi.contentType("api::frame-weight.frame-weight")
      );

      return ctx.send({
        success: true,
        message: 'Frame weight retrieved successfully.',
        data: sanitizedFrameWeight,
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