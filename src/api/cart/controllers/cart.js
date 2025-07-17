'use strict';

/**
 * cart controller
 */

const { createCoreController } = require('@strapi/strapi').factories;

// ===========================================================================
// Helper Functions:
// You need to ensure these helper functions (handleErrors, handleStatusCode,
// NotFoundError, validateBodyRequiredFields) are accessible here.
// They are likely defined in a common utilities file in your Strapi project.
// Replace these placeholders with your actual import paths.
// Example:
// const { handleErrors, handleStatusCode } = require('../../../utils/errors');
// const { NotFoundError } = require('@strapi/utils').errors; // Strapi's built-in error class
// const { validateBodyRequiredFields } = require('../../../utils/validation');
// ===========================================================================

// --- Placeholder for your helper functions (REPLACE WITH REAL IMPORTS) ---
const handleErrors = (error) => {
  console.error("Error occurred:", error);
  // Simple error handling for demonstration. Adjust as per your project's error utility.
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
  if (error.message && error.message.includes("Missing required field")) return 400;
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
    if (body[field] === undefined || body[field] === null || body[field] === '') {
      throw new Error(`Missing required field: ${field}`);
    }
  }
};
// --- END Placeholder for helper functions ---


module.exports = createCoreController('api::cart.cart', ({ strapi }) => ({

  // 1. Get User's Cart Method
  async getMyCart(ctx) {
    try {
      const { id: userId } = ctx.state.user; // Get authenticated user ID

      const [cart] = await strapi.entityService.findMany(
        'api::cart.cart', // Your Cart UID
        {
          filters: {
            user: userId // Filter by the current user's ID
          },
          populate: {
            products: { // Populate the many-to-many products
              fields: ['id', 'name', 'price'], // Only direct fields from 'products' table
              populate: {
                image: { // Assuming 'image' is your media field on the Product content type
                  fields: ['url', 'name', 'alternativeText'] // Fields you want from the media file
                }
              }
            },
            user: { // Populate user details if needed for response consistency
              fields: ['id', 'email', 'phone', 'name']
            }
          }
        }
      );

      if (!cart) {
        return ctx.send({
          success: true,
          message: "User does not have a cart yet.",
          data: null
        });
      }

      // **IMPORTANT LIMITATION NOTE:**
      // With your current schema, the 'quantity' field on the Cart model
      // cannot represent individual product quantities. It would only represent
      // a total quantity for the entire cart or similar.
      // If you need per-product quantity, you MUST use a 'Cart Item'
      // intermediary table as discussed previously.
      // For now, 'quantity' in this response will just be the single value from the cart.

      return ctx.send({
        success: true,
        message: "Cart retrieved successfully",
        data: {
          id: cart.id,
          user: {
            id: cart.user.id,
            name: cart.user.name,
            email: cart.user.email,
            phone: cart.user.phone
          },
          products: cart.products.map(p => ({
            id: p.id,
            name: p.name,
            price: p.price,
            image: p.image // Will be full media object if populated, or just ID if not
          })),
          // This 'quantity' field is problematic for many-to-many products.
          // It would only reflect the single quantity field from the cart itself.
          quantity: cart.quantity || 0, // Reflects the single 'quantity' field on Cart
          createdAt: cart.createdAt,
          updatedAt: cart.updatedAt
        }
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
      const { productId } = ctx.request.body;

      validateBodyRequiredFields(ctx.request.body, ["productId"]);

      const product = await strapi.entityService.findOne(
        'api::product.product', // Your Product UID
        productId
      );

      if (!product) {
        throw new NotFoundError("Product not found.");
      }

      let [cart] = await strapi.entityService.findMany(
        'api::cart.cart', // Your Cart UID
        { filters: { user: userId } }
      );

      // If user doesn't have a cart, create one
      if (!cart) {
        cart = await strapi.entityService.create(
          'api::cart.cart', // Your Cart UID
          { data: { user: userId } }
        );
      }

      // Connect the product to the cart
      // This will add the product to the 'products' array on the cart.
      // It DOES NOT handle quantity per product with your schema.
      const updatedCart = await strapi.entityService.update(
        'api::cart.cart', // Your Cart UID
        cart.id,
        {
          data: {
            products: {
              connect: [
                { id: productId }
              ]
            }
            // You might manually increment the single 'quantity' field on the Cart
            // if it's meant to be the count of distinct products or total items.
            // e.g., quantity: (cart.quantity || 0) + 1
            // But this would be misleading if you intend per-product quantity.
          },
          populate: {
            products: { // Populate the many-to-many products
              fields: ['id', 'name', 'price'], // Only direct fields from 'products' table
              populate: {
                image: { // Assuming 'image' is your media field on the Product content type
                  fields: ['url', 'name', 'alternativeText'] // Fields you want from the media file
                }
              }
            },
            user: { fields: ['id', 'email', 'phone', 'name'] }
          }
        }
      );

      return ctx.send({
        success: true,
        message: "Product added to cart.",
        data: {
          id: updatedCart.id,
          user: {
            id: updatedCart.user.id,
            name: updatedCart.user.name,
            email: updatedCart.user.email,
            phone: updatedCart.user.phone
          },
          products: updatedCart.products.map(p => ({
            id: p.id,
            name: p.name,
            price: p.price,
            image: p.image
          })),
          quantity: updatedCart.quantity || 0,
          createdAt: updatedCart.createdAt,
          updatedAt: updatedCart.updatedAt
        }
      });

    } catch (error) {
      const customizedError = handleErrors(error);
      return ctx.send(
        { success: false, message: customizedError.message },
        handleStatusCode(error) || 500
      );
    }
  },

  // 3. Remove Product from Cart Method
  async removeProductFromCart(ctx) {
    try {
      const { id: userId } = ctx.state.user;
      const { productId } = ctx.params; // Product ID from URL parameters

      let [cart] = await strapi.entityService.findMany(
        'api::cart.cart', // Your Cart UID
        { filters: { user: userId }, populate: { products: true } }
      );

      if (!cart) {
        throw new NotFoundError("Cart not found for this user.");
      }

      // Check if product exists in cart
      const productExistsInCart = cart.products.some(p => p.id == productId); // Use == for loose comparison if IDs can be string/number
      if (!productExistsInCart) {
        throw new NotFoundError("Product not found in cart.");
      }

      // Disconnect the product from the cart
      const updatedCart = await strapi.entityService.update(
        'api::cart.cart', // Your Cart UID
        cart.id,
        {
          data: {
            products: {
              disconnect: [
                { id: productId }
              ]
            }
            // You might decrement the single 'quantity' field on the Cart here
            // if it's meant to be the count of distinct products or total items.
            // e.g., quantity: Math.max(0, (cart.quantity || 0) - 1)
          },
          populate: {
            products: { // Populate the many-to-many products
              fields: ['id', 'name', 'price'], // Only direct fields from 'products' table
              populate: {
                image: { // Assuming 'image' is your media field on the Product content type
                  fields: ['url', 'name', 'alternativeText'] // Fields you want from the media file
                }
              }
            },
            user: { fields: ['id', 'email', 'phone', 'name'] }
          }
        }
      );

      return ctx.send({
        success: true,
        message: "Product removed from cart.",
        data: {
          id: updatedCart.id,
          user: {
            id: updatedCart.user.id,
            name: updatedCart.user.name,
            email: updatedCart.user.email,
            phone: updatedCart.user.phone
          },
          products: updatedCart.products.map(p => ({
            id: p.id,
            name: p.name,
            price: p.price,
            image: p.image
          })),
          quantity: updatedCart.quantity || 0,
          createdAt: updatedCart.createdAt,
          updatedAt: updatedCart.updatedAt
        }
      });

    } catch (error) {
      const customizedError = handleErrors(error);
      return ctx.send(
        { success: false, message: customizedError.message },
        handleStatusCode(error) || 500
      );
    }
  },

  // 4. Clear Cart Method
  async clearCart(ctx) {
    try {
      const { id: userId } = ctx.state.user;

      let [cart] = await strapi.entityService.findMany(
        'api::cart.cart', // Your Cart UID
        { filters: { user: userId }, populate: { products: true } }
      );

      if (!cart) {
        throw new NotFoundError("Cart not found for this user.");
      }

      // Get all product IDs currently in the cart to disconnect them
      const productIdsToDisconnect = cart.products.map(p => ({ id: p.id }));

      // Disconnect all products from the cart
      const updatedCart = await strapi.entityService.update(
        'api::cart.cart', // Your Cart UID
        cart.id,
        {
          data: {
            products: {
              disconnect: productIdsToDisconnect
            },
            // Reset the single 'quantity' field on the Cart if it's used for total
            quantity: 0
          },
          populate: {
            products: { // Populate the many-to-many products
              fields: ['id', 'name', 'price'], // Only direct fields from 'products' table
              populate: {
                image: { // Assuming 'image' is your media field on the Product content type
                  fields: ['url', 'name', 'alternativeText'] // Fields you want from the media file
                }
              }
            },
            user: { fields: ['id', 'email', 'phone', 'name'] }
          }
        }
      );

      return ctx.send({
        success: true,
        message: "Cart cleared successfully.",
        data: {
          id: updatedCart.id,
          user: {
            id: updatedCart.user.id,
            name: updatedCart.user.name,
            email: updatedCart.user.email,
            phone: updatedCart.user.phone
          },
          products: updatedCart.products.map(p => ({
            id: p.id,
            name: p.name,
            price: p.price,
            image: p.image
          })),
          quantity: updatedCart.quantity || 0,
          createdAt: updatedCart.createdAt,
          updatedAt: updatedCart.updatedAt
        }
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