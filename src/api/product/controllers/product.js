// src/api/product/controllers/product.js

"use strict";

/**
 * product controller
 */

const { createCoreController } = require("@strapi/strapi").factories;
const strapiUtils = require("@strapi/utils"); // Import the entire @strapi/utils module
const { ValidationError } = strapiUtils.errors; // Access ValidationError from the imported module

// ===========================================================================
// Helper Functions: (Make sure these are available, either defined here or imported)
// ===========================================================================
const handleErrors = (error) => {
  console.error("Error occurred:", error);
  const errorMessage = String(error.message || ''); // Ensure message is a string for robust comparison

  // Prioritize Strapi's ValidationError messages
  if (error.name === "ValidationError") {
    return { message: errorMessage };
  }
  if (error.name === "NotFoundError") {
    return { message: errorMessage };
  }
  // Fallback for generic errors, including "Missing required field" from validateBodyRequiredFields
  if (errorMessage.includes("Missing required field")) {
    return { message: errorMessage };
  }
  // Fallback for any other unexpected errors
  return { message: "An unexpected error occurred." };
};

const handleStatusCode = (error) => {
  const errorMessage = String(error.message || ''); // Ensure message is a string for robust comparison

  // Prioritize Strapi's ValidationError status
  if (error.name === "ValidationError") return 400;
  if (error.name === "NotFoundError") return 404;
  // Fallback for generic errors, including "Missing required field" from validateBodyRequiredFields
  if (errorMessage.includes("Missing required field")) {
    return 400;
  }
  // If it's a generic error not matching specific messages, assume 500 for server-side issues
  return 500;
};

class NotFoundError extends Error {
  constructor(message = "Not Found") {
    super(message);
    this.name = "NotFoundError";
  }
}

const validateBodyRequiredFields = (body, fields) => {
  for (const field of fields) {
    if (
      body[field] === undefined ||
      body[field] === null ||
      body[field] === ""
    ) {
      throw new Error(`Missing required field: ${field}`);
    }
  }
};
// --- END Placeholder for helper functions ---

module.exports = createCoreController("api::product.product", ({ strapi }) => ({
  /**
   * Create a new product.
   * Handles linking to related content types via their IDs (expects arrays for oneToMany relations on Product side).
   */
  async create(ctx) {
    try {
      // Strapi v4 typically wraps request body in 'data'
      const requestData = ctx.request.body.data || ctx.request.body;
      const {
        name,
        description,
        price,
        inStock,
        image, // Expects ID of uploaded media
        category, // Expects ID (manyToOne)
        // Relations that are oneToMany on Product side (expect arrays of IDs)
        lens_types,
        lens_coatings,
        frame_weights,
        brands,
        frame_materials,
        frame_shapes,
        lens_thicknesses,
        frame_sizes,
        color,
        salesCount,
      } = requestData;

      // Validate required fields
      validateBodyRequiredFields(requestData, ["name", "price"]);

      // Basic type/value validation
      if (isNaN(price) || price < 0) {
        throw new ValidationError("Price must be a non-negative number.");
      }
      if (
        typeof inStock !== "boolean" &&
        inStock !== undefined &&
        inStock !== null
      ) {
        throw new ValidationError("inStock must be a boolean (true/false).");
      }

      // Validate existence of related entities for manyToOne (category)
      if (category) {
        if (Array.isArray(category)) {
            throw new ValidationError("Category must be a single ID, not an array.");
        }
        const categoryEntity = await strapi.entityService.findOne("api::category.category", category);
        if (!categoryEntity) {
          throw new NotFoundError("Provided category not found.");
        }
      }

      // Validate existence of related entities for oneToMany relations (expect arrays of IDs)
      const validateOneToManyRelationIds = async (target, ids, fieldName) => {
        if (ids !== undefined && ids !== null) { // Allow empty array or null/undefined if not required
            if (!Array.isArray(ids)) {
                throw new ValidationError(`${fieldName} must be an array of IDs.`);
            }
            for (const id of ids) {
                if (typeof id !== 'number' && typeof id !== 'string') { // IDs can be numbers or strings
                    throw new ValidationError(`Invalid ID type in ${fieldName} array.`);
                }
                const entity = await strapi.entityService.findOne(target, id);
                if (!entity) {
                    throw new NotFoundError(`Provided ${fieldName} ID ${id} not found.`);
                }
            }
        }
      };

      await validateOneToManyRelationIds("api::lens-type.lens-type", lens_types, "lens_types");
      await validateOneToManyRelationIds("api::lens-coating.lens-coating", lens_coatings, "lens_coatings");
      await validateOneToManyRelationIds("api::frame-weight.frame-weight", frame_weights, "frame_weights");
      await validateOneToManyRelationIds("api::brand.brand", brands, "brands");
      await validateOneToManyRelationIds("api::frame-material.frame-material", frame_materials, "frame_materials");
      await validateOneToManyRelationIds("api::frame-shape.frame-shape", frame_shapes, "frame_shapes");
      await validateOneToManyRelationIds("api::lens-thickness.lens-thickness", lens_thicknesses, "lens_thicknesses");
      await validateOneToManyRelationIds("api::frame-size.frame-size", frame_sizes, "frame_sizes");


      // Create the new product
      const newProduct = await strapi.entityService.create(
        "api::product.product",
        {
          data: {
            name,
            description,
            price,
            inStock: inStock !== undefined ? inStock : true, // Default to true if not provided
            image, // This expects the image ID if it's already uploaded
            category, // This expects the category ID
            lens_types, // Expects array of IDs
            lens_coatings, // Expects array of IDs
            frame_weights, // Expects array of IDs
            brands, // Expects array of IDs
            frame_materials, // Expects array of IDs
            frame_shapes, // Expects array of IDs
            lens_thicknesses, // Expects array of IDs
            frame_sizes, // Expects array of IDs
            color,
            salesCount: salesCount || 0, // Default salesCount to 0 if not provided
            publishedAt: new Date(), // Publish immediately upon creation
          },
          // Populate all relations to get full details in the response
          populate: [
            "image",
            "category",
            "lens_types",
            "lens_coatings",
            "frame_weights",
            "brands",
            "frame_materials",
            "frame_shapes",
            "lens_thicknesses",
            "frame_sizes",
            "wishlistedByUsers"
          ],
        }
      );

      // Sanitize the output
      const sanitizedProduct = await strapiUtils.sanitize.contentAPI.output(newProduct, strapi.contentType('api::product.product'));

      return ctx.send({
        success: true,
        message: "Product created successfully.",
        data: sanitizedProduct,
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
   * List all products with filtering, searching, sorting, and pagination.
   * Populates all relevant relations.
   */
  async find(ctx) {
    try {
      const { query } = ctx; // Access query parameters
      let filters = {};
      let sort = [];
      // Populate all relations using their plural names as per your schema
      let populate = [
        'image',
        'category',
        'lens_types',
        'lens_coatings',
        'frame_weights',
        'brands',
        'frame_materials',
        'frame_shapes',
        'lens_thicknesses',
        'frame_sizes'
      ];

      // --- 1. Search (using '_q' for fuzzy search across specified fields) ---
      if (query._q) {
        // Apply search across 'name', 'description', and new related fields
        filters.$or = [
          { name: { $containsi: query._q } },
          { description: { $containsi: query._q } },
          { color: { $containsi: query._q } },
          // Search by related content type's name field (assuming they have a 'name' attribute)
          // Note: Filtering oneToMany relations by nested fields like 'name' can be complex
          // and might require custom query logic or specific database indexing depending on Strapi's ORM.
          // Filtering by ID (e.g., ?brands_id=1) is generally more direct for oneToMany.
          { brands: { name: { $containsi: query._q } } },
          { frame_materials: { name: { $containsi: query._q } } },
          { frame_shapes: { name: { $containsi: query._q } } },
          { lens_types: { name: { $containsi: query._q } } },
          { lens_coatings: { name: { $containsi: query._q } } },
          { lens_thicknesses: { name: { $containsi: query._q } } },
          { frame_weights: { name: { $containsi: query._q } } },
          { frame_sizes: { name: { $containsi: query._q } } }
        ];
        delete query._q; // Remove _q from the direct query to prevent conflicts
      }

      // --- 2. Filtering ---

      // Price Range
      if (query.price_gte) {
        filters.price = { ...filters.price, $gte: parseFloat(query.price_gte) };
        delete query.price_gte;
      }
      if (query.price_lte) {
        filters.price = { ...filters.price, $lte: parseFloat(query.price_lte) };
        delete query.price_lte;
      }

      // Offer Price Range (if you add this field to your schema)
      if (query.offerPrice_gte) {
        filters.offerPrice = { ...filters.offerPrice, $gte: parseFloat(query.offerPrice_gte) };
        delete query.offerPrice_gte;
      }
      if (query.offerPrice_lte) {
        filters.offerPrice = { ...filters.offerPrice, $lte: parseFloat(query.offerPrice_lte) };
        delete query.offerPrice_lte;
      }

      // Availability (inStock - Boolean field)
      if (query.inStock !== undefined) {
        filters.inStock = query.inStock === 'true';
        delete query.inStock;
      }

      // Category (by name)
      if (query.category) {
        filters.category = { name: { $eqi: query.category } };
        delete query.category;
      }

      // Color (Text field on Product)
      if (query.color) {
        filters.color = { $eqi: query.color }; // Case-insensitive exact match for color
        delete query.color;
      }

      // Filter by related content type's name (plural field names as per your schema)
      // Note: Filtering oneToMany relations by nested fields like 'name' can be complex
      // and might require custom query logic or specific database indexing depending on Strapi's ORM.
      // Filtering by ID (e.g., ?brands_id=1) is generally more direct for oneToMany.
      if (query.brands) {
        filters.brands = { name: { $eqi: query.brands } };
        delete query.brands;
      }
      if (query.frame_materials) {
        filters.frame_materials = { name: { $eqi: query.frame_materials } };
        delete query.frame_materials;
      }
      if (query.frame_shapes) {
        filters.frame_shapes = { name: { $eqi: query.frame_shapes } };
        delete query.frame_shapes;
      }
      if (query.lens_types) {
        filters.lens_types = { name: { $eqi: query.lens_types } };
        delete query.lens_types;
      }
      if (query.lens_coatings) {
        filters.lens_coatings = { name: { $eqi: query.lens_coatings } };
        delete query.lens_coatings;
      }
      if (query.lens_thicknesses) {
        filters.lens_thicknesses = { name: { $eqi: query.lens_thicknesses } };
        delete query.lens_thicknesses;
      }
      if (query.frame_weights) {
        filters.frame_weights = { name: { $eqi: query.frame_weights } };
        delete query.frame_weights;
      }
      if (query.frame_sizes) {
        filters.frame_sizes = { name: { $eqi: query.frame_sizes } };
        delete query.frame_sizes;
      }

      // Rating (gte) (if you add this field to your schema)
      if (query.rating_gte) {
        filters.rating = { ...filters.rating, $gte: parseFloat(query.rating_gte) };
        delete query.rating_gte;
      }

      // --- 3. Sorting ---
      if (query._sort) {
        const sortParams = Array.isArray(query._sort) ? query._sort : [query._sort];
        sort = sortParams.map(s => {
          const [field, order] = s.split(':');
          // Handle sorting by relation names if needed, e.g., 'brands.name:asc'
          if (field.includes('.')) {
            const [relation, subField] = field.split('.');
            return { [relation]: { [subField]: order.toLowerCase() } };
          }
          return { [field]: order.toLowerCase() };
        });
        delete query._sort;
      } else {
        // Default sorting: Newest arrivals
        sort.push({ createdAt: 'desc' });
      }

      // --- 4. Pagination ---
      const page = parseInt(query.page || 1);
      const pageSize = parseInt(query.pageSize || 10);
      const start = (page - 1) * pageSize;
      const limit = pageSize;

      // --- Construct final query options for entityService.findMany ---
      const findOptions = {
        filters: filters,
        sort: sort,
        populate: populate,
        start: start,
        limit: limit,
      };

      // Fetch products and total count separately for pagination metadata
      const products = await strapi.entityService.findMany("api::product.product", findOptions);
      const total = await strapi.entityService.count("api::product.product", { filters: filters });

      // Sanitize the output to remove sensitive fields if any (though not expected for products)
      const sanitizedProducts = await Promise.all(
        products.map((product) =>
          strapiUtils.sanitize.contentAPI.output(product, strapi.contentType('api::product.product'))
        )
      );

      // Return response with data and pagination metadata
      ctx.body = {
        data: sanitizedProducts,
        meta: {
          pagination: {
            page: page,
            pageSize: limit,
            pageCount: Math.ceil(total / limit),
            total: total,
          },
        },
      };

    } catch (error) {
      const customizedError = handleErrors(error); // Using your existing error handler
      return ctx.send(
        { success: false, message: customizedError.message },
        handleStatusCode(error) || 500 // Using your existing status code handler
      );
    }
  },

  /**
   * Update an existing product.
   * Allows updating product details and its relations (expects arrays of IDs for oneToMany).
   * PUT /api/products/:id
   */
  async update(ctx) {
    try {
      const { id } = ctx.params; // Product ID from URL parameters
      const requestData = ctx.request.body.data || ctx.request.body; // Strapi v4 wraps body in 'data'

      // Check if the product exists
      const existingProduct = await strapi.entityService.findOne(
        "api::product.product",
        id
      );

      if (!existingProduct) {
        throw new NotFoundError("Product not found.");
      }

      // Validate existence of related entities for manyToOne (category)
      if (requestData.category !== undefined) {
          if (Array.isArray(requestData.category)) {
              throw new ValidationError("Category must be a single ID, not an array.");
          }
          const categoryEntity = await strapi.entityService.findOne("api::category.category", requestData.category);
          if (!categoryEntity) {
              throw new NotFoundError("Provided category not found.");
          }
      }

      // Validate existence of related entities for oneToMany relations (expect arrays of IDs)
      const validateOneToManyRelationIds = async (target, ids, fieldName) => {
        if (ids !== undefined && ids !== null) { // Allow empty array or null/undefined if not required
            if (!Array.isArray(ids)) {
                throw new ValidationError(`${fieldName} must be an array of IDs.`);
            }
            for (const id of ids) {
                if (typeof id !== 'number' && typeof id !== 'string') { // IDs can be numbers or strings
                    throw new ValidationError(`Invalid ID type in ${fieldName} array.`);
                }
                const entity = await strapi.entityService.findOne(target, id);
                if (!entity) {
                    throw new NotFoundError(`Provided ${fieldName} ID ${id} not found.`);
                }
            }
        }
      };

      if (requestData.lens_types !== undefined) await validateOneToManyRelationIds("api::lens-type.lens-type", requestData.lens_types, "lens_types");
      if (requestData.lens_coatings !== undefined) await validateOneToManyRelationIds("api::lens-coating.lens-coating", requestData.lens_coatings, "lens_coatings");
      if (requestData.frame_weights !== undefined) await validateOneToManyRelationIds("api::frame-weight.frame-weight", requestData.frame_weights, "frame_weights");
      if (requestData.brands !== undefined) await validateOneToManyRelationIds("api::brand.brand", requestData.brands, "brands");
      if (requestData.frame_materials !== undefined) await validateOneToManyRelationIds("api::frame-material.frame-material", requestData.frame_materials, "frame_materials");
      if (requestData.frame_shapes !== undefined) await validateOneToManyRelationIds("api::frame-shape.frame-shape", requestData.frame_shapes, "frame_shapes");
      if (requestData.lens_thicknesses !== undefined) await validateOneToManyRelationIds("api::lens-thickness.lens-thickness", requestData.lens_thicknesses, "lens_thicknesses");
      if (requestData.frame_sizes !== undefined) await validateOneToManyRelationIds("api::frame-size.frame-size", requestData.frame_sizes, "frame_sizes");


      // Update the product
      const updatedProduct = await strapi.entityService.update(
        "api::product.product",
        id,
        {
          data: requestData, // Pass the entire request data (Strapi handles updates to relations by ID/array of IDs)
          populate: [
            "image",
            "category",
            "lens_types",
            "lens_coatings",
            "frame_weights",
            "brands",
            "frame_materials",
            "frame_shapes",
            "lens_thicknesses",
            "frame_sizes",
            "wishlistedByUsers"
          ],
        }
      );

      // Sanitize the output
      const sanitizedProduct = await strapiUtils.sanitize.contentAPI.output(updatedProduct, strapi.contentType('api::product.product'));

      return ctx.send({
        success: true,
        message: "Product updated successfully.",
        data: sanitizedProduct,
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
   * Delete an existing product.
   * DELETE /api/products/:id
   */
  async delete(ctx) {
    try {
      const { id } = ctx.params; // Product ID from URL parameters

      // Check if the product exists
      const existingProduct = await strapi.entityService.findOne(
        "api::product.product",
        id
      );

      if (!existingProduct) {
        throw new NotFoundError("Product not found.");
      }

      // Strapi's entityService.delete for many-to-many relations like 'wishlistedByUsers'
      // will automatically handle disconnecting the product from users' wishlists.
      // For oneToMany relations like brands, lens_types, etc., deleting the product
      // will NOT automatically delete the related brand/lens_type entries.
      // It will simply remove the link from the product to those entities.

      const deletedProduct = await strapi.entityService.delete(
        "api::product.product",
        id
      );

      return ctx.send({
        success: true,
        message: "Product deleted successfully.",
        data: {
          id: deletedProduct.id,
          name: deletedProduct.name, // Return some identifying info about the deleted product
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

//MARK:ADD WHISHLIST
  async addToWishlist(ctx) {
    try {
      const { id: userId } = ctx.state.user;
      const { productId } = ctx.params; // Product ID from URL parameters

      const product = await strapi.entityService.findOne(
        "api::product.product",
        productId,
        { populate: ["wishlistedByUsers"] } // Populate to check existing users
      );

      if (!product) {
        throw new NotFoundError("Product not found.");
      }

      // Check if user has already wishlisted this product
      const isAlreadyWishlisted = product.wishlistedByUsers.some(
        (user) => user.id === userId
      );

      if (isAlreadyWishlisted) {
        return ctx.send({
          success: true,
          message: "Product is already in your wishlist.",
          data: {
            product_id: productId,
            user_id: userId,
          },
        });
      }

      // Add the user to the product's 'wishlistedByUsers' relation
      const updatedProduct = await strapi.entityService.update(
        "api::product.product",
        productId,
        {
          data: {
            wishlistedByUsers: [
              ...product.wishlistedByUsers.map((u) => u.id),
              userId,
            ],
          },
          populate: ["wishlistedByUsers"], // Populate updated relation for response
        }
      );

      return ctx.send({
        success: true,
        message: "Product added to wishlist.",
        data: {
          product_id: updatedProduct.id,
          wishlisted_by_user_ids: updatedProduct.wishlistedByUsers.map(
            (u) => u.id
          ),
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

  // 2. Remove Product from Wishlist Method
  // DELETE /api/products/:productId/wishlist
  async removeFromWishlist(ctx) {
    try {
      const { id: userId } = ctx.state.user;
      const { productId } = ctx.params; // Product ID from URL parameters

      const product = await strapi.entityService.findOne(
        "api::product.product",
        productId,
        { populate: ["wishlistedByUsers"] } // Populate to check existing users
      );

      if (!product) {
        throw new NotFoundError("Product not found.");
      }

      // Check if user has actually wishlisted this product
      const isWishlisted = product.wishlistedByUsers.some(
        (user) => user.id === userId
      );

      if (!isWishlisted) {
        return ctx.send({
          success: true,
          message: "Product is not in your wishlist.",
          data: {
            product_id: productId,
            user_id: userId,
          },
        });
      }

      // Remove the user from the product's 'wishlistedByUsers' relation
      const updatedProduct = await strapi.entityService.update(
        "api::product.product",
        productId,
        {
          data: {
            // Filter out the current user's ID from the relation
            wishlistedByUsers: product.wishlistedByUsers
              .filter((u) => u.id !== userId)
              .map((u) => u.id),
          },
          populate: ["wishlistedByUsers"], // Populate updated relation for response
        }
      );

      return ctx.send({
        success: true,
        message: "Product removed from wishlist.",
        data: {
          product_id: updatedProduct.id,
          wishlisted_by_user_ids: updatedProduct.wishlistedByUsers.map(
            (u) => u.id
          ),
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

  // 3. Get User's Wishlist (all products wishlisted by the current user)
  // GET /api/products/my-wishlist
  async getMyWishlist(ctx) {
    try {
      const { id: userId } = ctx.state.user;

      const wishlistedProducts = await strapi.entityService.findMany(
        "api::product.product",
        {
          filters: {
            // Filter products where 'wishlistedByUsers' relation contains the current user's ID
            wishlistedByUsers: userId,
          },
          populate: {
            image: {
              fields: ["url", "name", "alternativeText"],
            },
            category: {
              // Populate category if needed
              fields: ["name"],
            },
          },
          // You can't easily sort by "added date" with this model, as there's no specific timestamp on the join table.
          // Sorting here would be by product fields like name, price, or creation date of the product.
          sort: [{ createdAt: "desc" }], // Example: sort by product creation date
        }
      );

      if (!wishlistedProducts || wishlistedProducts.length === 0) {
        return ctx.send({
          success: true,
          message: "Your wishlist is empty.",
          data: {
            products: [],
            total_items_in_wishlist: 0,
          },
        });
      }

      return ctx.send({
        success: true,
        message: "Wishlist retrieved successfully.",
        data: {
          products: wishlistedProducts,
          total_items_in_wishlist: wishlistedProducts.length,
          user_id: userId,
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

  // 4. Clear User's Entire Wishlist (remove all products from their wishlist)
  // DELETE /api/products/my-wishlist/clear
  async clearMyWishlist(ctx) {
    try {
      const { id: userId } = ctx.state.user;

      // Find all products currently wishlisted by the user
      const productsToClear = await strapi.entityService.findMany(
        "api::product.product",
        {
          filters: {
            wishlistedByUsers: userId,
          },
          populate: ["wishlistedByUsers"], // Need to populate to update the relation
        }
      );

      if (!productsToClear || productsToClear.length === 0) {
        return ctx.send({
          success: true,
          message: "Your wishlist is already empty.",
          data: null,
        });
      }

      // For each product, remove the current user from its wishlistedByUsers relation
      for (const product of productsToClear) {
        await strapi.entityService.update("api::product.product", product.id, {
          data: {
            wishlistedByUsers: product.wishlistedByUsers
              .filter((u) => u.id !== userId)
              .map((u) => u.id),
          },
        });
      }

      return ctx.send({
        success: true,
        message: "Your wishlist has been cleared.",
        data: null,
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
