// "use strict";

// /**
//  * cart controller
//  */

// const { createCoreController } = require("@strapi/strapi").factories;

// // ===========================================================================
// // Helper Functions: (Ensure these are correctly imported/defined in your project)
// // ===========================================================================
// const handleErrors = (error) => {
//   console.error("Error occurred:", error);
//   if (error.name === "NotFoundError") {
//     return { message: error.message };
//   }
//   if (error.message && error.message.includes("Missing required field")) {
//     return { message: error.message };
//   }
//   return { message: "An unexpected error occurred." };
// };

// const handleStatusCode = (error) => {
//   if (error.name === "NotFoundError") return 404;
//   if (error.message && error.message.includes("Missing required field"))
//     return 400;
//   return 500;
// };

// class NotFoundError extends Error {
//   constructor(message = "Not Found") {
//     super(message);
//     this.name = "NotFoundError";
//   }
// }

// const validateBodyRequiredFields = (body, fields) => {
//   for (const field of fields) {
//     if (
//       body[field] === undefined ||
//       body[field] === null ||
//       body[field] === ""
//     ) {
//       throw new Error(`Missing required field: ${field}`);
//     }
//   }
// };
// // --- END Placeholder for helper functions ---

// module.exports = createCoreController("api::cart.cart", ({ strapi }) => ({
//   // 1. Get User's Cart Method
//   async getMyCart(ctx) {
//     try {
//       const { id: userId } = ctx.state.user;

//       // Populate both 'products' (for product details) and 'user'
//       const [cart] = await strapi.entityService.findMany("api::cart.cart", {
//         filters: { user: userId },
//         populate: {
//           products: {
//             // This populates distinct product details
//             fields: ["id", "name", "price"],
//             populate: {
//               image: { fields: ["url", "name", "alternativeText"] },
//             },
//           },
//           user: { fields: ["id", "email", "phone", "name"] },
//         },
//       });

//       if (!cart) {
//         return ctx.send({
//           success: true,
//           message: "User does not have a cart yet.",
//           data: null,
//         });
//       }

//       // Merge product details with quantities from the 'items' JSON field
//       const productsWithQuantities = cart.products
//         .map((product) => {
//           const itemData = (cart.items || []).find(
//             (item) => item.productId === product.id
//           );
//           return {
//             id: product.id,
//             name: product.name,
//             price: product.price,
//             image: product.image,
//             quantity: itemData ? itemData.quantity : 0, // Get quantity from JSON field
//           };
//         })
//         .filter((item) => item.quantity > 0); // Filter out products that might be in 'products' relation but not in 'items' JSON (shouldn't happen with correct logic)

//       const totalItemsInCart = productsWithQuantities.reduce(
//         (sum, item) => sum + item.quantity,
//         0
//       );

//       return ctx.send({
//         success: true,
//         message: "Cart retrieved successfully",
//         data: {
//           id: cart.id,
//           user: {
//             id: cart.user.id,
//             name: cart.user.name,
//             email: cart.user.email,
//             phone: cart.user.phone,
//           },
//           products: productsWithQuantities, // Products with their quantities
//           total_items_in_cart: totalItemsInCart, // Total count of all individual items
//           createdAt: cart.createdAt,
//           updatedAt: cart.updatedAt,
//         },
//       });
//     } catch (error) {
//       const customizedError = handleErrors(error);
//       return ctx.send(
//         { success: false, message: customizedError.message },
//         handleStatusCode(error) || 500
//       );
//     }
//   },

//   // 2. Add Product to Cart Method
//   async addProductToCart(ctx) {
//     try {
//       const { id: userId } = ctx.state.user;
//       const { productId, quantity = 1 } = ctx.request.body; // Default quantity to 1

//       validateBodyRequiredFields(ctx.request.body, ["productId"]);

//       const product = await strapi.entityService.findOne(
//         "api::product.product",
//         productId
//       );

//       if (!product) {
//         throw new NotFoundError("Product not found.");
//       }

//       let [cart] = await strapi.entityService.findMany(
//         "api::cart.cart",
//         { filters: { user: userId }, populate: { products: true } } // Populate products to manage M2M relation
//       );

//       // If user doesn't have a cart, create one
//       if (!cart) {
//         cart = await strapi.entityService.create(
//           "api::cart.cart",
//           { data: { user: userId, items: [] } } // Initialize items as an empty array
//         );
//       }

//       // Logic to update the 'items' JSON field
//       let cartItems = Array.isArray(cart.items) ? [...cart.items] : []; // Ensure it's an array

//       const existingItemIndex = cartItems.findIndex(
//         (item) => item.productId === productId
//       );

//       if (existingItemIndex !== -1) {
//         // Product already in cart, update its quantity
//         cartItems[existingItemIndex].quantity += quantity;
//       } else {
//         // Product not in cart, add new entry
//         cartItems.push({ productId, quantity });
//       }

//       // Also ensure the many-to-many relation is connected for proper population
//       const productsToConnect = [{ id: productId }]; // Only connect if not already
//       const productsToDisconnect = []; // No disconnect on add

//       const updatedCart = await strapi.entityService.update(
//         "api::cart.cart",
//         cart.id,
//         {
//           data: {
//             items: cartItems, // Update the JSON field
//             products: {
//               // Update the many-to-many relation
//               connect: productsToConnect,
//             },
//           },
//           populate: {
//             // Populate to return the updated cart with products
//             products: {
//               fields: ["id", "name", "price"],
//               populate: {
//                 image: { fields: ["url", "name", "alternativeText"] },
//               },
//             },
//             user: { fields: ["id", "email", "phone", "name"] },
//           },
//         }
//       );

//       // Re-map products with quantities for response
//       const productsWithQuantities = updatedCart.products
//         .map((p) => {
//           const itemData = (updatedCart.items || []).find(
//             (item) => item.productId === p.id
//           );
//           return {
//             id: p.id,
//             name: p.name,
//             price: p.price,
//             image: p.image,
//             quantity: itemData ? itemData.quantity : 0,
//           };
//         })
//         .filter((item) => item.quantity > 0);

//       const totalItemsInCart = productsWithQuantities.reduce(
//         (sum, item) => sum + item.quantity,
//         0
//       );

//       return ctx.send({
//         success: true,
//         message: "Product added to cart.",
//         data: {
//           id: updatedCart.id,
//           user: {
//             id: updatedCart.user.id,
//             name: updatedCart.user.name,
//             email: updatedCart.user.email,
//             phone: updatedCart.user.phone,
//           },
//           products: productsWithQuantities,
//           total_items_in_cart: totalItemsInCart,
//           createdAt: updatedCart.createdAt,
//           updatedAt: updatedCart.updatedAt,
//         },
//       });
//     } catch (error) {
//       const customizedError = handleErrors(error);
//       return ctx.send(
//         { success: false, message: customizedError.message },
//         handleStatusCode(error) || 500
//       );
//     }
//   },

//   // 3. Remove Product from Cart Method
//   async removeProductFromCart(ctx) {
//     try {
//       const { id: userId } = ctx.state.user;
//       const { productId } = ctx.params; // Product ID from URL parameters
//       const { decrement = false } = ctx.request.body || {}; // <--- FIX IS HERE

//       let [cart] = await strapi.entityService.findMany("api::cart.cart", {
//         filters: { user: userId },
//         populate: { products: true },
//       });

//       if (!cart) {
//         throw new NotFoundError("Cart not found for this user.");
//       }

//       let cartItems = Array.isArray(cart.items) ? [...cart.items] : [];
//       const existingItemIndex = cartItems.findIndex(
//         (item) => item.productId === parseInt(productId)
//       );

//       if (existingItemIndex === -1) {
//         throw new NotFoundError("Product not found in cart.");
//       }

//       let productsToDisconnect = [];

//       if (decrement && cartItems[existingItemIndex].quantity > 1) {
//         // Decrement quantity by 1
//         cartItems[existingItemIndex].quantity -= 1;
//       } else {
//         // Remove item entirely
//         cartItems.splice(existingItemIndex, 1);
//         productsToDisconnect.push({ id: productId }); // Disconnect from M2M if fully removed
//       }

//       const updatedCart = await strapi.entityService.update(
//         "api::cart.cart",
//         cart.id,
//         {
//           data: {
//             items: cartItems,
//             products: {
//               disconnect: productsToDisconnect,
//             },
//           },
//           populate: {
//             products: {
//               fields: ["id", "name", "price"],
//               populate: {
//                 image: { fields: ["url", "name", "alternativeText"] },
//               },
//             },
//             user: { fields: ["id", "email", "phone", "name"] },
//           },
//         }
//       );

//       // Re-map products with quantities for response
//       const productsWithQuantities = updatedCart.products
//         .map((p) => {
//           const itemData = (updatedCart.items || []).find(
//             (item) => item.productId === p.id
//           );
//           return {
//             id: p.id,
//             name: p.name,
//             price: p.price,
//             image: p.image,
//             quantity: itemData ? itemData.quantity : 0,
//           };
//         })
//         .filter((item) => item.quantity > 0);

//       const totalItemsInCart = productsWithQuantities.reduce(
//         (sum, item) => sum + item.quantity,
//         0
//       );

//       return ctx.send({
//         success: true,
//         message:
//           decrement &&
//           cartItems[existingItemIndex] &&
//           cartItems[existingItemIndex].quantity >= 1
//             ? "Product quantity decreased in cart."
//             : "Product removed from cart.",
//         data: {
//           id: updatedCart.id,
//           user: {
//             id: updatedCart.user.id,
//             name: updatedCart.user.name,
//             email: updatedCart.user.email,
//             phone: updatedCart.user.phone,
//           },
//           products: productsWithQuantities,
//           total_items_in_cart: totalItemsInCart,
//           createdAt: updatedCart.createdAt,
//           updatedAt: updatedCart.updatedAt,
//         },
//       });
//     } catch (error) {
//       const customizedError = handleErrors(error);
//       return ctx.send(
//         { success: false, message: customizedError.message },
//         handleStatusCode(error) || 500
//       );
//     }
//   },

//   //   // 3. Remove Product from Cart Method
//   //   async removeProductFromCart(ctx) {
//   //     try {
//   //       const { id: userId } = ctx.state.user;
//   //       const { productId } = ctx.params; // Product ID from URL parameters
//   //       const { decrement = false } = ctx.request.body; // Optional: { "decrement": true } to decrease by 1

//   //       let [cart] = await strapi.entityService.findMany(
//   //         'api::cart.cart',
//   //         { filters: { user: userId }, populate: { products: true } } // Populate products to manage M2M relation
//   //       );

//   //       if (!cart) {
//   //         throw new NotFoundError("Cart not found for this user.");
//   //       }

//   //       let cartItems = Array.isArray(cart.items) ? [...cart.items] : [];
//   //       const existingItemIndex = cartItems.findIndex(item => item.productId === parseInt(productId)); // productId from params is string

//   //       if (existingItemIndex === -1) {
//   //         throw new NotFoundError("Product not found in cart.");
//   //       }

//   //       let productsToDisconnect = [];

//   //       if (decrement && cartItems[existingItemIndex].quantity > 1) {
//   //         // Decrement quantity by 1
//   //         cartItems[existingItemIndex].quantity -= 1;
//   //       } else {
//   //         // Remove item entirely
//   //         cartItems.splice(existingItemIndex, 1);
//   //         productsToDisconnect.push({ id: productId }); // Disconnect from M2M if fully removed
//   //       }

//   //       const updatedCart = await strapi.entityService.update(
//   //         'api::cart.cart',
//   //         cart.id,
//   //         {
//   //           data: {
//   //             items: cartItems, // Update the JSON field
//   //             products: {
//   //               disconnect: productsToDisconnect // Disconnect if necessary
//   //             }
//   //           },
//   //           populate: { // Populate to return the updated cart
//   //             products: {
//   //               fields: ['id', 'name', 'price'],
//   //               populate: { image: { fields: ['url', 'name', 'alternativeText'] } }
//   //             },
//   //             user: { fields: ['id', 'email', 'phone', 'name'] }
//   //           }
//   //         }
//   //       );

//   //       // Re-map products with quantities for response
//   //       const productsWithQuantities = updatedCart.products.map(p => {
//   //         const itemData = (updatedCart.items || []).find(item => item.productId === p.id);
//   //         return {
//   //           id: p.id,
//   //           name: p.name,
//   //           price: p.price,
//   //           image: p.image,
//   //           quantity: itemData ? itemData.quantity : 0
//   //         };
//   //       }).filter(item => item.quantity > 0);

//   //       const totalItemsInCart = productsWithQuantities.reduce((sum, item) => sum + item.quantity, 0);

//   //       return ctx.send({
//   //         success: true,
//   //         message: decrement && cartItems[existingItemIndex] && cartItems[existingItemIndex].quantity >= 1 ? "Product quantity decreased in cart." : "Product removed from cart.",
//   //         data: {
//   //           id: updatedCart.id,
//   //           user: {
//   //             id: updatedCart.user.id,
//   //             name: updatedCart.user.name,
//   //             email: updatedCart.user.email,
//   //             phone: updatedCart.user.phone
//   //           },
//   //           products: productsWithQuantities,
//   //           total_items_in_cart: totalItemsInCart,
//   //           createdAt: updatedCart.createdAt,
//   //           updatedAt: updatedCart.updatedAt
//   //         }
//   //       });

//   //     } catch (error) {
//   //       const customizedError = handleErrors(error);
//   //       return ctx.send(
//   //         { success: false, message: customizedError.message },
//   //         handleStatusCode(error) || 500
//   //       );
//   //     }
//   //   },

//   // 4. Clear Cart Method
//   async clearCart(ctx) {
//     try {
//       const { id: userId } = ctx.state.user;

//       let [cart] = await strapi.entityService.findMany(
//         "api::cart.cart",
//         { filters: { user: userId }, populate: { products: true } } // Populate products to get all connected products
//       );

//       if (!cart) {
//         throw new NotFoundError("Cart not found for this user.");
//       }

//       // Get all product IDs currently in the M2M relation to disconnect them
//       const productIdsToDisconnect = cart.products.map((p) => ({ id: p.id }));

//       const updatedCart = await strapi.entityService.update(
//         "api::cart.cart",
//         cart.id,
//         {
//           data: {
//             items: [], // Clear the JSON field
//             products: {
//               disconnect: productIdsToDisconnect, // Disconnect all from M2M
//             },
//           },
//           populate: {
//             // Populate to return the updated cart (now empty)
//             products: {
//               fields: ["id", "name", "price"],
//               populate: {
//                 image: { fields: ["url", "name", "alternativeText"] },
//               },
//             },
//             user: { fields: ["id", "email", "phone", "name"] },
//           },
//         }
//       );

//       return ctx.send({
//         success: true,
//         message: "Cart cleared successfully.",
//         data: {
//           id: updatedCart.id,
//           user: {
//             id: updatedCart.user.id,
//             name: updatedCart.user.name,
//             email: updatedCart.user.email,
//             phone: updatedCart.user.phone,
//           },
//           products: [], // Will be empty
//           total_items_in_cart: 0,
//           createdAt: updatedCart.createdAt,
//           updatedAt: updatedCart.updatedAt,
//         },
//       });
//     } catch (error) {
//       const customizedError = handleErrors(error);
//       return ctx.send(
//         { success: false, message: customizedError.message },
//         handleStatusCode(error) || 500
//       );
//     }
//   },
// }));










"use strict";

/**
 * cart controller
 */

const { createCoreController } = require("@strapi/strapi").factories;

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
              fields: ["id", "name", "price"], // Only direct fields from 'products' table
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

      if (!cart) {
        return ctx.send({
          success: true,
          message: "User does not have a cart yet.",
          data: null,
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
         cart:cart
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
      const { productId, quantity } = ctx.request.body;

      validateBodyRequiredFields(ctx.request.body, ["productId"]);

      const product = await strapi.entityService.findOne(
        "api::product.product", // Your Product UID
        productId
      );

      if (!product) {
        throw new NotFoundError("Product not found.");
      }

      let [cart] = await strapi.entityService.findMany(
        "api::cart.cart", // Your Cart UID
        { filters: { user: userId, product: productId } }
      );

      // If user doesn't have a cart, create one
      if (!cart) {
        cart = await strapi.entityService.create(
          "api::cart.cart", // Your Cart UID
          {
            data: {
              user: userId,
              product: productId,
              quantity: quantity,
            },
          }
        );
      } else {
        cart = await strapi.entityService.update(
          "api::cart.cart", // Your Cart UID
          cart.id,

          {
            data: {
              quantity: quantity,
            },
          }
        );
      }

      return ctx.send({
        success: true,
        message: "Product added to cart.",
        data: {
          id: cart.id,
          quantity: cart.quantity ,
          createdAt: cart.createdAt,
          updatedAt: cart.updatedAt,
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
      // Optional: allow decrementing quantity or full removal.
      // If `decrement` is true and quantity > 1, reduce. Otherwise, remove.
      const { decrement = false } = ctx.request.body || {}; 

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
            quantity: updatedEntry.quantity,
            createdAt: updatedEntry.createdAt,
            updatedAt: updatedEntry.updatedAt,
            // Include product details if the client might need them on decrement
            product: {
                id: updatedEntry.product.id,
                name: updatedEntry.product.name,
                price: updatedEntry.product.price,
                image: updatedEntry.product.image,
            }
        };
      } else {
        // Remove the entire cart entry (if decrement is false or quantity is 1)
        await strapi.entityService.delete(
          "api::cart.cart",
          cartEntry.id
        );
        message = "Product removed from cart.";
        responseData = null; // Item is gone, so no data for it, consistent with getMyCart empty state
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
          data: null, // Consistent with getMyCart's empty state
        });
      }

      // Delete all found cart entries for the user
      // Iterate and delete each entry since Strapi's entityService.delete does not support bulk deletion by filter.
      for (const entry of cartEntries) {
        await strapi.entityService.delete("api::cart.cart", entry.id);
      }

      return ctx.send({
        success: true,
        message: "Cart cleared successfully.",
        data: null, // Consistent with getMyCart's empty state
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
