// File: src/api/chat-message/controllers/chat-message.js
'use strict';

/**
 * chat-message controller
 */

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::chat-message.chat-message', ({ strapi }) => ({
  /**
   * Custom find method to get messages for a specific session ID.
   * GET /api/chat-messages?filters[chat_sessions][session_id]=<your_session_id>&populate=attachments
   */
  async find(ctx) {
    try {
      await this.validateQuery(ctx);
      const sanitizedQueryParams = await this.sanitizeQuery(ctx);

      // Ensure 'populate=attachments' is always present for retrieving files
      if (!sanitizedQueryParams.populate || !sanitizedQueryParams.populate.includes('attachments')) {
          sanitizedQueryParams.populate = sanitizedQueryParams.populate ? [...sanitizedQueryParams.populate, 'attachments'] : ['attachments'];
      }

      // We expect a filter on chat_sessions.session_id (the relation field name on ChatMessage)
      if (
        !sanitizedQueryParams.filters ||
        !sanitizedQueryParams.filters.chat_sessions || // <--- REVERTED TO 'chat_sessions'
        !sanitizedQueryParams.filters.chat_sessions.session_id // <--- REVERTED TO 'chat_sessions'
      ) {
        ctx.status = 400;
        return ctx.send({
          success: false,
          message: 'Missing chat session ID filter. Use ?filters[chat_sessions][session_id]=YOUR_SESSION_ID', // <--- Updated message for clarity
          data: null
        });
      }

      const { results, pagination } = await strapi.service('api::chat-message.chat-message').find(sanitizedQueryParams);
      const sanitizedResults = await this.sanitizeOutput(results, ctx);

      return ctx.send({
        success: true,
        message: 'Chat messages fetched successfully',
        data: {
          messages: sanitizedResults,
          meta: pagination
        }
      });

    } catch (error) {
      console.error("Error fetching chat messages:", error);
      ctx.status = error.status || 500;
      return ctx.send({
        success: false,
        message: error.message || 'An error occurred while fetching chat messages',
        data: null
      });
    }
  },

  // ... (create method remains the same)
}));