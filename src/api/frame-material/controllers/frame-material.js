'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { sanitize } = require('@strapi/utils');

module.exports = createCoreController('api::frame-material.frame-material', ({ strapi }) => ({

    async find(ctx) {
    const { locale } = ctx.query;

    try {
      // Set the locale for the query, defaulting to 'en'
      const queryOptions = {
        locale: locale || 'en',
      };

      // Find all frame materials based on the provided locale
      const frameMaterials = await strapi.entityService.findMany(
        'api::frame-material.frame-material',
        queryOptions
      );

      // If no frame materials are found, return a not-found response
      if (!frameMaterials || frameMaterials.length === 0) {
        return ctx.notFound({
          success: false,
          message: 'No frame materials found for the specified locale.',
          data: [],
        });
      }

      // Sanitize the output for all retrieved frame materials
      const sanitizedFrameMaterials = await Promise.all(
        frameMaterials.map(material =>
          sanitize.contentAPI.output(
            material,
            strapi.contentType('api::frame-material.frame-material')
          )
        )
      );

      // Return the data in the desired format
      return ctx.send({
        success: true,
        message: 'Frame materials retrieved successfully.',
        data: sanitizedFrameMaterials,
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
      const frameMaterial = await strapi.entityService.findOne(
        'api::frame-material.frame-material',
        id,
        {
          populate: ['localizations'],
          locale: defaultLocale,
        }
      );

      if (!frameMaterial) {
        return ctx.notFound({
          success: false,
          message: 'Frame material not found.',
          data: null,
        });
      }

      let localizedFrameMaterial = frameMaterial;

      if (locale && locale !== defaultLocale) {
        const foundLocalization = frameMaterial.localizations.find(loc => loc.locale === locale);

        if (foundLocalization) {
          localizedFrameMaterial = await strapi.entityService.findOne(
            'api::frame-material.frame-material',
            foundLocalization.id,
            { locale: locale }
          );
        }
      }

      // Sanitize the output to remove sensitive fields
      const sanitizedFrameMaterial = await sanitize.contentAPI.output(
        localizedFrameMaterial,
        strapi.contentType("api::frame-material.frame-material")
      );

      // Return the data in the desired format
      return ctx.send({
        success: true,
        message: 'Frame material retrieved successfully.',
        data: sanitizedFrameMaterial,
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