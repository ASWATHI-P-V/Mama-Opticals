'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { sanitize } = require('@strapi/utils');

module.exports = createCoreController('api::lens-thickness.lens-thickness', ({ strapi }) => ({

    async find(ctx) {
    const { locale } = ctx.query;

    try {
      const queryOptions = {
        locale: locale || 'en',
      };

      const lensThicknesses = await strapi.entityService.findMany(
        'api::lens-thickness.lens-thickness',
        queryOptions
      );

      if (!lensThicknesses || lensThicknesses.length === 0) {
        return ctx.notFound({
          success: false,
          message: 'No lens thicknesses found for the specified locale.',
          data: [],
        });
      }

      const sanitizedLensThicknesses = await Promise.all(
        lensThicknesses.map(thickness =>
          sanitize.contentAPI.output(
            thickness,
            strapi.contentType('api::lens-thickness.lens-thickness')
          )
        )
      );

      return ctx.send({
        success: true,
        message: 'Lens thicknesses retrieved successfully.',
        data: sanitizedLensThicknesses,
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
      const lensThickness = await strapi.entityService.findOne(
        'api::lens-thickness.lens-thickness',
        id,
        {
          populate: ['localizations'],
          locale: defaultLocale,
        }
      );

      if (!lensThickness) {
        return ctx.notFound({
          success: false,
          message: 'Lens thickness not found.',
          data: null,
        });
      }

      let localizedLensThickness = lensThickness;

      if (locale && locale !== defaultLocale) {
        const foundLocalization = lensThickness.localizations.find(loc => loc.locale === locale);

        if (foundLocalization) {
          localizedLensThickness = await strapi.entityService.findOne(
            'api::lens-thickness.lens-thickness',
            foundLocalization.id,
            { locale: locale }
          );
        }
      }

      const sanitizedLensThickness = await sanitize.contentAPI.output(
        localizedLensThickness,
        strapi.contentType("api::lens-thickness.lens-thickness")
      );

      return ctx.send({
        success: true,
        message: 'Lens thickness retrieved successfully.',
        data: sanitizedLensThickness,
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