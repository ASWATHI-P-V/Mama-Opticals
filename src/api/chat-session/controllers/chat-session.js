// src/api/chat-session/controllers/chat-session.js
'use strict';

/**
 * chat-session controller
 */

const { createCoreController } = require('@strapi/strapi').factories;
const { ValidationError, NotFoundError } = require('@strapi/utils').errors;

// Helper function for error handling (can be global or within controller)
const handleErrors = (error, ctx) => {
    console.error("Error occurred:", error);
    const errorMessage = String(error.message || 'An unexpected error occurred.');
    let statusCode = 500;

    if (error instanceof ValidationError) {
        statusCode = 400;
    } else if (error instanceof NotFoundError) {
        statusCode = 404;
    } else if (errorMessage.includes("Missing required field")) {
        statusCode = 400;
    }

    ctx.status = statusCode;
    return { success: false, message: errorMessage, data: null };
};

module.exports = createCoreController('api::chat-session.chat-session', ({ strapi }) => ({

    /**
     * Custom find method to list all chat sessions (conversations) a user is involved in.
     * GET /api/chat/sessions?userId=<user_id>
     * Optionally accepts filters/pagination for sessions.
     */
    async find(ctx) {
        try {
            const { query } = ctx;
            const userId = query.userId; // Expect a userId query parameter

            if (!userId) {
                throw new ValidationError("Missing userId query parameter. Use ?userId=YOUR_USER_ID");
            }

            // Validate user existence (optional, but good practice)
            const userExists = await strapi.entityService.findOne('plugin::users-permissions.user', userId);
            if (!userExists) {
                throw new NotFoundError(`User with ID ${userId} not found.`);
            }

            // Find sessions where the user is one of the participants
            // This relies on the `session_id` format: `chat-lowerId-higherId`
            const sessions = await strapi.entityService.findMany('api::chat-session.chat-session', {
                filters: {
                    $or: [
                        { session_id: { $startsWith: `chat-${userId}-` } },
                        { session_id: { $endsWith: `-${userId}` } }
                    ]
                },
                populate: ['user'], // Populate the 'user' field of the session if needed
                sort: 'updatedAt:desc', // Sort by most recent activity
                ...ctx.query, // Allow other Strapi query parameters (e.g., pagination, populate)
            });

            // Sanitize the output
            const sanitizedSessions = await this.sanitizeOutput(sessions, ctx);

            ctx.status = 200;
            return ctx.send({
                success: true,
                message: 'Chat sessions fetched successfully.',
                data: {
                    sessions: sanitizedSessions,
                    // You might want to add pagination meta here if you enable it for findMany
                },
            });

        } catch (error) {
            return handleErrors(error, ctx);
        }
    },

    // You likely won't need a custom create method for chat-sessions if they are created
    // automatically by the chat-message controller.
    // However, if you need one, it would follow the standard Strapi create logic.

    // findOne method (standard Strapi functionality is usually sufficient)
    // async findOne(ctx) {
    //     const { id } = ctx.params;
    //     const session = await strapi.entityService.findOne('api::chat-session.chat-session', id, {
    //         populate: ['user', 'messages'] // Populate messages if you want to get all messages with the session
    //     });
    //     if (!session) {
    //         throw new NotFoundError('Chat session not found.');
    //     }
    //     const sanitizedSession = await this.sanitizeOutput(session, ctx);
    //     return ctx.send({
    //         success: true,
    //         message: 'Chat session retrieved successfully.',
    //         data: sanitizedSession
    //     });
    // }
}));