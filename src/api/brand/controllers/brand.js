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
      const brand = await strapi.entityService.findOne(
        'api::brand.brand',
        id,
        {
          populate: ['localizations', 'image'], // Populate localizations and the Image field
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

      if (locale && locale !== defaultLocale) {
        const foundLocalization = brand.localizations.find(loc => loc.locale === locale);

        if (foundLocalization) {
          localizedBrand = await strapi.entityService.findOne(
            'api::brand.brand',
            foundLocalization.id,
            { 
              locale: locale,
              populate: ['image'] // Ensure Image is populated for the localized version too
            }
          );
        }
      }

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