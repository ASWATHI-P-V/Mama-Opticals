'use strict';

/**
 * video controller
 */

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::video.video', ({ strapi }) => ({
    /**
     * Custom find method to list all videos with populated relations.
     * GET /api/videos
     */
    async find(ctx) {
        try {
            await this.validateQuery(ctx);
            const sanitizedQueryParams = await this.sanitizeQuery(ctx);

            // Add 'video', 'eye_care_category', and 'relatedVideos' to the populate list.
            const populateFields = new Set(sanitizedQueryParams.populate || []);
            populateFields.add('video');
            populateFields.add('eye_care_category');
            populateFields.add('relatedVideos'); // Added to ensure it's always included

            const { results, pagination } = await strapi.service('api::video.video').find({
                ...sanitizedQueryParams,
                populate: Array.from(populateFields)
            });

            const sanitizedResults = await this.sanitizeOutput(results, ctx);

            return ctx.send({
                success: true,
                message: 'Videos fetched successfully',
                data: {
                    videos: sanitizedResults,
                    meta: pagination
                }
            });

        } catch (error) {
            console.error("Error fetching videos:", error);
            ctx.status = error.status || 500;
            return ctx.send({
                success: false,
                message: error.message || 'An error occurred while fetching videos',
                data: null
            });
        }
    },

    /**
     * Custom findOne method to return a single video in { success, message, data } format.
     * GET /api/videos/:slug (or :id)
     */
    async findOne(ctx) {
        const { slug } = ctx.params;

        try {
            await this.validateQuery(ctx);
            const sanitizedQueryParams = await this.sanitizeQuery(ctx);

            // Ensure 'video', 'eye_care_category', and 'relatedVideos' are always populated
            const populateFields = new Set(sanitizedQueryParams.populate || []);
            populateFields.add('video');
            populateFields.add('eye_care_category');
            populateFields.add('relatedVideos'); // Added to ensure it's always included
            
            const entity = await strapi.db.query('api::video.video').findOne({
                where: { slug },
                populate: Array.from(populateFields)
            });

            if (!entity) {
                ctx.status = 404;
                return ctx.send({
                    success: false,
                    message: 'Video not found',
                    data: null
                });
            }

            const sanitizedEntity = await this.sanitizeOutput(entity, ctx);

            return ctx.send({
                success: true,
                message: 'Video fetched successfully',
                data: sanitizedEntity
            });

        } catch (error) {
            console.error(`Error fetching video with slug ${slug}:`, error);
            ctx.status = error.status || 500;
            return ctx.send({
                success: false,
                message: error.message || 'An error occurred while fetching the video',
                data: null
            });
        }
    },
}));

// "use strict";

// /**
//  * video controller
//  */

// const { createCoreController } = require("@strapi/strapi").factories;

// module.exports = createCoreController("api::video.video", ({ strapi }) => ({
//   /**
//    * Custom find method to return data in { success, message, data } format.
//    * GET /api/videos
//    */
//   async find(ctx) {
//     try {
//       // Apply Strapi's default query parsing, sanitization, and validation
//       await this.validateQuery(ctx);
//       const sanitizedQueryParams = await this.sanitizeQuery(ctx);
//       const populateFields = new Set(sanitizedQueryParams.populate || []);
//       populateFields.add("video");
//       populateFields.add("eye_care_category");
//       populateFields.add("relatedVideos");

//       const { results, pagination } = await strapi
//         .service("api::video.video")
//         .find({
//           ...sanitizedQueryParams,
//           populate: Array.from(populateFields),
//         });
//       // Sanitize the output (removes private fields, etc.)
//       const sanitizedResults = await this.sanitizeOutput(results, ctx);

//       // Transform the response to your desired format
//       return ctx.send({
//         success: true,
//         message: "Videos fetched successfully",
//         data: {
//           videos: sanitizedResults,
//           meta: pagination, // Include pagination meta if needed
//         },
//       });
//     } catch (error) {
//       console.error("Error fetching videos:", error);
//       ctx.status = error.status || 500;
//       return ctx.send({
//         success: false,
//         message: error.message || "An error occurred while fetching videos",
//         data: null,
//       });
//     }
//   },

//   /**
//    * Custom findOne method to return data in { success, message, data } format.
//    * GET /api/videos/:slug (or :id if you configure routes to use ID)
//    */
//   async findOne(ctx) {
//     const { slug } = ctx.params; // Assuming you're fetching by slug

//     try {
//       // Validate and sanitize the query parameters (e.g., population)
//       await this.validateQuery(ctx);
//       const sanitizedQueryParams = await this.sanitizeQuery(ctx);
//       const populateFields = new Set(sanitizedQueryParams.populate || []);
//       populateFields.add("video");
//       populateFields.add("eye_care_category");
//       populateFields.add("relatedVideos");
//       // Find the video by slug
//       const entity = await strapi.db.query("api::video.video").findOne({
//         where: { slug },
//         populate: Array.from(populateFields), // Apply population from context
//       });

//       if (!entity) {
//         ctx.status = 404;
//         return ctx.send({
//           success: false,
//           message: "Video not found",
//           data: null,
//         });
//       }

//       // Sanitize the output
//       const sanitizedEntity = await this.sanitizeOutput(entity, ctx);

//       // Transform the response to your desired format
//       return ctx.send({
//         success: true,
//         message: "Video fetched successfully",
//         data: sanitizedEntity,
//       });
//     } catch (error) {
//       console.error(`Error fetching video with slug ${slug}:`, error);
//       ctx.status = error.status || 500;
//       return ctx.send({
//         success: false,
//         message: error.message || "An error occurred while fetching the video",
//         data: null,
//       });
//     }
//   },
// }));
