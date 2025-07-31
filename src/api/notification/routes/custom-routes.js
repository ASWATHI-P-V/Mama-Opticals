'use strict';

/**
 * notification router
 */

const { createCoreRouter } = require('@strapi/strapi').factories;

module.exports = createCoreRouter('api::notification.notification', {
  routes: [
    // Default Strapi routes (GET /notifications, GET /notifications/:id, POST, PUT, DELETE)
    // You might want to remove some of these default routes if they are not needed or pose security risks.

    // Custom route to get authenticated user's notifications
    {
      method: 'GET',
      path: '/notifications/me',
      handler: 'notification.findMyNotifications',
     
    },
    // Custom route to mark a notification as read
    {
      method: 'PUT',
      path: '/notifications/mark-read/:id',
      handler: 'notification.markAsRead',
      
    },
    // Custom route to delete a notification
    {
      method: 'DELETE',
      path: '/notifications/:id', // Overrides default delete, but with user check
      handler: 'notification.deleteNotification',
      
    },
    // Custom route to get unread notification count
    {
      method: 'GET',
      path: '/notifications/me/unread-count',
      handler: 'notification.getUnreadCount',
      
    },
    // Standard Strapi `find` route (GET /notifications) - You might want to restrict this or use it for admin
    {
      method: 'GET',
      path: '/notifications',
      handler: 'api::notification.notification.find',
      
    },
    // Standard Strapi `findOne` route (GET /notifications/:id)
    {
      method: 'GET',
      path: '/notifications/:id',
      handler: 'api::notification.notification.findOne',
      
    },
    // Standard Strapi `create` route (POST /notifications)
    {
      method: 'POST',
      path: '/notifications',
      handler: 'api::notification.notification.create',
      
    },
    // Standard Strapi `update` route (PUT /notifications/:id)
    {
      method: 'PUT',
      path: '/notifications/:id',
      handler: 'api::notification.notification.update',
      
    },
    // Standard Strapi `delete` route (DELETE /notifications/:id)
    // Note: Our custom deleteNotification provides user-specific deletion.
    // This default one might still be useful for admin.
    {
      method: 'DELETE',
      path: '/notifications/:id',
      handler: 'api::notification.notification.delete',
      
    },
  ]
});