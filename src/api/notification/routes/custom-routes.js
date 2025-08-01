'use strict';


module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/notifications/me',
      handler: 'notification.findMyNotifications',
     
    },
    
    {
      method: 'PUT',
      path: '/notifications/mark-read/:id',
      handler: 'notification.markAsRead',
      
    },
    
    {
      method: 'DELETE',
      path: '/notifications/:id', 
      handler: 'notification.deleteNotification',
      
    },
    
    {
      method: 'GET',
      path: '/notifications/me/unread-count',
      handler: 'notification.getUnreadCount',
      
    },
    
    {
      method: 'GET',
      path: '/notifications',
      handler: 'api::notification.notification.find',
      
    },
    
    {
      method: 'GET',
      path: '/notifications/:id',
      handler: 'api::notification.notification.findOne',
      
    },
    
    {
      method: 'POST',
      path: '/notifications',
      handler: 'api::notification.notification.create',
      
    },
    {
      method: 'PUT',
      path: '/notifications/:id',
      handler: 'api::notification.notification.update',
      
    },
    {
      method: 'DELETE',
      path: '/notifications/:id',
      handler: 'api::notification.notification.delete',
      
    },
  ]
};