'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { sanitize } = require('@strapi/utils');

module.exports = createCoreController('api::brand.brand', ({ strapi }) => ({

  async find(ctx) {
    const { locale } = ctx.query;

    try {
      const queryOptions = {
        locale: locale || 'en',
        populate: ['image'] // Populate the non-localized Image field
      };

      const brands = await strapi.entityService.findMany(
        'api::brand.brand',
        queryOptions
      );

      if (!brands || brands.length === 0) {
        return ctx.notFound({
          success: false,
          message: 'No brands found for the specified locale.',
          data: [],
        });
      }

      const sanitizedBrands = await Promise.all(
        brands.map(brand =>
          sanitize.contentAPI.output(
            brand,
            strapi.contentType('api::brand.brand')
          )
        )
      );

      return ctx.send({
        success: true,
        message: 'Brands retrieved successfully.',
        data: sanitizedBrands,
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
            // Find the brand by ID, populating its localizations and image.
            const brand = await strapi.entityService.findOne(
                'api::brand.brand',
                id,
                {
                    populate: ['localizations', 'image'],
                    locale: defaultLocale,
                }
            );

            if (!brand) {
                return ctx.notFound({
                    success: false,
                    message: 'Brand not found.',
                    data: null,
                });
            }

            let localizedBrand = brand;

            // If a specific locale is requested, find and use the localized version.
            if (locale && locale !== defaultLocale) {
                const foundLocalization = brand.localizations.find(loc => loc.locale === locale);

                if (foundLocalization) {
                    localizedBrand = await strapi.entityService.findOne(
                        'api::brand.brand',
                        foundLocalization.id,
                        {
                            locale: locale,
                            populate: ['image'] // Ensure the image is populated for the localized version.
                        }
                    );
                }
            }

            // Sanitize the output to remove sensitive fields before sending the response.
            const sanitizedBrand = await sanitize.contentAPI.output(
                localizedBrand,
                strapi.contentType("api::brand.brand")
            );

            return ctx.send({
                success: true,
                message: 'Brand retrieved successfully.',
                data: sanitizedBrand,
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