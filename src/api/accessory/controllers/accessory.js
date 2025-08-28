"use strict";

const { createCoreController } = require("@strapi/strapi").factories;
const { ValidationError, ForbiddenError } = require("@strapi/utils").errors;

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
    },
  },
  images: true, // Populates all fields for the media type
};

module.exports = createCoreController(
  "api::accessory.accessory",
  ({ strapi }) => ({
    /**
     * List all accessories with search, filters, sorting, and pagination.
     */
    async find(ctx) {
      try {
        const { query } = ctx;
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

        return ctx.send({
          success: true,
          message:
            accessories.length > 0
              ? "Accessories retrieved successfully."
              : "No accessories found matching the criteria.",
          data: 
          {
            accessories,
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
     * Get a single accessory by ID with full population.
     */
    async findOne(ctx) {
      try {
        const { id: accessoryId } = ctx.params;
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

        return ctx.send({
          success: true,
          message: "Accessory retrieved successfully.",
          data: accessory,
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
