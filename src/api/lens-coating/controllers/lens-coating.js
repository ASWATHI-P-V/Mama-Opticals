'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { sanitize } = require('@strapi/utils');

module.exports = createCoreController('api::lens-coating.lens-coating', ({ strapi }) => ({

    async find(ctx) {
    const { locale } = ctx.query;

    try {
      const queryOptions = {
        locale: locale || 'en',
      };

      const lensCoatings = await strapi.entityService.findMany(
        'api::lens-coating.lens-coating',
        queryOptions
      );

      if (!lensCoatings || lensCoatings.length === 0) {
        return ctx.notFound({
          success: false,
          message: 'No lens coatings found for the specified locale.',
          data: [],
        });
      }

      const sanitizedLensCoatings = await Promise.all(
        lensCoatings.map(coating =>
          sanitize.contentAPI.output(
            coating,
            strapi.contentType('api::lens-coating.lens-coating')
          )
        )
      );

      return ctx.send({
        success: true,
        message: 'Lens coatings retrieved successfully.',
        data: sanitizedLensCoatings,
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
      const lensCoating = await strapi.entityService.findOne(
        'api::lens-coating.lens-coating',
        id,
        {
          populate: ['localizations'],
          locale: defaultLocale,
        }
      );

      if (!lensCoating) {
        return ctx.notFound({
          success: false,
          message: 'Lens coating not found.',
          data: null,
        });
      }

      let localizedLensCoating = lensCoating;

      if (locale && locale !== defaultLocale) {
        const foundLocalization = lensCoating.localizations.find(loc => loc.locale === locale);

        if (foundLocalization) {
          localizedLensCoating = await strapi.entityService.findOne(
            'api::lens-coating.lens-coating',
            foundLocalization.id,
            { locale: locale }
          );
        }
      }

      const sanitizedLensCoating = await sanitize.contentAPI.output(
        localizedLensCoating,
        strapi.contentType("api::lens-coating.lens-coating")
      );

      return ctx.send({
        success: true,
        message: 'Lens coating retrieved successfully.',
        data: sanitizedLensCoating,
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