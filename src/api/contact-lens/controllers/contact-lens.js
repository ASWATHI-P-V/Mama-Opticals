"use strict";

const { createCoreController } = require("@strapi/strapi").factories;
const { ValidationError, ForbiddenError } = require("@strapi/utils").errors;

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

        let filters = {};
        let sort = [];

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

        return ctx.send({
          success: true,
          message:
            lenses.length > 0
              ? "Contact lenses retrieved successfully."
              : "No contact lenses found matching the criteria.",
          data: {
            lenses,
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

        return ctx.send({
          success: true,
          message: "Contact lens retrieved successfully.",
          data: lens,
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
  })
);
