'use strict';

/**
 * eye-care-category controller
 */

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::eye-care-category.eye-care-category', ({ strapi }) => ({
  /**
   * Custom find method to return data in { success, message, data } format.
   * GET /api/eye-care-categories
   */
  async find(ctx) {
    try {
      // Apply Strapi's default query parsing, sanitization, and validation
      await this.validateQuery(ctx);
      const sanitizedQueryParams = await this.sanitizeQuery(ctx);

      // Fetch data using the core service
      const { results, pagination } = await strapi.service('api::eye-care-category.eye-care-category').find(sanitizedQueryParams);

      // Sanitize the output (removes private fields, etc.)
      const sanitizedResults = await this.sanitizeOutput(results, ctx);

      // Transform the response to your desired format
      return ctx.send({
        success: true,
        message: 'Eye care categories fetched successfully',
        data: {
          categories: sanitizedResults,
          meta: pagination // Include pagination meta if needed
        }
      });

    } catch (error) {
      console.error("Error fetching eye care categories:", error);
      ctx.status = error.status || 500;
      return ctx.send({
        success: false,
        message: error.message || 'An error occurred while fetching eye care categories',
        data: null
      });
    }
  },

  /**
   * Custom findOne method to return data in { success, message, data } format.
   * GET /api/eye-care-categories/:slug (or :id if you configure routes to use ID)
   */
  async findOne(ctx) {
    const { slug } = ctx.params; // Assuming you're fetching by slug

    try {
      // Validate and sanitize the query parameters (e.g., population)
      await this.validateQuery(ctx);
      const sanitizedQueryParams = await this.sanitizeQuery(ctx);

      // Find the eye care category by slug
      const entity = await strapi.db.query('api::eye-care-category.eye-care-category').findOne({
        where: { slug },
        populate: sanitizedQueryParams.populate // Apply population from context
      });

      if (!entity) {
        ctx.status = 404;
        return ctx.send({
          success: false,
          message: 'Eye care category not found',
          data: null
        });
      }

      // Sanitize the output
      const sanitizedEntity = await this.sanitizeOutput(entity, ctx);

      // Transform the response to your desired format
      return ctx.send({
        success: true,
        message: 'Eye care category fetched successfully',
        data: sanitizedEntity
      });

    } catch (error) {
      console.error(`Error fetching eye care category with slug ${slug}:`, error);
      ctx.status = error.status || 500;
      return ctx.send({
        success: false,
        message: error.message || 'An error occurred while fetching the eye care category',
        data: null
      });
    }
  },
}));