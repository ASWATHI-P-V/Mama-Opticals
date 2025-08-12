'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { ValidationError, ForbiddenError } = require("@strapi/utils").errors;


// Helper to recalculate product rating & review count
const recalculateProductRating = async (productId) => {
    const product = await strapi.entityService.findOne(
        "api::product.product",
        productId, {
            populate: ["reviews"]
        }
    );

    if (!product) return;

    const reviewCount = product.reviews.length;
    const averageRating =
        reviewCount > 0 ?
        product.reviews.reduce((sum, r) => sum + r.rating, 0) / reviewCount :
        0;

    await strapi.entityService.update("api::product.product", productId, {
        data: {
            average_rating: parseFloat(averageRating.toFixed(2)),
            reviewCount,
        },
    });
};

const defaultPopulate = {
    user: { fields: ["id", "name", "email"] },
    product: { fields: ["id", "name", "price"] },
};

const handleErrors = (error) => {
    console.error("Error occurred:", error);
    const errorMessage = String(error.message || "");
    if (error.name === "YupValidationError") return { message: error.message };
    if (error.name === "ValidationError") return { message: errorMessage };
    if (error.name === "ForbiddenError") return { message: errorMessage };
    if (errorMessage.includes("Missing required field")) return { message: errorMessage };
    return { message: "An unexpected error occurred." };
};

const handleStatusCode = (error) => {
    const errorMessage = String(error.message || "");
    if (error.name === "YupValidationError") return 400;
    if (error.name === "ValidationError") return 400;
    if (error.name === "ForbiddenError") return 403;
    if (errorMessage.includes("Missing required field")) return 400;
    return 500;
};

module.exports = createCoreController("api::review.review", ({ strapi }) => ({

    // Create a review
    async create(ctx) {
        try {
            const { id: userId } = ctx.state.user;
            if (!userId) throw new ValidationError('User not authenticated.');
            
            const requestData = ctx.request.body;

            if (!requestData || !requestData.product) {
                throw new ValidationError('Request body must contain a product ID.');
            }
            
            const productToReview = requestData.product;

            // ❗ NEW: Validate that the product exists before proceeding
            const productExists = await strapi.entityService.findOne(
                "api::product.product",
                productToReview
            );

            if (!productExists) {
                // The updated error message is here
                throw new ValidationError("No product found with the given ID.");
            }

            // Check if a review already exists for this user and product
            const existingReview = await strapi.entityService.findMany("api::review.review", {
                filters: {
                    user: { id: userId },
                    product: { id: productToReview }
                },
            });

            if (existingReview && existingReview.length > 0) {
                throw new ForbiddenError("You have already reviewed this product.");
            }

            // Ensure the data payload is correctly formatted for Strapi's internal methods
            const dataWithUser = {
                ...requestData,
                user: userId
            };
            ctx.request.body = { data: dataWithUser };

            const response = await super.create(ctx);
            const createdReview = await strapi.entityService.findOne(
                "api::review.review",
                response.data.id, {
                    populate: {
                        product: {
                            fields: ["id", "name", "price"],
                        },
                        user: {
                            fields: ["id", "name", "email"],
                        }
                    }
                }
            );
            if (createdReview && createdReview.product) {
                await recalculateProductRating(createdReview.product.id);
            }

            // Custom success response without the data wrapper
            return ctx.send({
                success: true,
                message: "Review created successfully.",
                data: createdReview,
            });

        } catch (error) {
            const customizedError = handleErrors(error);
            ctx.status = handleStatusCode(error);
            return ctx.send({
                success: false,
                message: customizedError.message
            });
        }
    },

    // Update a review
    async update(ctx) {
        const { id } = ctx.params;
        const userId = ctx.state.user.id;

        const existingReview = await strapi.entityService.findOne(
            "api::review.review",
            id, { populate: ["user", "product"] }
        );

        if (!existingReview) {
            return ctx.notFound("Review not found.");
        }
        if (existingReview.user.id !== userId) {
            return ctx.forbidden("You can only update your own reviews.");
        }
        
        // ❗ Reads the request body directly and wraps it for Strapi's internal update method
        const requestBody = ctx.request.body;
        if (!requestBody) {
             throw new ValidationError('Request body must contain data for the update.');
        }
        ctx.request.body = { data: requestBody };

        const response = await super.update(ctx);

        const updatedReview = await strapi.entityService.findOne(
            "api::review.review",
            response.data.id, {
                populate: {
                        product: {
                            fields: ["id", "name", "price"],
                        },
                        user: {
                            fields: ["id", "name", "email"],
                        }
                    }
            }
        );
        if (updatedReview && updatedReview.product) {
            await recalculateProductRating(updatedReview.product.id);
        }
        
        // Custom success response without the data wrapper
        return ctx.send({
            success: true,
            message: "Review updated successfully.",
            data: updatedReview,
        });
    },

    // Delete a review
    async delete(ctx) {
        const { id } = ctx.params;
        const userId = ctx.state.user.id;

        const review = await strapi.entityService.findOne(
            "api::review.review",
            id, {
                populate: {
                    user: {
                        fields: ["id", "name", "email"],
                    },
                    product: {
                        fields: ["id", "name", "price"],
                    }
                }
            }
        );

        if (!review) return ctx.notFound("Review not found.");
        if (review.user.id !== userId) {
            return ctx.forbidden("You can only delete your own reviews.");
        }

        await strapi.entityService.delete("api::review.review", id);

        await recalculateProductRating(review.product.id);

        return ctx.send({
            success: true,
            message: "Review deleted successfully.",
            data: null,
            meta: {},
        });
    },

    // Default find and findOne methods are inherited
    async find(ctx) {
        ctx.query = {
            ...ctx.query,
            populate: defaultPopulate,
        };
        const reviews = await strapi.entityService.findMany(
            "api::review.review",
            ctx.query
        );
        return ctx.send({
            success: true,
            message: "Reviews fetched successfully.",
            data: reviews,
            meta: {},
        });
    },

    async findOne(ctx) {
        const { id } = ctx.params;
        const review = await strapi.entityService.findOne(
            "api::review.review",
            id, { populate: defaultPopulate }
        );
        if (!review) return ctx.notFound("Review not found.");
        return ctx.send({
            success: true,
            message: "Review fetched successfully.",
            data: review,
            meta: {},
        });
    },
}));





// "use strict";

// const { createCoreController } = require('@strapi/strapi').factories;
// const { ValidationError, NotFoundError } = require("@strapi/utils").errors;

// // Corrected path for your utility functions, if they are in ../../../utils/error-handlers


// // Helper to recalculate product rating & review count
// const recalculateProductRating = async (productId) => {
//     const product = await strapi.entityService.findOne(
//         "api::product.product",
//         productId, {
//             populate: ["reviews"]
//         }
//     );

//     if (!product) return;

//     const reviewCount = product.reviews.length;
//     const averageRating =
//         reviewCount > 0 ?
//         product.reviews.reduce((sum, r) => sum + r.rating, 0) / reviewCount :
//         0;

//     await strapi.entityService.update("api::product.product", productId, {
//         data: {
//             average_rating: parseFloat(averageRating.toFixed(2)),
//             reviewCount,
//         },
//     });
// };

// // Default fields to populate
// const defaultPopulate = {
//     user: {
//         fields: ["id", "name", "email"]
//     },
//     product: {
//         fields: ["id", "name", "price"]
//     },
// };

// // Functions that were in your original code
// const handleErrors = (error) => {
//     console.error("Error occurred:", error);
//     const errorMessage = String(error.message || "");
//     if (error.name === "ValidationError") return { message: errorMessage };
//     if (error.name === "NotFoundError") return { message: errorMessage };
//     if (errorMessage.includes("Missing required field"))
//         return { message: errorMessage };
//     if (
//         errorMessage.includes(
//             "relation(s) of type plugin::upload.file associated with this entity do not exist"
//         )
//     ) {
//         return {
//             message: "One or more provided image IDs do not exist or are invalid.",
//         };
//     }
//     return { message: "An unexpected error occurred." };
// };

// const handleStatusCode = (error) => {
//     const errorMessage = String(error.message || "");
//     if (error.name === "ValidationError") return 400;
//     if (error.name === "NotFoundError") return 404;
//     if (errorMessage.includes("Missing required field")) return 400;
//     if (
//         errorMessage.includes(
//             "relation(s) of type plugin::upload.file associated with this entity do not exist"
//         )
//     ) {
//         return 400;
//     }
//     return 500;
// };

// module.exports = createCoreController("api::review.review", ({ strapi }) => ({
//     // MARK: Create a review
// async create(ctx) {
//         try {
//             const { id: userId } = ctx.state.user;
//             if (!userId) {
//                 throw new ValidationError('User not authenticated.');
//             }

//             // Ensure the data payload is correctly formatted
//             const dataWithUser = {
//                 ...ctx.request.body.data,
//                 user: userId
//             };

//             // Assign the new, correctly formatted data payload to the request body
//             ctx.request.body = { data: dataWithUser };

//             const response = await super.create(ctx);
//             const createdReview = await strapi.entityService.findOne(
//                 "api::review.review",
//                 response.data.id, {
//                     populate: ["product"]
//                 }
//             );
//             if (createdReview && createdReview.product) {
//                 await recalculateProductRating(createdReview.product.id);
//             }
//             return response;
//         } catch (error) {
//             const customizedError = handleErrors(error);
//             ctx.status = handleStatusCode(error) || 500;
//             return ctx.send({
//                 success: false,
//                 message: customizedError.message
//             });
//         }
//     },

// //MARK:Retrieve all reviews.
//   async find(ctx) {
//     ctx.query = {
//       ...ctx.query,
//       populate: defaultPopulate,
//     };

//     const reviews = await strapi.entityService.findMany(
//       "api::review.review",
//       ctx.query
//     );

//     return ctx.send({
//       success: true,
//       message: "Reviews fetched successfully.",
//       data: reviews,
//       meta: {},
//     });
//   },

// //MARK: Retrieve a single review
//   async findOne(ctx) {
//     const { id } = ctx.params;

//     const review = await strapi.entityService.findOne(
//       "api::review.review",
//       id,
//       { populate: defaultPopulate }
//     );

//     if (!review) return ctx.notFound("Review not found.");

//     return ctx.send({
//       success: true,
//       message: "Review fetched successfully.",
//       data: review,
//       meta: {},
//     });
//   },

//   // Add the default update method back
//   async update(ctx) {
//     return super.update(ctx);
//   },
// //MARK: Delete a review
//   async delete(ctx) {
//     const { id } = ctx.params;
//     const userId = ctx.state.user.id;

//     const review = await strapi.entityService.findOne(
//       "api::review.review",
//       id,
//       { populate: ["user", "product"] }
//     );

//     if (!review) return ctx.notFound("Review not found.");
//     if (review.user.id !== userId) {
//       return ctx.forbidden("You can only delete your own reviews.");
//     }

//     await strapi.entityService.delete("api::review.review", id);

//     await recalculateProductRating(review.product.id);

//     return ctx.send({
//       success: true,
//       message: "Review deleted successfully.",
//       data: null,
//       meta: {},
//     });
//   },
// }));




// // src/api/review/controllers/review.js

// "use strict";

// const { createCoreController } = require("@strapi/strapi").factories;
// const strapiUtils = require("@strapi/utils");
// const { ValidationError, NotFoundError } = strapiUtils.errors;

// const handleErrors = (error) => {
//   console.error("Error occurred:", error);
//   const errorMessage = String(error.message || "");

//   if (error.name === "ValidationError") {
//     return { message: errorMessage };
//   }
//   if (error.name === "NotFoundError") {
//     return { message: errorMessage };
//   }
//   return { message: "An unexpected error occurred." };
// };

// const handleStatusCode = (error) => {
//   if (error.name === "ValidationError") return 400;
//   if (error.name === "NotFoundError") return 404;
//   return 500;
// };

// const validateBodyRequiredFields = (body, fields) => {
//   for (const field of fields) {
//     if (
//       body[field] === undefined ||
//       body[field] === null ||
//       body[field] === ""
//     ) {
//       throw new ValidationError(`Missing required field: ${field}`);
//     }
//   }
// };

// module.exports = createCoreController("api::review.review", ({ strapi }) => ({
//   //MARK:Create a review
//   async create(ctx) {
//     try {
//       const { id: userId } = ctx.state.user;
//       const requestData = ctx.request.body.data || ctx.request.body;
//       const { rating, comment, product } = requestData;

//       validateBodyRequiredFields(requestData, ["rating", "product"]);

//       if (isNaN(rating) || rating < 1 || rating > 5) {
//         throw new ValidationError("Rating must be an integer between 1 and 5.");
//       }
//       if (comment && typeof comment !== "string") {
//         throw new ValidationError("Comment must be a string.");
//       }

//       // Check if product exists
//       const productEntity = await strapi.entityService.findOne(
//         "api::product.product",
//         product
//       );
//       if (!productEntity) {
//         throw new NotFoundError("Product not found.");
//       }

//       // Check if user has already reviewed this product via this method
//       const existingReview = await strapi.entityService.findMany(
//         "api::review.review",
//         {
//           filters: {
//             user: userId,
//             product: product,
//           },
//           limit: 1,
//         }
//       );

//       if (existingReview.length > 0) {
//         throw new ValidationError(
//           "You have already submitted a review for this product"
//         );
//       }

//       const newReview = await strapi.entityService.create(
//         "api::review.review",
//         {
//           data: {
//             rating: parseInt(rating),
//             comment: comment || null,
//             user: userId,
//             product: product,
//             publishedAt: new Date(),
//           },
//           populate: {
//             user: {
//               fields: ["id", "email", "name"],
//             },
//             product: {
//               fields: ["id", "name"],
//             },
//           },
//         }
//       );

//       // --- START: Logic to update product rating and reviewCount on review creation ---
//       const productId = newReview.product.id;
//       // Fetch the product with all its reviews to recalculate
//       const updatedProductWithReviews = await strapi.entityService.findOne(
//         "api::product.product",
//         productId,
//         {
//           populate: ["reviews"],
//         }
//       );

//       if (updatedProductWithReviews) {
//         const currentReviews = updatedProductWithReviews.reviews;
//         const newReviewCount = currentReviews.length;

//         let newAverageRating = 0;
//         if (newReviewCount > 0) {
//           const totalRatings = currentReviews.reduce(
//             (sum, r) => sum + r.rating,
//             0
//           );
//           newAverageRating = totalRatings / newReviewCount;
//         }

//         await strapi.entityService.update("api::product.product", productId, {
//           data: {
//             rating: parseFloat(newAverageRating.toFixed(2)),
//             reviewCount: newReviewCount,
//           },
//         });
//       }
//       // --- END: Logic ---

//       return ctx.send({
//         success: true,
//         message: "Review created successfully.",
//         data: newReview,
//       });
//     } catch (error) {
//       const customizedError = handleErrors(error);
//       return ctx.send(
//         { success: false, message: customizedError.message },
//         handleStatusCode(error) || 500
//       );
//     }
//   },

//   //MARK:Retrieve all reviews.

//   async find(ctx) {
//     try {
//       // You can add custom logic here before fetching, e.g.,
//       // const { query } = ctx;
//       // if (query.filters && query.filters.product) {
//       //   // Special handling for filtering by product
//       // }
//       ctx.query.populate =  {
//             user: {
//               fields: ["id", "email", "name"],
//             },
//             product: {
//               fields: ["id", "name"],
//             },
//           };
//       // Call the default Strapi find method to handle querying, filtering, pagination, etc.
//       const { data, meta } = await super.find(ctx);

//       return ctx.send({
//         success: true,
//         message: "Reviews retrieved successfully.",
//         data,
//         meta,
//       });
//     } catch (error) {
//       const customizedError = handleErrors(error);
//       return ctx.send(
//         { success: false, message: customizedError.message },
//         handleStatusCode(error) || 500
//       );
//     }
//   },

//   //MARK: Retrieve a single review
//   async findOne(ctx) {
//     try {
//       const { id: reviewId } = ctx.params;
//       ctx.query.populate =  {
//             user: {
//               fields: ["id", "email", "name"],
//             },
//             product: {
//               fields: ["id", "name"],
//             },
//           };
//       // Call the default Strapi findOne method
//       const { data, meta } = await super.findOne(ctx);

//       if (!data) {
//         throw new NotFoundError("Review not found.");
//       }

//       return ctx.send({
//         success: true,
//         message: "Review retrieved successfully.",
//         data,
//         meta,
//       });
//     } catch (error) {
//       const customizedError = handleErrors(error);
//       return ctx.send(
//         { success: false, message: customizedError.message },
//         handleStatusCode(error) || 500
//       );
//     }
//   },

//   //MARK: Update a review
//   async update(ctx) {
//     try {
//       const { id: reviewId } = ctx.params;
//       const { id: userId } = ctx.state.user;
//       const requestData = ctx.request.body.data || ctx.request.body;
//       const { rating, comment } = requestData;

//       // Fetch existing review to ensure it belongs to the user and get product ID
//       const existingReview = await strapi.entityService.findOne(
//         "api::review.review",
//         reviewId,
//         {
//           populate: ["user", "product"],
//         }
//       );

//       if (!existingReview) {
//         throw new NotFoundError("Review not found.");
//       }

//       // Ensure the user updating the review is the one who created it
//       if (existingReview.user.id !== userId) {
//         throw new strapiUtils.errors.ForbiddenError(
//           "You are not authorized to update this review."
//         );
//       }

//       if (rating !== undefined) {
//         if (isNaN(rating) || rating < 1 || rating > 5) {
//           throw new ValidationError(
//             "Rating must be an integer between 1 and 5."
//           );
//         }
//       }
//       if (comment !== undefined && typeof comment !== "string") {
//         throw new ValidationError("Comment must be a string.");
//       }

//       const updatedReview = await strapi.entityService.update(
//         "api::review.review",
//         reviewId,
//         {
//           data: {
//             rating:
//               rating !== undefined ? parseInt(rating) : existingReview.rating,
//             comment: comment !== undefined ? comment : existingReview.comment,
//           },
//           populate: ["user", "product"],
//         }
//       );

//       // Recalculate product's average rating after review update
//       const productId = updatedReview.product.id;
//       const product = await strapi.entityService.findOne(
//         "api::product.product",
//         productId,
//         {
//           populate: ["reviews"],
//         }
//       );

//       if (product && product.reviews.length > 0) {
//         const totalRatings = product.reviews.reduce(
//           (sum, r) => sum + r.rating,
//           0
//         );
//         const newAverageRating = totalRatings / product.reviews.length;

//         await strapi.entityService.update("api::product.product", productId, {
//           data: {
//             rating: parseFloat(newAverageRating.toFixed(2)),
//           },
//         });
//       }

//       return ctx.send({
//         success: true,
//         message: "Review updated successfully.",
//         data: updatedReview,
//       });
//     } catch (error) {
//       const customizedError = handleErrors(error);
//       return ctx.send(
//         { success: false, message: customizedError.message },
//         handleStatusCode(error) || 500
//       );
//     }
//   },

//   //MARK: Delete a review
//   async delete(ctx) {
//     try {
//       const { id: reviewId } = ctx.params;
//       const { id: userId } = ctx.state.user;

//       const existingReview = await strapi.entityService.findOne(
//         "api::review.review",
//         reviewId,
//         {
//           populate: ["user", "product"],
//         }
//       );

//       if (!existingReview) {
//         throw new NotFoundError("Review not found.");
//       }

//       // Ensure the user deleting the review is the one who created it
//       if (existingReview.user.id !== userId) {
//         throw new strapiUtils.errors.ForbiddenError(
//           "You are not authorized to delete this review."
//         );
//       }

//       const productId = existingReview.product.id;

//       await strapi.entityService.delete("api::review.review", reviewId);

//       // Recalculate product's average rating after review deletion
//       const product = await strapi.entityService.findOne(
//         "api::product.product",
//         productId,
//         {
//           populate: ["reviews"],
//         }
//       );

//       if (product) {
//         const newReviewCount = product.reviews.length;
//         let newAverageRating = 0;

//         if (newReviewCount > 0) {
//           const totalRatings = product.reviews.reduce(
//             (sum, r) => sum + r.rating,
//             0
//           );
//           newAverageRating = totalRatings / newReviewCount;
//         }

//         await strapi.entityService.update("api::product.product", productId, {
//           data: {
//             rating: parseFloat(newAverageRating.toFixed(2)),
//             reviewCount: newReviewCount,
//           },
//         });
//       }

//       return ctx.send({
//         success: true,
//         message: "Review deleted successfully.",
//         data: {
//           review_id: reviewId,
//           product_id: productId,
//         },
//       });
//     } catch (error) {
//       const customizedError = handleErrors(error);
//       return ctx.send(
//         { success: false, message: customizedError.message },
//         handleStatusCode(error) || 500
//       );
//     }
//   },
// }));
