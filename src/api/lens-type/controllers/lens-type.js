'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { sanitize } = require('@strapi/utils');

module.exports = createCoreController('api::lens-type.lens-type', ({ strapi }) => ({

    async find(ctx) {
    const { locale } = ctx.query;

    try {
      const queryOptions = {
        locale: locale || 'en',
      };

      const lensTypes = await strapi.entityService.findMany(
        'api::lens-type.lens-type',
        queryOptions
      );

      if (!lensTypes || lensTypes.length === 0) {
        return ctx.notFound({
          success: false,
          message: 'No lens types found for the specified locale.',
          data: [],
        });
      }

      const sanitizedLensTypes = await Promise.all(
        lensTypes.map(type =>
          sanitize.contentAPI.output(
            type,
            strapi.contentType('api::lens-type.lens-type')
          )
        )
      );

      return ctx.send({
        success: true,
        message: 'Lens types retrieved successfully.',
        data: sanitizedLensTypes,
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
      const lensType = await strapi.entityService.findOne(
        'api::lens-type.lens-type',
        id,
        {
          populate: ['localizations'],
          locale: defaultLocale,
        }
      );

      if (!lensType) {
        return ctx.notFound({
          success: false,
          message: 'Lens type not found.',
          data: null,
        });
      }

      let localizedLensType = lensType;

      if (locale && locale !== defaultLocale) {
        const foundLocalization = lensType.localizations.find(loc => loc.locale === locale);

        if (foundLocalization) {
          localizedLensType = await strapi.entityService.findOne(
            'api::lens-type.lens-type',
            foundLocalization.id,
            { locale: locale }
          );
        }
      }

      const sanitizedLensType = await sanitize.contentAPI.output(
        localizedLensType,
        strapi.contentType("api::lens-type.lens-type")
      );

      return ctx.send({
        success: true,
        message: 'Lens type retrieved successfully.',
        data: sanitizedLensType,
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