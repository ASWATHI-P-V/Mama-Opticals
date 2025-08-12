"use strict";

const { createCoreController } = require("@strapi/strapi").factories;
const strapiUtils = require("@strapi/utils");
const { ValidationError, NotFoundError } = strapiUtils.errors;

const handleErrors = (error) => {
  console.error("Error occurred:", error);
  const errorMessage = String(error.message || "");

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
  if (errorMessage.includes("product is currently not active")) {
    return { message: errorMessage };
  }
  return { message: "An unexpected error occurred." };
};

const handleStatusCode = (error) => {
  if (error instanceof ValidationError) return 400;
  if (error instanceof NotFoundError) return 404;
  // Custom error messages might map to 400 Bad Request
  if (String(error.message || "").includes("out of stock or insufficient quantity")) {
    return 400;
  }
  if (String(error.message || "").includes("Product not found in cart for this user.")) {
    return 404;
  }
  if (String(error.message || "").includes("product is currently not active")) {
    return 400;
  }
  if (String(error.message || "").includes("Cart is already empty for this user.")) {
    return 200; // Informational success, no action needed
  }
  if (String(error.message || "").includes("User does not have a cart yet.")) {
    return 200; // Informational success, no cart to show
  }
  return 500;
};

const validateBodyRequiredFields = (body, fields) => {
  const missingFields = fields.filter(field => !body[field]);
  if (missingFields.length > 0) {
    throw new ValidationError(`Missing required fields: ${missingFields.join(', ')}`);
  }
};

// Helper function to get master product (base product for all localizations)
const getMasterProduct = async (productId, strapi) => {
  // First, get the product with localizations
  const product = await strapi.entityService.findOne(
    "api::product.product",
    productId,
    {
      fields: ["name", "price", "stock", "inStock", "isActive", "locale"],
      populate: {
        localizations: {
          fields: ["id", "locale", "stock", "inStock", "isActive"]
        }
      }
    }
  );

  if (!product) {
    throw new NotFoundError("Product not found.");
  }

  // If this product has no localizations, it's the master product
  if (!product.localizations || product.localizations.length === 0) {
    return {
      masterProduct: product,
      allVariants: [product],
      totalStock: product.stock || 0
    };
  }

  // Find the master product (usually the default locale)
  let masterProduct = product;
  let allVariants = [product, ...product.localizations];

  // Calculate total stock across all variants
  const totalStock = allVariants.reduce((sum, variant) => {
    return sum + (variant.stock || 0);
  }, 0);

  // Check if any variant is active and in stock
  const hasActiveVariant = allVariants.some(variant => variant.isActive && variant.inStock);

  return {
    masterProduct: {
      ...masterProduct,
      stock: totalStock,
      inStock: hasActiveVariant,
      isActive: hasActiveVariant
    },
    allVariants,
    totalStock
  };
};

// Helper function to get all cart items for the same product (across all locales)
const getAllCartItemsForProduct = async (userId, productId, strapi) => {
  const { allVariants } = await getMasterProduct(productId, strapi);
  const allVariantIds = allVariants.map(variant => variant.id);

  const cartItems = await strapi.entityService.findMany(
    "api::cart.cart",
    {
      filters: {
        user: userId,
        product: { $in: allVariantIds }
      }
    }
  );

  return {
    cartItems,
    totalQuantityInCart: cartItems.reduce((sum, item) => sum + item.quantity, 0)
  };
};

// --- END Helper functions ---

module.exports = createCoreController("api::cart.cart", ({ strapi }) => ({
  //MARK: GetCart
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
              // Populate the product details including new fields
              fields: [
                "id", "name", "price", "stock", "inStock",
                "offers", "offerPrice", "rating", "reviewCount", "isActive", "locale"
              ],
              populate: {
                image: {
                  fields: ["url", "name", "alternativeText"],
                },
                localizations: {
                  fields: ["id", "locale", "stock", "inStock", "isActive"]
                }
              },
            },
            user: {
              fields: ["id", "email", "phone", "name"],
            },
          },
        }
      );

      if (!cart || cart.length === 0) {
        return ctx.send({
          success: true,
          message: "User does not have a cart yet or cart is empty.",
          data: {
            cart_items: [],
            total_items: 0
          },
        });
      }

      // Enhance cart items with combined stock information
      const enhancedCart = await Promise.all(cart.map(async (cartItem) => {
        try {
          const { masterProduct, totalStock } = await getMasterProduct(cartItem.product.id, strapi);
          return {
            ...cartItem,
            product: {
              ...cartItem.product,
              combinedStock: totalStock,
              isCombinedProduct: cartItem.product.localizations && cartItem.product.localizations.length > 0
            }
          };
        } catch (error) {
          console.warn(`Could not enhance cart item ${cartItem.id}:`, error);
          return cartItem;
        }
      }));

      return ctx.send({
        success: true,
        message: "Cart retrieved successfully",
        data: {
          cart_items: enhancedCart,
          total_items: enhancedCart.length
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

  // 2.MARK: Add Product (Now handles decrementing and cross-locale stock management)
  async addProductToCart(ctx) {
    try {
      const { id: userId } = ctx.state.user;
      const { productId, quantity } = ctx.request.body;

      validateBodyRequiredFields(ctx.request.body, ["productId", "quantity"]);

      if (quantity === 0) {
        throw new ValidationError("Quantity cannot be zero.");
      }

      // Get master product and all variants
      const { masterProduct, allVariants, totalStock } = await getMasterProduct(productId, strapi);

      // --- VALIDATION CHECKS WITH COMBINED STOCK ---
      if (!masterProduct.isActive) {
        throw new ValidationError("This product is currently not active and cannot be added to the cart.");
      }
      if (!masterProduct.inStock || totalStock < 1) {
        throw new ValidationError("This product is out of stock.");
      }
      // --- END VALIDATION CHECKS ---

      // Get all existing cart items for this product (across all locales)
      const { cartItems, totalQuantityInCart } = await getAllCartItemsForProduct(userId, productId, strapi);

      // Find the specific cart entry for this exact product ID
      const currentCartEntry = cartItems.find(item => item.product === productId);
      const currentQuantityForThisVariant = currentCartEntry ? currentCartEntry.quantity : 0;

      const newTotalQuantityAcrossAllVariants = totalQuantityInCart + quantity;
      const newQuantityForThisVariant = currentQuantityForThisVariant + quantity;

      // Handle decrement logic
      if (quantity < 0) {
        if (!currentCartEntry) {
          throw new NotFoundError("Product not found in cart for this user to decrement.");
        }
        if (newQuantityForThisVariant < 0) {
          throw new ValidationError("Cannot decrement quantity below zero.");
        }
        // If the new quantity is 0, remove the item
        if (newQuantityForThisVariant === 0) {
          await strapi.entityService.delete("api::cart.cart", currentCartEntry.id);
          return ctx.send({
            success: true,
            message: "Product quantity decreased to zero and removed from cart.",
            data: {
              product_id: productId,
              user_id: userId,
              combined_stock_used: totalQuantityInCart - Math.abs(quantity)
            }
          });
        }
      }
      // Handle increment logic with combined stock check
      else if (newTotalQuantityAcrossAllVariants > totalStock) {
        const availableStock = totalStock - (totalQuantityInCart - currentQuantityForThisVariant);
        throw new ValidationError(
          `Product ${masterProduct.name} has insufficient combined stock. ` +
          `Available: ${availableStock}, Requested: ${quantity}, ` +
          `Total in cart across all variants: ${totalQuantityInCart - currentQuantityForThisVariant}`
        );
      }

      let updatedCartEntry;
      let message = "";

      if (!currentCartEntry) {
        updatedCartEntry = await strapi.entityService.create(
          "api::cart.cart",
          {
            data: {
              user: userId,
              product: productId,
              quantity: quantity,
            },
            populate: {
              product: {
                fields: ["id", "name", "price", "offers", "offerPrice", "rating", "reviewCount", "locale"],
                populate: {
                  image: { fields: ["url"] },
                  localizations: { fields: ["id", "locale"] }
                },
              },
            },
          }
        );
        message = "Product added to cart.";
      } else {
        updatedCartEntry = await strapi.entityService.update(
          "api::cart.cart",
          currentCartEntry.id,
          {
            data: {
              quantity: newQuantityForThisVariant,
            },
            populate: {
              product: {
                fields: ["id", "name", "price", "offers", "offerPrice", "rating", "reviewCount", "locale"],
                populate: {
                  image: { fields: ["url"] },
                  localizations: { fields: ["id", "locale"] }
                },
              },
            },
          }
        );
        message = quantity > 0 ? "Product quantity updated in cart." : "Product quantity decreased in cart.";
      }

      return ctx.send({
        success: true,
        message: message,
        data: {
          id: updatedCartEntry.id,
          product_id: updatedCartEntry.product.id,
          quantity: updatedCartEntry.quantity,
          product_name: updatedCartEntry.product.name,
          product_price: updatedCartEntry.product.price,
          product_offers: updatedCartEntry.product.offers,
          product_offerPrice: updatedCartEntry.product.offerPrice,
          product_rating: updatedCartEntry.product.rating,
          product_reviewCount: updatedCartEntry.product.reviewCount,
          product_image: updatedCartEntry.product.image ? updatedCartEntry.product.image[0] : null,
          product_locale: updatedCartEntry.product.locale,
          combined_stock_available: totalStock,
          total_quantity_in_cart_all_variants: newTotalQuantityAcrossAllVariants,
          is_combined_product: allVariants.length > 1
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

  // 3.MARK: Remove Product From Cart
  async removeProductFromCart(ctx) {
    try {
      const { id: userId } = ctx.state.user;
      if (!userId) {
        throw new ValidationError("User not authenticated.");
      }

      const { productId } = ctx.params;
      const parsedProductId = parseInt(productId, 10);

      if (isNaN(parsedProductId)) {
        throw new ValidationError("Invalid Product ID provided in URL. Must be a number.");
      }

      let [cartEntry] = await strapi.entityService.findMany(
        "api::cart.cart",
        { filters: { user: userId, product: parsedProductId } }
      );

      if (!cartEntry) {
        throw new NotFoundError("Product not found in cart for this user.");
      }

      await strapi.entityService.delete(
        "api::cart.cart",
        cartEntry.id
      );

      return ctx.send({
        success: true,
        message: "Product removed from cart.",
        data: {
          product_id: parsedProductId,
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

  // MARK: Clear entire cart
  async clearCart(ctx) {
    try {
      const { id: userId } = ctx.state.user;

      const cartEntries = await strapi.entityService.findMany(
        "api::cart.cart",
        { filters: { user: userId } }
      );

      if (!cartEntries || cartEntries.length === 0) {
        return ctx.send({
          success: true,
          message: "Cart is already empty for this user.",
          data: { user_id: userId }
        });
      }

      // Delete all cart entries for this user
      await Promise.all(
        cartEntries.map(entry =>
          strapi.entityService.delete("api::cart.cart", entry.id)
        )
      );

      return ctx.send({
        success: true,
        message: "Cart cleared successfully.",
        data: {
          user_id: userId,
          items_removed: cartEntries.length
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

  // MARK: Get cart summary with combined stock info
  async getCartSummary(ctx) {
    try {
      const { id: userId } = ctx.state.user;

      const cart = await strapi.entityService.findMany(
        "api::cart.cart",
        {
          filters: { user: userId },
          populate: {
            product: {
              fields: ["id", "name", "price", "offers", "offerPrice", "locale"],
              populate: {
                localizations: { fields: ["id", "locale"] }
              }
            }
          }
        }
      );

      if (!cart || cart.length === 0) {
        return ctx.send({
          success: true,
          message: "Cart is empty.",
          data: {
            total_items: 0,
            total_unique_products: 0,
            estimated_total: 0,
            items_by_locale: {}
          }
        });
      }

      let totalItems = 0;
      let estimatedTotal = 0;
      const itemsByLocale = {};
      const uniqueProducts = new Set();

      cart.forEach(item => {
        totalItems += item.quantity;
        const effectivePrice = item.product.offers && item.product.offerPrice
          ? item.product.offerPrice
          : item.product.price;
        estimatedTotal += effectivePrice * item.quantity;

        const locale = item.product.locale || 'default';
        if (!itemsByLocale[locale]) {
          itemsByLocale[locale] = [];
        }
        itemsByLocale[locale].push({
          product_id: item.product.id,
          product_name: item.product.name,
          quantity: item.quantity,
          price: effectivePrice
        });

        // Track unique products (considering localizations as same product)
        const productKey = item.product.localizations && item.product.localizations.length > 0
          ? `master_${item.product.id}`
          : item.product.id;
        uniqueProducts.add(productKey);
      });

      return ctx.send({
        success: true,
        message: "Cart summary retrieved successfully.",
        data: {
          total_items: totalItems,
          total_unique_products: uniqueProducts.size,
          estimated_total: estimatedTotal,
          items_by_locale: itemsByLocale
        }
      });

    } catch (error) {
      const customizedError = handleErrors(error);
      return ctx.send(
        { success: false, message: customizedError.message },
        handleStatusCode(error) || 500
      );
    }
  }
}));





// "use strict";

// const { createCoreController } = require("@strapi/strapi").factories;
// const strapiUtils = require("@strapi/utils");
// const { ValidationError, NotFoundError } = strapiUtils.errors;

// const handleErrors = (error) => {
//   console.error("Error occurred:", error);
//   const errorMessage = String(error.message || '');

//   if (error instanceof ValidationError) {
//     return { message: errorMessage };
//   }
//   if (error instanceof NotFoundError) {
//     return { message: errorMessage };
//   }
//   // Catch custom messages for consistency
//   if (errorMessage.includes("out of stock or insufficient quantity")) {
//     return { message: errorMessage };
//   }
//   if (errorMessage.includes("Product not found in cart for this user.")) {
//     return { message: errorMessage };
//   }
//   if (errorMessage.includes("Cart is already empty for this user.")) {
//     return { message: errorMessage };
//   }
//   if (errorMessage.includes("User does not have a cart yet.")) {
//     return { message: errorMessage };
//   }
//   if (errorMessage.includes("product is currently not active")) {
//     return { message: errorMessage };
//   }
//   return { message: "An unexpected error occurred." };
// };

// const handleStatusCode = (error) => {
//   if (error instanceof ValidationError) return 400;
//   if (error instanceof NotFoundError) return 404;
//   // Custom error messages might map to 400 Bad Request
//   if (String(error.message || '').includes("out of stock or insufficient quantity")) {
//     return 400;
//   }
//   if (String(error.message || '').includes("Product not found in cart for this user.")) {
//     return 404;
//   }
//   if (String(error.message || '').includes("product is currently not active")) {
//     return 400;
//   }
//   if (String(error.message || '').includes("Cart is already empty for this user.")) {
//     return 200; // Informational success, no action needed
//   }
//   if (String(error.message || '').includes("User does not have a cart yet.")) {
//     return 200; // Informational success, no cart to show
//   }
//   return 500;
// };

// const validateBodyRequiredFields = (body, fields) => {
//   const missingFields = fields.filter(field => !body[field]);
//   if (missingFields.length > 0) {
//     throw new ValidationError(`Missing required fields: ${missingFields.join(', ')}`);
//   }
// };
// // --- END Helper functions ---

// module.exports = createCoreController("api::cart.cart", ({ strapi }) => ({
//   //MARK:GetCart 
//   async getMyCart(ctx) {
//     try {
//       const { id: userId } = ctx.state.user; // Get authenticated user ID

//       const cart = await strapi.entityService.findMany(
//         "api::cart.cart", // Your Cart UID
//         {
//           filters: {
//             user: userId, // Filter by the current user's ID
//           },
//           populate: {
//             product: {
//               // Populate the product details including new fields
//               fields: [
//                 "id", "name", "price", "stock", "inStock",
//                 "offers", "offerPrice", "rating", "reviewCount", "isActive"
//               ],
//               populate: {
//                 image: {
//                   fields: ["url", "name", "alternativeText"],
//                 },
//               },
//             },
//             user: {
//               fields: ["id", "email", "phone", "name"],
//             },
//           },
//         }
//       );

//       if (!cart || cart.length === 0) {
//         return ctx.send({
//           success: true,
//           message: "User does not have a cart yet or cart is empty.",
//           data: {
//             cart_items: [],
//             total_items: 0
//           },
//         });
//       }

//       return ctx.send({
//         success: true,
//         message: "Cart retrieved successfully",
//         data: {
//           cart_items: cart,
//           total_items: cart.length
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

//   // 2.MARK: Add Product (Now also handles decrementing)
//   async addProductToCart(ctx) {
//     try {
//       const { id: userId } = ctx.state.user;
//       const requestBody = ctx.request.body || {};
//       const { productId, quantity } = requestBody.data || requestBody;

//       validateBodyRequiredFields(requestBody.data || requestBody, ["productId", "quantity"]);

//       if (quantity === 0) {
//         throw new ValidationError("Quantity cannot be zero.");
//       }

//       // Fetch the product with all required fields for validation
//       const product = await strapi.entityService.findOne(
//         "api::product.product",
//         productId,
//         { fields: ["name", "price", "stock", "inStock", "isActive"] }
//       );

//       if (!product) {
//         throw new NotFoundError("Product not found.");
//       }

//       // --- NEW VALIDATION CHECKS ---
//       if (!product.isActive) {
//         throw new ValidationError("This product is currently not active and cannot be added to the cart.");
//       }
//       if (!product.inStock || product.stock < 1) {
//         throw new ValidationError("This product is out of stock.");
//       }
//       // --- END NEW VALIDATION CHECKS ---

//       let [currentCartEntry] = await strapi.entityService.findMany(
//         "api::cart.cart",
//         { filters: { user: userId, product: productId }, limit: 1 }
//       );

//       const currentQuantityInCart = currentCartEntry ? currentCartEntry.quantity : 0;
//       const newTotalQuantity = currentQuantityInCart + quantity;

//       // Handle decrement logic
//       if (quantity < 0) {
//         if (!currentCartEntry) {
//           throw new NotFoundError("Product not found in cart for this user to decrement.");
//         }
//         if (newTotalQuantity < 0) {
//           throw new ValidationError("Cannot decrement quantity below zero.");
//         }
//         // If the new quantity is 0, remove the item
//         if (newTotalQuantity === 0) {
//           await strapi.entityService.delete("api::cart.cart", currentCartEntry.id);
//           return ctx.send({
//             success: true,
//             message: "Product quantity decreased to zero and removed from cart.",
//             data: { product_id: productId, user_id: userId }
//           });
//         }
//       }
//       // Handle increment logic
//       else if (newTotalQuantity > product.stock) {
//         throw new ValidationError(`Product ${product.name} is out of stock or insufficient quantity (Available: ${product.stock}, Requested: ${newTotalQuantity}).`);
//       }

//       let updatedCartEntry;
//       let message = "";

//       if (!currentCartEntry) {
//         updatedCartEntry = await strapi.entityService.create(
//           "api::cart.cart",
//           {
//             data: {
//               user: userId,
//               product: productId,
//               quantity: quantity,
//             },
//             populate: {
//               product: {
//                 fields: ["id", "name", "price", "offers", "offerPrice", "rating", "reviewCount"],
//                 populate: { image: { fields: ["url"] } },
//               },
//             },
//           }
//         );
//         message = "Product added to cart.";
//       } else {
//         updatedCartEntry = await strapi.entityService.update(
//           "api::cart.cart",
//           currentCartEntry.id,
//           {
//             data: {
//               quantity: newTotalQuantity,
//             },
//             populate: {
//               product: {
//                 fields: ["id", "name", "price", "offers", "offerPrice", "rating", "reviewCount"],
//                 populate: { image: { fields: ["url"] } },
//               },
//             },
//           }
//         );
//         message = quantity > 0 ? "Product quantity updated in cart." : "Product quantity decreased in cart.";
//       }

//       return ctx.send({
//         success: true,
//         message: message,
//         data: {
//           id: updatedCartEntry.id,
//           product_id: updatedCartEntry.product.id,
//           quantity: updatedCartEntry.quantity,
//           product_name: updatedCartEntry.product.name,
//           product_price: updatedCartEntry.product.price,
//           product_offers: updatedCartEntry.product.offers,
//           product_offerPrice: updatedCartEntry.product.offerPrice,
//           product_rating: updatedCartEntry.product.rating,
//           product_reviewCount: updatedCartEntry.product.reviewCount,
//           product_image: updatedCartEntry.product.image ? updatedCartEntry.product.image[0] : null,
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

//   // 3.MARK: Remove Product From Cart (Now only handles full removal)
//   async removeProductFromCart(ctx) {
//     try {
//       const { id: userId } = ctx.state.user;
//       if (!userId) {
//         throw new ValidationError("User not authenticated.");
//       }

//       const { productId } = ctx.params;
//       const parsedProductId = parseInt(productId, 10);

//       if (isNaN(parsedProductId)) {
//         throw new ValidationError("Invalid Product ID provided in URL. Must be a number.");
//       }

//       let [cartEntry] = await strapi.entityService.findMany(
//         "api::cart.cart",
//         { filters: { user: userId, product: parsedProductId } }
//       );

//       if (!cartEntry) {
//         throw new NotFoundError("Product not found in cart for this user.");
//       }

//       await strapi.entityService.delete(
//         "api::cart.cart",
//         cartEntry.id
//       );

//       return ctx.send({
//         success: true,
//         message: "Product removed from cart.",
//         data: {
//           product_id: parsedProductId,
//           user_id: userId,
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

