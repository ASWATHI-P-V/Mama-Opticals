'use strict';


module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/customer-supports/send',
      handler: 'customer-support.sendMessage', 
    },
    {
      method: 'GET',
      path: '/customer-supports/conversation/:conversationId',
      handler: 'customer-support.getConversation',
    },
    {
      method: 'GET',
      path: '/customer-supports/admin/conversations',
      handler: 'customer-support.getAllConversationsForAdmin', 
    },
    {
      method: 'GET',
      path: '/customer-supports/unread-count',
      handler: 'customer-support.getUnreadCount',
    },
    {
      method: 'POST',
      path: '/customer-supports/mark-read/admin',
      handler: 'customer-support.markAsReadByAdmin',
    },
    {
      method: 'POST',
      path: '/customer-supports/mark-read/user',
      handler: 'customer-support.markAsReadByUser',
    },
  ],
};