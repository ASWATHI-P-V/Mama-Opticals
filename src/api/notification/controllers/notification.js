'use strict';

/**
 * notification controller
 */

const { createCoreController } = require('@strapi/strapi').factories;
const strapiUtils = require("@strapi/utils"); // Import the entire @strapi/utils module
const { ValidationError, UnauthorizedError } = strapiUtils.errors; // Ensure necessary errors are imported

// --- Local Helper Functions (Copied from address.js for consistency) ---
// Note: In a larger project, it's better to put these in a shared `utils` file
// (e.g., `src/utils/error-handlers.js`) and import them into both controllers.

const handleErrors = (error) => {
  console.error("Error occurred:", error);
  const errorMessage = String(error.message || ''); // Ensure message is a string for robust comparison

  // Prioritize Strapi's ValidationError messages
  if (error.name === "ValidationError") {
    return { message: errorMessage };
  }
  if (error.name === "NotFoundError") {
    return { message: errorMessage };
  }
  // Fallback for generic errors, including "Missing required field" from validateBodyRequiredFields
  if (errorMessage.includes("Missing required field")) { // Although not explicitly used in notification, keep for consistency
    return { message: errorMessage };
  }
  // Fallback for any other unexpected errors
  return { message: "An unexpected error occurred." };
};

const handleStatusCode = (error) => {
  const errorMessage = String(error.message || ''); // Ensure message is a string for robust comparison

  // Prioritize Strapi's ValidationError status
  if (error.name === "ValidationError") return 400;
  if (error.name === "NotFoundError") return 404;
  // Fallback for generic errors, including "Missing required field" from validateBodyRequiredFields
  if (errorMessage.includes("Missing required field")) { // Although not explicitly used in notification, keep for consistency
    return 400;
  }
  // If it's a generic error not matching specific messages, assume 500 for server-side issues
  return 500;
};

// Re-defining NotFoundError as a class since it's used with `instanceof`
// If `NotFoundError` from `@strapi/utils` is suitable and always available,
// you might not need to redefine it, but your `address.js` does, so we mirror it.
class NotFoundError extends Error {
  constructor(message = "Not Found") {
    super(message);
    this.name = "NotFoundError";
  }
}
// --- End Local Helper Functions ---


module.exports = createCoreController('api::notification.notification', ({ strapi }) => ({

  // Custom method to get notifications for the authenticated user
  async findMyNotifications(ctx) {
    const { user } = ctx.state;
    const { _q, read } = ctx.query; // Allow filtering by read status or search query

    try {
      if (!user) {
        throw new UnauthorizedError('Authentication required to view notifications.');
      }

      const filters = {
        user: user.id,
      };

      if (read !== undefined) {
        filters.read = read === 'true'; // Convert string 'true'/'false' to boolean
      }

      const notifications = await strapi.entityService.findMany('api::notification.notification', {
        filters: filters,
        sort: [{ sentAt: 'desc' }], // Show most recent notifications first
        populate: ['relatedOrder'], // Populate related order if exists
      });

      // Format the notifications for consistent response
      const formattedNotifications = notifications.map(notification => ({
        id: notification.id,
        title: notification.title,
        message: notification.message,
        read: notification.read,
        sentAt: notification.sentAt,
        type: notification.type,
        relatedOrder: notification.relatedOrder ? {
          id: notification.relatedOrder.id,
          orderID: notification.relatedOrder.orderID,
          status: notification.relatedOrder.status
        } : null,
      }));

      return ctx.send({
        success: true,
        message: 'Notifications retrieved successfully.',
        data: formattedNotifications
      }, 200);

    } catch (error) {
      // Use the consistent error handling
      const customizedError = handleErrors(error);
      return ctx.send(
        { success: false, message: customizedError.message },
        handleStatusCode(error) || 500
      );
    }
  },

  // Custom method to mark a notification as read
  async markAsRead(ctx) {
    const { user } = ctx.state;
    const { id } = ctx.params; // Notification ID from URL

    try {
      if (!user) {
        throw new UnauthorizedError('Authentication required to mark notifications as read.');
      }
      if (!id) {
        throw new ValidationError('Notification ID is required.');
      }

      const notification = await strapi.entityService.findOne('api::notification.notification', id, {
        filters: { user: user.id } // Ensure user can only mark their own notifications
      });

      if (!notification) {
        throw new NotFoundError(`Notification with ID '${id}' not found or does not belong to the user.`);
      }

      if (notification.read) {
        return ctx.send({
          success: true,
          message: `Notification '${id}' is already marked as read.`,
          data: { id: notification.id, read: true }
        }, 200);
      }

      const updatedNotification = await strapi.entityService.update('api::notification.notification', id, {
        data: { read: true },
        populate: ['relatedOrder'],
      });

      return ctx.send({
        success: true,
        message: `Notification '${id}' marked as read.`,
        data: {
          id: updatedNotification.id,
          title: updatedNotification.title,
          message: updatedNotification.message,
          read: updatedNotification.read,
          sentAt: updatedNotification.sentAt,
          type: updatedNotification.type,
          relatedOrder: updatedNotification.relatedOrder ? {
            id: updatedNotification.relatedOrder.id,
            orderID: updatedNotification.relatedOrder.orderID,
            status: updatedNotification.relatedOrder.status
          } : null,
        }
      }, 200);

    } catch (error) {
      // Use the consistent error handling
      const customizedError = handleErrors(error);
      return ctx.send(
        { success: false, message: customizedError.message },
        handleStatusCode(error) || 500
      );
    }
  },

  // Custom method to delete a notification
  async deleteNotification(ctx) {
    const { user } = ctx.state;
    const { id } = ctx.params;

    try {
      if (!user) {
        throw new UnauthorizedError('Authentication required to delete notifications.');
      }
      if (!id) {
        throw new ValidationError('Notification ID is required.');
      }

      const notification = await strapi.entityService.findOne('api::notification.notification', id, {
        filters: { user: user.id } // Ensure user can only delete their own notifications
      });

      if (!notification) {
        throw new NotFoundError(`Notification with ID '${id}' not found or does not belong to the user.`);
      }

      await strapi.entityService.delete('api::notification.notification', id);

      return ctx.send({
        success: true,
        message: `Notification '${id}' deleted successfully.`,
        data: { id: id }
      }, 200);

    } catch (error) {
      // Use the consistent error handling
      const customizedError = handleErrors(error);
      return ctx.send(
        { success: false, message: customizedError.message },
        handleStatusCode(error) || 500
      );
    }
  },

  // Custom method to get the count of unread notifications for a user
  async getUnreadCount(ctx) {
    const { user } = ctx.state;

    try {
      if (!user) {
        throw new UnauthorizedError('Authentication required to get unread notification count.');
      }

      const unreadCount = await strapi.entityService.count('api::notification.notification', {
        filters: { user: user.id, read: false },
      });

      return ctx.send({
        success: true,
        message: 'Unread notification count retrieved successfully.',
        data: { count: unreadCount }
      }, 200);

    } catch (error) {
      // Use the consistent error handling
      const customizedError = handleErrors(error);
      return ctx.send(
        { success: false, message: customizedError.message },
        handleStatusCode(error) || 500
      );
    }
  },

}));