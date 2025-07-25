// Path: src/api/category/controllers/category.js

"use strict";

/**
 * category controller
 */

const { createCoreController } = require("@strapi/strapi").factories;
const strapiUtils = require("@strapi/utils");
const { ValidationError } = strapiUtils.errors;

// ===========================================================================
// Helper Functions: (Copied from product.js for self-containment,
// but ideally these would be in a shared utility file)
// ===========================================================================
const handleErrors = (error) => {
  console.error("Error occurred:", error);
  const errorMessage = String(error.message || '');

  if (error.name === "ValidationError") {
    return { message: errorMessage };
  }
  if (error.name === "NotFoundError") {
    return { message: errorMessage };
  }
  if (errorMessage.includes("Missing required field")) {
    return { message: errorMessage };
  }
  return { message: "An unexpected error occurred." };
};

const handleStatusCode = (error) => {
  const errorMessage = String(error.message || '');

  if (error.name === "ValidationError") return 400;
  if (error.name === "NotFoundError") return 404;
  if (errorMessage.includes("Missing required field"))
    return 400;
  return 500;
};

class NotFoundError extends Error {
  constructor(message = "Not Found") {
    super(message);
    this.name = "NotFoundError";
  }
}

const validateBodyRequiredFields = (body, requiredFields) => {
  const missingFields = requiredFields.filter(field => !body[field]);

  if (missingFields.length > 0) {
    throw new ValidationError(`Missing required fields: ${missingFields.join(', ')}`);
  }
};
// --- END Helper functions ---


module.exports = createCoreController("api::category.category", ({ strapi }) => ({
  /**
   * Create a new category.
   * POST /api/categories
   */
  //MARK: Create a new category
  async create(ctx) {
    try {
      const requestData = ctx.request.body.data || ctx.request.body;
      const { name } = requestData;

      // Validate required fields
      validateBodyRequiredFields(requestData, ["name"]);

      // Check if a category with the same name already exists (case-insensitive)
      const existingCategory = await strapi.entityService.findMany("api::category.category", {
        filters: { name: { $eqi: name } },
        limit: 1,
      });

      if (existingCategory.length > 0) {
        throw new ValidationError(`Category with name '${name}' already exists.`);
      }

      // Create the new category
      const newCategory = await strapi.entityService.create(
        "api::category.category",
        {
          data: {
            name,
            publishedAt: new Date(), // Publish immediately upon creation
          },
        }
      );

      return ctx.send({
        success: true,
        message: "Category created successfully.",
        data: {
          category_id: newCategory.id,
          category_name: newCategory.name,
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

  /**
   * List all categories.
   * Supports filtering, sorting, and pagination.
   * GET /api/categories
   */
  //MARK: Find all categories
  async find(ctx) {
    try {
      const { query } = ctx;
      let filters = {};
      let sort = [];
      let populate = ['products']; // Populate products relation by default

      // --- 1. Search/Filtering by name ---
      if (query._q) {
        filters.$or = [
          { name: { $containsi: query._q } }
        ];
        delete query._q;
      } else if (query.name) {
        filters.name = { $eqi: query.name };
        delete query.name;
      }

      // --- 2. Sorting ---
      if (query._sort) {
        const sortParams = Array.isArray(query._sort) ? query._sort : [query._sort];
        sort = sortParams.map(s => {
          const [field, order] = s.split(':');
          return { [field]: order.toLowerCase() };
        });
        delete query._sort;
      } else {
        sort.push({ createdAt: 'desc' }); // Default sort
      }

      // --- 3. Pagination ---
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
      };

      const categories = await strapi.entityService.findMany("api::category.category", findOptions);
      const total = await strapi.entityService.count("api::category.category", { filters: filters });

      const sanitizedCategories = await Promise.all(
        categories.map((category) =>
          strapiUtils.sanitize.contentAPI.output(category, strapi.contentType('api::category.category'))
        )
      );

      return ctx.send({
        success: true,
        message: "Categories retrieved successfully.",
        data: {
          categories: sanitizedCategories,
          meta: {
            pagination: {
              page: page,
              pageSize: limit,
              pageCount: Math.ceil(total / limit),
              total: total,
            },
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

  /**
   * Retrieve a single category by ID.
   * GET /api/categories/:id
   */
  //MARK: Find a single category
  async findOne(ctx) {
    try {
      const { id } = ctx.params;

      const category = await strapi.entityService.findOne(
        "api::category.category",
        id,
        { populate: ['products'] } // Populate products relation
      );

      if (!category) {
        throw new NotFoundError("Category not found.");
      }

      const sanitizedCategory = await strapiUtils.sanitize.contentAPI.output(category, strapi.contentType('api::category.category'));

      return ctx.send({
        success: true,
        message: "Category retrieved successfully.",
        data: sanitizedCategory, // Return the full category object
      });
    } catch (error) {
      const customizedError = handleErrors(error);
      return ctx.send(
        { success: false, message: customizedError.message },
        handleStatusCode(error) || 500
      );
    }
  },

  /**
   * Update an existing category.
   * PUT /api/categories/:id
   */
  //MARK: Update category
  async update(ctx) {
    try {
      const { id } = ctx.params;
      const requestData = ctx.request.body.data || ctx.request.body;
      const { name } = requestData;

      // Check if the category exists
      const existingCategory = await strapi.entityService.findOne(
        "api::category.category",
        id
      );

      if (!existingCategory) {
        throw new NotFoundError("Category not found.");
      }

      // If name is being updated, check for duplicates (case-insensitive)
      if (name && name !== existingCategory.name) {
        const duplicateCategory = await strapi.entityService.findMany("api::category.category", {
          filters: { name: { $eqi: name }, id: { $ne: id } }, // Exclude current category
          limit: 1,
        });

        if (duplicateCategory.length > 0) {
          throw new ValidationError(`Category with name '${name}' already exists.`);
        }
      }

      const updatedCategory = await strapi.entityService.update(
        "api::category.category",
        id,
        {
          data: { name }, // Only update the name for now, or other fields if added to schema
        }
      );

      return ctx.send({
        success: true,
        message: "Category updated successfully.",
        data: {
          category_id: updatedCategory.id,
          category_name: updatedCategory.name,
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

  /**
   * Delete a category.
   * DELETE /api/categories/:id
   */
  //MARK: Delete category
  async delete(ctx) {
    try {
      const { id } = ctx.params;

      const categoryToDelete = await strapi.entityService.findOne(
        "api::category.category",
        id
      );

      if (!categoryToDelete) {
        throw new NotFoundError("Category not found.");
      }

      // Strapi's default behavior for 'oneToMany' relation:
      // When a category is deleted, the 'category' field on associated products
      // will be set to null. No products will be deleted.

      const deletedCategory = await strapi.entityService.delete(
        "api::category.category",
        id
      );

      return ctx.send({
        success: true,
        message: "Category deleted successfully.",
        data: {
          category_id: deletedCategory.id,
          category_name: deletedCategory.name,
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
