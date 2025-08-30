"use strict";

const { createCoreController } = require("@strapi/strapi").factories;
const strapiUtils = require("@strapi/utils");
const { ValidationError, ForbiddenError } = strapiUtils.errors;
const { sanitize } = require("@strapi/utils");

/**
 * Helper function to handle potential errors and return a clean error message.
 * @param {Error} error The error object.
 * @returns {object} An object with a simplified error message.
 */
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

/**
 * Helper function to determine the appropriate HTTP status code based on the error type.
 * @param {Error} error The error object.
 * @returns {number} The HTTP status code.
 */
const handleStatusCode = (error) => {
  const errorMessage = String(error.message || "");
  if (error.name === "YupValidationError") return 400;
  if (error.name === "ValidationError") return 400;
  if (error.name === "ForbiddenError") return 403;
  if (errorMessage.includes("Missing required field")) return 400;
  return 500;
};

/**
 * Helper function to get an array of values from a query parameter.
 * It can handle a single value or a comma-separated string, and
 * attempts to parse JSON arrays.
 * @param {string|string[]} param The query parameter value.
 * @returns {Array} An array of processed values.
 */
const getArrayFromQueryParam = (param) => {
  if (!param) return [];
  try {
    const parsed = JSON.parse(param);
    if (Array.isArray(parsed)) {
      return parsed.map(s => String(s).trim()).filter(s => s.length > 0);
    }
  } catch (e) {
    // If it's not a valid JSON array, treat it as a string.
  }

  if (typeof param === "string") {
    return param
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  return [String(param)];
};

/**
 * Defines the default fields to populate when fetching an accessory.
 * This ensures related data like reviews, images, and product variants are included.
 */
const defaultPopulate = {
  reviews: {
    fields: ["id", "rating", "comment"],
    populate: {
      user: { fields: ["id", "name", "email"] },
    },
  },
  product_variants: {
    populate: {
      color_picker: true,
      color: { fields: ["id", "name"] },
      eyewear_type: true,
    },
  },
  images: true, // Populates all fields for the media type
};

module.exports = createCoreController(
  "api::accessory.accessory",
  ({ strapi }) => ({
    //MARK:find
    async find(ctx) {
      try {
        const { query } = ctx;
        const user = ctx.state.user;
        let filters = {};
        let sort = [];

        // --- 1. Search (fuzzy search on name and brand) ---
        if (query._q) {
          filters.$or = [
            { name: { $containsi: query._q } },
            { brand: { $containsi: query._q } },
          ];
          delete query._q;
        }

        // --- 2. Filtering ---
        // Filter by accessory type (e.g., 'cleaning-kit', 'case').
        if (query.types) {
          const types = getArrayFromQueryParam(query.types);
          if (types.length > 0) {
            filters.type = { $in: types };
          }
          delete query.types;
        }

        // Filter by accessory brand (case-insensitive).
        if (query.brands) {
          const brands = getArrayFromQueryParam(query.brands);
          if (brands.length > 0) {
            // Note: Since 'brand' is a string field, we use $in directly.
            filters.brand = { $in: brands };
          }
          delete query.brands;
        }

        // Filter by product variant colors.
        if (query.colors) {
          const colors = getArrayFromQueryParam(query.colors);
          if (colors.length > 0) {
            filters.product_variants = {
              ...filters.product_variants,
              color: { id: { $in: colors } },
            };
          }
          delete query.colors;
        }

        // Filter by price range.
        if (query.price_gte) {
          filters.price = {
            ...filters.price,
            $gte: parseFloat(query.price_gte),
          };
          delete query.price_gte;
        }
        if (query.price_lte) {
          filters.price = {
            ...filters.price,
            $lte: parseFloat(query.price_lte),
          };
          delete query.price_lte;
        }

        // Filter for accessories with a review key.
        if (query.isreviewkey !== undefined) {
          if (query.isreviewkey === "true") {
            filters.review_key = { $not: null };
          } else if (query.isreviewkey === "false") {
            filters.review_key = { $null: true };
          }
          delete query.isreviewkey;
        }

        // Filter by eyeware type.
        if (query.eyeware_types) {
          const eyewareTypes = getArrayFromQueryParam(query.eyeware_types);
          if (eyewareTypes.length > 0) {
            filters.eyeware_type = { $in: eyewareTypes };
          }
          delete query.eyeware_types;
        }

        // --- 3. Sorting ---
        if (query.sort) {
          const sortParams = Array.isArray(query.sort)
            ? query.sort
            : [query.sort];
          sort = sortParams.map((s) => {
            const [field, order] = s.split(":");
            return { [field]: order.toLowerCase() };
          });
          delete query.sort;
        } else {
          // Default sort by creation date
          sort.push({ createdAt: "desc" });
        }

        // --- 4. Pagination ---
        const page = parseInt(query.pagination?.page || 1, 10);
        const pageSize = parseInt(query.pagination?.pageSize || 25, 10);
        const start = (page - 1) * pageSize;
        const limit = pageSize;

        const findOptions = {
          filters: filters,
          sort: sort,
          start: start,
          limit: limit,
          populate: defaultPopulate,
        };

        const accessories = await strapi.entityService.findMany(
          "api::accessory.accessory",
          findOptions
        );

        const total = await strapi.entityService.count(
          "api::accessory.accessory",
          { filters: filters }
        );

        let wishlistedIds = new Set();
        if (user && user.id) {
          const userWishlistProducts = await strapi.db
            .query("api::accessory.accessory")
            .findMany({
              where: { wishlistedByUsers: { id: user.id } },
              select: ["id"],
            });
          if (userWishlistProducts) {
            userWishlistProducts.forEach((accessory) => {
              wishlistedIds.add(accessory.id);
            });
          }
        }

        const sanitizedAccessories = await Promise.all(
          accessories.map(async (accessory) => {
            const sanitized = await strapiUtils.sanitize.contentAPI.output(
              accessory,
              strapi.contentType("api::accessory.accessory")
            );

            // Check if the current user has reviewed this product
            let isReviewed = false;
            if (
              user &&
              user.id &&
              sanitized.reviews &&
              Array.isArray(sanitized.reviews)
            ) {
              isReviewed = sanitized.reviews.some(
                (review) => review.user && review.user.id === user.id
              );
            }
            
            // Add the new eyeware_type key from the first product variant
            if (
                sanitized.product_variants &&
                sanitized.product_variants.length > 0 &&
                sanitized.product_variants[0].eyewear_type &&
                sanitized.product_variants[0].eyewear_type.name
            ) {
                sanitized.eyewear_type = sanitized.product_variants[0].eyewear_type.name;
            } else {
                sanitized.eyewear_type = null;
            }

            const isWishlisted = wishlistedIds.has(sanitized.id);

            return {
              ...sanitized,
              isWishlisted,
              isReviewed,
            };
          })
        );

        return ctx.send({
          success: true,
          message:
            sanitizedAccessories.length > 0
              ? "Accessories retrieved successfully."
              : "No accessories found matching the criteria.",
          data: {
            products: sanitizedAccessories,
            page: page,
            pageSize: pageSize,
            pageCount: Math.ceil(total / pageSize),
            total: total,
          },
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

   //MARK:findone
    async findOne(ctx) {
      try {
        const { id: accessoryId } = ctx.params;
        const user = ctx.state.user;
        const accessory = await strapi.entityService.findOne(
          "api::accessory.accessory",
          accessoryId,
          {
            populate: defaultPopulate,
          }
        );

        if (!accessory) {
          ctx.status = 404;
          return ctx.send({
            success: false,
            message: "Accessory not found.",
          });
        }
        
        const sanitizedAccessory = await strapiUtils.sanitize.contentAPI.output(
          accessory,
          strapi.contentType("api::accessory.accessory")
        );

        // Check if the current user has wishlisted this product
        let isWishlisted = false;
        if (user && user.id) {
          const wishlistCheck = await strapi.db
            .query("api::accessory.accessory")
            .findOne({
              where: { id: accessoryId, wishlistedByUsers: { id: user.id } },
              select: ["id"],
            });
          isWishlisted = !!wishlistCheck;
        }

        // Check if the current user has reviewed this product
        let isReviewed = false;
        if (
          user &&
          user.id &&
          sanitizedAccessory.reviews &&
          Array.isArray(sanitizedAccessory.reviews)
        ) {
          isReviewed = sanitizedAccessory.reviews.some(
            (review) => review.user && review.user.id === user.id
          );
        }

        // Add the new eyeware_type key from the first product variant
        if (
            sanitizedAccessory.product_variants &&
            sanitizedAccessory.product_variants.length > 0 &&
            sanitizedAccessory.product_variants[0].eyewear_type &&
            sanitizedAccessory.product_variants[0].eyewear_type.name
        ) {
            sanitizedAccessory.eyewear_type =
                sanitizedAccessory.product_variants[0].eyewear_type.name;
        } else {
            sanitizedAccessory.eyewear_type = null;
        }

        const finalAccessory = {
          ...sanitizedAccessory,
          isWishlisted,
          isReviewed,
        };

        return ctx.send({
          success: true,
          message: "Accessory retrieved successfully.",
          data: finalAccessory,
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
    // MARK: Find similar accessories by an accessory ID
    async findSimilar(ctx) {
      try {
        const { id } = ctx.params;
        const user = ctx.state.user;

        // Step 1: Find the original accessory by its ID and populate relevant fields
        const originalAccessory = await strapi.entityService.findOne(
          "api::accessory.accessory",
          id,
          {
            populate: ["brands", "category", "localizations"],
          }
        );

        if (!originalAccessory) {
          throw new NotFoundError("Accessory not found.");
        }

        // Step 2: Extract relevant IDs and attributes for filtering
        const brandsIds = originalAccessory.brands?.map((brand) => brand.id);
        const categoryId = originalAccessory.category?.id;

        // Step 3: Build the dynamic filter
        const filters = {
          $and: [
            {
              id: {
                $ne: id, // Exclude the original accessory
              },
            },
            {
              $or: [],
            },
          ],
        };

        if (brandsIds && brandsIds.length > 0) {
          filters.$and[1].$or.push({
            brands: {
              id: {
                $in: brandsIds,
              },
            },
          });
        }
        if (categoryId) {
          filters.$and[1].$or.push({
            category: {
              id: categoryId,
            },
          });
        }

        // If no filters can be applied, return an empty array
        if (filters.$and[1].$or.length === 0) {
          return ctx.send({
            success: true,
            message: "No similar accessories found.",
            data: [],
          });
        }

        // --- WISH LIST: Fetch the authenticated user's wishlist IDs including localizations ---
        let wishlistedIds = new Set();
        if (user && user.id) {
          const userWishlistAccessories = await strapi.db
            .query("api::accessory.accessory")
            .findMany({
              where: {
                wishlistedByUsers: {
                  id: user.id,
                },
              },
              select: ["id"],
              populate: {
                localizations: {
                  select: ["id"],
                },
              },
            });

          if (userWishlistAccessories) {
            userWishlistAccessories.forEach((accessory) => {
              // Add the main accessory ID to the set
              wishlistedIds.add(accessory.id);

              // Add all localized accessory IDs to the set
              if (accessory.localizations && Array.isArray(accessory.localizations)) {
                accessory.localizations.forEach((localization) => {
                  wishlistedIds.add(localization.id);
                });
              }
            });
          }
        }

        // Step 4: Find similar accessories based on the dynamic filter
        const similarAccessories = await strapi.entityService.findMany(
          "api::accessory.accessory",
          {
            filters: filters,
            populate: defaultPopulate,
            limit: 10, // You can adjust the limit
          }
        );

        // Step 5: Sanitize and format the response with the wishlist status
        const sanitizedAccessories = similarAccessories.map((accessory) => {
          // Determine if the accessory is wishlisted
          const isWishlisted = wishlistedIds.has(accessory.id);

          // Return the new object with the wishlist status
          return {
            ...accessory,
            isWishlisted: isWishlisted,
          };
        });

        // Step 6: Send the final response
        return ctx.send({
          success: true,
          message: "Similar accessories retrieved successfully.",
          data: sanitizedAccessories,
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

    // MARK: Toggle Wishlist + Return Updated Wishlist
    async toggleWishlist(ctx) {
      try {
        const { id: userId } = ctx.state.user;
        const { accessoryId } = ctx.params;

        // 1. Find accessory with wishlistedByUsers
        const accessory = await strapi.entityService.findOne(
          "api::accessory.accessory",
          accessoryId,
          { populate: ["wishlistedByUsers"] }
        );

        if (!accessory) {
          throw new NotFoundError("Accessory not found.");
        }

        const isWishlisted = accessory.wishlistedByUsers.some(
          (user) => user.id === userId
        );

        let updatedWishlistUsers;
        let message;

        if (isWishlisted) {
          // Remove from wishlist
          updatedWishlistUsers = accessory.wishlistedByUsers
            .filter((u) => u.id !== userId)
            .map((u) => u.id);
          message = "Accessory removed from wishlist.";
        } else {
          // Add to wishlist
          updatedWishlistUsers = [
            ...accessory.wishlistedByUsers.map((u) => u.id),
            userId,
          ];
          message = "Accessory added to wishlist.";
        }

        // 2. Update wishlist relation
        await strapi.entityService.update(
          "api::accessory.accessory",
          accessoryId,
          {
            data: { wishlistedByUsers: updatedWishlistUsers },
          }
        );

        // 3. Get updated wishlist accessories for the current user
        const wishlistedAccessories = await strapi.entityService.findMany(
          "api::accessory.accessory",
          {
            filters: { wishlistedByUsers: userId },
            populate: {
              image: {
                fields: ["url", "name", "alternativeText"],
              },
              reviews: {
                fields: ["rating", "comment", "createdAt"],
                populate: { user: { fields: ["name"] } },
              },
            },
            sort: [{ createdAt: "desc" }],
          }
        );

        return ctx.send({
          success: true,
          message,
          data: {
            accessory_id: accessoryId,
            isWishlisted: !isWishlisted,
            wishlist: {
              accessories: wishlistedAccessories,
              total_items_in_wishlist: wishlistedAccessories.length,
            },
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

    // GET /api/accessories/my-wishlist
    async getMyWishlist(ctx) {
      try {
        const { id: userId } = ctx.state.user;

        const wishlistedAccessories = await strapi.entityService.findMany(
          "api::accessory.accessory",
          {
            filters: {
              wishlistedByUsers: userId, // Only accessories where current user is in wishlist
            },
            populate: {
              image: { fields: ["url", "name", "alternativeText"] },
              reviews: {
                fields: ["rating", "comment", "createdAt"],
                populate: { user: { fields: ["name"] } },
              },
            },
            sort: [{ createdAt: "desc" }],
          }
        );

        return ctx.send({
          success: true,
          message: "Wishlist retrieved successfully.",
          data: {
            accessories: wishlistedAccessories,
            total_items_in_wishlist: wishlistedAccessories.length,
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
  })
);
