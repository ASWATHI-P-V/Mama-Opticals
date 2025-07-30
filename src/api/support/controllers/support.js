'use strict';

/**
 * support controller
 */

const { createCoreController } = require('@strapi/strapi').factories;
const { UnauthorizedError, ValidationError, NotFoundError } = require('@strapi/utils').errors;

module.exports = createCoreController('api::support.support', ({ strapi }) => ({

  // Helper to format support chat messages for consistent API response
  _formatSupportMessage(message) {
    if (!message) return null;

    // Handle both direct object (from entityService.create/findOne) and wrapped object (from entityService.findMany)
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
        // Add other file properties you might need, e.g., formats for images
        formats: file.formats // Include image formats if available and useful for frontend
      })) : []
    };
  },

  /**
   * Send a new support message (user or admin) with optional attachments.
   * Expects message, conversationId, and optional attachmentIds in the request body.
   */
  async sendMessage(ctx) {
    const { user } = ctx.state;
    const { message, conversationId, attachmentIds } = ctx.request.body;

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
    // Determine sender type: 'admin' if the user has an admin role, 'user' otherwise.
    // Adjust 'Admin' role name if yours is different (e.g., 'Super Admin').
    const isAdmin = user.roles && user.roles.some(role => role.name === 'Admin');
    senderType = isAdmin ? 'admin' : 'user';

    const messageData = {
      message: message,
      sender: senderType,
      user: user.id, // Link to the user who initiated/is part of the conversation
      conversationId: conversationId,
      readByAdmin: senderType === 'admin' ? true : false, // Admin messages are read by admin from their perspective
      readByUser: senderType === 'user' ? false : true, // User messages are unread by user initially
      publishedAt: new Date() // Support messages are published immediately
    };

    if (attachmentIds && attachmentIds.length > 0) {
      messageData.attachments = attachmentIds; // Strapi expects an array of file IDs here
    }

    try {
      const newSupportMessage = await strapi.entityService.create('api::support.support', {
        data: messageData,
        populate: ['attachments'], // Crucially, populate attachments to get their details in the response
      });

      return ctx.send({
        success: true,
        message: 'Support message sent successfully.',
        data: this._formatSupportMessage(newSupportMessage)
      }, 201);
    } catch (error) {
      console.error('Error sending support message:', error);
      throw error;
    }
  },

  /**
   * Get messages for a specific support conversation of the authenticated user.
   */
  async getConversation(ctx) {
    const { user } = ctx.state;
    const { conversationId } = ctx.params;

    if (!user) {
      throw new UnauthorizedError('Authentication required to view support chat history.');
    }
    if (!conversationId) {
      throw new ValidationError('Conversation ID is required in the URL.');
    }

    try {
      // Fetch messages belonging to the specific user and conversationId, ordered by createdAt
      const messages = await strapi.entityService.findMany('api::support.support', {
        filters: {
          user: user.id,
          conversationId: conversationId,
        },
        sort: ['createdAt:asc'],
        populate: ['attachments'], // Populate attachments when retrieving conversations
      });

      // Mark messages sent by admin as read by user when user retrieves them
      await strapi.db.query('api::support.support').updateMany({
        where: {
          user: user.id,
          conversationId: conversationId,
          sender: 'admin',
          readByUser: false
        },
        data: {
          readByUser: true
        }
      });

      const formattedMessages = messages.map(msg => this._formatSupportMessage(msg));

      return ctx.send({
        success: true,
        message: `Support conversation ${conversationId} retrieved successfully.`,
        data: formattedMessages
      }, 200);

    } catch (error) {
      console.error('Error fetching support conversation:', error);
      throw error;
    }
  },

  /**
   * Get a list of all support conversations for the admin, with latest message and unread count.
   */
  async getAllConversationsForAdmin(ctx) {
    const { user } = ctx.state;

    if (!user) {
      throw new UnauthorizedError('Authentication required.');
    }

    const isAdmin = user.roles && user.roles.some(role => role.name === 'Admin');
    if (!isAdmin) {
      throw new UnauthorizedError('Only administrators can view all support conversations.');
    }

    try {
      // Find all unique conversation IDs
      const distinctConversationIds = await strapi.db.query('api::support.support').findMany({
          select: ['conversationId'],
          groupBy: ['conversationId']
      });

      const result = [];
      for (const { conversationId } of distinctConversationIds) {
          // Get the latest message for this conversation
          const latestMessage = await strapi.db.query('api::support.support').findOne({
              where: { conversationId: conversationId },
              orderBy: { createdAt: 'desc' },
              populate: { user: { select: ['id', 'username', 'email'] } } // Populate user who owns the conversation
          });

          // Count unread messages from user for this conversation (for admin's view)
          const unreadCount = await strapi.db.query('api::support.support').count({
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

      // Mark all user messages as read by admin (general update when admin views the list)
      await strapi.db.query('api::support.support').updateMany({
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
      console.error('Error fetching all support conversations for admin:', error);
      throw error;
    }
  },

  /**
   * Get unread message count for the current user (messages sent by admin to them).
   */
  async getUnreadCount(ctx) {
    const { user } = ctx.state;

    if (!user) {
      throw new UnauthorizedError('Authentication required.');
    }

    try {
      const unreadCount = await strapi.db.query('api::support.support').count({
        where: {
          user: user.id,
          sender: 'admin', // Count messages sent by admin
          readByUser: false
        }
      });

      return ctx.send({
        success: true,
        message: 'Unread support message count retrieved.',
        data: { unreadCount: unreadCount }
      }, 200);
    } catch (error) {
      console.error('Error fetching unread support count:', error);
      throw error;
    }
  },

  /**
   * Mark messages as read by admin for a specific conversation.
   */
  async markAsReadByAdmin(ctx) {
    const { conversationId } = ctx.request.body;
    const { user } = ctx.state;

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

    try {
        const result = await strapi.db.query('api::support.support').updateMany({
            where: {
                conversationId: conversationId,
                sender: 'user', // Mark messages sent by the user
                readByAdmin: false
            },
            data: {
                readByAdmin: true
            }
        });

        return ctx.send({
            success: true,
            message: `Messages in support conversation ${conversationId} marked as read by admin.`,
            data: { count: result.count } // Show how many messages were updated
        }, 200);
    } catch (error) {
        console.error('Error marking support messages as read by admin:', error);
        throw error;
    }
  },

  /**
   * Mark messages as read by user for a specific conversation.
   */
  async markAsReadByUser(ctx) {
    const { conversationId } = ctx.request.body;
    const { user } = ctx.state;

    if (!user) {
        throw new UnauthorizedError('Authentication required.');
    }
    if (!conversationId) {
        throw new ValidationError('Conversation ID is required to mark messages as read.');
    }

    try {
        const result = await strapi.db.query('api::support.support').updateMany({
            where: {
                user: user.id, // Crucial: only mark for the current user's conversation
                conversationId: conversationId,
                sender: 'admin', // Mark messages sent by admin
                readByUser: false
            },
            data: {
                readByUser: true
            }
        });

        return ctx.send({
            success: true,
            message: `Messages in support conversation ${conversationId} marked as read by user.`,
            data: { count: result.count }
        }, 200);
    } catch (error) {
        console.error('Error marking support messages as read by user:', error);
        throw error;
    }
  }

}));