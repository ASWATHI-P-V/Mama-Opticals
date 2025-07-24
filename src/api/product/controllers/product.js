// src/api/product/controllers/product.js

"use strict";

/**
 * product controller
 */

const { createCoreController } = require("@strapi/strapi").factories;

// ===========================================================================
// Helper Functions: (Make sure these are available, either defined here or imported)
// ===========================================================================
const handleErrors = (error) => {
  console.error("Error occurred:", error);
  if (error.name === "NotFoundError") {
    return { message: error.message };
  }
  if (error.message && error.message.includes("Missing required field")) {
    return { message: error.message };
  }
  return { message: "An unexpected error occurred." };
};

const handleStatusCode = (error) => {
  if (error.name === "NotFoundError") return 404;
  if (error.message && error.message.includes("Missing required field"))
    return 400;
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
  async create(ctx) {
    try {
      // Strapi v4 typically wraps request body in 'data'
      const requestData = ctx.request.body.data || ctx.request.body;
      const { name, description, price, inStock, image, category } =
        requestData;

      // Validate required fields
      validateBodyRequiredFields(requestData, ["name", "price"]);

      // Basic type/value validation
      if (isNaN(price) || price < 0) {
        throw new Error("Price must be a non-negative number.");
      }
      if (
        typeof inStock !== "boolean" &&
        inStock !== undefined &&
        inStock !== null
      ) {
        throw new Error("inStock must be a boolean (true/false).");
      }

      // Optional: Validate if category exists if category ID is provided
      if (category) {
        const categoryEntity = await strapi.entityService.findOne(
          "api::category.category",
          category
        );
        if (!categoryEntity) {
          throw new NotFoundError("Provided category not found.");
        }
      }

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
            // publishedAt: new Date(), // Uncomment this line if you want to publish immediately upon creation
          },
          // Populate relations to get full details in the response
          populate: ["image", "category", "wishlistedByUsers"],
        }
      );

      return ctx.send({
        success: true,
        message: "Product created successfully.",
        data: newProduct,
      });
    } catch (error) {
      const customizedError = handleErrors(error);
      return ctx.send(
        { success: false, message: customizedError.message },
        handleStatusCode(error) || 500
      );
    }
  },

  // --- NEW: Custom Delete Product Method (Overrides default) ---
  // DELETE /api/products/:id
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
      // If you had separate tables like 'CartItem' or 'OrderItem', you might need
      // to consider cascading deletes or specific cleanup logic there.

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

//MARK:FILTER PRODUCTS


  async find(ctx) {
    try {
      const { query } = ctx; // Access query parameters
      let filters = {};
      let sort = [];
      let populate = [
        'image',
        'category',
        'brand', // New population
        'frameMaterial', // New population
        'frameShape', // New population
        'lensType', // New population
        'lensCoating', // New population
        'lensThickness', // New population
        'frameWeight', // New population
        'storeAddress' // New population
      ];

      // --- 1. Search (using '_q' for fuzzy search across specified fields) ---
      if (query._q) {
        // Apply search across 'name', 'description', and new related fields
        filters.$or = [
          { name: { $containsi: query._q } },
          { description: { $containsi: query._q } },
          { color: { $containsi: query._q } }, // Search by color
          { size: { $containsi: query._q } }, // Search by size
          { brand: { name: { $containsi: query._q } } }, // Search by brand name
          { frameMaterial: { name: { $containsi: query._q } } }, // Search by frame material name
          { frameShape: { name: { $containsi: query._q } } }, // Search by frame shape name
          { lensType: { name: { $containsi: query._q } } }, // Search by lens type name
          { lensCoating: { name: { $containsi: query._q } } }, // Search by lens coating name
          { lensThickness: { name: { $containsi: query._q } } }, // Search by lens thickness name
          { frameWeight: { name: { $containsi: query._q } } } // Search by frame weight name
        ];
        delete query._q; // Remove _q from the direct query to prevent conflicts
      }

      // --- 2. Filtering ---

      // Price Range (existing)
      if (query.price_gte) {
        filters.price = { ...filters.price, $gte: parseFloat(query.price_gte) };
        delete query.price_gte;
      }
      if (query.price_lte) {
        filters.price = { ...filters.price, $lte: parseFloat(query.price_lte) };
        delete query.price_lte;
      }

      // Offer Price Range (New)
      if (query.offerPrice_gte) {
        filters.offerPrice = { ...filters.offerPrice, $gte: parseFloat(query.offerPrice_gte) };
        delete query.offerPrice_gte;
      }
      if (query.offerPrice_lte) {
        filters.offerPrice = { ...filters.offerPrice, $lte: parseFloat(query.offerPrice_lte) };
        delete query.offerPrice_lte;
      }

      // Availability (inStock - Boolean field) (existing)
      if (query.inStock !== undefined) {
        filters.inStock = query.inStock === 'true';
        delete query.inStock;
      }

      // Category (by name) (existing)
      if (query.category) {
        filters.category = { name: { $eqi: query.category } };
        delete query.category;
      }

      // Color (Text field on Product) (existing)
      if (query.color) {
        filters.color = { $eqi: query.color }; // Case-insensitive exact match for color
        delete query.color;
      }

      // Brand (by name of the related Brand) (New)
      if (query.brand) {
        filters.brand = { name: { $eqi: query.brand } };
        delete query.brand;
      }

      // Frame Material (by name of the related FrameMaterial) (New)
      if (query.frameMaterial) {
        filters.frameMaterial = { name: { $eqi: query.frameMaterial } };
        delete query.frameMaterial;
      }

      // Frame Shape (by name of the related FrameShape) (New)
      if (query.frameShape) {
        filters.frameShape = { name: { $eqi: query.frameShape } };
        delete query.frameShape;
      }

      // Lens Type (by name of the related LensType) (New)
      if (query.lensType) {
        filters.lensType = { name: { $eqi: query.lensType } };
        delete query.lensType;
      }

      // Lens Coating (by name of the related LensCoating) (New)
      if (query.lensCoating) {
        filters.lensCoating = { name: { $eqi: query.lensCoating } };
        delete query.lensCoating;
      }

      // Lens Thickness (by name of the related LensThickness) (New)
      if (query.lensThickness) {
        filters.lensThickness = { name: { $eqi: query.lensThickness } };
        delete query.lensThickness;
      }

      // Frame Weight (by name of the related FrameWeight) (New)
      if (query.frameWeight) {
        filters.frameWeight = { name: { $eqi: query.frameWeight } };
        delete query.frameWeight;
      }

      // Frame Size (direct string match on 'size' field) (New)
      // This will allow filtering by exact size string, e.g., ?frameSize=52-18-140
      if (query.frameSize) {
        filters.size = { $eqi: query.frameSize };
        delete query.frameSize;
      }

      // Rating (gte) (New)
      if (query.rating_gte) {
        filters.rating = { ...filters.rating, $gte: parseFloat(query.rating_gte) };
        delete query.rating_gte;
      }

      // --- 3. Sorting ---
      if (query._sort) {
        const sortParams = Array.isArray(query._sort) ? query._sort : [query._sort];
        sort = sortParams.map(s => {
          const [field, order] = s.split(':');
          // Handle sorting by relation names if needed, e.g., 'brand.name:asc'
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
          sanitize.contentAPI.output(product, strapi.contentType('api::product.product'))
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








// async find(ctx) {
//         try {
//             const { query } = ctx; // Access query parameters
//             let filters = {};
//             let sort = [];
//             let populate = ['image', 'category']; // Populate image and category relation for filtering

//             // --- 1. Search (using '_q' for fuzzy search across specified fields) ---
//             if (query._q) {
//                 // Apply search across 'name' and 'description' fields
//                 filters.$or = [
//                     { name: { $containsi: query._q } },
//                     { description: { $containsi: query._q } },
//                 ];
//                 delete query._q; // Remove _q from the direct query to prevent conflicts
//             }

//             // --- 2. Filtering ---

//             // Price Range
//             if (query.price_gte) {
//                 filters.price = { ...filters.price, $gte: parseFloat(query.price_gte) };
//                 delete query.price_gte;
//             }
//             if (query.price_lte) {
//                 filters.price = { ...filters.price, $lte: parseFloat(query.price_lte) };
//                 delete query.price_lte;
//             }

//             // Availability (inStock - Boolean field)
//             if (query.inStock !== undefined) {
//                 // Convert string "true" / "false" from URL to boolean
//                 filters.inStock = query.inStock === 'true';
//                 delete query.inStock;
//             }

//             // Category (assuming your Category content type has a 'name' field)
//             if (query.category) {
//                 // Filter by the name of the related category
//                 filters.category = { name: { $eqi: query.category } };
//                 delete query.category;
//             }

//             // Color (Text field on Product)
//             if (query.color) {
//                 // Case-insensitive exact match for color
//                 filters.color = { $eqi: query.color };
//                 delete query.color;
//             }

//             // --- 3. Sorting ---
//             if (query._sort) {
//                 // Example: _sort=price:asc,name:desc
//                 // Supports multiple sort criteria separated by commas
//                 const sortParams = Array.isArray(query._sort) ? query._sort : [query._sort];
//                 sort = sortParams.map(s => {
//                     const [field, order] = s.split(':');
//                     return { [field]: order.toLowerCase() };
//                 });
//                 delete query._sort;
//             } else {
//                 // Default sorting: Newest arrivals (using Strapi's default 'createdAt' field)
//                 sort.push({ createdAt: 'desc' });
//             }

//             // --- 4. Pagination ---
//             // Extract pagination parameters
//             const page = parseInt(query.page || 1);
//             const pageSize = parseInt(query.pageSize || 10);
//             const start = (page - 1) * pageSize; // Calculate offset for pagination
//             const limit = pageSize;

//             // --- Construct final query options for entityService.findMany ---
//             const findOptions = {
//                 filters: filters,
//                 sort: sort,
//                 populate: populate,
//                 start: start, // Offset for pagination
//                 limit: limit, // Limit for pagination
//             };

//             // Fetch products and total count separately for pagination metadata
//             const products = await strapi.entityService.findMany("api::product.product", findOptions);
//             const total = await strapi.entityService.count("api::product.product", { filters: filters });

//             // Return response with data and pagination metadata
//             ctx.body = {
//                 data: products,
//                 meta: {
//                     pagination: {
//                         page: page,
//                         pageSize: limit,
//                         pageCount: Math.ceil(total / limit),
//                         total: total,
//                     },
//                 },
//             };

//         } catch (error) {
//             const customizedError = handleErrors(error); // Using your existing error handler
//             return ctx.send(
//                 { success: false, message: customizedError.message },
//                 handleStatusCode(error) || 500 // Using your existing status code handler
//             );
//         }
//     },




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
