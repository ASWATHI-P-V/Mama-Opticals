// src/api/review/controllers/review.js

"use strict";

const { createCoreController } = require("@strapi/strapi").factories;
const strapiUtils = require("@strapi/utils");
const { ValidationError, NotFoundError } = strapiUtils.errors;

const handleErrors = (error) => {
  console.error("Error occurred:", error);
  const errorMessage = String(error.message || '');

  if (error.name === "ValidationError") {
    return { message: errorMessage };
  }
  if (error.name === "NotFoundError") {
    return { message: errorMessage };
  }
  return { message: "An unexpected error occurred." };
};

const handleStatusCode = (error) => {
  if (error.name === "ValidationError") return 400;
  if (error.name === "NotFoundError") return 404;
  return 500;
};

const validateBodyRequiredFields = (body, fields) => {
  for (const field of fields) {
    if (
      body[field] === undefined ||
      body[field] === null ||
      body[field] === ""
    ) {
      throw new ValidationError(`Missing required field: ${field}`);
    }
  }
};


module.exports = createCoreController("api::review.review", ({ strapi }) => ({
  //MARK:Create a review
  async create(ctx) {
    try {
      const { id: userId } = ctx.state.user;
      const requestData = ctx.request.body.data || ctx.request.body;
      const { rating, comment, product } = requestData;

      validateBodyRequiredFields(requestData, ["rating", "product"]);

      if (isNaN(rating) || rating < 1 || rating > 5) {
        throw new ValidationError("Rating must be an integer between 1 and 5.");
      }
      if (comment && typeof comment !== 'string') {
        throw new ValidationError("Comment must be a string.");
      }

      // Check if product exists
      const productEntity = await strapi.entityService.findOne("api::product.product", product);
      if (!productEntity) {
        throw new NotFoundError("Product not found.");
      }

      // Check if user has already reviewed this product via this method
      const existingReview = await strapi.entityService.findMany("api::review.review", {
        filters: {
          user: userId,
          product: product,
        },
        limit: 1
      });

      if (existingReview.length > 0) {
        throw new ValidationError("You have already submitted a review for this product. You can update it.");
      }

      const newReview = await strapi.entityService.create("api::review.review", {
        data: {
          rating: parseInt(rating),
          comment: comment || null,
          user: userId,
          product: product,
          publishedAt: new Date(),
        },
        populate: ['user', 'product']
      });

      // --- START: Logic to update product rating and reviewCount on review creation ---
      const productId = newReview.product.id;
      // Fetch the product with all its reviews to recalculate
      const updatedProductWithReviews = await strapi.entityService.findOne("api::product.product", productId, {
        populate: ["reviews"]
      });

      if (updatedProductWithReviews) {
        const currentReviews = updatedProductWithReviews.reviews;
        const newReviewCount = currentReviews.length;

        let newAverageRating = 0;
        if (newReviewCount > 0) {
          const totalRatings = currentReviews.reduce((sum, r) => sum + r.rating, 0);
          newAverageRating = totalRatings / newReviewCount;
        }

        await strapi.entityService.update("api::product.product", productId, {
          data: {
            rating: parseFloat(newAverageRating.toFixed(2)),
            reviewCount: newReviewCount,
          },
        });
      }
      // --- END: Logic ---

      return ctx.send({
        success: true,
        message: "Review created successfully.",
        data: newReview,
      });
    } catch (error) {
      const customizedError = handleErrors(error);
      return ctx.send(
        { success: false, message: customizedError.message },
        handleStatusCode(error) || 500
      );
    }
  },

  
//MARK:Retrieve all reviews.
  async find(ctx) {
    try {
      // You can add custom logic here before fetching, e.g.,
      // const { query } = ctx;
      // if (query.filters && query.filters.product) {
      //   // Special handling for filtering by product
      // }

      // Call the default Strapi find method to handle querying, filtering, pagination, etc.
      const { data, meta } = await super.find(ctx);

      return ctx.send({
        success: true,
        message: "Reviews retrieved successfully.",
        data,
        meta,
      });
    } catch (error) {
      const customizedError = handleErrors(error);
      return ctx.send(
        { success: false, message: customizedError.message },
        handleStatusCode(error) || 500
      );
    }
  },

 
  //MARK: Retrieve a single review
  async findOne(ctx) {
    try {
      const { id: reviewId } = ctx.params;

      // Call the default Strapi findOne method
      const { data, meta } = await super.findOne(ctx);

      if (!data) {
        throw new NotFoundError("Review not found.");
      }

      return ctx.send({
        success: true,
        message: "Review retrieved successfully.",
        data,
        meta,
      });
    } catch (error) {
      const customizedError = handleErrors(error);
      return ctx.send(
        { success: false, message: customizedError.message },
        handleStatusCode(error) || 500
      );
    }
  },

  
  //MARK: Update a review
  async update(ctx) {
    try {
      const { id: reviewId } = ctx.params;
      const { id: userId } = ctx.state.user;
      const requestData = ctx.request.body.data || ctx.request.body;
      const { rating, comment } = requestData;

      // Fetch existing review to ensure it belongs to the user and get product ID
      const existingReview = await strapi.entityService.findOne("api::review.review", reviewId, {
        populate: ['user', 'product']
      });

      if (!existingReview) {
        throw new NotFoundError("Review not found.");
      }

      // Ensure the user updating the review is the one who created it
      if (existingReview.user.id !== userId) {
        throw new strapiUtils.errors.ForbiddenError("You are not authorized to update this review.");
      }

      if (rating !== undefined) {
        if (isNaN(rating) || rating < 1 || rating > 5) {
          throw new ValidationError("Rating must be an integer between 1 and 5.");
        }
      }
      if (comment !== undefined && typeof comment !== 'string') {
        throw new ValidationError("Comment must be a string.");
      }

      const updatedReview = await strapi.entityService.update("api::review.review", reviewId, {
        data: {
          rating: rating !== undefined ? parseInt(rating) : existingReview.rating,
          comment: comment !== undefined ? comment : existingReview.comment,
        },
        populate: ['user', 'product']
      });

      // Recalculate product's average rating after review update
      const productId = updatedReview.product.id;
      const product = await strapi.entityService.findOne("api::product.product", productId, {
        populate: ["reviews"]
      });

      if (product && product.reviews.length > 0) {
        const totalRatings = product.reviews.reduce((sum, r) => sum + r.rating, 0);
        const newAverageRating = totalRatings / product.reviews.length;

        await strapi.entityService.update("api::product.product", productId, {
          data: {
            rating: parseFloat(newAverageRating.toFixed(2)),
          },
        });
      }

      return ctx.send({
        success: true,
        message: "Review updated successfully.",
        data: updatedReview,
      });
    } catch (error) {
      const customizedError = handleErrors(error);
      return ctx.send(
        { success: false, message: customizedError.message },
        handleStatusCode(error) || 500
      );
    }
  },

 
  //MARK: Delete a review
  async delete(ctx) {
    try {
      const { id: reviewId } = ctx.params;
      const { id: userId } = ctx.state.user;

      const existingReview = await strapi.entityService.findOne("api::review.review", reviewId, {
        populate: ['user', 'product']
      });

      if (!existingReview) {
        throw new NotFoundError("Review not found.");
      }

      // Ensure the user deleting the review is the one who created it
      if (existingReview.user.id !== userId) {
        throw new strapiUtils.errors.ForbiddenError("You are not authorized to delete this review.");
      }

      const productId = existingReview.product.id;

      await strapi.entityService.delete("api::review.review", reviewId);

      // Recalculate product's average rating after review deletion
      const product = await strapi.entityService.findOne("api::product.product", productId, {
        populate: ["reviews"]
      });

      if (product) {
        const newReviewCount = product.reviews.length;
        let newAverageRating = 0;

        if (newReviewCount > 0) {
          const totalRatings = product.reviews.reduce((sum, r) => sum + r.rating, 0);
          newAverageRating = totalRatings / newReviewCount;
        }

        await strapi.entityService.update("api::product.product", productId, {
          data: {
            rating: parseFloat(newAverageRating.toFixed(2)),
            reviewCount: newReviewCount,
          },
        });
      }

      return ctx.send({
        success: true,
        message: "Review deleted successfully.",
        data: {
          review_id: reviewId,
          product_id: productId,
        },
      });
    } catch (error) {
      const customizedError = handleErrors(error);
      return ctx.send(
        { success: false, message: customizedError.message },
        handleStatusCode(error) || 500
      );
    }
  },
}));
