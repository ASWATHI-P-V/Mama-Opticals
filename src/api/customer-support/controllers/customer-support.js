'use strict';

/**
 * customer-support controller
 */

const { createCoreController } = require('@strapi/strapi').factories;
const { UnauthorizedError, ValidationError, NotFoundError } = require('@strapi/utils').errors;

const formatAndSendErrorResponse = (ctx, error) => {
  console.error("Error occurred:", error); // Log the full error for debugging

  let message = 'An unexpected error occurred.';
  let status = 500;
  let data = null; // Initialize data as null for error responses

  if (error.name === 'ValidationError') {
    status = 400; // Bad Request for validation errors
    if (error.details && error.details.errors && error.details.errors.length > 0) {
      const firstError = error.details.errors[0];

      // --- Custom Formatting for 'Unique' Validation Error ---
      if (firstError.path && firstError.path.length > 0 && firstError.message === "This attribute must be unique") {
        message = `${firstError.path[0]} must be unique`;
      } else {
      // --- End Custom Formatting ---
        // Fallback for other validation errors, combining message and path
        message = error.details.errors.map(err => {
          const path = err.path && err.path.length > 0 ? `(${err.path.join('.')})` : '';
          return `${err.message} ${path}`.trim();
        }).join('; ');
      }
    } else {
      message = error.message; // Fallback to main message if no details
    }
  } else if (error.status) { // Strapi errors (like UnauthorizedError, NotFoundError) often have a 'status' property
    status = error.status;
    message = error.message;
  } else {
    message = error.message || message; // Use error.message if available, else default generic message
  }

  // Include data: null explicitly in the response
  return ctx.send({ success: false, message: message, data: data }, status);
};


module.exports = createCoreController('api::customer-support.customer-support', ({ strapi }) => ({

  // Helper to format support chat messages for consistent API response
  _formatSupportMessage(message) {
    if (!message) return null;

    const attributes = message.attributes || message;

    return {
      id: attributes.id || message.id,
      message: attributes.message,
      sender: attributes.sender,
      createdAt: attributes.createdAt,
      readByAdmin: attributes.readByAdmin,
      readByUser: attributes.readByUser,
      conversationId: attributes.conversationId,
      attachments: attributes.attachments && attributes.attachments.length > 0 ? attributes.attachments.map(file => ({
        id: file.id,
        name: file.name,
        url: file.url,
        mime: file.mime,
        size: file.size,
        formats: file.formats
      })) : []
    };
  },

  /**
   * Send a new support message (user or admin) with optional attachments.
   */
  async sendMessage(ctx) {
    const { user } = ctx.state;
    // It's good practice to wrap ctx.request.body access in a safeguard for safety.
    // However, the core issue with the unique constraint is not directly from this.
    const { message, conversationId, attachmentIds } = ctx.request.body;

    try {
      if (!user) {
        throw new UnauthorizedError('Authentication required to send support messages.');
      }
      if ((!message || message.trim() === '') && (!attachmentIds || attachmentIds.length === 0)) {
        throw new ValidationError('Message or attachment is required.');
      }
      if (!conversationId) {
          throw new ValidationError('Conversation ID is required.');
      }

      let senderType;
      const isAdmin = user.roles && user.roles.some(role => role.name === 'Admin');
      senderType = isAdmin ? 'admin' : 'user';

      const messageData = {
        message: message,
        sender: senderType,
        user: user.id,
        conversationId: conversationId,
        readByAdmin: senderType === 'admin' ? true : false,
        readByUser: senderType === 'user' ? false : true,
        publishedAt: new Date()
      };

      if (attachmentIds && attachmentIds.length > 0) {
        messageData.attachments = attachmentIds;
      }

      const newSupportMessage = await strapi.entityService.create('api::customer-support.customer-support', {
        data: messageData,
        populate: ['attachments'],
      });

      return ctx.send({
        success: true,
        message: 'Support message sent successfully.',
        data: this._formatSupportMessage(newSupportMessage)
      }, 201);
    } catch (error) {
      return formatAndSendErrorResponse(ctx, error); // Use the new helper
    }
  },

  /**
   * Get messages for a specific support conversation of the authenticated user.
   */
  async getConversation(ctx) {
    const { user } = ctx.state;
    const { conversationId } = ctx.params;

    try {
      if (!user) {
        throw new UnauthorizedError('Authentication required to view support chat history.');
      }
      if (!conversationId) {
        throw new ValidationError('Conversation ID is required in the URL.');
      }

      const messages = await strapi.entityService.findMany('api::customer-support.customer-support', {
        filters: {
          user: user.id,
          conversationId: conversationId,
        },
        sort: ['createdAt:asc'],
        populate: ['attachments'],
      });

      if (!messages || messages.length === 0) {
        throw new NotFoundError(`Conversation with ID '${conversationId}' not found for this user.`);
      }

      const messagesToMarkRead = await strapi.db.query('api::customer-support.customer-support').findMany({
        select: ['id'],
        where: {
          user: user.id,
          conversationId: conversationId,
          sender: 'admin',
          readByUser: false
        },
      });

      if (messagesToMarkRead.length > 0) {
        const messageIds = messagesToMarkRead.map(msg => msg.id);
        await strapi.db.query('api::customer-support.customer-support').updateMany({
          where: {
            id: { $in: messageIds }
          },
          data: {
            readByUser: true
          }
        });
      }

      const formattedMessages = messages.map(msg => this._formatSupportMessage(msg));

      return ctx.send({
        success: true,
        message: `Support conversation ${conversationId} retrieved successfully.`,
        data: formattedMessages
      }, 200);

    } catch (error) {
      return formatAndSendErrorResponse(ctx, error); // Use the new helper
    }
  },

  async find(ctx) {
    try {
      // Call the original `find` method from the core controller.
      // This allows Strapi to handle query parameters like filters, sort, pagination, etc.
      const { data, meta } = await super.find(ctx);

      // Format each item in the data array using your helper
      const formattedData = data.map(item => this._formatSupportMessage(item));

      // Return in the desired custom format
      return ctx.send({
        success: true,
        message: 'All customer support messages retrieved successfully.',
        data: formattedData,
        // Optional: Include pagination meta if you want to expose it in your custom format
        // meta: meta
      }, 200);

    } catch (error) {
      // Use the consistent error handling helper for any errors during this process
      return formatAndSendErrorResponse(ctx, error);
    }
  },

  /**
   * Get a list of all support conversations for the admin, with latest message and unread count.
   */
  async getAllConversationsForAdmin(ctx) {
    const { user } = ctx.state;

    try {
      if (!user) {
        throw new UnauthorizedError('Authentication required.');
      }

      const isAdmin = user.roles && user.roles.some(role => role.name === 'Admin');
      if (!isAdmin) {
        throw new UnauthorizedError('Only administrators can view all support conversations.');
      }

      const distinctConversationIds = await strapi.db.query('api::customer-support.customer-support').findMany({
          select: ['conversationId'],
          groupBy: ['conversationId']
      });

      const result = [];
      for (const { conversationId } of distinctConversationIds) {
          const latestMessage = await strapi.db.query('api::customer-support.customer-support').findOne({
              where: { conversationId: conversationId },
              orderBy: { createdAt: 'desc' },
              populate: { user: { select: ['id', 'username', 'email'] } }
          });

          const unreadCount = await strapi.db.query('api::customer-support.customer-support').count({
              where: { conversationId: conversationId, sender: 'user', readByAdmin: false }
          });

          result.push({
              conversationId: conversationId,
              user: latestMessage && latestMessage.user ? {
                  id: latestMessage.user.id,
                  username: latestMessage.user.username,
                  email: latestMessage.user.email
              } : null,
              latestMessage: latestMessage ? this._formatSupportMessage(latestMessage) : null,
              unreadCountForAdmin: unreadCount
          });
      }

      await strapi.db.query('api::customer-support.customer-support').updateMany({
        where: {
          sender: 'user',
          readByAdmin: false
        },
        data: {
          readByAdmin: true
        }
      });

      return ctx.send({
        success: true,
        message: 'All support conversations retrieved for admin.',
        data: result
      }, 200);

    } catch (error) {
      return formatAndSendErrorResponse(ctx, error); // Use the new helper
    }
  },

  /**
   * Get unread message count for the current user (messages sent by admin to them).
   */
  async getUnreadCount(ctx) {
    const { user } = ctx.state;

    try {
      if (!user) {
        throw new UnauthorizedError('Authentication required.');
      }

      const unreadCount = await strapi.db.query('api::customer-support.customer-support').count({
        where: {
          user: user.id,
          sender: 'admin',
          readByUser: false
        }
      });

      return ctx.send({
        success: true,
        message: 'Unread support message count retrieved.',
        data: { unreadCount: unreadCount }
      }, 200);
    } catch (error) {
      return formatAndSendErrorResponse(ctx, error); // Use the new helper
    }
  },

  /**
   * Mark messages as read by admin for a specific conversation.
   */
  async markAsReadByAdmin(ctx) {
    const { conversationId } = ctx.request.body;
    const { user } = ctx.state;

    try {
      if (!user) {
          throw new UnauthorizedError('Authentication required.');
      }
      const isAdmin = user.roles && user.roles.some(role => role.name === 'Admin');
      if (!isAdmin) {
          throw new UnauthorizedError('Only administrators can mark messages as read.');
      }
      if (!conversationId) {
          throw new ValidationError('Conversation ID is required to mark messages as read.');
      }

      const result = await strapi.db.query('api::customer-support.customer-support').updateMany({
          where: {
              conversationId: conversationId,
              sender: 'user',
              readByAdmin: false
          },
          data: {
              readByAdmin: true
          }
      });

      return ctx.send({
          success: true,
          message: `Messages in support conversation ${conversationId} marked as read by admin.`,
          data: { count: result.count }
      }, 200);
    } catch (error) {
      return formatAndSendErrorResponse(ctx, error); // Use the new helper
    }
  },

  /**
   * Mark messages as read by user for a specific conversation.
   */
  async markAsReadByUser(ctx) {
    const { conversationId } = ctx.request.body;
    const { user } = ctx.state;

    try {
      if (!user) {
          throw new UnauthorizedError('Authentication required.');
      }
      if (!conversationId) {
          throw new ValidationError('Conversation ID is required to mark messages as read.');
      }

      const messagesToMarkRead = await strapi.db.query('api::customer-support.customer-support').findMany({
          select: ['id'],
          where: {
              user: user.id,
              conversationId: conversationId,
              sender: 'admin',
              readByUser: false
          },
      });

      let updatedCount = 0;
      if (messagesToMarkRead.length > 0) {
          const messageIds = messagesToMarkRead.map(msg => msg.id);
          const result = await strapi.db.query('api::customer-support.customer-support').updateMany({
              where: {
                  id: { $in: messageIds }
              },
              data: {
                  readByUser: true
              }
          });
          updatedCount = result.count;
      }

      return ctx.send({
          success: true,
          message: `Messages in support conversation ${conversationId} marked as read by user.`,
          data: { count: updatedCount }
      }, 200);
    } catch (error) {
      return formatAndSendErrorResponse(ctx, error); // Use the new helper
    }
  }

}));