"use strict";

const { createCoreController } = require("@strapi/strapi").factories;
const strapiUtils = require("@strapi/utils");
const { ValidationError, NotFoundError } = strapiUtils.errors;
const { sanitize } = require("@strapi/utils");

/**
 * Parses a string, number, or array of IDs into a clean array of integers.
 * @param {*} input The input to parse.
 * @returns {number[]|null} An array of integer IDs or null if input is empty.
 * @throws {ValidationError} If an ID is not a valid number.
 */
const parseIdsToArray = (input) => {
  if (input === undefined || input === null || input === "") {
    return null;
  }
  if (Array.isArray(input)) {
    return input
      .map((id) => {
        const parsedId = parseInt(id, 10);
        if (isNaN(parsedId)) {
          throw new ValidationError(`Invalid ID type found in array: ${id}`);
        }
        return parsedId;
      })
      .filter((id) => !isNaN(id));
  }
  if (typeof input === "string") {
    const ids = input
      .split(",")
      .map((s) => {
        const trimmedS = s.trim();
        if (trimmedS === "") return NaN;
        const parsedId = parseInt(trimmedS, 10);
        if (isNaN(parsedId)) {
          throw new ValidationError(
            `Invalid ID format in string: '${trimmedS}'`
          );
        }
        return parsedId;
      })
      .filter((id) => !isNaN(id));
    return ids.length > 0 ? ids : null;
  }
  if (typeof input === "number") {
    return [input];
  }
  throw new ValidationError(`Unexpected data type for IDs: ${typeof input}`);
};

/**
 * Validates that all provided IDs exist for a given one-to-many relation.
 * @param {string} target The Strapi content type UID.
 * @param {number[]} ids An array of IDs to validate.
 * @param {string} fieldName The name of the field for error messages.
 * @throws {ValidationError|NotFoundError} If IDs are not an array or if some IDs are not found.
 */
const validateOneToManyRelationIds = async (target, ids, fieldName) => {
  // Return early if no IDs are provided
  if (!ids) return;

  if (!Array.isArray(ids)) {
    throw new ValidationError(`${fieldName} must be an array of IDs.`);
  }

  if (ids.length > 0) {
    // Use a single query to fetch all entities by their IDs
    const entities = await strapi.entityService.findMany(target, {
      filters: { id: { $in: ids } },
      fields: ["id"], // We only need the IDs to check for existence
    });

    // Check if the number of found entities matches the number of provided IDs
    if (entities.length !== ids.length) {
      const foundIds = new Set(entities.map((e) => e.id));
      const notFoundIds = ids.filter((id) => !foundIds.has(id));
      throw new NotFoundError(
        `Provided ${fieldName} ID(s) [${notFoundIds.join(", ")}] not found.`
      );
    }
  }
};

/**
 * Handles errors and returns a customized error message.
 * @param {Error} error The error object.
 * @returns {object} An object with a user-friendly error message.
 */
const handleErrors = (error) => {
  console.error("Error occurred:", error);
  const errorMessage = String(error.message || "");
  if (error.name === "ValidationError") return { message: errorMessage };
  if (error.name === "NotFoundError") return { message: errorMessage };
  if (errorMessage.includes("Missing required field"))
    return { message: errorMessage };
  if (
    errorMessage.includes(
      "relation(s) of type plugin::upload.file associated with this entity do not exist"
    )
  ) {
    return {
      message: "One or more provided image IDs do not exist or are invalid.",
    };
  }
  return { message: "An unexpected error occurred." };
};

/**
 * Determines the appropriate HTTP status code based on the error.
 * @param {Error} error The error object.
 * @returns {number} The HTTP status code.
 */
const handleStatusCode = (error) => {
  const errorMessage = String(error.message || "");
  if (error.name === "ValidationError") return 400;
  if (error.name === "NotFoundError") return 404;
  if (errorMessage.includes("Missing required field")) return 400;
  if (
    errorMessage.includes(
      "relation(s) of type plugin::upload.file associated with this entity do not exist"
    )
  ) {
    return 400;
  }
  return 500;
};

/**
 * Validates that required fields exist in the request body.
 * @param {object} body The request body.
 * @param {string[]} fields An array of field names to check.
 * @throws {ValidationError} If a required field is missing.
 */
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

// Placeholder for `ImageFile`. Your custom implementation is assumed to be working.
async function ImageFile(file, width, height) {
  const [uploadedFile] = await strapi.plugins.upload.services.upload.upload({
    data: {},
    files: file,
  });
  return uploadedFile;
}

// Helper function to get an array of values from a query parameter
const getArrayFromQueryParam = (param) => {
  if (!param) return [];
  try {
    const parsedParam = JSON.parse(param);
    if (Array.isArray(parsedParam)) {
      return parsedParam;
    }
  } catch (e) {
    // Not a JSON array, proceed to handle as string
  }
  if (typeof param === "string") {
    // Updated to handle comma-separated strings correctly
    return param
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  return [String(param)];
};

module.exports = createCoreController(
  "api::contact-lens.contact-lens",
  ({ strapi }) => ({
    //MARK:findone

     async findOne(ctx) {
      try {
        const { id } = ctx.params;
        const user = ctx.state.user;

        const populate = {
          images: true,
          brands: true,
          reviews: {
            populate: {
              user: true,
            },
          },
          // Populate product_variants and its nested relations as requested
          product_variants: {
            populate: {
              eyewear_type: true,
            },
          },
        };

        const contactLens = await strapi.entityService.findOne(
          "api::contact-lens.contact-lens",
          id,
          { populate }
        );

        if (!contactLens) {
          throw new NotFoundError("Contact lens not found.");
        }

        // Check if the current user has wishlisted this product
        let isWishlisted = false;
        if (user && user.id) {
          const wishlistCheck = await strapi.db
            .query("api::contact-lens.contact-lens")
            .findOne({
              where: { id: id, wishlistedByUsers: { id: user.id } },
              select: ["id"],
            });
          isWishlisted = !!wishlistCheck;
        }

        // Check if the current user has reviewed this product
        let isReviewed = false;
        if (
          user &&
          user.id &&
          contactLens.reviews &&
          Array.isArray(contactLens.reviews)
        ) {
          isReviewed = contactLens.reviews.some(
            (review) => review.user && review.user.id === user.id
          );
        }

        const sanitizedContactLens = await strapiUtils.sanitize.contentAPI.output(
          contactLens,
          strapi.contentType("api::contact-lens.contact-lens")
        );

        // Transform the 'brands' relation from an array to a single object
        if (
          sanitizedContactLens.brands &&
          Array.isArray(sanitizedContactLens.brands) &&
          sanitizedContactLens.brands.length > 0
        ) {
          const brand = sanitizedContactLens.brands[0];
          sanitizedContactLens.brands = {
            id: brand.id,
            name: brand.name,
          };
        } else {
          sanitizedContactLens.brands = null;
        }

        // Add the new eyeware_type key from the first product variant
        if (
          sanitizedContactLens.product_variants &&
          sanitizedContactLens.product_variants.length > 0 &&
          sanitizedContactLens.product_variants[0].eyewear_type &&
          sanitizedContactLens.product_variants[0].eyewear_type.name
        ) {
          sanitizedContactLens.eyewear_type =
            sanitizedContactLens.product_variants[0].eyewear_type.name;
        } else {
          sanitizedContactLens.eyewear_type = null;
        }

        // Final product object with the requested changes
        const finalContactLens = {
          ...sanitizedContactLens,
          isWishlisted: isWishlisted,
          isReviewed: isReviewed,
          average_rating: sanitizedContactLens.average_rating,
          reviewCount: sanitizedContactLens.reviewCount,
        };

        // Remove old fields to clean up the response
        delete finalContactLens.wishlistedByUsers;

        return ctx.send({
          success: true,
          message: "Contact lens retrieved successfully.",
          data: finalContactLens,
        });
      } catch (error) {
        const customizedError = handleErrors(error);
        ctx.status = handleStatusCode(error) || 500;
        return ctx.send({ success: false, message: customizedError.message });
      }
    },

    /**
     * Find all contact lenses and return a success message with the data.
     * @param {object} ctx Koa context.
     * @returns {object} The response object with success status and data.
     */
    //MARK:find
    async find(ctx) {
      try {
        const { query } = ctx;
        const user = ctx.state.user;

        let filters = {};
        let sort = [];

        const populate = {
          images: true,
          brands: true,
          reviews: {
            populate: {
              user: true,
            },
          },
          // Populate product_variants and its nested relations as requested
          product_variants: {
            populate: {
              eyewear_type: true,
            },
          },
          localizations: true,
        };

        const locale = query.locale || "en";
        delete query.locale;

        // --- 1. Search (using '_q' for fuzzy search) ---
        if (query._q) {
          filters.$or = [
            { name: { $containsi: query._q } },
            { description: { $containsi: query._q } },
            { brands: { name: { $containsi: query._q } } },
          ];
          delete query._q;
        }

        // --- 2. Filtering ---
        if (query.price_gte) {
          filters.price = { ...filters.price, $gte: parseFloat(query.price_gte) };
          delete query.price_gte;
        }
        if (query.price_lte) {
          filters.price = { ...filters.price, $lte: parseFloat(query.price_lte) };
          delete query.price_lte;
        }
        if (query.offerPrice_gte) {
          filters.offerPrice = {
            ...filters.offerPrice,
            $gte: parseFloat(query.offerPrice_gte),
          };
          delete query.offerPrice_gte;
        }
        if (query.offerPrice_lte) {
          filters.offerPrice = {
            ...filters.offerPrice,
            $lte: parseFloat(query.offerPrice_lte),
          };
          delete query.offerPrice_lte;
        }
        if (query.best_seller !== undefined) {
          filters.best_seller = query.best_seller.toLowerCase() === "true";
          delete query.best_seller;
        }
        if (query.brands) {
          const brands = getArrayFromQueryParam(query.brands);
          if (brands.length > 0) {
            filters.brands = { id: { $in: brands } };
          }
          delete query.brands;
        }
        if (query.rating_gte) {
          filters.average_rating = {
            ...filters.average_rating,
            $gte: parseFloat(query.rating_gte),
          };
          delete query.rating_gte;
        }
        if (query.rating_lte) {
          filters.average_rating = {
            ...filters.average_rating,
            $lte: parseFloat(query.rating_lte),
          };
          delete query.rating_lte;
        }

        // --- 3. Sorting ---
        if (query._sort) {
          const sortParams = Array.isArray(query._sort)
            ? query._sort
            : [query._sort];
          sort = sortParams.map((s) => {
            const [field, order] = s.split(":");
            if (field.includes(".")) {
              const [relation, subField] = field.split(".");
              return { [relation]: { [subField]: order.toLowerCase() } };
            }
            return { [field]: order.toLowerCase() };
          });
          delete query._sort;
        } else {
          sort.push({ createdAt: "desc" });
        }

        // --- 4. Pagination ---
        const page = parseInt(query.page || 1);
        const pageSize = parseInt(query.pageSize || 10);
        const start = (page - 1) * pageSize;
        const limit = pageSize;

        const findOptions = {
          filters: filters,
          sort: sort,
          populate: populate,
          start: start,
          limit: limit,
          locale: locale,
        };

        const contactLenses = await strapi.entityService.findMany(
          "api::contact-lens.contact-lens",
          findOptions
        );
        const total = await strapi.entityService.count(
          "api::contact-lens.contact-lens",
          {
            filters: filters,
            locale: locale,
          }
        );

        // Fetch the authenticated user's wishlist IDs if a user exists
        let wishlistedIds = new Set();
        if (user && user.id) {
          const userWishlistProducts = await strapi.db
            .query("api::contact-lens.contact-lens")
            .findMany({
              where: { wishlistedByUsers: { id: user.id } },
              select: ["id"],
              populate: {
                localizations: {
                  select: ["id"],
                },
              },
            });

          if (userWishlistProducts) {
            userWishlistProducts.forEach((contactLens) => {
              wishlistedIds.add(contactLens.id);
              if (
                contactLens.localizations &&
                Array.isArray(contactLens.localizations)
              ) {
                contactLens.localizations.forEach((localization) => {
                  wishlistedIds.add(localization.id);
                });
              }
            });
          }
        }

        const contactLensesWithOriginalId = contactLenses.map(
          (contactLens) => {
            const originalProduct = contactLens.localizations?.find(
              (loc) => loc.locale === "en"
            );
            return {
              ...contactLens,
              originalId: originalProduct ? originalProduct.id : contactLens.id,
            };
          }
        );

        const sanitizedContactLenses = await Promise.all(
          contactLensesWithOriginalId.map(async (contactLens) => {
            const sanitized = await strapiUtils.sanitize.contentAPI.output(
              contactLens,
              strapi.contentType("api::contact-lens.contact-lens")
            );

            // Add the new eyeware_type key from the first product variant
            if (
              sanitized.product_variants &&
              sanitized.product_variants.length > 0 &&
              sanitized.product_variants[0].eyewear_type &&
              sanitized.product_variants[0].eyewear_type.name
            ) {
              sanitized.eyewear_type =
                sanitized.product_variants[0].eyewear_type.name;
            } else {
              sanitized.eyewear_type = null;
            }

            // Transform the 'brands' relation from an array to a single object
            if (
              sanitized.brands &&
              Array.isArray(sanitized.brands) &&
              sanitized.brands.length > 0
            ) {
              const brand = sanitized.brands[0];
              sanitized.brands = {
                id: brand.id,
                name: brand.name,
              };
            } else {
              sanitized.brands = null;
            }

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
            // Apply the transformations directly
            const isWishlisted = wishlistedIds.has(sanitized.originalId);

            // Return the new object with the extracted lists
            return {
              ...sanitized,
              isWishlisted: isWishlisted,
              isReviewed: isReviewed,
              average_rating: sanitized.average_rating,
              reviewCount: sanitized.reviewCount,
            };
          })
        );

        const message =
          sanitizedContactLenses.length > 0
            ? "Contact lenses retrieved successfully."
            : "No contact lenses found matching the criteria.";

        return ctx.send({
          success: true,
          message: message,
          data: {
            products: sanitizedContactLenses,
            page: page,
            pageSize: limit,
            pageCount: Math.ceil(total / limit),
            total: total,
          },
        });
      } catch (error) {
        const customizedError = handleErrors(error);
        ctx.status = handleStatusCode(error) || 500;
        return ctx.send({ success: false, message: customizedError.message });
      }
    },
      // MARK: Find similar contact lenses by a lens ID
    async findSimilar(ctx) {
      try {
        const { id } = ctx.params;
        const user = ctx.state.user;

        // Step 1: Find the original contact lens by its ID and populate relevant fields
        const originalLens = await strapi.entityService.findOne(
          "api::contact-lens.contact-lens",
          id,
          {
            populate: ["brands", "product_variants", "localizations"],
          }
        );

        if (!originalLens) {
          throw new NotFoundError("Contact lens not found.");
        }

        // Step 2: Extract relevant IDs and attributes for filtering
        const brandsIds = originalLens.brands?.map((brand) => brand.id);
        const variantColors = originalLens.product_variants?.map(
          (variant) => variant.color
        );
        const variantColorIds = variantColors
          .filter(Boolean)
          .map((color) => color.id);

        // Step 3: Build the dynamic filter
        const filters = {
          $and: [
            {
              id: {
                $ne: id, // Exclude the original lens
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
        if (variantColorIds && variantColorIds.length > 0) {
          filters.$and[1].$or.push({
            product_variants: {
              color: {
                id: {
                  $in: variantColorIds,
                },
              },
            },
          });
        }

        // If no filters can be applied, return an empty array
        if (filters.$and[1].$or.length === 0) {
          return ctx.send({
            success: true,
            message: "No similar contact lenses found.",
            data: [],
          });
        }

        // --- WISH LIST: Fetch the authenticated user's wishlist IDs including localizations ---
        let wishlistedIds = new Set();
        if (user && user.id) {
          const userWishlistLenses = await strapi.db
            .query("api::contact-lens.contact-lens")
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

          if (userWishlistLenses) {
            userWishlistLenses.forEach((lens) => {
              // Add the main lens ID to the set
              wishlistedIds.add(lens.id);

              // Add all localized lens IDs to the set
              if (lens.localizations && Array.isArray(lens.localizations)) {
                lens.localizations.forEach((localization) => {
                  wishlistedIds.add(localization.id);
                });
              }
            });
          }
        }

        // Step 4: Find similar contact lenses based on the dynamic filter
        const similarLenses = await strapi.entityService.findMany(
          "api::contact-lens.contact-lens",
          {
            filters: filters,
            populate: defaultPopulate,
            limit: 10, // You can adjust the limit
          }
        );

        // Step 5: Sanitize and format the response with the wishlist status
        const sanitizedLenses = similarLenses.map((lens) => {
          // Determine if the lens is wishlisted
          const isWishlisted = wishlistedIds.has(lens.id);

          // Return the new object with the wishlist status
          return {
            ...lens,
            isWishlisted: isWishlisted,
          };
        });

        // Step 6: Send the final response
        return ctx.send({
          success: true,
          message: "Similar contact lenses retrieved successfully.",
          data: sanitizedLenses,
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
        const { lensId } = ctx.params;

        // 1. Find lens with wishlistedByUsers
        const lens = await strapi.entityService.findOne(
          "api::contact-lens.contact-lens",
          lensId,
          { populate: ["wishlistedByUsers"] }
        );

        if (!lens) {
          throw new NotFoundError("Contact lens not found.");
        }

        const isWishlisted = lens.wishlistedByUsers.some(
          (user) => user.id === userId
        );

        let updatedWishlistUsers;
        let message;

        if (isWishlisted) {
          // Remove from wishlist
          updatedWishlistUsers = lens.wishlistedByUsers
            .filter((u) => u.id !== userId)
            .map((u) => u.id);
          message = "Contact lens removed from wishlist.";
        } else {
          // Add to wishlist
          updatedWishlistUsers = [
            ...lens.wishlistedByUsers.map((u) => u.id),
            userId,
          ];
          message = "Contact lens added to wishlist.";
        }

        // 2. Update wishlist relation
        await strapi.entityService.update(
          "api::contact-lens.contact-lens",
          lensId,
          {
            data: { wishlistedByUsers: updatedWishlistUsers },
          }
        );

        // 3. Get updated wishlist lenses for the current user
        const wishlistedLenses = await strapi.entityService.findMany(
          "api::contact-lens.contact-lens",
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
            lens_id: lensId,
            isWishlisted: !isWishlisted,
            wishlist: {
              lenses: wishlistedLenses,
              total_items_in_wishlist: wishlistedLenses.length,
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

    // GET /api/contact-lenses/my-wishlist
    async getMyWishlist(ctx) {
      try {
        const { id: userId } = ctx.state.user;

        const wishlistedLenses = await strapi.entityService.findMany(
          "api::contact-lens.contact-lens",
          {
            filters: {
              wishlistedByUsers: userId, // Only lenses where current user is in wishlist
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
            lenses: wishlistedLenses,
            total_items_in_wishlist: wishlistedLenses.length,
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



// "use strict";

// const { createCoreController } = require("@strapi/strapi").factories;
// const { ValidationError, ForbiddenError } = require("@strapi/utils").errors;

// // Helper function to handle potential errors.
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

// // Helper function to handle status codes.
// const handleStatusCode = (error) => {
//   const errorMessage = String(error.message || "");
//   if (error.name === "YupValidationError") return 400;
//   if (error.name === "ValidationError") return 400;
//   if (error.name === "ForbiddenError") return 403;
//   if (errorMessage.includes("Missing required field")) return 400;
//   return 500;
// };
// // Helper function to get an array of values from a query parameter
// const getArrayFromQueryParam = (param) => {
//   if (!param) return [];
//   if (Array.isArray(JSON.parse(param))) {
//     return JSON.parse(param);
//   }
//   if (typeof param === "string") {
//     // Updated to handle comma-separated strings correctly
//     return param
//       .split(",")
//       .map((s) => s.trim())
//       .filter((s) => s.length > 0);
//   }
//   return [String(param)];
// };

// const defaultPopulate = {
//   reviews: {
//     fields: ["id", "rating", "comment"],
//     populate: {
//       user: { fields: ["id", "name", "email"] },
//     },
//   },
//   product_variants: {
//     populate: {
//       color_picker: true,
//       color: { fields: ["id", "name"] },
//     },
//   },
//   brands: {
//     fields: ["name"],
//   },
//   images: true,
// };

// module.exports = createCoreController(
//   "api::contact-lens.contact-lens",
//   ({ strapi }) => ({
//     /**
//      * List all contact lenses with pagination, filters, and population.
//      */
//     async find(ctx) {
//       try {
//         const { query } = ctx;

//         let filters = {};
//         let sort = [];

//         // --- 1. Search (using '_q' for fuzzy search across specified fields) ---
//         if (query._q) {
//           filters.$or = [
//             { name: { $containsi: query._q } },
//             { brands: { name: { $containsi: query._q } } },
//           ];
//           delete query._q;
//         }

//         // --- 2. Filtering ---
//         // Filter by brands using their IDs.
//         if (query.brands) {
//           const brands = getArrayFromQueryParam(query.brands);
//           if (brands.length > 0) {
//             filters.brands = { id: { $in: brands } };
//           }
//           delete query.brands;
//         }

//         // Filter by product variants (e.g., color, frame_size).
//         if (query.colors) {
//           const colors = getArrayFromQueryParam(query.colors);
//           if (colors.length > 0) {
//             filters.product_variants = {
//               ...filters.product_variants,
//               color: { id: { $in: colors } },
//             };
//           }
//           delete query.colors;
//         }

//         // Filter by price range.
//         if (query.price_gte) {
//           filters.price = {
//             ...filters.price,
//             $gte: parseFloat(query.price_gte),
//           };
//           delete query.price_gte;
//         }
//         if (query.price_lte) {
//           filters.price = {
//             ...filters.price,
//             $lte: parseFloat(query.price_lte),
//           };
//           delete query.price_lte;
//         }

//         // --- 3. Sorting ---
//         if (query.sort) {
//           const sortParams = Array.isArray(query.sort)
//             ? query.sort
//             : [query.sort];
//           sort = sortParams.map((s) => {
//             const [field, order] = s.split(":");
//             if (field.includes(".")) {
//               const [relation, subField] = field.split(".");
//               return { [relation]: { [subField]: order.toLowerCase() } };
//             }
//             return { [field]: order.toLowerCase() };
//           });
//           delete query.sort;
//         } else {
//           sort.push({ createdAt: "desc" });
//         }

//         // --- 4. Pagination ---
//         const page = parseInt(query.pagination?.page || 1, 10);
//         const pageSize = parseInt(query.pagination?.pageSize || 25, 10);
//         const start = (page - 1) * pageSize;
//         const limit = pageSize;

//         const findOptions = {
//           filters: filters,
//           sort: sort,
//           start: start,
//           limit: limit,
//           populate: defaultPopulate,
//         };

//         const lenses = await strapi.entityService.findMany(
//           "api::contact-lens.contact-lens",
//           findOptions
//         );

//         const total = await strapi.entityService.count(
//           "api::contact-lens.contact-lens",
//           {
//             filters: filters,
//           }
//         );

//         return ctx.send({
//           success: true,
//           message:
//             lenses.length > 0
//               ? "Contact lenses retrieved successfully."
//               : "No contact lenses found matching the criteria.",
//           data: {
//             lenses,
//             page: page,
//             pageSize: pageSize,
//             pageCount: Math.ceil(total / pageSize),
//             total: total,
//           },
//         });
//       } catch (error) {
//         const customizedError = handleErrors(error);
//         ctx.status = handleStatusCode(error);
//         return ctx.send({
//           success: false,
//           message: customizedError.message,
//         });
//       }
//     },

//     /**
//      * Get a single contact lens by ID with population.
//      */
//     async findOne(ctx) {
//       try {
//         const { id: lensId } = ctx.params;

//         const lens = await strapi.entityService.findOne(
//           "api::contact-lens.contact-lens",
//           lensId,
//           {
//             populate: defaultPopulate, // Add the defined populate fields
//           }
//         );

//         if (!lens) {
//           ctx.status = 404;
//           return ctx.send({
//             success: false,
//             message: "Contact lens not found.",
//           });
//         }

//         return ctx.send({
//           success: true,
//           message: "Contact lens retrieved successfully.",
//           data: lens,
//         });
//       } catch (error) {
//         const customizedError = handleErrors(error);
//         ctx.status = handleStatusCode(error);
//         return ctx.send({
//           success: false,
//           message: customizedError.message,
//         });
//       }
//     },
//      // MARK: Find similar contact lenses by a lens ID
//     async findSimilar(ctx) {
//       try {
//         const { id } = ctx.params;
//         const user = ctx.state.user;

//         // Step 1: Find the original contact lens by its ID and populate relevant fields
//         const originalLens = await strapi.entityService.findOne(
//           "api::contact-lens.contact-lens",
//           id,
//           {
//             populate: ["brands", "product_variants", "localizations"],
//           }
//         );

//         if (!originalLens) {
//           throw new NotFoundError("Contact lens not found.");
//         }

//         // Step 2: Extract relevant IDs and attributes for filtering
//         const brandsIds = originalLens.brands?.map((brand) => brand.id);
//         const variantColors = originalLens.product_variants?.map(
//           (variant) => variant.color
//         );
//         const variantColorIds = variantColors
//           .filter(Boolean)
//           .map((color) => color.id);

//         // Step 3: Build the dynamic filter
//         const filters = {
//           $and: [
//             {
//               id: {
//                 $ne: id, // Exclude the original lens
//               },
//             },
//             {
//               $or: [],
//             },
//           ],
//         };

//         if (brandsIds && brandsIds.length > 0) {
//           filters.$and[1].$or.push({
//             brands: {
//               id: {
//                 $in: brandsIds,
//               },
//             },
//           });
//         }
//         if (variantColorIds && variantColorIds.length > 0) {
//           filters.$and[1].$or.push({
//             product_variants: {
//               color: {
//                 id: {
//                   $in: variantColorIds,
//                 },
//               },
//             },
//           });
//         }

//         // If no filters can be applied, return an empty array
//         if (filters.$and[1].$or.length === 0) {
//           return ctx.send({
//             success: true,
//             message: "No similar contact lenses found.",
//             data: [],
//           });
//         }

//         // --- WISH LIST: Fetch the authenticated user's wishlist IDs including localizations ---
//         let wishlistedIds = new Set();
//         if (user && user.id) {
//           const userWishlistLenses = await strapi.db
//             .query("api::contact-lens.contact-lens")
//             .findMany({
//               where: {
//                 wishlistedByUsers: {
//                   id: user.id,
//                 },
//               },
//               select: ["id"],
//               populate: {
//                 localizations: {
//                   select: ["id"],
//                 },
//               },
//             });

//           if (userWishlistLenses) {
//             userWishlistLenses.forEach((lens) => {
//               // Add the main lens ID to the set
//               wishlistedIds.add(lens.id);

//               // Add all localized lens IDs to the set
//               if (lens.localizations && Array.isArray(lens.localizations)) {
//                 lens.localizations.forEach((localization) => {
//                   wishlistedIds.add(localization.id);
//                 });
//               }
//             });
//           }
//         }

//         // Step 4: Find similar contact lenses based on the dynamic filter
//         const similarLenses = await strapi.entityService.findMany(
//           "api::contact-lens.contact-lens",
//           {
//             filters: filters,
//             populate: defaultPopulate,
//             limit: 10, // You can adjust the limit
//           }
//         );

//         // Step 5: Sanitize and format the response with the wishlist status
//         const sanitizedLenses = await Promise.all(
//           similarLenses.map(async (lens) => {
//             const sanitized = await strapi.entityService.sanitizeOutput(
//               lens,
//               strapi.contentType("api::contact-lens.contact-lens")
//             );

//             // Determine if the lens is wishlisted
//             const isWishlisted = wishlistedIds.has(sanitized.id);

//             // Return the new object with the wishlist status
//             return {
//               ...sanitized,
//               isWishlisted: isWishlisted,
//             };
//           })
//         );

//         // Step 6: Send the final response
//         return ctx.send({
//           success: true,
//           message: "Similar contact lenses retrieved successfully.",
//           data: sanitizedLenses,
//         });
//       } catch (error) {
//         const customizedError = handleErrors(error);
//         ctx.status = handleStatusCode(error);
//         return ctx.send({
//           success: false,
//           message: customizedError.message,
//         });
//       }
//     },

//     // MARK: Toggle Wishlist + Return Updated Wishlist
//     async toggleWishlist(ctx) {
//       try {
//         const { id: userId } = ctx.state.user;
//         const { lensId } = ctx.params;

//         // 1. Find lens with wishlistedByUsers
//         const lens = await strapi.entityService.findOne(
//           "api::contact-lens.contact-lens",
//           lensId,
//           { populate: ["wishlistedByUsers"] }
//         );

//         if (!lens) {
//           throw new NotFoundError("Contact lens not found.");
//         }

//         const isWishlisted = lens.wishlistedByUsers.some(
//           (user) => user.id === userId
//         );

//         let updatedWishlistUsers;
//         let message;

//         if (isWishlisted) {
//           // Remove from wishlist
//           updatedWishlistUsers = lens.wishlistedByUsers
//             .filter((u) => u.id !== userId)
//             .map((u) => u.id);
//           message = "Contact lens removed from wishlist.";
//         } else {
//           // Add to wishlist
//           updatedWishlistUsers = [
//             ...lens.wishlistedByUsers.map((u) => u.id),
//             userId,
//           ];
//           message = "Contact lens added to wishlist.";
//         }

//         // 2. Update wishlist relation
//         await strapi.entityService.update(
//           "api::contact-lens.contact-lens",
//           lensId,
//           {
//             data: { wishlistedByUsers: updatedWishlistUsers },
//           }
//         );

//         // 3. Get updated wishlist lenses for the current user
//         const wishlistedLenses = await strapi.entityService.findMany(
//           "api::contact-lens.contact-lens",
//           {
//             filters: { wishlistedByUsers: userId },
//             populate: {
//               image: {
//                 fields: ["url", "name", "alternativeText"],
//               },
//               reviews: {
//                 fields: ["rating", "comment", "createdAt"],
//                 populate: { user: { fields: ["name"] } },
//               },
//             },
//             sort: [{ createdAt: "desc" }],
//           }
//         );

//         return ctx.send({
//           success: true,
//           message,
//           data: {
//             lens_id: lensId,
//             isWishlisted: !isWishlisted,
//             wishlist: {
//               lenses: wishlistedLenses,
//               total_items_in_wishlist: wishlistedLenses.length,
//             },
//           },
//         });
//       } catch (error) {
//         const customizedError = handleErrors(error);
//         return ctx.send(
//           { success: false, message: customizedError.message },
//           handleStatusCode(error) || 500
//         );
//       }
//     },

//     // GET /api/contact-lenses/my-wishlist
//     async getMyWishlist(ctx) {
//       try {
//         const { id: userId } = ctx.state.user;

//         const wishlistedLenses = await strapi.entityService.findMany(
//           "api::contact-lens.contact-lens",
//           {
//             filters: {
//               wishlistedByUsers: userId, // Only lenses where current user is in wishlist
//             },
//             populate: {
//               image: { fields: ["url", "name", "alternativeText"] },
//               reviews: {
//                 fields: ["rating", "comment", "createdAt"],
//                 populate: { user: { fields: ["name"] } },
//               },
//             },
//             sort: [{ createdAt: "desc" }],
//           }
//         );

//         return ctx.send({
//           success: true,
//           message: "Wishlist retrieved successfully.",
//           data: {
//             lenses: wishlistedLenses,
//             total_items_in_wishlist: wishlistedLenses.length,
//           },
//         });
//       } catch (error) {
//         const customizedError = handleErrors(error);
//         return ctx.send(
//           { success: false, message: customizedError.message },
//           handleStatusCode(error) || 500
//         );
//       }
//     },
//   })
// );
