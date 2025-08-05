'use strict';

/**
 * blog-post controller
 */

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::blog-post.blog-post', ({ strapi }) => ({
  /**
   * Custom find method to return data in { success, message, data } format.
   * GET /api/blog-posts
   */
  async find(ctx) {
    try {
      // Apply Strapi's default query parsing, sanitization, and validation
      await this.validateQuery(ctx);
      const sanitizedQueryParams = await this.sanitizeQuery(ctx);

      const populateFields = new Set(sanitizedQueryParams.populate || []);
      populateFields.add('backgroundImage'); // Assuming you want to populate the backgroundImage field
      populateFields.add("eye_care_category");
      populateFields.add("relatedBlogPosts"); 

      // Fetch data using the core service
      const { results, pagination } = await strapi.service('api::blog-post.blog-post').find({
        ...sanitizedQueryParams,
        populate: Array.from(populateFields),
      });

      // Sanitize the output (removes private fields, etc.)
      const sanitizedResults = await this.sanitizeOutput(results, ctx);

      // Transform the response to your desired format
      return ctx.send({
        success: true,
        message: 'Blog posts fetched successfully',
        data: {
          posts: sanitizedResults,
          meta: pagination // Include pagination meta if needed
        }
      });

    } catch (error) {
      console.error("Error fetching blog posts:", error);
      // Handle different types of errors if necessary (e.g., validation errors)
      ctx.status = error.status || 500;
      return ctx.send({
        success: false,
        message: error.message || 'An error occurred while fetching blog posts',
        data: null
      });
    }
  },

  /**
   * Custom findOne method to return data in { success, message, data } format.
   * GET /api/blog-posts/:slug (or :id if you configure routes to use ID)
   */
  async findOne(ctx) {
    const { slug } = ctx.params; // Assuming you're fetching by slug

    try {
      // Strapi's findOne requires an ID by default.
      // We need to query by slug first to get the ID, or modify the query
      // It's often easier to use the service directly for custom queries like this.

      // Validate and sanitize the query parameters (e.g., population)
      await this.validateQuery(ctx);
      const sanitizedQueryParams = await this.sanitizeQuery(ctx);

      const populateFields = new Set(sanitizedQueryParams.populate || []);
      populateFields.add("backgroundImage");
      populateFields.add("eye_care_category");
      populateFields.add("relatedBlogPosts");

      // Find the blog post by slug
      const entity = await strapi.db.query('api::blog-post.blog-post').findOne({
        where: { slug },
        populate: Array.from(populateFields) // Apply population from context
      });

      if (!entity) {
        ctx.status = 404;
        return ctx.send({
          success: false,
          message: 'Blog post not found',
          data: null
        });
      }

      // Sanitize the output
      const sanitizedEntity = await this.sanitizeOutput(entity, ctx);

      // Transform the response to your desired format
      return ctx.send({
        success: true,
        message: 'Blog post fetched successfully',
        data: sanitizedEntity
      });

    } catch (error) {
      console.error(`Error fetching blog post with slug ${slug}:`, error);
      ctx.status = error.status || 500;
      return ctx.send({
        success: false,
        message: error.message || 'An error occurred while fetching the blog post',
        data: null
      });
    }
  },
}));