"use strict";

const { createCoreController } = require("@strapi/strapi").factories;
const { ValidationError, ForbiddenError } = require("@strapi/utils").errors;

const defaultPopulate = {
  user: { fields: ["id", "name", "email"] },
  product: { fields: ["id", "name", "price"] },
  contact_lens: { fields: ["id", "name"] },
  accessory: { fields: ["id", "name"] },
};

const handleErrors = (error) => {
  console.error("Error occurred:", error);
  const errorMessage = String(error.message || "");
  if (error.name === "YupValidationError") return { message: error.message };
  if (error.name === "ValidationError") return { message: errorMessage };
  if (error.name === "ForbiddenError") return { message: errorMessage };
  if (errorMessage.includes("Missing required field"))
    return { message: errorMessage };
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

// Map item types to their respective Strapi API IDs and a display name
const itemMap = [
  { key: "product", apiId: "api::product.product", name: "product" },
  { key: "contact_lens", apiId: "api::contact-lens.contact-lens", name: "contact lens" },
  { key: "accessory", apiId: "api::accessory.accessory", name: "accessory" },
];

module.exports = createCoreController("api::review.review", ({ strapi }) => ({
  // Create a review
  async create(ctx) {
    try {
      const { id: userId } = ctx.state.user;
      if (!userId) throw new ValidationError("User not authenticated.");

      // Directly access the request body without the 'data' wrapper
      const requestBody = ctx.request.body;
      const { item_id, item_type } = requestBody;

      // Validate that 'item_id' and 'item_type' are present
      if (!item_id || !item_type) {
        throw new ValidationError("Request body must contain 'item_id' and 'item_type'.");
      }

      // Find the corresponding API ID based on the item type
      const targetItem = itemMap.find(item => item.key === item_type);
      if (!targetItem) {
        throw new ValidationError("Invalid 'item_type' provided.");
      }

      // Validate that the entity exists before proceeding
      const entityExists = await strapi.entityService.findOne(targetItem.apiId, item_id);
      if (!entityExists) {
        throw new ValidationError("No entity found with the given 'item_id'.");
      }

      // Check if a review already exists for this user and entity
      const existingReview = await strapi.entityService.findMany("api::review.review", {
        filters: {
          user: { id: userId },
          [item_type]: { id: item_id },
        },
      });

      if (existingReview && existingReview.length > 0) {
        throw new ForbiddenError(`You have already reviewed this ${targetItem.name}.`);
      }

      // Dynamically build the data object to match the Strapi content type
      const dataWithUser = {
        rating: requestBody.rating,
        comment: requestBody.comment,
        user: userId,
        [item_type]: item_id,
      };

      ctx.request.body = { data: dataWithUser };

      const response = await super.create(ctx);
      const createdReview = await strapi.entityService.findOne(
        "api::review.review",
        response.data.id,
        { populate: defaultPopulate }
      );
      
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
        message: customizedError.message,
      });
    }
  },

  // Update a review
  async update(ctx) {
    try {
      const { id } = ctx.params;
      const userId = ctx.state.user.id;

      const existingReview = await strapi.entityService.findOne(
        "api::review.review",
        id,
        { populate: ["user", "product", "contact_lens", "accessory"] }
      );

      if (!existingReview) {
        return ctx.notFound("Review not found.");
      }
      if (existingReview.user.id !== userId) {
        return ctx.forbidden("You can only update your own reviews.");
      }

      // Access the request body directly
      const requestBody = ctx.request.body;
      if (!requestBody) {
        throw new ValidationError("Request body must contain data for the update.");
      }

      const existingItemType = existingReview.product ? "product" : existingReview.contact_lens ? "contact_lens" : "accessory";
      const existingItemId = existingReview[existingItemType].id;
      
      if (requestBody.item_id && requestBody.item_id !== existingItemId) {
        throw new ForbiddenError("You cannot change the item for which the review was written.");
      }
      
      const newUpdateData = {
        rating: requestBody.rating,
        comment: requestBody.comment,
      };

      ctx.request.body = { data: newUpdateData };

      const response = await super.update(ctx);

      const updatedReview = await strapi.entityService.findOne(
        "api::review.review",
        response.data.id,
        { populate: defaultPopulate }
      );
      
      return ctx.send({
        success: true,
        message: "Review updated successfully.",
        data: updatedReview,
      });
    } catch (error) {
      const customizedError = handleErrors(error);
      ctx.status = handleStatusCode(error);
      return ctx.send({
        success: false,
        message: customizedError.message,
      });
    }
  },

  // Delete a review
  async delete(ctx) {
    try {
      const { id } = ctx.params;
      const userId = ctx.state.user.id;

      const review = await strapi.entityService.findOne(
        "api::review.review",
        id,
        { populate: ["user"] }
      );

      if (!review) return ctx.notFound("Review not found.");
      if (review.user.id !== userId) {
        return ctx.forbidden("You can only delete your own reviews.");
      }

      await strapi.entityService.delete("api::review.review", id);

      return ctx.send({
        success: true,
        message: "Review deleted successfully.",
        data: null,
      });
    } catch (error) {
      const customizedError = handleErrors(error);
      ctx.status = handleStatusCode(error);
      return ctx.send({
        success: false,
        message: customizedError.message,
      });
    }
  },

  // Find reviews by item ID
  async find(ctx) {
    const { item_id, item_type } = ctx.query;
    
    let reviews = [];

    if (item_id && item_type) {
      const targetItem = itemMap.find(item => item.key === item_type);
      if (targetItem) {
        reviews = await strapi.entityService.findMany("api::review.review", {
          filters: { [item_type]: item_id },
          populate: defaultPopulate,
        });
      }
    } else {
      // If no specific item ID is provided, return all reviews
      reviews = await strapi.entityService.findMany("api::review.review", {
        populate: defaultPopulate,
      });
    }
    
    return ctx.send({
      success: true,
      message: "Reviews fetched successfully.",
      data: reviews
    });
  },

  async findOne(ctx) {
    const { id } = ctx.params;
    const review = await strapi.entityService.findOne(
      "api::review.review",
      id,
      { populate: defaultPopulate }
    );
    if (!review) return ctx.notFound("Review not found.");
    return ctx.send({
      success: true,
      message: "Review fetched successfully.",
      data: review
    });
  },
}));




// "use strict";

// const { createCoreController } = require("@strapi/strapi").factories;
// const { ValidationError, ForbiddenError } = require("@strapi/utils").errors;

// const defaultPopulate = {
//   user: { fields: ["id", "name", "email"] },
//   product: { fields: ["id", "name", "price"] },
//   contact_lens: { fields: ["id", "name"] },
//   accessory: { fields: ["id", "name"] },
// };

// const handleErrors = (error) => {
//   console.error("Error occurred:", error);
//   const errorMessage = String(error.message || "");
//   if (error.name === "YupValidationError") return { message: error.message };
//   if (error.name === "ValidationError") return { message: errorMessage };
//   if (error.name === "ForbiddenError") return { message: errorMessage };
//   if (errorMessage.includes("Missing required field"))
//     return { message: errorMessage };
//   return { message: "An unexpected error occurred." };
// };

// const handleStatusCode = (error) => {
//   const errorMessage = String(error.message || "");
//   if (error.name === "YupValidationError") return 400;
//   if (error.name === "ValidationError") return 400;
//   if (error.name === "ForbiddenError") return 403;
//   if (errorMessage.includes("Missing required field")) return 400;
//   return 500;
// };

// // Map item types to their respective Strapi API IDs and a display name
// const itemMap = [
//   { key: "product", apiId: "api::product.product", name: "product" },
//   { key: "contact_lens", apiId: "api::contact-lens.contact-lens", name: "contact lens" },
//   { key: "accessory", apiId: "api::accessory.accessory", name: "accessory" },
// ];

// module.exports = createCoreController("api::review.review", ({ strapi }) => ({
//   // Create a review
//   async create(ctx) {
//     try {
//       const { id: userId } = ctx.state.user;
//       if (!userId) throw new ValidationError("User not authenticated.");

//       // Directly access the request body without the 'data' wrapper
//       const requestBody = ctx.request.body;
//       const targetEntityId = requestBody.product;

//       if (!targetEntityId) {
//         throw new ValidationError("Request body must contain a valid 'product' ID.");
//       }

//       let foundItem = null;
//       let targetApiId = null;
      
//       // Dynamically check each content type for the provided ID
//       for (const item of itemMap) {
//         const entity = await strapi.entityService.findOne(item.apiId, targetEntityId, { fields: ["id"] });
//         if (entity) {
//           foundItem = item.key;
//           targetApiId = item.apiId;
//           break;
//         }
//       }

//       if (!foundItem) {
//         throw new ValidationError("No entity found with the given ID.");
//       }

//       // Check if a review already exists for this user and entity
//       const existingReview = await strapi.entityService.findMany("api::review.review", {
//         filters: {
//           user: { id: userId },
//           [foundItem]: { id: targetEntityId },
//         },
//       });

//       if (existingReview && existingReview.length > 0) {
//         throw new ForbiddenError(`You have already reviewed this ${itemMap.find(item => item.key === foundItem).name}.`);
//       }

//       // Dynamically build the data object to match the Strapi content type
//       const dataWithUser = {
//         rating: requestBody.rating,
//         comment: requestBody.comment,
//         user: userId,
//         [foundItem]: targetEntityId,
//       };

//       ctx.request.body = { data: dataWithUser };

//       const response = await super.create(ctx);
//       const createdReview = await strapi.entityService.findOne(
//         "api::review.review",
//         response.data.id,
//         { populate: defaultPopulate }
//       );
      
//       return ctx.send({
//         success: true,
//         message: "Review created successfully.",
//         data: createdReview,
//       });
//     } catch (error) {
//       const customizedError = handleErrors(error);
//       ctx.status = handleStatusCode(error);
//       return ctx.send({
//         success: false,
//         message: customizedError.message,
//       });
//     }
//   },

//   // Update a review
//   async update(ctx) {
//     try {
//       const { id } = ctx.params;
//       const userId = ctx.state.user.id;

//       const existingReview = await strapi.entityService.findOne(
//         "api::review.review",
//         id,
//         { populate: ["user", "product", "contact_lens", "accessory"] }
//       );

//       if (!existingReview) {
//         return ctx.notFound("Review not found.");
//       }
//       if (existingReview.user.id !== userId) {
//         return ctx.forbidden("You can only update your own reviews.");
//       }

//       const requestBody = ctx.request.body;
//       if (!requestBody || !requestBody.data) {
//         throw new ValidationError("Request body must contain data for the update.");
//       }

//       const existingItemType = existingReview.product ? "product" : existingReview.contact_lens ? "contact_lens" : "accessory";
//       const existingItemId = existingReview[existingItemType].id;
      
//       if (requestBody.data.product && requestBody.data.product !== existingItemId) {
//         throw new ForbiddenError("You cannot change the item for which the review was written.");
//       }
      
//       const newUpdateData = {
//         rating: requestBody.data.rating,
//         comment: requestBody.data.comment,
//       };

//       ctx.request.body = { data: newUpdateData };

//       const response = await super.update(ctx);

//       const updatedReview = await strapi.entityService.findOne(
//         "api::review.review",
//         response.data.id,
//         { populate: defaultPopulate }
//       );
      
//       return ctx.send({
//         success: true,
//         message: "Review updated successfully.",
//         data: updatedReview,
//       });
//     } catch (error) {
//       const customizedError = handleErrors(error);
//       ctx.status = handleStatusCode(error);
//       return ctx.send({
//         success: false,
//         message: customizedError.message,
//       });
//     }
//   },

//   // Delete a review
//   async delete(ctx) {
//     try {
//       const { id } = ctx.params;
//       const userId = ctx.state.user.id;

//       const review = await strapi.entityService.findOne(
//         "api::review.review",
//         id,
//         { populate: ["user"] }
//       );

//       if (!review) return ctx.notFound("Review not found.");
//       if (review.user.id !== userId) {
//         return ctx.forbidden("You can only delete your own reviews.");
//       }

//       await strapi.entityService.delete("api::review.review", id);

//       return ctx.send({
//         success: true,
//         message: "Review deleted successfully.",
//         data: null,
//       });
//     } catch (error) {
//       const customizedError = handleErrors(error);
//       ctx.status = handleStatusCode(error);
//       return ctx.send({
//         success: false,
//         message: customizedError.message,
//       });
//     }
//   },

//   // Find reviews by item ID
//   async find(ctx) {
//     const { product: itemId } = ctx.query;
    
//     let reviews = [];

//     if (itemId) {
//       // Find reviews for the given ID across all item types
//       for (const item of itemMap) {
//         const foundReviews = await strapi.entityService.findMany("api::review.review", {
//           filters: { [item.key]: itemId },
//           populate: defaultPopulate,
//         });
//         reviews = reviews.concat(foundReviews);
//       }
//     } else {
//       // If no specific item ID is provided, return all reviews
//       reviews = await strapi.entityService.findMany("api::review.review", {
//         populate: defaultPopulate,
//       });
//     }
    
//     return ctx.send({
//       success: true,
//       message: "Reviews fetched successfully.",
//       data: reviews
//     });
//   },

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
//       data: review
//     });
//   },
// }));



// "use strict";

// const { createCoreController } = require("@strapi/strapi").factories;
// const { ValidationError, ForbiddenError } = require("@strapi/utils").errors;

// const defaultPopulate = {
//   user: { fields: ["id", "name", "email"] },
//   product: { fields: ["id", "name", "price"] },
//   contact_lens: { fields: ["id", "name"] },
//   accessory: { fields: ["id", "name"] },
// };

// const handleErrors = (error) => {
//   console.error("Error occurred:", error);
//   const errorMessage = String(error.message || "");
//   if (error.name === "YupValidationError") return { message: error.message };
//   if (error.name === "ValidationError") return { message: errorMessage };
//   if (error.name === "ForbiddenError") return { message: errorMessage };
//   if (errorMessage.includes("Missing required field"))
//     return { message: errorMessage };
//   return { message: "An unexpected error occurred." };
// };

// const handleStatusCode = (error) => {
//   const errorMessage = String(error.message || "");
//   if (error.name === "YupValidationError") return 400;
//   if (error.name === "ValidationError") return 400;
//   if (error.name === "ForbiddenError") return 403;
//   if (errorMessage.includes("Missing required field")) return 400;
//   return 500;
// };

// // Map item types from request to their respective Strapi API IDs
// const itemTypes = {
//   product: "api::product.product",
//   "contact-lens": "api::contact-lens.contact-lens",
//   accessory: "api::accessory.accessory",
// };

// module.exports = createCoreController("api::review.review", ({ strapi }) => ({
//   // Create a review
//   async create(ctx) {
//     try {
//       const { id: userId } = ctx.state.user;
//       if (!userId) throw new ValidationError("User not authenticated.");

//       const { data } = ctx.request.body;
//       const { item, item_type } = data;

//       if (!item || !item_type || !itemTypes[item_type]) {
//         throw new ValidationError("Invalid or missing 'item' or 'item_type' in request body.");
//       }

//       const targetApiId = itemTypes[item_type];
//       const targetEntityId = item;

//       // Validate that the entity exists before proceeding
//       const entityExists = await strapi.entityService.findOne(targetApiId, targetEntityId);
//       if (!entityExists) {
//         throw new ValidationError("No entity found with the given ID.");
//       }

//       // Check if a review already exists for this user and entity
//       const existingReview = await strapi.entityService.findMany("api::review.review", {
//         filters: {
//           user: { id: userId },
//           [item_type]: { id: targetEntityId },
//         },
//       });

//       if (existingReview && existingReview.length > 0) {
//         throw new ForbiddenError("You have already reviewed this item.");
//       }

//       // Dynamically build the data object to match the Strapi content type
//       const dataWithUser = {
//         ...data,
//         user: userId,
//         [item_type]: targetEntityId,
//       };

//       // Remove the temporary 'item' and 'item_type' keys from the data
//       delete dataWithUser.item;
//       delete dataWithUser.item_type;
      
//       ctx.request.body = { data: dataWithUser };

//       const response = await super.create(ctx);
//       const createdReview = await strapi.entityService.findOne(
//         "api::review.review",
//         response.data.id,
//         { populate: defaultPopulate }
//       );
      
//       return ctx.send({
//         success: true,
//         message: "Review created successfully.",
//         data: createdReview,
//       });
//     } catch (error) {
//       const customizedError = handleErrors(error);
//       ctx.status = handleStatusCode(error);
//       return ctx.send({
//         success: false,
//         message: customizedError.message,
//       });
//     }
//   },

//   // Update a review
//   async update(ctx) {
//     try {
//       const { id } = ctx.params;
//       const userId = ctx.state.user.id;

//       const existingReview = await strapi.entityService.findOne(
//         "api::review.review",
//         id,
//         { populate: ["user", "product", "contact_lens", "accessory"] }
//       );

//       if (!existingReview) {
//         return ctx.notFound("Review not found.");
//       }
//       if (existingReview.user.id !== userId) {
//         return ctx.forbidden("You can only update your own reviews.");
//       }

//       const requestBody = ctx.request.body;
//       if (!requestBody || !requestBody.data) {
//         throw new ValidationError("Request body must contain data for the update.");
//       }

//       // Dynamically map the item type
//       const existingItemType = existingReview.product ? "product" : existingReview.contact_lens ? "contact_lens" : "accessory";
//       const existingItemId = existingReview[existingItemType].id;

//       // Validate that the item in the request body (if provided) matches the existing item
//       if (requestBody.data.item && requestBody.data.item !== existingItemId) {
//         throw new ForbiddenError("You cannot change the item for which the review was written.");
//       }

//       // Remove temporary keys from request body to avoid errors
//       delete requestBody.data.item;
//       delete requestBody.data.item_type;
      
//       ctx.request.body = requestBody;

//       const response = await super.update(ctx);

//       const updatedReview = await strapi.entityService.findOne(
//         "api::review.review",
//         response.data.id,
//         { populate: defaultPopulate }
//       );
      
//       return ctx.send({
//         success: true,
//         message: "Review updated successfully.",
//         data: updatedReview,
//       });
//     } catch (error) {
//       const customizedError = handleErrors(error);
//       ctx.status = handleStatusCode(error);
//       return ctx.send({
//         success: false,
//         message: customizedError.message,
//       });
//     }
//   },

//   // Delete a review
//   async delete(ctx) {
//     try {
//       const { id } = ctx.params;
//       const userId = ctx.state.user.id;

//       const review = await strapi.entityService.findOne(
//         "api::review.review",
//         id,
//         { populate: ["user", "product", "contact_lens", "accessory"] }
//       );

//       if (!review) return ctx.notFound("Review not found.");
//       if (review.user.id !== userId) {
//         return ctx.forbidden("You can only delete your own reviews.");
//       }

//       await strapi.entityService.delete("api::review.review", id);

//       return ctx.send({
//         success: true,
//         message: "Review deleted successfully.",
//         data: null,
//       });
//     } catch (error) {
//       const customizedError = handleErrors(error);
//       ctx.status = handleStatusCode(error);
//       return ctx.send({
//         success: false,
//         message: customizedError.message,
//       });
//     }
//   },

//   // Find reviews by item type and ID
//   async find(ctx) {
//     const { item_id, item_type } = ctx.query;

//     let reviews;
//     const filterKey = item_type ? item_type.replace("-", "_") : null;

//     if (item_id && filterKey) {
//       reviews = await strapi.entityService.findMany("api::review.review", {
//         filters: { [filterKey]: item_id },
//         populate: defaultPopulate,
//       });
//     } else {
//       reviews = await strapi.entityService.findMany("api::review.review", {
//         populate: defaultPopulate,
//       });
//     }
//     return ctx.send({
//       success: true,
//       message: "Reviews fetched successfully.",
//       data: reviews
//     });
//   },

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
//       data: review
//     });
//   },
// }));


// "use strict";

// const { createCoreController } = require("@strapi/strapi").factories;
// const { ValidationError, ForbiddenError } = require("@strapi/utils").errors;

// /**
//  * Recalculates the average rating and review count for a given product.
//  * @param {string} productId The ID of the product.
//  */
// const recalculateProductRating = async (productId) => {
//   const product = await strapi.entityService.findOne(
//     "api::product.product",
//     productId,
//     {
//       populate: ["reviews"],
//     }
//   );
//   if (!product) return;

//   const reviewCount = product.reviews.length;
//   const averageRating =
//     reviewCount > 0
//       ? product.reviews.reduce((sum, r) => sum + r.rating, 0) / reviewCount
//       : 0;

//   await strapi.entityService.update("api::product.product", productId, {
//     data: {
//       average_rating: parseFloat(averageRating.toFixed(2)),
//       reviewCount,
//     },
//   });
// };

// /**
//  * Recalculates the average rating and review count for a given contact lens.
//  * @param {string} contactLensId The ID of the contact lens.
//  */
// const recalculateContactLensRating = async (contactLensId) => {
//   const contactLens = await strapi.entityService.findOne(
//     "api::contact-lens.contact-lens",
//     contactLensId,
//     {
//       populate: ["reviews"],
//     }
//   );
//   if (!contactLens) return;

//   const reviewCount = contactLens.reviews.length;
//   const averageRating =
//     reviewCount > 0
//       ? contactLens.reviews.reduce((sum, r) => sum + r.rating, 0) / reviewCount
//       : 0;

//   await strapi.entityService.update("api::contact-lens.contact-lens", contactLensId, {
//     data: {
//       average_rating: parseFloat(averageRating.toFixed(2)),
//       reviewCount,
//     },
//   });
// };

// /**
//  * Recalculates the average rating and review count for a given accessory.
//  * @param {string} accessoryId The ID of the accessory.
//  */
// const recalculateAccessoryRating = async (accessoryId) => {
//   const accessory = await strapi.entityService.findOne(
//     "api::accessory.accessory",
//     accessoryId,
//     {
//       populate: ["reviews"],
//     }
//   );
//   if (!accessory) return;

//   const reviewCount = accessory.reviews.length;
//   const averageRating =
//     reviewCount > 0
//       ? accessory.reviews.reduce((sum, r) => sum + r.rating, 0) / reviewCount
//       : 0;

//   await strapi.entityService.update("api::accessory.accessory", accessoryId, {
//     data: {
//       average_rating: parseFloat(averageRating.toFixed(2)),
//       reviewCount,
//     },
//   });
// };

// const defaultPopulate = {
//   user: { fields: ["id", "name", "email"] },
//   product: { fields: ["id", "name", "price"] },
//   contact_lens: { fields: ["id", "name"] },
//   accessory: { fields: ["id", "name"] },
// };

// const handleErrors = (error) => {
//   console.error("Error occurred:", error);
//   const errorMessage = String(error.message || "");
//   if (error.name === "YupValidationError") return { message: error.message };
//   if (error.name === "ValidationError") return { message: errorMessage };
//   if (error.name === "ForbiddenError") return { message: errorMessage };
//   if (errorMessage.includes("Missing required field"))
//     return { message: errorMessage };
//   return { message: "An unexpected error occurred." };
// };

// const handleStatusCode = (error) => {
//   const errorMessage = String(error.message || "");
//   if (error.name === "YupValidationError") return 400;
//   if (error.name === "ValidationError") return 400;
//   if (error.name === "ForbiddenError") return 403;
//   if (errorMessage.includes("Missing required field")) return 400;
//   return 500;
// };

// module.exports = createCoreController("api::review.review", ({ strapi }) => ({
//   // Create a review
//   async create(ctx) {
//     try {
//       const { id: userId } = ctx.state.user;
//       if (!userId) throw new ValidationError("User not authenticated.");

//       const requestData = ctx.request.body;
//       const targetEntityId = requestData.product || requestData.contact_lens || requestData.accessory;
//       const targetApiId = requestData.product ? "api::product.product" : requestData.contact_lens ? "api::contact-lens.contact-lens" : requestData.accessory ? "api::accessory.accessory" : null;

//       if (!targetEntityId || !targetApiId) {
//         throw new ValidationError("Request body must contain a valid product, contact lens, or accessory ID.");
//       }

//       // ❗ Validate that the entity exists before proceeding
//       const entityExists = await strapi.entityService.findOne(targetApiId, targetEntityId);
//       if (!entityExists) {
//         throw new ValidationError("No entity found with the given ID.");
//       }

//       // Check if a review already exists for this user and entity
//       const existingReview = await strapi.entityService.findMany("api::review.review", {
//         filters: {
//           user: { id: userId },
//           $or: [
//             { product: { id: targetEntityId } },
//             { contact_lens: { id: targetEntityId } },
//             { accessory: { id: targetEntityId } },
//           ],
//         },
//       });

//       if (existingReview && existingReview.length > 0) {
//         throw new ForbiddenError("You have already reviewed this item.");
//       }

//       const dataWithUser = { ...requestData, user: userId };
//       ctx.request.body = { data: dataWithUser };

//       const response = await super.create(ctx);
//       const createdReview = await strapi.entityService.findOne(
//         "api::review.review",
//         response.data.id,
//         {
//           populate: {
//             product: { fields: ["id", "name", "price"] },
//             contact_lens: { fields: ["id", "name"] },
//             accessory: { fields: ["id", "name"] },
//             user: { fields: ["id", "name", "email"] },
//           },
//         }
//       );
      
//       // Call the appropriate recalculation function
//       if (createdReview.product) await recalculateProductRating(createdReview.product.id);
//       if (createdReview.contact_lens) await recalculateContactLensRating(createdReview.contact_lens.id);
//       if (createdReview.accessory) await recalculateAccessoryRating(createdReview.accessory.id);

//       return ctx.send({
//         success: true,
//         message: "Review created successfully.",
//         data: createdReview,
//       });
//     } catch (error) {
//       const customizedError = handleErrors(error);
//       ctx.status = handleStatusCode(error);
//       return ctx.send({
//         success: false,
//         message: customizedError.message,
//       });
//     }
//   },

//   // Update a review
//   async update(ctx) {
//     try {
//       const { id } = ctx.params;
//       const userId = ctx.state.user.id;

//       const existingReview = await strapi.entityService.findOne(
//         "api::review.review",
//         id,
//         { populate: ["user", "product", "contact_lens", "accessory"] }
//       );

//       if (!existingReview) {
//         return ctx.notFound("Review not found.");
//       }
//       if (existingReview.user.id !== userId) {
//         return ctx.forbidden("You can only update your own reviews.");
//       }

//       const requestBody = ctx.request.body;
//       if (!requestBody) {
//         throw new ValidationError("Request body must contain data for the update.");
//       }
//       ctx.request.body = { data: requestBody };

//       const response = await super.update(ctx);

//       const updatedReview = await strapi.entityService.findOne(
//         "api::review.review",
//         response.data.id,
//         {
//           populate: {
//             product: { fields: ["id", "name", "price"] },
//             contact_lens: { fields: ["id", "name"] },
//             accessory: { fields: ["id", "name"] },
//             user: { fields: ["id", "name", "email"] },
//           },
//         }
//       );

//       // Call the appropriate recalculation function
//       if (updatedReview.product) await recalculateProductRating(updatedReview.product.id);
//       if (updatedReview.contact_lens) await recalculateContactLensRating(updatedReview.contact_lens.id);
//       if (updatedReview.accessory) await recalculateAccessoryRating(updatedReview.accessory.id);
      
//       return ctx.send({
//         success: true,
//         message: "Review updated successfully.",
//         data: updatedReview,
//       });
//     } catch (error) {
//       const customizedError = handleErrors(error);
//       ctx.status = handleStatusCode(error);
//       return ctx.send({
//         success: false,
//         message: customizedError.message,
//       });
//     }
//   },

//   // Delete a review
//   async delete(ctx) {
//     try {
//       const { id } = ctx.params;
//       const userId = ctx.state.user.id;

//       const review = await strapi.entityService.findOne(
//         "api::review.review",
//         id,
//         { populate: ["user", "product", "contact_lens", "accessory"] }
//       );

//       if (!review) return ctx.notFound("Review not found.");
//       if (review.user.id !== userId) {
//         return ctx.forbidden("You can only delete your own reviews.");
//       }

//       await strapi.entityService.delete("api::review.review", id);

//       // Call the appropriate recalculation function
//       if (review.product) await recalculateProductRating(review.product.id);
//       if (review.contact_lens) await recalculateContactLensRating(review.contact_lens.id);
//       if (review.accessory) await recalculateAccessoryRating(review.accessory.id);

//       return ctx.send({
//         success: true,
//         message: "Review deleted successfully.",
//         data: null,
//       });
//     } catch (error) {
//       const customizedError = handleErrors(error);
//       ctx.status = handleStatusCode(error);
//       return ctx.send({
//         success: false,
//         message: customizedError.message,
//       });
//     }
//   },

//   // Default find and findOne methods are inherited
//   async find(ctx) {
//     const { productId, contactLensId, accessoryId } = ctx.query;

//     let reviews;

//     // Build the query based on the provided IDs
//     if (productId) {
//       reviews = await strapi.entityService.findMany("api::review.review", {
//         filters: { product: productId },
//         populate: defaultPopulate,
//       });
//     } else if (contactLensId) {
//       reviews = await strapi.entityService.findMany("api::review.review", {
//         filters: { contact_lens: contactLensId },
//         populate: defaultPopulate,
//       });
//     } else if (accessoryId) {
//       reviews = await strapi.entityService.findMany("api::review.review", {
//         filters: { accessory: accessoryId },
//         populate: defaultPopulate,
//       });
//     } else {
//       // If no specific product ID is provided, return all reviews
//       reviews = await strapi.entityService.findMany("api::review.review", {
//         populate: defaultPopulate,
//       });
//     }
//     return ctx.send({
//       success: true,
//       message: "Reviews fetched successfully.",
//       data: reviews
//     });
//   },

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
//       data: review
//     });
//   },
// }));






// "use strict";

// const { createCoreController } = require("@strapi/strapi").factories;
// const { ValidationError, ForbiddenError } = require("@strapi/utils").errors;

// // Helper to recalculate product rating & review count
// const recalculateProductRating = async (productId) => {
//   const product = await strapi.entityService.findOne(
//     "api::product.product",
//     productId,
//     {
//       populate: ["reviews"],
//     }
//   );

//   if (!product) return;

//   const reviewCount = product.reviews.length;
//   const averageRating =
//     reviewCount > 0
//       ? product.reviews.reduce((sum, r) => sum + r.rating, 0) / reviewCount
//       : 0;

//   await strapi.entityService.update("api::product.product", productId, {
//     data: {
//       average_rating: parseFloat(averageRating.toFixed(2)),
//       reviewCount,
//     },
//   });
// };
// const recalculateContactLensRating = async (contactLensId) => {
//   const contactLens = await strapi.entityService.findOne(
//     "api::contact-lens.contact-lens",
//     contactLensId,
//     {
//       populate: ["reviews"],
//     }
//   );

//   if (!contactLens) return;

//   const reviewCount = contactLens.reviews.length;
//   const averageRating =
//     reviewCount > 0
//       ? contactLens.reviews.reduce((sum, r) => sum + r.rating, 0) / reviewCount
//       : 0;

//   await strapi.entityService.update("api::contact-lens.contact-lens", contactLensId, {
//     data: {
//       average_rating: parseFloat(averageRating.toFixed(2)),
//       reviewCount,
//     },
//   });
// };
// const recalculateAccessoryRating = async (accessoryId) => {
//   const accessory = await strapi.entityService.findOne(
//     "api::accessory.accessory",
//     accessoryId,
//     {
//       populate: ["reviews"],
//     }
//   );

//   if (!accessory) return;

//   const reviewCount = accessory.reviews.length;
//   const averageRating =
//     reviewCount > 0
//       ? accessory.reviews.reduce((sum, r) => sum + r.rating, 0) / reviewCount
//       : 0;

//   await strapi.entityService.update("api::accessory.accessory", accessoryId, {
//     data: {
//       average_rating: parseFloat(averageRating.toFixed(2)),
//       reviewCount,
//     },
//   });
// };

// const defaultPopulate = {
//   user: { fields: ["id", "name", "email"] },
//   product: { fields: ["id", "name", "price"] },
// };

// const handleErrors = (error) => {
//   console.error("Error occurred:", error);
//   const errorMessage = String(error.message || "");
//   if (error.name === "YupValidationError") return { message: error.message };
//   if (error.name === "ValidationError") return { message: errorMessage };
//   if (error.name === "ForbiddenError") return { message: errorMessage };
//   if (errorMessage.includes("Missing required field"))
//     return { message: errorMessage };
//   return { message: "An unexpected error occurred." };
// };

// const handleStatusCode = (error) => {
//   const errorMessage = String(error.message || "");
//   if (error.name === "YupValidationError") return 400;
//   if (error.name === "ValidationError") return 400;
//   if (error.name === "ForbiddenError") return 403;
//   if (errorMessage.includes("Missing required field")) return 400;
//   return 500;
// };

// // ... (imports and helper functions remain unchanged)

// module.exports = createCoreController("api::review.review", ({ strapi }) => ({
//   async create(ctx) {
//     try {
//       const { id: userId } = ctx.state.user;
//       if (!userId) throw new ValidationError("User not authenticated.");

//       const requestData = ctx.request.body;
//       const targetEntity = requestData.product || requestData.contact_lens || requestData.accessory;
//       const targetApiId = requestData.product ? "api::product.product" : requestData.contact_lens ? "api::contact-lens.contact-lens" : requestData.accessory ? "api::accessory.accessory" : null;

//       if (!targetEntity || !targetApiId) {
//         throw new ValidationError("Request body must contain a valid product, contact lens, or accessory ID.");
//       }

//       // ❗ Validate that the entity exists before proceeding
//       const entityExists = await strapi.entityService.findOne(targetApiId, targetEntity);
//       if (!entityExists) {
//         throw new ValidationError("No entity found with the given ID.");
//       }

//       // Check if a review already exists for this user and entity
//       const existingReview = await strapi.entityService.findMany("api::review.review", {
//         filters: {
//           user: { id: userId },
//           $or: [
//             { product: { id: targetEntity } },
//             { contact_lens: { id: targetEntity } },
//             { accessory: { id: targetEntity } },
//           ],
//         },
//       });

//       if (existingReview && existingReview.length > 0) {
//         throw new ForbiddenError("You have already reviewed this item.");
//       }

//       const dataWithUser = { ...requestData, user: userId };
//       ctx.request.body = { data: dataWithUser };

//       const response = await super.create(ctx);
//       const createdReview = await strapi.entityService.findOne(
//         "api::review.review",
//         response.data.id,
//         {
//           populate: {
//             product: { fields: ["id", "name", "price"] },
//             contact_lens: { fields: ["id", "name"] },
//             accessory: { fields: ["id", "name"] },
//             user: { fields: ["id", "name", "email"] },
//           },
//         }
//       );
      
//       // Call the appropriate recalculation function
//       if (createdReview.product) await recalculateProductRating(createdReview.product.id);
//       if (createdReview.contact_lens) await recalculateContactLensRating(createdReview.contact_lens.id);
//       if (createdReview.accessory) await recalculateAccessoryRating(createdReview.accessory.id);

//       return ctx.send({
//         success: true,
//         message: "Review created successfully.",
//         data: createdReview,
//       });
//     } catch (error) {
//       // ... (error handling logic)
//     }
//   },

//   async update(ctx) {
//     const { id } = ctx.params;
//     const userId = ctx.state.user.id;

//     const existingReview = await strapi.entityService.findOne(
//       "api::review.review",
//       id,
//       { populate: ["user", "product", "contact_lens", "accessory"] }
//     );
//     if (!existingReview) return ctx.notFound("Review not found.");
//     if (existingReview.user.id !== userId) {
//       return ctx.forbidden("You can only update your own reviews.");
//     }
    
//     // ... (rest of the update logic)
    
//     // Call the appropriate recalculation function
//     if (existingReview.product) await recalculateProductRating(existingReview.product.id);
//     if (existingReview.contact_lens) await recalculateContactLensRating(existingReview.contact_lens.id);
//     if (existingReview.accessory) await recalculateAccessoryRating(existingReview.accessory.id);
    
//     return ctx.send({
//       success: true,
//       message: "Review updated successfully.",
//       data: updatedReview,
//     });
//   },

//   async delete(ctx) {
//     const { id } = ctx.params;
//     const userId = ctx.state.user.id;

//     const review = await strapi.entityService.findOne(
//       "api::review.review",
//       id,
//       { populate: ["user", "product", "contact_lens", "accessory"] }
//     );
//     if (!review) return ctx.notFound("Review not found.");
//     if (review.user.id !== userId) {
//       return ctx.forbidden("You can only delete your own reviews.");
//     }

//     await strapi.entityService.delete("api::review.review", id);

//     // Call the appropriate recalculation function
//     if (review.product) await recalculateProductRating(review.product.id);
//     if (review.contact_lens) await recalculateContactLensRating(review.contact_lens.id);
//     if (review.accessory) await recalculateAccessoryRating(review.accessory.id);

//     return ctx.send({
//       success: true,
//       message: "Review deleted successfully.",
//       data: null,
//     });
//   },
  
//   // You need to add recalculation helpers to the controller
//   // if you choose not to use the lifecycle hooks
//   // ...
//   const recalculateContactLensRating = async (contactLensId) => {
//     // ... (logic for contact lenses)
//   };
//   const recalculateAccessoryRating = async (accessoryId) => {
//     // ... (logic for accessories)
//   };
// }));

//   // Default find and findOne methods are inherited
//   async find(ctx) {
//     const { productId, contactLensId, accessoryId } = ctx.query;

//     let reviews;

//     // Build the query based on the provided IDs
//     if (productId) {
//       reviews = await strapi.entityService.findMany("api::review.review", {
//         filters: { product: productId },
//         populate: defaultPopulate,
//       });
//     } else if (contactLensId) {
//       reviews = await strapi.entityService.findMany("api::review.review", {
//         filters: { contact_lens: contactLensId }, // Assuming 'contact_lens' is the relation field name
//         populate: defaultPopulate,
//       });
//     } else if (accessoryId) {
//       reviews = await strapi.entityService.findMany("api::review.review", {
//         filters: { accessory: accessoryId }, // Assuming 'accessory' is the relation field name
//         populate: defaultPopulate,
//       });
//     } else {
//       // If no specific product ID is provided, return all reviews
//       reviews = await strapi.entityService.findMany("api::review.review", {
//         populate: defaultPopulate,
//       });
//     }
//     return ctx.send({
//       success: true,
//       message: "Reviews fetched successfully.",
//       data: reviews
//     });
//   },

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
//       data: review
//     });
//   },
// }));








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
