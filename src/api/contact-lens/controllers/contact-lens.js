"use strict";

const { createCoreController } = require("@strapi/strapi").factories;
const { ValidationError, ForbiddenError, NotFoundError } = require("@strapi/utils").errors;

// Helper function to handle potential errors.
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

// Helper function to handle status codes.
const handleStatusCode = (error) => {
  const errorMessage = String(error.message || "");
  if (error.name === "YupValidationError") return 400;
  if (error.name === "ValidationError") return 400;
  if (error.name === "ForbiddenError") return 403;
  if (errorMessage.includes("Missing required field")) return 400;
  return 500;
};
// Helper function to get an array of values from a query parameter
const getArrayFromQueryParam = (param) => {
  if (!param) return [];
  if (Array.isArray(JSON.parse(param))) {
    return JSON.parse(param);
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
    },
  },
  brands: {
    fields: ["name"],
  },
  images: true,
};

module.exports = createCoreController(
  "api::contact-lens.contact-lens",
  ({ strapi }) => ({
    /**
     * List all contact lenses with pagination, filters, and population.
     */
    async find(ctx) {
      try {
        const { query } = ctx;
        const user = ctx.state.user;

        let filters = {};
        let sort = [];
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
              wishlistedIds.add(lens.id);
              if (lens.localizations && Array.isArray(lens.localizations)) {
                lens.localizations.forEach((localization) => {
                  wishlistedIds.add(localization.id);
                });
              }
            });
          }
        }

        // --- 1. Search (using '_q' for fuzzy search across specified fields) ---
        if (query._q) {
          filters.$or = [
            { name: { $containsi: query._q } },
            { brands: { name: { $containsi: query._q } } },
          ];
          delete query._q;
        }

        // --- 2. Filtering ---
        // Filter by brands using their IDs.
        if (query.brands) {
          const brands = getArrayFromQueryParam(query.brands);
          if (brands.length > 0) {
            filters.brands = { id: { $in: brands } };
          }
          delete query.brands;
        }

        // Filter by product variants (e.g., color, frame_size).
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

        // --- 3. Sorting ---
        if (query.sort) {
          const sortParams = Array.isArray(query.sort)
            ? query.sort
            : [query.sort];
          sort = sortParams.map((s) => {
            const [field, order] = s.split(":");
            if (field.includes(".")) {
              const [relation, subField] = field.split(".");
              return { [relation]: { [subField]: order.toLowerCase() } };
            }
            return { [field]: order.toLowerCase() };
          });
          delete query.sort;
        } else {
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

        const lenses = await strapi.entityService.findMany(
          "api::contact-lens.contact-lens",
          findOptions
        );

        const total = await strapi.entityService.count(
          "api::contact-lens.contact-lens",
          {
            filters: filters,
          }
        );
        
        const sanitizedLenses = lenses.map(lens => {
          const isWishlisted = wishlistedIds.has(lens.id);
          const colors = new Set();
          
          if (lens.product_variants && Array.isArray(lens.product_variants)) {
            lens.product_variants.forEach(variant => {
              if (variant.color) {
                colors.add(JSON.stringify(variant.color));
              }
            });
          }
          return {
            ...lens,
            isWishlisted: isWishlisted,
            colors: Array.from(colors).map(c => JSON.parse(c)),
          };
        });

        return ctx.send({
          success: true,
          message:
            sanitizedLenses.length > 0
              ? "Contact lenses retrieved successfully."
              : "No contact lenses found matching the criteria.",
          data: {
            lenses: sanitizedLenses,
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

    /**
     * Get a single contact lens by ID with population.
     */
    async findOne(ctx) {
      try {
        const { id: lensId } = ctx.params;
        const user = ctx.state.user;
        let isWishlisted = false;
        if (user && user.id) {
          const wishlistedLens = await strapi.db.query("api::contact-lens.contact-lens").findOne({
            where: {
              id: lensId,
              wishlistedByUsers: { id: user.id },
            },
            select: ["id"]
          });
          isWishlisted = !!wishlistedLens;
        }

        const lens = await strapi.entityService.findOne(
          "api::contact-lens.contact-lens",
          lensId,
          {
            populate: defaultPopulate, // Add the defined populate fields
          }
        );

        if (!lens) {
          ctx.status = 404;
          return ctx.send({
            success: false,
            message: "Contact lens not found.",
          });
        }
        const colors = new Set();
        if (lens.product_variants && Array.isArray(lens.product_variants)) {
            lens.product_variants.forEach(variant => {
                if (variant.color) {
                    colors.add(JSON.stringify(variant.color));
                }
            });
        }
        
        const sanitizedLens = {
          ...lens,
          isWishlisted: isWishlisted,
        };

        return ctx.send({
          success: true,
          message: "Contact lens retrieved successfully.",
          data: sanitizedLens,
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
