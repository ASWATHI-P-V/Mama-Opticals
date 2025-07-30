'use strict';

/**
 * support router
 */

const { createCoreRouter } = require('@strapi/strapi').factories;

module.exports = createCoreRouter('api::support.support', {
  // Disable default find, findOne, create, update, delete as we're creating custom ones.
  // This helps enforce your custom logic and response format.
  except: ['find', 'findOne', 'create', 'update', 'delete'],
  routes: [
    {
      method: 'POST',
      path: '/supports/send', // Endpoint for sending messages
      handler: 'api::support.support.sendMessage',
      config: {
        policies: ['global::is-authenticated'],
      },
    },
    {
      method: 'GET',
      path: '/supports/conversation/:conversationId', // Endpoint for getting a specific conversation
      handler: 'api::support.support.getConversation',
      config: {
        policies: ['global::is-authenticated'],
      },
    },
    {
      method: 'GET',
      path: '/supports/admin/conversations', // Endpoint for admin to see all conversations
      handler: 'api::support.support.getAllConversationsForAdmin',
      config: {
        policies: ['global::is-authenticated'], // Controller will handle admin role check
      },
    },
    {
        method: 'GET',
        path: '/supports/unread-count', // Endpoint for user's unread count
        handler: 'api::support.support.getUnreadCount',
        config: {
            policies: ['global::is-authenticated']
        }
    },
    {
        method: 'POST',
        path: '/supports/mark-read/admin', // Endpoint for admin to mark a conversation as read
        handler: 'api::support.support.markAsReadByAdmin',
        config: {
            policies: ['global::is-authenticated'] // Controller will handle admin role check
        }
    },
    {
        method: 'POST',
        path: '/supports/mark-read/user', // Endpoint for user to mark a conversation as read
        handler: 'api::support.support.markAsReadByUser',
        config: {
            policies: ['global::is-authenticated']
        }
    }
  ],
});