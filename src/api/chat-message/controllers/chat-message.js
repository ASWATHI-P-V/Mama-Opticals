// src/api/chat-message/controllers/chat-message.js
'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { ValidationError, UnauthorizedError,NotFoundError } = require('@strapi/utils').errors;


const handleErrors = (error, ctx) => {
    console.error("Error occurred:", error);
    const errorMessage = String(error.message || 'An unexpected error occurred.');
    let statusCode = 500;

    if (error instanceof ValidationError) {
        statusCode = 400;
    } else if (error instanceof UnauthorizedError) {
        statusCode = 401;
    } else if (error.name === 'ForbiddenError') {
        statusCode = 403;
    } else if (error.name === 'NotFoundError') {
        statusCode = 404;
    } else if (errorMessage.includes("Missing required field")) {
        statusCode = 400;
    }

    ctx.status = statusCode;
    return { success: false, message: errorMessage, data: null };
};


module.exports = createCoreController('api::chat-message.chat-message', ({ strapi }) => ({

    /**
     * Send Message API (User to AI or AI to User, based on `sender` and `receiver` in request body)
     * POST /api/chat-messages
     *
     * Request Body Examples:
     * 1. User sends to AI:
     * { "sender": "13", "receiver": "expert", "messageContent": "Tell me a joke.", "attachments": [] }
     * (Here, '13' is the authenticated user's ID)
     *
     * 2. Frontend stores AI's response:
     * { "sender": "expert", "receiver": "13", "messageContent": "Why did the robot...", "attachments": [] }
     * (Here, '13' is the authenticated user's ID)
     *
     * The `user` ID in the stored message is always the authenticated user's ID.
     * The `isFromAI` field is determined by who the `sender` is in the request body.
     */
    async create(ctx) {
        try {
            const { body, files } = ctx.request;
            const requestData = body.data ? (typeof body.data === 'string' ? JSON.parse(body.data) : body.data) : body;

            // Get user ID from the authorization token - this is always the human participant
            const authenticatedUser = ctx.state.user;
            if (!authenticatedUser || !authenticatedUser.id) {
                throw new UnauthorizedError("User not authenticated. Authorization token required.");
            }
            const humanParticipantId = authenticatedUser.id;

            // Extract message details from requestData
            const { sender, receiver, messageContent } = requestData;
            const attachments = Array.isArray(requestData.attachments)
                ? requestData.attachments.map(id => parseInt(id, 10)).filter(id => !isNaN(id))
                : (requestData.attachments ? [parseInt(requestData.attachments, 10)].filter(id => !isNaN(id)) : []);

            if (!sender || !receiver || !messageContent) {
                throw new ValidationError("Missing required fields: sender, receiver, messageContent.");
            }

            let isMessageFromAI; // This will determine the value for the 'isFromAI' field in the schema

            // Logic to determine 'isFromAI' based on 'sender' and 'receiver'
            // One of them must be the authenticated user's ID, the other 'expert'.
            const parsedSenderId = parseInt(sender, 10);
            const parsedReceiverId = parseInt(receiver, 10);

            if (sender === "expert") {
                // Scenario: AI is the sender. The receiver MUST be the human participant's ID.
                if (parsedReceiverId !== humanParticipantId) {
                    throw new ValidationError(`If sender is 'expert', receiver must be the authenticated user's ID (${humanParticipantId}).`);
                }
                isMessageFromAI = true;
            } else if (receiver === "expert") {
                // Scenario: Human participant is the sender. The sender MUST be the human participant's ID.
                if (parsedSenderId !== humanParticipantId) {
                    throw new ValidationError(`If receiver is 'expert', sender must be the authenticated user's ID (${humanParticipantId}).`);
                }
                isMessageFromAI = false;
            } else {
                // Neither sender nor receiver is 'expert'. This implies a user-to-user chat, which is not intended.
                throw new ValidationError("Invalid chat participants. One participant must be 'expert' (AI).");
            }

            // Handle file uploads if any in multipart/form-data or existing attachment IDs
            let finalAttachmentIds = [];
            if (files && files.attachments) {
                const attachmentFiles = Array.isArray(files.attachments) ? files.attachments : [files.attachments];
                if (attachmentFiles.length > 0) {
                    const uploadedFiles = await Promise.all(
                        attachmentFiles.map(file => strapi.plugins.upload.services.upload.upload({
                            data: {},
                            files: file,
                        }).then(result => result[0]))
                    );
                    finalAttachmentIds = uploadedFiles.map(f => f.id);
                }
            } else if (attachments && attachments.length > 0) {
                for (const attachmentId of attachments) {
                    const fileEntity = await strapi.entityService.findOne('plugin::upload.file', attachmentId);
                    if (!fileEntity) {
                        throw new NotFoundError(`Attachment ID ${attachmentId} not found.`);
                    }
                }
                finalAttachmentIds = attachments;
            }

            // Create the chat message
            const newChatMessage = await strapi.entityService.create('api::chat-message.chat-message', {
                data: {
                    user: humanParticipantId, // Always link to the authenticated human user
                    messageContent: messageContent,
                    isFromAI: isMessageFromAI, // Determined by the 'sender'/'receiver' logic above
                    attachments: finalAttachmentIds,
                },
                populate: ['user', 'attachments'] // Populate user and attachments in the response
            });

            const sanitizedMessage = await this.sanitizeOutput(newChatMessage, ctx);

            ctx.status = 201; // Created
            return ctx.send({
                success: true,
                message: 'Message sent successfully.',
                data: sanitizedMessage,
            });

        } catch (error) {
            return handleErrors(error, ctx);
        }
    },

    /**
     * List Messages API (for a specific user's conversation with the AI)
     * GET /api/chat-messages?populate=user,attachments&sort=createdAt:asc
     * Automatically filters messages by the authenticated user.
     */
    async find(ctx) {
        try {
            const authenticatedUser = ctx.state.user;
            if (!authenticatedUser || !authenticatedUser.id) {
                throw new UnauthorizedError("User not authenticated. Authorization token required.");
            }
            const userId = authenticatedUser.id;

            await this.validateQuery(ctx);
            const sanitizedQueryParams = await this.sanitizeQuery(ctx);

            if (!sanitizedQueryParams.filters) {
                sanitizedQueryParams.filters = {};
            }
            sanitizedQueryParams.filters.user = { $eq: userId };

            const populateFields = new Set(sanitizedQueryParams.populate || []);
            populateFields.add('user');
            populateFields.add('attachments');
            sanitizedQueryParams.populate = Array.from(populateFields);

            const { results, pagination } = await strapi.service('api::chat-message.chat-message').find(sanitizedQueryParams);
            const sanitizedResults = await this.sanitizeOutput(results, ctx);

            return ctx.send({
                success: true,
                message: `Chat messages for user ${userId} fetched successfully.`,
                data: {
                    messages: sanitizedResults,
                    meta: pagination
                }
            });

        } catch (error) {
            return handleErrors(error, ctx);
        }
    },
}));