"use strict";

/**
 * cart controller
 */

const { createCoreController } = require("@strapi/strapi").factories;
const strapiUtils = require("@strapi/utils"); // Import strapiUtils to access ValidationError
const { ValidationError, NotFoundError } = strapiUtils.errors; // Destructure specific errors

// ===========================================================================
// Helper Functions:
// It's highly recommended to move these into a shared utility file (e.g., `utils/helpers.js` or `utils/errors.js`).
// For this update, they are kept inline as per your provided context.
// ===========================================================================
const handleErrors = (error) => {
  console.error("Error occurred:", error);
  const errorMessage = String(error.message || '');

  if (error instanceof ValidationError) {
    return { message: errorMessage };
  }
  if (error instanceof NotFoundError) {
    return { message: errorMessage };
  }
  // Catch custom messages for consistency
  if (errorMessage.includes("out of stock or insufficient quantity")) {
    return { message: errorMessage };
  }
  if (errorMessage.includes("Product not found in cart for this user.")) {
    return { message: errorMessage };
  }
  if (errorMessage.includes("Cart is already empty for this user.")) {
    return { message: errorMessage };
  }
  if (errorMessage.includes("User does not have a cart yet.")) {
    return { message: errorMessage };
  }
  return { message: "An unexpected error occurred." };
};

const handleStatusCode = (error) => {
  if (error instanceof ValidationError) return 400;
  if (error instanceof NotFoundError) return 404;
  // Custom error messages might map to 400 Bad Request
  if (String(error.message || '').includes("out of stock or insufficient quantity")) {
    return 400;
  }
  if (String(error.message || '').includes("Product not found in cart for this user.")) {
    return 404;
  }
  if (String(error.message || '').includes("Cart is already empty for this user.")) {
    return 200; // Informational success, no action needed
  }
  if (String(error.message || '').includes("User does not have a cart yet.")) {
    return 200; // Informational success, no cart to show
  }
  return 500;
};

// NotFoundError is already defined above, no need to redefine
const validateBodyRequiredFields = (body, fields) => {
  const missingFields = fields.filter(field => !body[field]);
  if (missingFields.length > 0) {
    throw new ValidationError(`Missing required fields: ${missingFields.join(', ')}`);
  }
};
// --- END Helper functions ---

module.exports = createCoreController("api::cart.cart", ({ strapi }) => ({
  // 1. Get User's Cart Method
  async getMyCart(ctx) {
    try {
      const { id: userId } = ctx.state.user; // Get authenticated user ID

      const cart = await strapi.entityService.findMany(
        "api::cart.cart", // Your Cart UID
        {
          filters: {
            user: userId, // Filter by the current user's ID
          },
          populate: {
            product: {
              // Populate the many-to-many products
              fields: ["id", "name", "price", "stock", "inStock", "offers", "offerPrice", "rating", "reviewCount"], // Include new fields
              populate: {
                image: {
                  // Assuming 'image' is your media field on the Product content type
                  fields: ["url", "name", "alternativeText"], // Fields you want from the media file
                },
              },
            },
            user: {
              // Populate user details if needed for response consistency
              fields: ["id", "email", "phone", "name"],
            },
          },
        }
      );

      if (!cart || cart.length === 0) { // Check if cart is empty, not just if it exists
        return ctx.send({
          success: true,
          message: "User does not have a cart yet or cart is empty.",
          data: {
            cart_items: [], // Return an empty array for consistency
            total_items: 0
          },
        });
      }

      // If cart entries are found, structure the response
      return ctx.send({
        success: true,
        message: "Cart retrieved successfully",
        data: {
          cart_items: cart, // Renamed to cart_items for clarity when it's an array
          total_items: cart.length // Count of distinct products in cart
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

  // 2. Add Product to Cart Method
  async addProductToCart(ctx) {
    try {
      const { id: userId } = ctx.state.user;
      // Safely access request body
      const requestBody = ctx.request.body || {}; // Ensure requestBody is an object even if ctx.request.body is null/undefined
      const { productId, quantity } = requestBody.data || requestBody; // Safely destructure from data or direct body

      validateBodyRequiredFields(requestBody.data || requestBody, ["productId", "quantity"]); // Quantity is now required

      if (quantity <= 0) {
        throw new ValidationError("Quantity must be a positive number.");
      }

      const product = await strapi.entityService.findOne(
        "api::product.product", // Your Product UID
        productId,
        { fields: ["name", "price", "stock", "inStock"] } // Fetch stock and inStock for validation
      );

      if (!product) {
        throw new NotFoundError("Product not found.");
      }

      // --- NEW STOCK VALIDATION ---
      // Get current quantity of this product in the user's cart
      let currentCartEntry = await strapi.entityService.findMany(
        "api::cart.cart",
        { filters: { user: userId, product: productId }, limit: 1 }
      );
      const currentQuantityInCart = currentCartEntry.length > 0 ? currentCartEntry[0].quantity : 0;
      const totalRequestedQuantity = currentQuantityInCart + quantity;

      if (product.inStock === false || product.stock === undefined || product.stock < totalRequestedQuantity) {
        // Use template literal for clean message, no extra backslashes needed
        throw new ValidationError(`Product ${product.name} is out of stock or insufficient quantity (Available: ${product.stock !== undefined ? product.stock : 'N/A'}, Requested: ${totalRequestedQuantity}).`);
      }
      // --- END NEW STOCK VALIDATION ---

      let updatedCartEntry;
      let message = "";

      // If user doesn't have this product in their cart, create a new entry
      if (currentCartEntry.length === 0) { // Check length of array
        updatedCartEntry = await strapi.entityService.create(
          "api::cart.cart", // Your Cart UID
          {
            data: {
              user: userId,
              product: productId,
              quantity: quantity,
            },
          }
        );
        message = "Product added to cart.";
      } else {
        // If product already in cart, update quantity
        updatedCartEntry = await strapi.entityService.update(
          "api::cart.cart", // Your Cart UID
          currentCartEntry[0].id, // Use the ID of the existing cart entry
          {
            data: {
              quantity: totalRequestedQuantity, // Set to the new total quantity
            },
          }
        );
        message = "Product quantity updated in cart.";
      }

      return ctx.send({
        success: true,
        message: message,
        data: {
          id: updatedCartEntry.id,
          product_id: productId, // Include product_id for context
          quantity: updatedCartEntry.quantity,
          createdAt: updatedCartEntry.createdAt,
          updatedAt: updatedCartEntry.updatedAt,
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

  // 3. Remove Product from Cart Method (UPDATED)
  async removeProductFromCart(ctx) {
    try {
      const { id: userId } = ctx.state.user;
      const { productId } = ctx.params; // Product ID from URL parameters
      // Safely access request body for optional decrement flag
      const requestBody = ctx.request.body || {}; // Ensure requestBody is an object even if ctx.request.body is null/undefined
      const { decrement = false } = requestBody.data || requestBody; // Safely destructure from data or direct body

      // Find the specific cart entry for this user and product
      let [cartEntry] = await strapi.entityService.findMany(
        "api::cart.cart", // Your Cart UID (acting as CartItem)
        { filters: { user: userId, product: productId } }
      );

      if (!cartEntry) {
        throw new NotFoundError("Product not found in cart for this user.");
      }

      let message = "";
      let responseData = null; // Default response if item is fully removed

      // Handle decrementing quantity or full removal
      if (decrement && cartEntry.quantity > 1) {
        // Decrement quantity by 1
        const updatedEntry = await strapi.entityService.update(
          "api::cart.cart",
          cartEntry.id,
          {
            data: {
              quantity: cartEntry.quantity - 1,
            },
            // Populate to return the updated entry details consistent with addProductToCart's return
            populate: {
                product: {
                    fields: ["id", "name", "price"],
                    populate: {
                        image: { fields: ["url", "name", "alternativeText"] },
                    },
                },
            }
          }
        );
        message = "Product quantity decreased in cart.";
        responseData = { // Mimicking addProductToCart's response structure
            id: updatedEntry.id,
            product_id: updatedEntry.product.id, // Include product_id
            quantity: updatedEntry.quantity,
            createdAt: updatedEntry.createdAt,
            updatedAt: updatedEntry.updatedAt,
            // Include product details if the client might need them on decrement
            product_name: updatedEntry.product.name // Simplified product name
        };
      } else {
        // Remove the entire cart entry (if decrement is false or quantity is 1)
        await strapi.entityService.delete(
          "api::cart.cart",
          cartEntry.id
        );
        message = "Product removed from cart.";
        responseData = { // Indicate which product was removed
            product_id: productId,
            user_id: userId,
            message: "Product fully removed from cart."
        };
      }

      // The response structure matches addProductToCart (details of the affected item, or null if removed)
      return ctx.send({
        success: true,
        message: message,
        data: responseData,
      });

    } catch (error) {
      const customizedError = handleErrors(error);
      return ctx.send(
        { success: false, message: customizedError.message },
        handleStatusCode(error) || 500
      );
    }
  },

  // 4. Clear Cart Method (UPDATED)
  async clearCart(ctx) {
    try {
      const { id: userId } = ctx.state.user;

      // Find all cart entries for the user
      const cartEntries = await strapi.entityService.findMany(
        "api::cart.cart", // Your Cart UID (acting as CartItem)
        { filters: { user: userId } }
      );

      if (!cartEntries || cartEntries.length === 0) {
        return ctx.send({
          success: true,
          message: "Cart is already empty for this user.",
          data: {
            user_id: userId,
            message: "No items to clear."
          },
        });
      }

      // Delete all found cart entries for the user
      for (const entry of cartEntries) {
        await strapi.entityService.delete("api::cart.cart", entry.id);
      }

      return ctx.send({
        success: true,
        message: "Cart cleared successfully.",
        data: {
            user_id: userId,
            message: "All items removed from cart."
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
