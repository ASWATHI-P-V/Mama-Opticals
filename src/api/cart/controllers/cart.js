// src/api/cart/controllers/cart.js

"use strict";

const { createCoreController } = require("@strapi/strapi").factories;
const { ValidationError, NotFoundError } = require("@strapi/utils").errors;

// Helper function to handle and format errors
const handleErrors = (error) => {
  console.error("Error occurred:", error);
  const errorMessage = String(error.message || "");

  if (error instanceof ValidationError) {
    return { message: errorMessage };
  }
  if (error instanceof NotFoundError) {
    return { message: errorMessage };
  }
  if (errorMessage.includes("out of stock or insufficient quantity")) {
    return { message: errorMessage };
  }
  if (errorMessage.includes("Product not found in cart for this user.")) {
    return { message: errorMessage };
  }
  if (errorMessage.includes("Product variant not found in cart for this user.")) {
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
  if (errorMessage.includes("product variant is currently not active")) {
    return { message: errorMessage };
  }
  if (errorMessage.includes("Cannot read properties of undefined")) {
    return { message: "Invalid data structure encountered. Please refresh and try again." };
  }
  if (errorMessage.includes("User not authenticated")) {
    return { message: "User authentication required." };
  }
  if (errorMessage.includes("Invalid Product Variant ID")) {
    return { message: "Invalid product variant ID provided." };
  }
  if (errorMessage.includes("Product variant not found")) {
    return { message: "Product variant not found." };
  }
  return { message: "An unexpected error occurred." };
};

// Helper function to map error messages to status codes
const handleStatusCode = (error) => {
  if (error instanceof ValidationError) return 400;
  if (error instanceof NotFoundError) return 404;
  if (String(error.message || "").includes("out of stock or insufficient quantity")) {
    return 400;
  }
  if (String(error.message || "").includes("Product not found in cart for this user.")) {
    return 404;
  }
  if (String(error.message || "").includes("Product variant not found in cart for this user.")) {
    return 404;
  }
  if (String(error.message || "").includes("product variant is currently not active")) {
    return 400;
  }
  if (String(error.message || "").includes("User not authenticated")) {
    return 401;
  }
  if (String(error.message || "").includes("Invalid Product Variant ID")) {
    return 400;
  }
  if (String(error.message || "").includes("Product variant not found")) {
    return 404;
  }
  if (String(error.message || "").includes("Cannot read properties of undefined")) {
    return 500;
  }
  if (String(error.message || "").includes("Cart is already empty for this user.")) {
    return 200;
  }
  if (String(error.message || "").includes("User does not have a cart yet.")) {
    return 200;
  }
  return 500;
};

// Helper function to validate request body fields
const validateBodyRequiredFields = (body, fields) => {
  const missingFields = fields.filter(field => !body[field]);
  if (missingFields.length > 0) {
    throw new ValidationError(`Missing required fields: ${missingFields.join(', ')}`);
  }
};

/**
 * Helper to get a product variant and its master product dynamically.
 * This function is now the core of the polymorphic logic.
 */
const getProductVariantAndMaster = async (variantId, strapi) => {
  try {
    if (!variantId || isNaN(parseInt(variantId))) {
      throw new ValidationError("Invalid Product Variant ID provided.");
    }

    // Find the specific product variant, populating all three possible parent relations.
    const productVariant = await strapi.db.query("api::product-variant.product-variant").findOne({
      where: { id: variantId },
      populate: {
        product: {
          select: ["id", "name", "price", "offers", "offerPrice", "locale"],
          populate: { image: { select: ["url", "name", "alternativeText"] } },
        },
        contact_lens: {
          select: ["id", "name", "price", "offers", "offerPrice", "locale"],
          populate: { image: { select: ["url", "name", "alternativeText"] } },
        },
        accessory: {
          select: ["id", "name", "price", "offers", "offerPrice", "locale"],
          populate: { image: { select: ["url", "name", "alternativeText"] } },
        },
        frame_size: true,
        color: true,
      },
    });

    if (!productVariant) {
      throw new NotFoundError("Product variant not found.");
    }

    // Dynamically determine the master product based on which relation is populated.
    let masterProduct = null;
    let parentType = null;
    if (productVariant.product) {
      masterProduct = productVariant.product;
      parentType = 'product';
    } else if (productVariant.contact_lens) {
      masterProduct = productVariant.contact_lens;
      parentType = 'contact-lens';
    } else if (productVariant.accessory) {
      masterProduct = productVariant.accessory;
      parentType = 'accessory';
    }

    if (!masterProduct) {
      throw new ValidationError("Product variant is not linked to any master product.");
    }

    // Calculate combined stock based on all variants of the master product.
    const allVariants = await strapi.db.query("api::product-variant.product-variant").findMany({
      where: { [parentType]: masterProduct.id },
      select: ["id", "stock", "isActive", "inStock"]
    });

    if (!allVariants || allVariants.length === 0) {
      throw new ValidationError("No variants found for this product.");
    }

    const totalStock = allVariants.reduce((sum, variant) => {
      const stock = typeof variant.stock === 'number' ? variant.stock : 0;
      return sum + stock;
    }, 0);
    
    const hasActiveVariant = allVariants.some(variant => 
      variant.isActive && variant.inStock && (variant.stock || 0) > 0
    );

    return {
      productVariant,
      masterProduct,
      totalStock,
      hasActiveVariant,
      allVariants, // Return all variants to calculate total quantity in cart
      parentType
    };
  } catch (error) {
    console.error("Error in getProductVariantAndMaster:", error);
    throw error;
  }
};

/**
 * Helper to get all cart items for a given master product and all its variants.
 * This is now more robust to handle any product type.
 */
const getAllCartItemsForProduct = async (userId, masterProductId, parentType, strapi) => {
  try {
    if (!userId || !masterProductId || !parentType) {
      throw new ValidationError("User ID, Master Product ID, and Parent Type are required.");
    }

    const allVariants = await strapi.db.query("api::product-variant.product-variant").findMany({
      where: { [parentType]: masterProductId },
      select: ["id"]
    });

    const allVariantIds = allVariants.map(variant => variant.id).filter(id => id);

    if (allVariantIds.length === 0) {
      return { cartItems: [], totalQuantityInCart: 0 };
    }

    const cartItems = await strapi.db.query("api::cart.cart").findMany({
      where: {
        user: userId,
        product_variant: { id: { $in: allVariantIds } }
      },
      populate: {
        product_variant: {
          select: ["id", "stock", "isActive", "inStock"]
        }
      }
    });
    
    const validCartItems = cartItems.filter(item => 
      item && item.product_variant && typeof item.quantity === 'number'
    );

    const totalQuantityInCart = validCartItems.reduce((sum, item) => {
      return sum + (item.quantity || 0);
    }, 0);

    return {
      cartItems: validCartItems,
      totalQuantityInCart,
    };
  } catch (error) {
    console.error("Error in getAllCartItemsForProduct:", error);
    throw error;
  }
};

module.exports = createCoreController("api::cart.cart", ({ strapi }) => ({

  // MARK: GetCart
  async getMyCart(ctx) {
    try {
      // Get the user from the JWT token
      const user = ctx.state.user;
      if (!user) {
        return ctx.unauthorized("Authentication required.");
      }
      const userId = user.id;

      // Fetch cart items for the user, populating the necessary relations
      const cartItems = await strapi.db.query("api::cart.cart").findMany({
        where: { user: userId },
        populate: {
          product_variant: {
            populate: {
              product: {
                select: ["id", "name", "price", "offers", "offerPrice", "locale"],
                populate: {
                  image: { select: ["url", "name", "alternativeText"] },
                  localizations: { select: ["id", "locale"] },
                },
              },
              contact_lens: {
                select: ["id", "name", "price", "offers", "offerPrice", "locale"],
                populate: {
                  image: { select: ["url", "name", "alternativeText"] },
                },
              },
              accessory: {
                select: ["id", "name", "price", "offers", "offerPrice", "locale"],
                populate: {
                  image: { select: ["url", "name", "alternativeText"] },
                },
              },
              color_picker: true,
              frame_size: true,
            },
          },
        },
      });

      // Handle the case where the cart is empty
      if (!cartItems || cartItems.length === 0) {
        return ctx.send({
          success: true,
          message: "User does not have a cart yet or cart is empty.",
          data: {
            cart_items: [],
            total_items: 0,
          }
        });
      }

      // Cache to store combined stock for each product to avoid redundant queries
      const productCombinedStockCache = new Map();

      // Format the data to match the desired output structure precisely
      const formattedCartItems = await Promise.all(cartItems.map(async (item) => {
        const variant = item.product_variant;
        if (!variant) {
          console.warn(`Cart item ${item.id} has missing variant data and will be skipped.`);
          return null;
        }

        // Dynamically determine the master product
        let masterProduct = null;
        let productType = null;
        if (variant.product) {
          masterProduct = variant.product;
          productType = 'product';
        } else if (variant.contact_lens) {
          masterProduct = variant.contact_lens;
          productType = 'contact-lens';
        } else if (variant.accessory) {
          masterProduct = variant.accessory;
          productType = 'accessory';
        }

        if (!masterProduct) {
          console.warn(`Variant ${variant.id} has no master product linked.`);
          return null;
        }

        let combinedStock = 0;
        // Check if combined stock for this product has already been calculated
        if (productCombinedStockCache.has(masterProduct.id)) {
          combinedStock = productCombinedStockCache.get(masterProduct.id);
        } else {
          // If not, fetch all variants for the master product and calculate the total stock
          const allProductVariants = await strapi.entityService.findMany(
            "api::product-variant.product-variant", {
              filters: {
                [productType]: { id: masterProduct.id },
                isActive: true,
                stock: { $gt: 0 },
              },
              fields: ["stock"]
            });
          
          combinedStock = allProductVariants.reduce((sum, v) => sum + v.stock, 0);
          productCombinedStockCache.set(masterProduct.id, combinedStock);
        }

        const productDetails = {
          ...masterProduct,
          offerPrice: masterProduct.offer_price, // Use 'offer_price' from the query
          combinedStock: combinedStock, // Add the newly calculated combined stock
          product_type: productType,
        };
        // Clean up the offer_price key to avoid redundancy
        delete productDetails.offer_price;

        const formattedVariant = {
          id: variant.id,
          createdAt: variant.createdAt,
          updatedAt: variant.updatedAt,
          stock: variant.stock, // This is the stock for the specific variant
          isActive: variant.isActive,
          inStock: variant.inStock,
          salesCount: variant.salesCount,
          color_picker: variant.color_picker,
          product: productDetails,
          frame_size: variant.frame_size,
        };

        return {
          id: item.id,
          quantity: item.quantity,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          product_variant: formattedVariant,
        };
      }));

      // Filter out any null values that were returned for invalid cart items
      const validFormattedCartItems = formattedCartItems.filter(item => item !== null);

      // Send the formatted response
      return ctx.send({
        success: true,
        message: "Cart retrieved successfully",
        data:{
          cart_items: validFormattedCartItems,
          total_items: validFormattedCartItems.length,
        }
      });
    } catch (err) {
      console.error("Error in getMyCart:", err);
      // In a production environment, you might want a more generic error message
      return ctx.internalServerError("An internal server error occurred.");
    }
  },
  // MARK: Add Product Variant to Cart
  async addProductToCart(ctx) {
    try {
      const { id: userId } = ctx.state.user;
      
      if (!userId) {
        throw new ValidationError("User not authenticated.");
      }

      const requestBody = ctx.request.body || {};
      const { variantId, quantity } = requestBody.data || requestBody;

      validateBodyRequiredFields(requestBody.data || requestBody, ["variantId", "quantity"]);

      if (quantity === 0) {
        throw new ValidationError("Quantity cannot be zero.");
      }

      if (!Number.isInteger(quantity)) {
        throw new ValidationError("Quantity must be a whole number.");
      }

      const { productVariant, masterProduct, totalStock, hasActiveVariant, parentType } = await getProductVariantAndMaster(variantId, strapi);

      // Comprehensive validation checks
      if (!hasActiveVariant) {
        throw new ValidationError("This product variant is currently not active or out of stock.");
      }

      if (!productVariant.isActive || !productVariant.inStock || (productVariant.stock || 0) < 1) {
        throw new ValidationError("This specific product variant is currently not active or out of stock.");
      }
      
      const { cartItems, totalQuantityInCart } = await getAllCartItemsForProduct(userId, masterProduct.id, parentType, strapi);
      
      const currentCartEntry = cartItems.find(item => 
        item.product_variant && item.product_variant.id === parseInt(variantId)
      );
      const currentQuantityForThisVariant = currentCartEntry ? currentCartEntry.quantity : 0;
      
      const newTotalQuantityAcrossAllVariants = totalQuantityInCart + quantity;
      const newQuantityForThisVariant = currentQuantityForThisVariant + quantity;
      
      // Handle decrement logic
      if (quantity < 0) {
        if (!currentCartEntry) {
          throw new NotFoundError("Product variant not found in cart for this user to decrement.");
        }
        if (newQuantityForThisVariant < 0) {
          throw new ValidationError("Cannot decrement quantity below zero.");
        }
        if (newQuantityForThisVariant === 0) {
          await strapi.db.query("api::cart.cart").delete({
            where: { id: currentCartEntry.id }
          });
          return ctx.send({
            success: true,
            message: "Product quantity decreased to zero and removed from cart.",
            data: {
              product_id: masterProduct.id, 
              variant_id: parseInt(variantId), 
              user_id: userId
            }
          });
        }
      } 
      // Handle increment logic with comprehensive stock validation
      else {
        // Check combined stock across all variants
        if (newTotalQuantityAcrossAllVariants > totalStock) {
          const availableStock = Math.max(0, totalStock - totalQuantityInCart);
          throw new ValidationError(
            `Product ${masterProduct.name} has insufficient combined stock. Available: ${availableStock}, Requested: ${quantity}.`
          );
        }
        
        // Check individual variant stock
        if (newQuantityForThisVariant > (productVariant.stock || 0)) {
          const availableForThisVariant = Math.max(0, (productVariant.stock || 0) - currentQuantityForThisVariant);
          throw new ValidationError(
            `This product variant has insufficient stock. Available: ${availableForThisVariant}, Requested: ${quantity}.`
          );
        }
      }
      
      let updatedCartEntry;
      let message = "";
      
      if (!currentCartEntry) {
        updatedCartEntry = await strapi.db.query("api::cart.cart").create({
          data: { 
            user: userId, 
            product_variant: parseInt(variantId), 
            quantity: quantity 
          },
          populate: { 
            product_variant: { 
              populate: {
                product: {
                  select: ["id", "name", "price", "offers", "offerPrice"],
                  populate: { image: { select: ["url"] } }
                },
                contact_lens: {
                  select: ["id", "name", "price", "offers", "offerPrice"],
                  populate: { image: { select: ["url"] } }
                },
                accessory: {
                  select: ["id", "name", "price", "offers", "offerPrice"],
                  populate: { image: { select: ["url"] } }
                },
                color_picker: true,
              }
            } 
          }
        });
        message = "Product added to cart.";
      } else {
        updatedCartEntry = await strapi.db.query("api::cart.cart").update({
          where: { id: currentCartEntry.id },
          data: { quantity: newQuantityForThisVariant },
          populate: { 
            product_variant: { 
              populate: {
                product: {
                  select: ["id", "name", "price", "offers", "offerPrice"],
                  populate: { image: { select: ["url"] } }
                },
                contact_len: {
                  select: ["id", "name", "price", "offers", "offerPrice"],
                  populate: { image: { select: ["url"] } }
                },
                accessory: {
                  select: ["id", "name", "price", "offers", "offerPrice"],
                  populate: { image: { select: ["url"] } }
                },
                color_picker: true,
              }
            } 
          }
        });
        message = quantity > 0 ? "Product quantity updated in cart." : "Product quantity decreased in cart.";
      }
      
      // Re-fetch to get the most up-to-date cart info for the response
      const finalCartEntry = await strapi.db.query("api::cart.cart").findOne({
        where: { id: updatedCartEntry.id },
        populate: {
          product_variant: {
            populate: {
              product: true,
              contact_lens: true,
              accessory: true,
              color_picker: true,
            }
          }
        }
      });
      
      let finalMasterProduct = null;
      if (finalCartEntry.product_variant.product) finalMasterProduct = finalCartEntry.product_variant.product;
      else if (finalCartEntry.product_variant.contact_len) finalMasterProduct = finalCartEntry.product_variant.contact_len;
      else if (finalCartEntry.product_variant.accessory) finalMasterProduct = finalCartEntry.product_variant.accessory;

      return ctx.send({
        success: true,
        message: message,
        data: {
          id: finalCartEntry.id,
          quantity: finalCartEntry.quantity,
          createdAt: finalCartEntry.createdAt,
          updatedAt: finalCartEntry.updatedAt,
          product_variant: {
            ...finalCartEntry.product_variant,
            stock: finalCartEntry.product_variant.stock,
            available_stock: finalCartEntry.product_variant.stock - finalCartEntry.quantity,
            product: {
              ...finalMasterProduct,
              offerPrice: finalMasterProduct.offerPrice
            },
          },
          combined_stock_total: totalStock,
          combined_stock_available: totalStock - newTotalQuantityAcrossAllVariants,
          total_quantity_in_cart_all_variants: newTotalQuantityAcrossAllVariants,
          is_combined_product: totalStock > (finalCartEntry.product_variant.stock || 0)
        }
      });
    } catch (error) {
      console.error("Error in addProductToCart:", error);
      const customizedError = handleErrors(error);
      return ctx.send(
        { success: false, message: customizedError.message },
        handleStatusCode(error) || 500
      );
    }
  },

  // MARK: Remove Product Variant From Cart
  async removeProductFromCart(ctx) {
    try {
      const { id: userId } = ctx.state.user;
      if (!userId) {
        throw new ValidationError("User not authenticated.");
      }

      const { variantId } = ctx.params;
      const parsedVariantId = parseInt(variantId, 10);

      if (isNaN(parsedVariantId)) {
        throw new ValidationError("Invalid Product Variant ID provided in URL. Must be a number.");
      }

      const cartEntry = await strapi.db.query("api::cart.cart").findOne({
        where: { 
          user: userId, 
          product_variant: { id: parsedVariantId } 
        }
      });

      if (!cartEntry) {
        throw new NotFoundError("Product variant not found in cart for this user.");
      }

      await strapi.db.query("api::cart.cart").delete({
        where: { id: cartEntry.id }
      });

      return ctx.send({
        success: true,
        message: "Product variant removed from cart.",
        data: {
          product_variant_id: parsedVariantId, 
          user_id: userId
        }
      });

    } catch (error) {
      console.error("Error in removeProductFromCart:", error);
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

      if (!userId) {
        throw new ValidationError("User not authenticated.");
      }

      const cartEntries = await strapi.db.query("api::cart.cart").findMany({
        where: { user: userId }
      });

      if (!cartEntries || cartEntries.length === 0) {
        return ctx.send({
          success: true,
          message: "Cart is already empty for this user.",
          data: {
            user_id: userId
          }
        });
      }

      await strapi.db.query("api::cart.cart").deleteMany({
        where: { user: userId }
      });

      return ctx.send({
        success: true,
        message: "Cart cleared successfully.",
        data: {
          user_id: userId,
          items_removed: cartEntries.length
        }
      });

    } catch (error) {
      console.error("Error in clearCart:", error);
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

      if (!userId) {
        throw new ValidationError("User not authenticated.");
      }

      const cart = await strapi.db.query("api::cart.cart").findMany({
        where: { user: userId },
        populate: {
          product_variant: {
            select: ["id", "stock", "inStock", "isActive"],
            populate: {
              product: {
                select: ["id", "name", "price", "offers", "offerPrice", "locale"],
              },
              contact_lens: {
                select: ["id", "name", "price", "offers", "offerPrice", "locale"],
              },
              accessory: {
                select: ["id", "name", "price", "offers", "offerPrice", "locale"],
              }
            }
          }
        }
      });

      if (!cart || cart.length === 0) {
        return ctx.send({
          success: true,
          message: "Cart is empty.",
          data: {
            total_items: 0,
            total_unique_products: 0,
            estimated_total: 0,
            items_by_locale: {},
            invalid_items: []
          }
        });
      }

      let totalItems = 0;
      let estimatedTotal = 0;
      const itemsByLocale = {};
      const uniqueProducts = new Set();
      const invalidItems = [];

      cart.forEach((item, index) => {
        try {
          // Validate cart item structure
          if (!item || typeof item.quantity !== 'number') {
            console.warn(`Invalid cart item at index ${index}:`, item);
            invalidItems.push({
              cart_item_id: item?.id || `index_${index}`,
              error: "Invalid cart item structure - missing or invalid quantity"
            });
            return;
          }

          const variant = item.product_variant;
          if (!variant) {
            console.warn(`Cart item ${item.id} missing product_variant:`, item);
            invalidItems.push({
              cart_item_id: item.id,
              error: "Product variant not found or not properly populated"
            });
            return;
          }

          // Dynamically get the master product
          let masterProduct;
          if (variant.product) {
            masterProduct = variant.product;
          } else if (variant.contact_lens) {
            masterProduct = variant.contact_lens;
          } else if (variant.accessory) {
            masterProduct = variant.accessory;
          }
          
          if (!masterProduct) {
            console.warn(`Cart item ${item.id} has no master product linked:`, variant);
            invalidItems.push({
              cart_item_id: item.id,
              variant_id: variant.id,
              error: "Master product not found or not properly populated"
            });
            return;
          }
          
          // Validate required product fields
          if (!masterProduct.id || !masterProduct.name || typeof masterProduct.price !== 'number') {
            console.warn(`Cart item ${item.id} has invalid master product data:`, masterProduct);
            invalidItems.push({
              cart_item_id: item.id,
              variant_id: variant.id,
              product_id: masterProduct.id,
              error: "Master product missing required fields (id, name, or price)"
            });
            return;
          }

          // Calculate totals for valid items
          totalItems += item.quantity;
          
          const effectivePrice = masterProduct.offers && typeof masterProduct.offerPrice === 'number'
            ? masterProduct.offerPrice
            : masterProduct.price;
            
          estimatedTotal += effectivePrice * item.quantity;

          const locale = masterProduct.locale || 'default';
          if (!itemsByLocale[locale]) {
            itemsByLocale[locale] = [];
          }
          
          itemsByLocale[locale].push({
            cart_item_id: item.id,
            product_variant_id: item.product_variant.id,
            product_id: masterProduct.id,
            product_name: masterProduct.name,
            quantity: item.quantity,
            unit_price: masterProduct.price,
            effective_price: effectivePrice,
            has_offer: Boolean(masterProduct.offers && masterProduct.offerPrice),
            subtotal: effectivePrice * item.quantity
          });

          // Track unique products using the master product ID
          uniqueProducts.add(masterProduct.id);
          
        } catch (itemError) {
          console.error(`Error processing cart item ${item?.id || index}:`, itemError);
          invalidItems.push({
            cart_item_id: item?.id || `index_${index}`,
            error: `Processing error: ${itemError.message}`
          });
        }
      });

      const response = {
        success: true,
        message: invalidItems.length > 0 
          ? `Cart summary retrieved with ${invalidItems.length} invalid items found.`
          : "Cart summary retrieved successfully.",
        data: {
          total_items: totalItems, 
          total_unique_products: uniqueProducts.size, 
          estimated_total: Math.round(estimatedTotal * 100) / 100, 
          items_by_locale: itemsByLocale, 
          invalid_items: invalidItems 
        }
      };

      if (invalidItems.length > 0) {
        console.warn(`Found ${invalidItems.length} invalid cart items for user ${userId}:`, invalidItems);
      }

      return ctx.send(response);
      
    } catch (error) {
      console.error("Error in getCartSummary:", error);
      const customizedError = handleErrors(error);
      return ctx.send(
        { success: false, message: customizedError.message },
        handleStatusCode(error) || 500
      );
    }
  }
}));








// // src/api/cart/controllers/cart.js

// "use strict";

// const { createCoreController } = require("@strapi/strapi").factories;
// const { ValidationError, NotFoundError } = require("@strapi/utils").errors;

// // Helper function to handle and format errors
// const handleErrors = (error) => {
//   console.error("Error occurred:", error);
//   const errorMessage = String(error.message || "");

//   if (error instanceof ValidationError) {
//     return { message: errorMessage };
//   }
//   if (error instanceof NotFoundError) {
//     return { message: errorMessage };
//   }
//   if (errorMessage.includes("out of stock or insufficient quantity")) {
//     return { message: errorMessage };
//   }
//   if (errorMessage.includes("Product not found in cart for this user.")) {
//     return { message: errorMessage };
//   }
//   if (errorMessage.includes("Product variant not found in cart for this user.")) {
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
//   if (errorMessage.includes("product variant is currently not active")) {
//     return { message: errorMessage };
//   }
//   if (errorMessage.includes("Cannot read properties of undefined")) {
//     return { message: "Invalid data structure encountered. Please refresh and try again." };
//   }
//   if (errorMessage.includes("User not authenticated")) {
//     return { message: "User authentication required." };
//   }
//   if (errorMessage.includes("Invalid Product Variant ID")) {
//     return { message: "Invalid product variant ID provided." };
//   }
//   if (errorMessage.includes("Product variant not found")) {
//     return { message: "Product variant not found." };
//   }
//   return { message: "An unexpected error occurred." };
// };

// // Helper function to map error messages to status codes
// const handleStatusCode = (error) => {
//   if (error instanceof ValidationError) return 400;
//   if (error instanceof NotFoundError) return 404;
//   if (String(error.message || "").includes("out of stock or insufficient quantity")) {
//     return 400;
//   }
//   if (String(error.message || "").includes("Product not found in cart for this user.")) {
//     return 404;
//   }
//   if (String(error.message || "").includes("Product variant not found in cart for this user.")) {
//     return 404;
//   }
//   if (String(error.message || "").includes("product variant is currently not active")) {
//     return 400;
//   }
//   if (String(error.message || "").includes("User not authenticated")) {
//     return 401;
//   }
//   if (String(error.message || "").includes("Invalid Product Variant ID")) {
//     return 400;
//   }
//   if (String(error.message || "").includes("Product variant not found")) {
//     return 404;
//   }
//   if (String(error.message || "").includes("Cannot read properties of undefined")) {
//     return 500;
//   }
//   if (String(error.message || "").includes("Cart is already empty for this user.")) {
//     return 200;
//   }
//   if (String(error.message || "").includes("User does not have a cart yet.")) {
//     return 200;
//   }
//   return 500;
// };

// // Helper function to validate request body fields
// const validateBodyRequiredFields = (body, fields) => {
//   const missingFields = fields.filter(field => !body[field]);
//   if (missingFields.length > 0) {
//     throw new ValidationError(`Missing required fields: ${missingFields.join(', ')}`);
//   }
// };

// // Helper to get a product variant and its master product
// const getProductVariant = async (variantId, strapi) => {
//   try {
//     if (!variantId || isNaN(parseInt(variantId))) {
//       throw new ValidationError("Invalid Product Variant ID provided.");
//     }

//     const productVariant = await strapi.db.query("api::product-variant.product-variant").findOne({
//       where: { id: variantId },
//       populate: {
//         product: {
//           select: ["id", "name", "price", "offers", "offerPrice", "locale"],
//           populate: {
//             localizations: {
//               select: ["id", "locale"]
//             },
//             image: {
//               select: ["url", "name", "alternativeText"]
//             }
//           }
//         }
//       }
//     });

//     if (!productVariant) {
//       throw new NotFoundError("Product variant not found.");
//     }

//     if (!productVariant.product) {
//       throw new ValidationError("Product variant is missing master product reference.");
//     }
    
//     // Calculate combined stock based on all variants of the master product
//     const masterProduct = productVariant.product;
//     const allVariants = await strapi.db.query("api::product-variant.product-variant").findMany({
//       where: { product: masterProduct.id },
//       select: ["id", "stock", "isActive", "inStock"]
//     });

//     if (!allVariants || allVariants.length === 0) {
//       throw new ValidationError("No variants found for this product.");
//     }

//     const totalStock = allVariants.reduce((sum, variant) => {
//       const stock = typeof variant.stock === 'number' ? variant.stock : 0;
//       return sum + stock;
//     }, 0);
    
//     const hasActiveVariant = allVariants.some(variant => 
//       variant.isActive && variant.inStock && (variant.stock || 0) > 0
//     );

//     return {
//       productVariant,
//       masterProduct,
//       allVariants,
//       totalStock,
//       hasActiveVariant
//     };
//   } catch (error) {
//     console.error("Error in getProductVariant:", error);
//     throw error;
//   }
// };

// // Helper to get all cart items for a given master product
// const getAllCartItemsForProduct = async (userId, masterProductId, strapi) => {
//   try {
//     if (!userId || !masterProductId) {
//       throw new ValidationError("User ID and Master Product ID are required.");
//     }

//     const allVariants = await strapi.db.query("api::product-variant.product-variant").findMany({
//       where: { product: masterProductId },
//       select: ["id"]
//     });
    
//     if (!allVariants || allVariants.length === 0) {
//       console.warn(`No variants found for master product ${masterProductId}`);
//       return {
//         cartItems: [],
//         totalQuantityInCart: 0,
//         allVariantIds: []
//       };
//     }

//     const allVariantIds = allVariants.map(variant => variant.id).filter(id => id);

//     // FIX: Change to use nested object for relational query
//     const cartItems = await strapi.db.query("api::cart.cart").findMany({
//       where: {
//         user: userId,
//         product_variant: { id: { $in: allVariantIds } }
//       },
//       populate: {
//         product_variant: {
//           select: ["id", "stock", "isActive", "inStock"]
//         }
//       }
//     });
    
//     const validCartItems = cartItems.filter(item => 
//       item && item.product_variant && typeof item.quantity === 'number'
//     );

//     const totalQuantityInCart = validCartItems.reduce((sum, item) => {
//       return sum + (item.quantity || 0);
//     }, 0);

//     return {
//       cartItems: validCartItems,
//       totalQuantityInCart,
//       allVariantIds
//     };
//   } catch (error) {
//     console.error("Error in getAllCartItemsForProduct:", error);
//     throw error;
//   }
// };

// module.exports = createCoreController("api::cart.cart", ({ strapi }) => ({

//   // MARK: GetCart
// async getMyCart(ctx) {
//   try {
//     // Get the user from the JWT token
//     const user = ctx.state.user;
//     if (!user) {
//       return ctx.unauthorized("Authentication required.");
//     }
//     const userId = user.id;

//     // Fetch cart items for the user, populating the necessary relations
//     const cartItems = await strapi.db.query("api::cart.cart").findMany({
//       where: { user: userId },
//       populate: {
//         product_variant: {
//           populate: {
//             product: {
//               // Corrected 'offerPrice' to 'offer_price' to match your schema
//               select: ["id", "name", "price", "offers", "offer_price", "locale"],
//               populate: {
//                 image: {
//                   select: ["url", "name", "alternativeText"],
//                 },
//                 localizations: {
//                   select: ["id", "locale"],
//                 },
//               },
//             },
//             color_picker: true,
//             frame_size: true,
//           },
//         },
//       },
//     });

//     // Handle the case where the cart is empty
//     if (!cartItems || cartItems.length === 0) {
//       return ctx.send({
//         success: true,
//         message: "User does not have a cart yet or cart is empty.",
//         data: {
//         cart_items: [],
//         total_items: 0,
//         }
//       });
//     }

//     // Cache to store combined stock for each product to avoid redundant queries
//     const productCombinedStockCache = new Map();

//     // Format the data to match the desired output structure precisely
//     const formattedCartItems = await Promise.all(cartItems.map(async (item) => {
//       const variant = item.product_variant;
//       const masterProduct = variant?.product;

//       if (!masterProduct) {
//           // Handle cases where product or variant data is missing
//           console.warn(`Cart item ${item.id} has missing product data and will be skipped.`);
//           return null;
//       }

//       let combinedStock = 0;
//       // Check if combined stock for this product has already been calculated
//       if (productCombinedStockCache.has(masterProduct.id)) {
//           combinedStock = productCombinedStockCache.get(masterProduct.id);
//       } else {
//           // If not, fetch all variants for the master product and calculate the total stock
//           const allProductVariants = await strapi.entityService.findMany(
//               "api::product-variant.product-variant", {
//               filters: {
//                   product: { id: masterProduct.id },
//                   isActive: true,
//                   stock: { $gt: 0 },
//               },
//               fields: ["stock"]
//           });
          
//           combinedStock = allProductVariants.reduce((sum, v) => sum + v.stock, 0);
//           productCombinedStockCache.set(masterProduct.id, combinedStock);
//       }

//       const productDetails = {
//         ...masterProduct,
//         offerPrice: masterProduct.offer_price, // Use 'offer_price' from the query
//         combinedStock: combinedStock // Add the newly calculated combined stock
//       };
//       // Clean up the offer_price key to avoid redundancy
//       delete productDetails.offer_price;

//       const formattedVariant = {
//         id: variant.id,
//         createdAt: variant.createdAt,
//         updatedAt: variant.updatedAt,
//         stock: variant.stock, // This is the stock for the specific variant
//         isActive: variant.isActive,
//         inStock: variant.inStock,
//         salesCount: variant.salesCount,
//         color_picker: variant.color_picker,
//         product: productDetails,
//         frame_size: variant.frame_size,
//       };

//       return {
//         id: item.id,
//         quantity: item.quantity,
//         createdAt: item.createdAt,
//         updatedAt: item.updatedAt,
//         product_variant: formattedVariant,
//       };
//     }));

//     // Filter out any null values that were returned for invalid cart items
//     const validFormattedCartItems = formattedCartItems.filter(item => item !== null);

//     // Send the formatted response
//     return ctx.send({
//       success: true,
//       message: "Cart retrieved successfully",
//       data:{
//       cart_items: validFormattedCartItems,
//       total_items: validFormattedCartItems.length,
//       }
//     });
//   } catch (err) {
//     console.error("Error in getMyCart:", err);
//     // In a production environment, you might want a more generic error message
//     return ctx.internalServerError("An internal server error occurred.");
//   }
// },
//   // MARK: Add Product Variant to Cart
//   async addProductToCart(ctx) {
//     try {
//       const { id: userId } = ctx.state.user;
      
//       if (!userId) {
//         throw new ValidationError("User not authenticated.");
//       }

//       const requestBody = ctx.request.body || {};
//       const { variantId, quantity } = requestBody.data || requestBody;

//       validateBodyRequiredFields(requestBody.data || requestBody, ["variantId", "quantity"]);

//       if (quantity === 0) {
//         throw new ValidationError("Quantity cannot be zero.");
//       }

//       if (!Number.isInteger(quantity)) {
//         throw new ValidationError("Quantity must be a whole number.");
//       }

//       const { productVariant, masterProduct, totalStock, hasActiveVariant } = await getProductVariant(variantId, strapi);

//       // Comprehensive validation checks
//       if (!hasActiveVariant) {
//         throw new ValidationError("This product variant is currently not active or out of stock.");
//       }

//       if (!productVariant.isActive || !productVariant.inStock || (productVariant.stock || 0) < 1) {
//         throw new ValidationError("This specific product variant is currently not active or out of stock.");
//       }
      
//       const { cartItems, totalQuantityInCart } = await getAllCartItemsForProduct(userId, masterProduct.id, strapi);
      
//       const currentCartEntry = cartItems.find(item => 
//         item.product_variant && item.product_variant.id === parseInt(variantId)
//       );
//       const currentQuantityForThisVariant = currentCartEntry ? currentCartEntry.quantity : 0;
      
//       const newTotalQuantityAcrossAllVariants = totalQuantityInCart + quantity;
//       const newQuantityForThisVariant = currentQuantityForThisVariant + quantity;
      
//       // Handle decrement logic
//       if (quantity < 0) {
//         if (!currentCartEntry) {
//           throw new NotFoundError("Product variant not found in cart for this user to decrement.");
//         }
//         if (newQuantityForThisVariant < 0) {
//           throw new ValidationError("Cannot decrement quantity below zero.");
//         }
//         if (newQuantityForThisVariant === 0) {
//           await strapi.db.query("api::cart.cart").delete({
//             where: { id: currentCartEntry.id }
//           });
//           return ctx.send({
//             success: true,
//             message: "Product quantity decreased to zero and removed from cart.",
//             data: {
//               product_id: masterProduct.id, 
//               variant_id: parseInt(variantId), 
//               user_id: userId
//             }
//           });
//         }
//       } 
//       // Handle increment logic with comprehensive stock validation
//       else {
//         // Check combined stock across all variants
//         if (newTotalQuantityAcrossAllVariants > totalStock) {
//           const availableStock = Math.max(0, totalStock - totalQuantityInCart);
//           throw new ValidationError(
//             `Product ${masterProduct.name} has insufficient combined stock. Available: ${availableStock}, Requested: ${quantity}.`
//           );
//         }
        
//         // Check individual variant stock
//         if (newQuantityForThisVariant > (productVariant.stock || 0)) {
//           const availableForThisVariant = Math.max(0, (productVariant.stock || 0) - currentQuantityForThisVariant);
//           throw new ValidationError(
//             `This product variant has insufficient stock. Available: ${availableForThisVariant}, Requested: ${quantity}.`
//           );
//         }
//       }
      
//       let updatedCartEntry;
//       let message = "";
      
//       if (!currentCartEntry) {
//         // FIX: Use the explicit ID to create the relation
//         updatedCartEntry = await strapi.db.query("api::cart.cart").create({
//           data: { 
//             user: userId, 
//             product_variant: parseInt(variantId), 
//             quantity: quantity 
//           },
//           populate: { 
//             product_variant: { 
//               populate: {
//                 product: {
//                   select: ["id", "name", "price", "offers", "offerPrice"],
//                   populate: { 
//                     image: { 
//                       select: ["url"] 
//                     } 
//                   }
//                 },
//                 color_picker: true
//               }
//             } 
//           }
//         });
//         message = "Product added to cart.";
//       } else {
//         updatedCartEntry = await strapi.db.query("api::cart.cart").update({
//           where: { id: currentCartEntry.id },
//           data: { quantity: newQuantityForThisVariant },
//           populate: { 
//             product_variant: { 
//               populate: {
//                 product: {
//                   select: ["id", "name", "price", "offers", "offerPrice"],
//                   populate: { 
//                     image: { 
//                       select: ["url"] 
//                     } 
//                   }
//                 },
//                 color_picker: true
//               }
//             } 
//           }
//         });
//         message = quantity > 0 ? "Product quantity updated in cart." : "Product quantity decreased in cart.";
//       }
      
//       return ctx.send({
//         success: true,
//         message: message,
//         data: {
//           id: updatedCartEntry.id,
//           quantity: updatedCartEntry.quantity,
//           createdAt: updatedCartEntry.createdAt,
//           updatedAt: updatedCartEntry.updatedAt,
//           product_variant: {
//             ...updatedCartEntry.product_variant,
//             // Add the stock, combined_stock_available, and available_stock fields
//             stock: updatedCartEntry.product_variant.stock,
//             available_stock: updatedCartEntry.product_variant.stock - updatedCartEntry.quantity,
//             product: {
//               ...updatedCartEntry.product_variant.product,
//               offerPrice: updatedCartEntry.product_variant.product.offerPrice
//             },
//           },
//           combined_stock_total: totalStock,
//           combined_stock_available: totalStock - newTotalQuantityAcrossAllVariants,
//           total_quantity_in_cart_all_variants: newTotalQuantityAcrossAllVariants,
//           is_combined_product: totalStock > (productVariant.stock || 0)
//         }
//       });
//     } catch (error) {
//       console.error("Error in addProductToCart:", error);
//       const customizedError = handleErrors(error);
//       return ctx.send(
//         { success: false, message: customizedError.message },
//         handleStatusCode(error) || 500
//       );
//     }
//   },


//   // MARK: Remove Product Variant From Cart
//   async removeProductFromCart(ctx) {
//     try {
//       const { id: userId } = ctx.state.user;
//       if (!userId) {
//         throw new ValidationError("User not authenticated.");
//       }

//       const { variantId } = ctx.params;
//       const parsedVariantId = parseInt(variantId, 10);

//       if (isNaN(parsedVariantId)) {
//         throw new ValidationError("Invalid Product Variant ID provided in URL. Must be a number.");
//       }

//       // FIX: Use nested object for relational query
//       const cartEntry = await strapi.db.query("api::cart.cart").findOne({
//         where: { 
//           user: userId, 
//           product_variant: { id: parsedVariantId } 
//         }
//       });

//       if (!cartEntry) {
//         throw new NotFoundError("Product variant not found in cart for this user.");
//       }

//       await strapi.db.query("api::cart.cart").delete({
//         where: { id: cartEntry.id }
//       });

//       return ctx.send({
//         success: true,
//         message: "Product variant removed from cart.",
//         data: {
//           product_variant_id: parsedVariantId, 
//           user_id: userId
//         }
//       });

//     } catch (error) {
//       console.error("Error in removeProductFromCart:", error);
//       const customizedError = handleErrors(error);
//       return ctx.send(
//         { success: false, message: customizedError.message },
//         handleStatusCode(error) || 500
//       );
//     }
//   },

//   // MARK: Clear entire cart
//   async clearCart(ctx) {
//     try {
//       const { id: userId } = ctx.state.user;

//       if (!userId) {
//         throw new ValidationError("User not authenticated.");
//       }

//       const cartEntries = await strapi.db.query("api::cart.cart").findMany({
//         where: { user: userId }
//       });

//       if (!cartEntries || cartEntries.length === 0) {
//         return ctx.send({
//           success: true,
//           message: "Cart is already empty for this user.",
//           data: {
//             user_id: userId
//           }
//         });
//       }

//       await strapi.db.query("api::cart.cart").deleteMany({
//         where: { user: userId }
//       });

//       return ctx.send({
//         success: true,
//         message: "Cart cleared successfully.",
//         data: {
//           user_id: userId,
//           items_removed: cartEntries.length
//         }
//       });

//     } catch (error) {
//       console.t('Error in clearCart:', error);
//       const customizedError = handleErrors(error);
//       return ctx.send(
//         { success: false, message: customizedError.message },
//         handleStatusCode(error) || 500
//       );
//     }
//   },

//   // MARK: Get cart summary with combined stock info
//   async getCartSummary(ctx) {
//     try {
//       const { id: userId } = ctx.state.user;

//       if (!userId) {
//         throw new ValidationError("User not authenticated.");
//       }

//       const cart = await strapi.db.query("api::cart.cart").findMany({
//         where: { user: userId },
//         populate: {
//           product_variant: {
//             select: ["id", "stock", "inStock", "isActive"],
//             populate: {
//               product: {
//                 select: ["id", "name", "price", "offers", "offerPrice", "locale"],
//                 populate: {
//                   localizations: { 
//                     select: ["id", "locale"] 
//                   }
//                 }
//               }
//             }
//           }
//         }
//       });

//       if (!cart || cart.length === 0) {
//         return ctx.send({
//           success: true,
//           message: "Cart is empty.",
//           data: {
//             total_items: 0,
//             total_unique_products: 0,
//             estimated_total: 0,
//             items_by_locale: {},
//             invalid_items: []
//           }
//         });
//       }

//       let totalItems = 0;
//       let estimatedTotal = 0;
//       const itemsByLocale = {};
//       const uniqueProducts = new Set();
//       const invalidItems = [];

//       cart.forEach((item, index) => {
//         try {
//           // Validate cart item structure
//           if (!item || typeof item.quantity !== 'number') {
//             console.warn(`Invalid cart item at index ${index}:`, item);
//             invalidItems.push({
//               cart_item_id: item?.id || `index_${index}`,
//               error: "Invalid cart item structure - missing or invalid quantity"
//             });
//             return;
//           }

//           // Validate product variant exists and is populated
//           if (!item.product_variant) {
//             console.warn(`Cart item ${item.id} missing product_variant:`, item);
//             invalidItems.push({
//               cart_item_id: item.id,
//               error: "Product variant not found or not properly populated"
//             });
//             return;
//           }

//           // Validate master product exists
//           if (!item.product_variant.product) {
//             console.warn(`Cart item ${item.id} missing master product:`, item.product_variant);
//             invalidItems.push({
//               cart_item_id: item.id,
//               variant_id: item.product_variant.id,
//               error: "Master product not found or not properly populated"
//             });
//             return;
//           }

//           const masterProduct = item.product_variant.product;
          
//           // Validate required product fields
//           if (!masterProduct.id || !masterProduct.name || typeof masterProduct.price !== 'number') {
//             console.warn(`Cart item ${item.id} has invalid master product data:`, masterProduct);
//             invalidItems.push({
//               cart_item_id: item.id,
//               variant_id: item.product_variant.id,
//               product_id: masterProduct.id,
//               error: "Master product missing required fields (id, name, or price)"
//             });
//             return;
//           }

//           // Calculate totals for valid items
//           totalItems += item.quantity;
          
//           const effectivePrice = masterProduct.offers && typeof masterProduct.offerPrice === 'number'
//             ? masterProduct.offerPrice
//             : masterProduct.price;
            
//           estimatedTotal += effectivePrice * item.quantity;

//           const locale = masterProduct.locale || 'default';
//           if (!itemsByLocale[locale]) {
//             itemsByLocale[locale] = [];
//           }
          
//           itemsByLocale[locale].push({
//             cart_item_id: item.id,
//             product_variant_id: item.product_variant.id,
//             product_id: masterProduct.id,
//             product_name: masterProduct.name,
//             quantity: item.quantity,
//             unit_price: masterProduct.price,
//             effective_price: effectivePrice,
//             has_offer: Boolean(masterProduct.offers && masterProduct.offerPrice),
//             subtotal: effectivePrice * item.quantity
//           });

//           // Track unique products using the master product ID
//           uniqueProducts.add(masterProduct.id);
          
//         } catch (itemError) {
//           console.error(`Error processing cart item ${item?.id || index}:`, itemError);
//           invalidItems.push({
//             cart_item_id: item?.id || `index_${index}`,
//             error: `Processing error: ${itemError.message}`
//           });
//         }
//       });

//       const response = {
//         success: true,
//         message: invalidItems.length > 0 
//           ? `Cart summary retrieved with ${invalidItems.length} invalid items found.`
//           : "Cart summary retrieved successfully.",
//         data: {
//           total_items: totalItems, 
//           total_unique_products: uniqueProducts.size, 
//           estimated_total: Math.round(estimatedTotal * 100) / 100, 
//           items_by_locale: itemsByLocale, 
//           invalid_items: invalidItems 
//         }
//       };

//       // If there are invalid items, log them for debugging
//       if (invalidItems.length > 0) {
//         console.warn(`Found ${invalidItems.length} invalid cart items for user ${userId}:`, invalidItems);
//       }

//       return ctx.send(response);
      
//     } catch (error) {
//       console.error("Error in getCartSummary:", error);
//       const customizedError = handleErrors(error);
//       return ctx.send(
//         { success: false, message: customizedError.message },
//         handleStatusCode(error) || 500
//       );
//     }
//   }
// }));


















// // src/api/cart/controllers/cart.js

// "use strict";

// const { createCoreController } = require("@strapi/strapi").factories;
// const { ValidationError, NotFoundError } = require("@strapi/utils").errors;

// // Helper function to handle and format errors
// const handleErrors = (error) => {
//   console.error("Error occurred:", error);
//   const errorMessage = String(error.message || "");

//   if (error instanceof ValidationError) {
//     return { message: errorMessage };
//   }
//   if (error instanceof NotFoundError) {
//     return { message: errorMessage };
//   }
//   if (errorMessage.includes("out of stock or insufficient quantity")) {
//     return { message: errorMessage };
//   }
//   if (errorMessage.includes("Product not found in cart for this user.")) {
//     return { message: errorMessage };
//   }
//   if (errorMessage.includes("Product variant not found in cart for this user.")) {
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
//   if (errorMessage.includes("product variant is currently not active")) {
//     return { message: errorMessage };
//   }
//   if (errorMessage.includes("Cannot read properties of undefined")) {
//     return { message: "Invalid data structure encountered. Please refresh and try again." };
//   }
//   if (errorMessage.includes("User not authenticated")) {
//     return { message: "User authentication required." };
//   }
//   if (errorMessage.includes("Invalid Product Variant ID")) {
//     return { message: "Invalid product variant ID provided." };
//   }
//   if (errorMessage.includes("Product variant not found")) {
//     return { message: "Product variant not found." };
//   }
//   return { message: "An unexpected error occurred." };
// };

// // Helper function to map error messages to status codes
// const handleStatusCode = (error) => {
//   if (error instanceof ValidationError) return 400;
//   if (error instanceof NotFoundError) return 404;
//   if (String(error.message || "").includes("out of stock or insufficient quantity")) {
//     return 400;
//   }
//   if (String(error.message || "").includes("Product not found in cart for this user.")) {
//     return 404;
//   }
//   if (String(error.message || "").includes("Product variant not found in cart for this user.")) {
//     return 404;
//   }
//   if (String(error.message || "").includes("product variant is currently not active")) {
//     return 400;
//   }
//   if (String(error.message || "").includes("User not authenticated")) {
//     return 401;
//   }
//   if (String(error.message || "").includes("Invalid Product Variant ID")) {
//     return 400;
//   }
//   if (String(error.message || "").includes("Product variant not found")) {
//     return 404;
//   }
//   if (String(error.message || "").includes("Cannot read properties of undefined")) {
//     return 500;
//   }
//   if (String(error.message || "").includes("Cart is already empty for this user.")) {
//     return 200;
//   }
//   if (String(error.message || "").includes("User does not have a cart yet.")) {
//     return 200;
//   }
//   return 500;
// };

// // Helper function to validate request body fields
// const validateBodyRequiredFields = (body, fields) => {
//   const missingFields = fields.filter(field => !body[field]);
//   if (missingFields.length > 0) {
//     throw new ValidationError(`Missing required fields: ${missingFields.join(', ')}`);
//   }
// };

// // Helper to get a product variant and its master product
// const getProductVariant = async (variantId, strapi) => {
//   try {
//     if (!variantId || isNaN(parseInt(variantId))) {
//       throw new ValidationError("Invalid Product Variant ID provided.");
//     }

//     const productVariant = await strapi.db.query("api::product-variant.product-variant").findOne({
//       where: { id: variantId },
//       populate: {
//         product: {
//           select: ["id", "name", "price", "offers", "offerPrice", "locale"],
//           populate: {
//             localizations: {
//               select: ["id", "locale"]
//             },
//             image: {
//               select: ["url", "name", "alternativeText"]
//             }
//           }
//         }
//       }
//     });

//     if (!productVariant) {
//       throw new NotFoundError("Product variant not found.");
//     }

//     if (!productVariant.product) {
//       throw new ValidationError("Product variant is missing master product reference.");
//     }
    
//     // Calculate combined stock based on all variants of the master product
//     const masterProduct = productVariant.product;
//     const allVariants = await strapi.db.query("api::product-variant.product-variant").findMany({
//       where: { product: masterProduct.id },
//       select: ["id", "stock", "isActive", "inStock"]
//     });

//     if (!allVariants || allVariants.length === 0) {
//       throw new ValidationError("No variants found for this product.");
//     }

//     const totalStock = allVariants.reduce((sum, variant) => {
//       const stock = typeof variant.stock === 'number' ? variant.stock : 0;
//       return sum + stock;
//     }, 0);
    
//     const hasActiveVariant = allVariants.some(variant => 
//       variant.isActive && variant.inStock && (variant.stock || 0) > 0
//     );

//     return {
//       productVariant,
//       masterProduct,
//       allVariants,
//       totalStock,
//       hasActiveVariant
//     };
//   } catch (error) {
//     console.error("Error in getProductVariant:", error);
//     throw error;
//   }
// };

// // Helper to get all cart items for a given master product
// const getAllCartItemsForProduct = async (userId, masterProductId, strapi) => {
//   try {
//     if (!userId || !masterProductId) {
//       throw new ValidationError("User ID and Master Product ID are required.");
//     }

//     const allVariants = await strapi.db.query("api::product-variant.product-variant").findMany({
//       where: { product: masterProductId },
//       select: ["id"]
//     });
    
//     if (!allVariants || allVariants.length === 0) {
//       console.warn(`No variants found for master product ${masterProductId}`);
//       return {
//         cartItems: [],
//         totalQuantityInCart: 0,
//         allVariantIds: []
//       };
//     }

//     const allVariantIds = allVariants.map(variant => variant.id).filter(id => id);

//     // FIX: Change to use nested object for relational query
//     const cartItems = await strapi.db.query("api::cart.cart").findMany({
//       where: {
//         user: userId,
//         product_variant: { id: { $in: allVariantIds } }
//       },
//       populate: {
//         product_variant: {
//           select: ["id", "stock", "isActive", "inStock"]
//         }
//       }
//     });
    
//     const validCartItems = cartItems.filter(item => 
//       item && item.product_variant && typeof item.quantity === 'number'
//     );

//     const totalQuantityInCart = validCartItems.reduce((sum, item) => {
//       return sum + (item.quantity || 0);
//     }, 0);

//     return {
//       cartItems: validCartItems,
//       totalQuantityInCart,
//       allVariantIds
//     };
//   } catch (error) {
//     console.error("Error in getAllCartItemsForProduct:", error);
//     throw error;
//   }
// };

// module.exports = createCoreController("api::cart.cart", ({ strapi }) => ({

//   // MARK: GetCart
// async getMyCart(ctx) {
//   try {
//     // Get the user from the JWT token
//     const user = ctx.state.user;
//     if (!user) {
//       return ctx.unauthorized("Authentication required.");
//     }
//     const userId = user.id;

//     // Fetch cart items for the user, populating the necessary relations
//     const cartItems = await strapi.db.query("api::cart.cart").findMany({
//       where: { user: userId },
//       populate: {
//         product_variant: {
//           populate: {
//             product: {
//               // Corrected 'offerPrice' to 'offer_price' to match your schema
//               select: ["id", "name", "price", "offers", "offer_price", "locale"],
//               populate: {
//                 image: {
//                   select: ["url", "name", "alternativeText"],
//                 },
//                 localizations: {
//                   select: ["id", "locale"],
//                 },
//               },
//             },
//             color_picker: true,
//             frame_size: true,
//           },
//         },
//       },
//     });

//     // Handle the case where the cart is empty
//     if (!cartItems || cartItems.length === 0) {
//       return ctx.send({
//         success: true,
//         message: "User does not have a cart yet or cart is empty.",
//         cart_items: [],
//         total_items: 0,
//       });
//     }

//     // Cache to store combined stock for each product to avoid redundant queries
//     const productCombinedStockCache = new Map();

//     // Format the data to match the desired output structure precisely
//     const formattedCartItems = await Promise.all(cartItems.map(async (item) => {
//       const variant = item.product_variant;
//       const masterProduct = variant?.product;

//       if (!masterProduct) {
//           // Handle cases where product or variant data is missing
//           console.warn(`Cart item ${item.id} has missing product data and will be skipped.`);
//           return null;
//       }

//       let combinedStock = 0;
//       // Check if combined stock for this product has already been calculated
//       if (productCombinedStockCache.has(masterProduct.id)) {
//           combinedStock = productCombinedStockCache.get(masterProduct.id);
//       } else {
//           // If not, fetch all variants for the master product and calculate the total stock
//           const allProductVariants = await strapi.entityService.findMany(
//               "api::product-variant.product-variant", {
//               filters: {
//                   product: { id: masterProduct.id },
//                   isActive: true,
//                   stock: { $gt: 0 },
//               },
//               fields: ["stock"]
//           });
          
//           combinedStock = allProductVariants.reduce((sum, v) => sum + v.stock, 0);
//           productCombinedStockCache.set(masterProduct.id, combinedStock);
//       }

//       const productDetails = {
//         ...masterProduct,
//         offerPrice: masterProduct.offer_price, // Use 'offer_price' from the query
//         combinedStock: combinedStock // Add the newly calculated combined stock
//       };
//       // Clean up the offer_price key to avoid redundancy
//       delete productDetails.offer_price;

//       const formattedVariant = {
//         id: variant.id,
//         createdAt: variant.createdAt,
//         updatedAt: variant.updatedAt,
//         stock: variant.stock, // This is the stock for the specific variant
//         isActive: variant.isActive,
//         inStock: variant.inStock,
//         salesCount: variant.salesCount,
//         color_picker: variant.color_picker,
//         product: productDetails,
//         frame_size: variant.frame_size,
//       };

//       return {
//         id: item.id,
//         quantity: item.quantity,
//         createdAt: item.createdAt,
//         updatedAt: item.updatedAt,
//         product_variant: formattedVariant,
//       };
//     }));

//     // Filter out any null values that were returned for invalid cart items
//     const validFormattedCartItems = formattedCartItems.filter(item => item !== null);

//     // Send the formatted response
//     return ctx.send({
//       success: true,
//       message: "Cart retrieved successfully",
//       cart_items: validFormattedCartItems,
//       total_items: validFormattedCartItems.length,
//     });
//   } catch (err) {
//     console.error("Error in getMyCart:", err);
//     // In a production environment, you might want a more generic error message
//     return ctx.internalServerError("An internal server error occurred.");
//   }
// },
//   // MARK: Add Product Variant to Cart
//   async addProductToCart(ctx) {
//     try {
//       const { id: userId } = ctx.state.user;
      
//       if (!userId) {
//         throw new ValidationError("User not authenticated.");
//       }

//       const requestBody = ctx.request.body || {};
//       const { variantId, quantity } = requestBody.data || requestBody;

//       validateBodyRequiredFields(requestBody.data || requestBody, ["variantId", "quantity"]);

//       if (quantity === 0) {
//         throw new ValidationError("Quantity cannot be zero.");
//       }

//       if (!Number.isInteger(quantity)) {
//         throw new ValidationError("Quantity must be a whole number.");
//       }

//       const { productVariant, masterProduct, totalStock, hasActiveVariant } = await getProductVariant(variantId, strapi);

//       // Comprehensive validation checks
//       if (!hasActiveVariant) {
//         throw new ValidationError("This product variant is currently not active or out of stock.");
//       }

//       if (!productVariant.isActive || !productVariant.inStock || (productVariant.stock || 0) < 1) {
//         throw new ValidationError("This specific product variant is currently not active or out of stock.");
//       }
      
//       const { cartItems, totalQuantityInCart } = await getAllCartItemsForProduct(userId, masterProduct.id, strapi);
      
//       const currentCartEntry = cartItems.find(item => 
//         item.product_variant && item.product_variant.id === parseInt(variantId)
//       );
//       const currentQuantityForThisVariant = currentCartEntry ? currentCartEntry.quantity : 0;
      
//       const newTotalQuantityAcrossAllVariants = totalQuantityInCart + quantity;
//       const newQuantityForThisVariant = currentQuantityForThisVariant + quantity;
      
//       // Handle decrement logic
//       if (quantity < 0) {
//         if (!currentCartEntry) {
//           throw new NotFoundError("Product variant not found in cart for this user to decrement.");
//         }
//         if (newQuantityForThisVariant < 0) {
//           throw new ValidationError("Cannot decrement quantity below zero.");
//         }
//         if (newQuantityForThisVariant === 0) {
//           await strapi.db.query("api::cart.cart").delete({
//             where: { id: currentCartEntry.id }
//           });
//           return ctx.send({
//             success: true,
//             message: "Product quantity decreased to zero and removed from cart.",
//             data: {
//               product_id: masterProduct.id, 
//               variant_id: parseInt(variantId), 
//               user_id: userId
//             }
//           });
//         }
//       } 
//       // Handle increment logic with comprehensive stock validation
//       else {
//         // Check combined stock across all variants
//         if (newTotalQuantityAcrossAllVariants > totalStock) {
//           const availableStock = totalStock - (totalQuantityInCart - currentQuantityForThisVariant);
//           throw new ValidationError(
//             `Product ${masterProduct.name} has insufficient combined stock. Available: ${availableStock}, Requested: ${quantity}.`
//           );
//         }
        
//         // Check individual variant stock
//         if (newQuantityForThisVariant > (productVariant.stock || 0)) {
//           const availableForThisVariant = (productVariant.stock || 0) - currentQuantityForThisVariant;
//           throw new ValidationError(
//             `This product variant has insufficient stock. Available: ${availableForThisVariant}, Requested: ${quantity}.`
//           );
//         }
//       }
      
//       let updatedCartEntry;
//       let message = "";
      
//       if (!currentCartEntry) {
//         // FIX: Use the explicit ID to create the relation
//         updatedCartEntry = await strapi.db.query("api::cart.cart").create({
//           data: { 
//             user: userId, 
//             product_variant: parseInt(variantId), 
//             quantity: quantity 
//           },
//           populate: { 
//             product_variant: { 
//               populate: {
//                 product: {
//                   select: ["id", "name", "price", "offers", "offerPrice"],
//                   populate: { 
//                     image: { 
//                       select: ["url"] 
//                     } 
//                   }
//                 },
//                 color_picker: true
//               }
//             } 
//           }
//         });
//         message = "Product added to cart.";
//       } else {
//         updatedCartEntry = await strapi.db.query("api::cart.cart").update({
//           where: { id: currentCartEntry.id },
//           data: { quantity: newQuantityForThisVariant },
//           populate: { 
//             product_variant: { 
//               populate: {
//                 product: {
//                   select: ["id", "name", "price", "offers", "offerPrice"],
//                   populate: { 
//                     image: { 
//                       select: ["url"] 
//                     } 
//                   }
//                 },
//                 color_picker: true
//               }
//             } 
//           }
//         });
//         message = quantity > 0 ? "Product quantity updated in cart." : "Product quantity decreased in cart.";
//       }
      
//       return ctx.send({
//         success: true,
//         message: message,
//         data: {
//           id: updatedCartEntry.id,
//           quantity: updatedCartEntry.quantity,
//           createdAt: updatedCartEntry.createdAt,
//           updatedAt: updatedCartEntry.updatedAt,
//           product_variant: {
//             ...updatedCartEntry.product_variant,
//             // Add the stock, combined_stock_available, and available_stock fields
//             stock: updatedCartEntry.product_variant.stock,
//             available_stock: updatedCartEntry.product_variant.stock - updatedCartEntry.quantity,
//             product: {
//               ...updatedCartEntry.product_variant.product,
//               offerPrice: updatedCartEntry.product_variant.product.offerPrice
//             },
//           },
//           combined_stock_available: totalStock,
//           total_quantity_in_cart_all_variants: newTotalQuantityAcrossAllVariants,
//           is_combined_product: totalStock > (productVariant.stock || 0)
//         }
//       });
//     } catch (error) {
//       console.error("Error in addProductToCart:", error);
//       const customizedError = handleErrors(error);
//       return ctx.send(
//         { success: false, message: customizedError.message },
//         handleStatusCode(error) || 500
//       );
//     }
//   },

//   // MARK: Remove Product Variant From Cart
//   async removeProductFromCart(ctx) {
//     try {
//       const { id: userId } = ctx.state.user;
//       if (!userId) {
//         throw new ValidationError("User not authenticated.");
//       }

//       const { variantId } = ctx.params;
//       const parsedVariantId = parseInt(variantId, 10);

//       if (isNaN(parsedVariantId)) {
//         throw new ValidationError("Invalid Product Variant ID provided in URL. Must be a number.");
//       }

//       // FIX: Use nested object for relational query
//       const cartEntry = await strapi.db.query("api::cart.cart").findOne({
//         where: { 
//           user: userId, 
//           product_variant: { id: parsedVariantId } 
//         }
//       });

//       if (!cartEntry) {
//         throw new NotFoundError("Product variant not found in cart for this user.");
//       }

//       await strapi.db.query("api::cart.cart").delete({
//         where: { id: cartEntry.id }
//       });

//       return ctx.send({
//         success: true,
//         message: "Product variant removed from cart.",
//         data: {
//           product_variant_id: parsedVariantId, 
//           user_id: userId
//         }
//       });

//     } catch (error) {
//       console.error("Error in removeProductFromCart:", error);
//       const customizedError = handleErrors(error);
//       return ctx.send(
//         { success: false, message: customizedError.message },
//         handleStatusCode(error) || 500
//       );
//     }
//   },

//   // MARK: Clear entire cart
//   async clearCart(ctx) {
//     try {
//       const { id: userId } = ctx.state.user;

//       if (!userId) {
//         throw new ValidationError("User not authenticated.");
//       }

//       const cartEntries = await strapi.db.query("api::cart.cart").findMany({
//         where: { user: userId }
//       });

//       if (!cartEntries || cartEntries.length === 0) {
//         return ctx.send({
//           success: true,
//           message: "Cart is already empty for this user.",
//           data: {
//             user_id: userId
//           }
//         });
//       }

//       await strapi.db.query("api::cart.cart").deleteMany({
//         where: { user: userId }
//       });

//       return ctx.send({
//         success: true,
//         message: "Cart cleared successfully.",
//         data: {
//           user_id: userId,
//           items_removed: cartEntries.length
//         }
//       });

//     } catch (error) {
//       console.t('Error in clearCart:', error);
//       const customizedError = handleErrors(error);
//       return ctx.send(
//         { success: false, message: customizedError.message },
//         handleStatusCode(error) || 500
//       );
//     }
//   },

//   // MARK: Get cart summary with combined stock info
//   async getCartSummary(ctx) {
//     try {
//       const { id: userId } = ctx.state.user;

//       if (!userId) {
//         throw new ValidationError("User not authenticated.");
//       }

//       const cart = await strapi.db.query("api::cart.cart").findMany({
//         where: { user: userId },
//         populate: {
//           product_variant: {
//             select: ["id", "stock", "inStock", "isActive"],
//             populate: {
//               product: {
//                 select: ["id", "name", "price", "offers", "offerPrice", "locale"],
//                 populate: {
//                   localizations: { 
//                     select: ["id", "locale"] 
//                   }
//                 }
//               }
//             }
//           }
//         }
//       });

//       if (!cart || cart.length === 0) {
//         return ctx.send({
//           success: true,
//           message: "Cart is empty.",
//           data: {
//             total_items: 0,
//             total_unique_products: 0,
//             estimated_total: 0,
//             items_by_locale: {},
//             invalid_items: []
//           }
//         });
//       }

//       let totalItems = 0;
//       let estimatedTotal = 0;
//       const itemsByLocale = {};
//       const uniqueProducts = new Set();
//       const invalidItems = [];

//       cart.forEach((item, index) => {
//         try {
//           // Validate cart item structure
//           if (!item || typeof item.quantity !== 'number') {
//             console.warn(`Invalid cart item at index ${index}:`, item);
//             invalidItems.push({
//               cart_item_id: item?.id || `index_${index}`,
//               error: "Invalid cart item structure - missing or invalid quantity"
//             });
//             return;
//           }

//           // Validate product variant exists and is populated
//           if (!item.product_variant) {
//             console.warn(`Cart item ${item.id} missing product_variant:`, item);
//             invalidItems.push({
//               cart_item_id: item.id,
//               error: "Product variant not found or not properly populated"
//             });
//             return;
//           }

//           // Validate master product exists
//           if (!item.product_variant.product) {
//             console.warn(`Cart item ${item.id} missing master product:`, item.product_variant);
//             invalidItems.push({
//               cart_item_id: item.id,
//               variant_id: item.product_variant.id,
//               error: "Master product not found or not properly populated"
//             });
//             return;
//           }

//           const masterProduct = item.product_variant.product;
          
//           // Validate required product fields
//           if (!masterProduct.id || !masterProduct.name || typeof masterProduct.price !== 'number') {
//             console.warn(`Cart item ${item.id} has invalid master product data:`, masterProduct);
//             invalidItems.push({
//               cart_item_id: item.id,
//               variant_id: item.product_variant.id,
//               product_id: masterProduct.id,
//               error: "Master product missing required fields (id, name, or price)"
//             });
//             return;
//           }

//           // Calculate totals for valid items
//           totalItems += item.quantity;
          
//           const effectivePrice = masterProduct.offers && typeof masterProduct.offerPrice === 'number'
//             ? masterProduct.offerPrice
//             : masterProduct.price;
            
//           estimatedTotal += effectivePrice * item.quantity;

//           const locale = masterProduct.locale || 'default';
//           if (!itemsByLocale[locale]) {
//             itemsByLocale[locale] = [];
//           }
          
//           itemsByLocale[locale].push({
//             cart_item_id: item.id,
//             product_variant_id: item.product_variant.id,
//             product_id: masterProduct.id,
//             product_name: masterProduct.name,
//             quantity: item.quantity,
//             unit_price: masterProduct.price,
//             effective_price: effectivePrice,
//             has_offer: Boolean(masterProduct.offers && masterProduct.offerPrice),
//             subtotal: effectivePrice * item.quantity
//           });

//           // Track unique products using the master product ID
//           uniqueProducts.add(masterProduct.id);
          
//         } catch (itemError) {
//           console.error(`Error processing cart item ${item?.id || index}:`, itemError);
//           invalidItems.push({
//             cart_item_id: item?.id || `index_${index}`,
//             error: `Processing error: ${itemError.message}`
//           });
//         }
//       });

//       const response = {
//         success: true,
//         message: invalidItems.length > 0 
//           ? `Cart summary retrieved with ${invalidItems.length} invalid items found.`
//           : "Cart summary retrieved successfully.",
//         data: {
//           total_items: totalItems, 
//           total_unique_products: uniqueProducts.size, 
//           estimated_total: Math.round(estimatedTotal * 100) / 100, 
//           items_by_locale: itemsByLocale, 
//           invalid_items: invalidItems 
//         }
//       };

//       // If there are invalid items, log them for debugging
//       if (invalidItems.length > 0) {
//         console.warn(`Found ${invalidItems.length} invalid cart items for user ${userId}:`, invalidItems);
//       }

//       return ctx.send(response);
      
//     } catch (error) {
//       console.error("Error in getCartSummary:", error);
//       const customizedError = handleErrors(error);
//       return ctx.send(
//         { success: false, message: customizedError.message },
//         handleStatusCode(error) || 500
//       );
//     }
//   }
// }));






// "use strict";

// const { createCoreController } = require("@strapi/strapi").factories;
// const { ValidationError, NotFoundError } = require("@strapi/utils").errors;

// // Helper function to handle and format errors
// const handleErrors = (error) => {
//   console.error("Error occurred:", error);
//   const errorMessage = String(error.message || "");

//   if (error instanceof ValidationError) {
//     return { message: errorMessage };
//   }
//   if (error instanceof NotFoundError) {
//     return { message: errorMessage };
//   }
//   if (errorMessage.includes("out of stock or insufficient quantity")) {
//     return { message: errorMessage };
//   }
//   if (errorMessage.includes("Product not found in cart for this user.")) {
//     return { message: errorMessage };
//   }
//   if (errorMessage.includes("Product variant not found in cart for this user.")) {
//     return { message: errorMessage };
//   }
//   if (errorMessage.includes("Cart is already empty for this user.")) {
//     return { message: errorMessage };
//   }
//   if (errorMessage.includes("User does not have a cart yet.")) {
//     return { message: errorMessage };
//   }
//   if (errorMessage.includes("product is currently not active")) {
//     return { message: errorMessage };
//   }
//   if (errorMessage.includes("product variant is currently not active")) {
//     return { message: errorMessage };
//   }
//   if (errorMessage.includes("Cannot read properties of undefined")) {
//     return { message: "Invalid data structure encountered. Please refresh and try again." };
//   }
//   if (errorMessage.includes("User not authenticated")) {
//     return { message: "User authentication required." };
//   }
//   if (errorMessage.includes("Invalid Product Variant ID")) {
//     return { message: "Invalid product variant ID provided." };
//   }
//   if (errorMessage.includes("Product variant not found")) {
//     return { message: "Product variant not found." };
//   }
//   return { message: "An unexpected error occurred." };
// };

// // Helper function to map error messages to status codes
// const handleStatusCode = (error) => {
//   if (error instanceof ValidationError) return 400;
//   if (error instanceof NotFoundError) return 404;
//   if (String(error.message || "").includes("out of stock or insufficient quantity")) {
//     return 400;
//   }
//   if (String(error.message || "").includes("Product not found in cart for this user.")) {
//     return 404;
//   }
//   if (String(error.message || "").includes("Product variant not found in cart for this user.")) {
//     return 404;
//   }
//   if (String(error.message || "").includes("product variant is currently not active")) {
//     return 400;
//   }
//   if (String(error.message || "").includes("User not authenticated")) {
//     return 401;
//   }
//   if (String(error.message || "").includes("Invalid Product Variant ID")) {
//     return 400;
//   }
//   if (String(error.message || "").includes("Product variant not found")) {
//     return 404;
//   }
//   if (String(error.message || "").includes("Cannot read properties of undefined")) {
//     return 500;
//   }
//   if (String(error.message || "").includes("Cart is already empty for this user.")) {
//     return 200;
//   }
//   if (String(error.message || "").includes("User does not have a cart yet.")) {
//     return 200;
//   }
//   return 500;
// };

// // Helper function to validate request body fields
// const validateBodyRequiredFields = (body, fields) => {
//   const missingFields = fields.filter(field => !body[field]);
//   if (missingFields.length > 0) {
//     throw new ValidationError(`Missing required fields: ${missingFields.join(', ')}`);
//   }
// };

// // Helper to get a product variant and its master product
// const getProductVariant = async (variantId, strapi) => {
//   try {
//     if (!variantId || isNaN(parseInt(variantId))) {
//       throw new ValidationError("Invalid Product Variant ID provided.");
//     }

//     const productVariant = await strapi.db.query("api::product-variant.product-variant").findOne({
//       where: { id: variantId },
//       populate: {
//         product: {
//           select: ["id", "name", "price", "offers", "offerPrice", "locale"],
//           populate: {
//             localizations: {
//               select: ["id", "locale"]
//             },
//             image: {
//               select: ["url", "name", "alternativeText"]
//             }
//           }
//         }
//       }
//     });

//     if (!productVariant) {
//       throw new NotFoundError("Product variant not found.");
//     }

//     if (!productVariant.product) {
//       throw new ValidationError("Product variant is missing master product reference.");
//     }
//     
//     // Calculate combined stock based on all variants of the master product
//     const masterProduct = productVariant.product;
//     const allVariants = await strapi.db.query("api::product-variant.product-variant").findMany({
//       where: { product: masterProduct.id },
//       select: ["id", "stock", "isActive", "inStock"]
//     });

//     if (!allVariants || allVariants.length === 0) {
//       throw new ValidationError("No variants found for this product.");
//     }

//     const totalStock = allVariants.reduce((sum, variant) => {
//       const stock = typeof variant.stock === 'number' ? variant.stock : 0;
//       return sum + stock;
//     }, 0);
//     
//     const hasActiveVariant = allVariants.some(variant => 
//       variant.isActive && variant.inStock && (variant.stock || 0) > 0
//     );

//     return {
//       productVariant,
//       masterProduct,
//       allVariants,
//       totalStock,
//       hasActiveVariant
//     };
//   } catch (error) {
//     console.error("Error in getProductVariant:", error);
//     throw error;
//   }
// };

// // Helper to get all cart items for a given master product
// const getAllCartItemsForProduct = async (userId, masterProductId, strapi) => {
//   try {
//     if (!userId || !masterProductId) {
//       throw new ValidationError("User ID and Master Product ID are required.");
//     }

//     const allVariants = await strapi.db.query("api::product-variant.product-variant").findMany({
//       where: { product: masterProductId },
//       select: ["id"]
//     });
//     
//     if (!allVariants || allVariants.length === 0) {
//       console.warn(`No variants found for master product ${masterProductId}`);
//       return {
//         cartItems: [],
//         totalQuantityInCart: 0,
//         allVariantIds: []
//       };
//     }

//     const allVariantIds = allVariants.map(variant => variant.id).filter(id => id);

//     // FIX: Change to use nested object for relational query
//     const cartItems = await strapi.db.query("api::cart.cart").findMany({
//       where: {
//         user: userId,
//         product_variant: { id: { $in: allVariantIds } }
//       },
//       populate: {
//         product_variant: {
//           select: ["id", "stock", "isActive", "inStock"]
//         }
//       }
//     });
//     
//     const validCartItems = cartItems.filter(item => 
//       item && item.product_variant && typeof item.quantity === 'number'
//     );

//     const totalQuantityInCart = validCartItems.reduce((sum, item) => {
//       return sum + (item.quantity || 0);
//     }, 0);

//     return {
//       cartItems: validCartItems,
//       totalQuantityInCart,
//       allVariantIds
//     };
//   } catch (error) {
//     console.error("Error in getAllCartItemsForProduct:", error);
//     throw error;
//   }
// };

// module.exports = createCoreController("api::cart.cart", ({ strapi }) => ({

//   // MARK: GetCart
// async getMyCart(ctx) {
//     try {
//       // Get the user from the JWT token
//       const user = ctx.state.user;
//       if (!user) {
//         return ctx.unauthorized("Authentication required.");
//       }
//       const userId = user.id;

//       // Fetch cart items for the user, populating the necessary relations
//       const cartItems = await strapi.db.query("api::cart.cart").findMany({
//         where: { user: userId },
//         populate: {
//           product_variant: {
//             populate: {
//               product: {
//                 // Corrected 'offerPrice' to 'offer_price' to match your schema
//                 select: ["id", "name", "price", "offers", "offer_price", "locale"],
//                 populate: {
//                   image: {
//                     select: ["url", "name", "alternativeText"],
//                   },
//                   localizations: {
//                     select: ["id", "locale"],
//                   },
//                 },
//               },
//               color_picker: true,
//               frame_size: true,
//             },
//           },
//         },
//       });

//       // Handle the case where the cart is empty
//       if (!cartItems || cartItems.length === 0) {
//         return ctx.send({
//           success: true,
//           message: "User does not have a cart yet or cart is empty.",
//           cart_items: [],
//           total_items: 0,
//         });
//       }

//       // Format the data to match the desired output structure precisely
//       const formattedCartItems = cartItems.map((item) => {
//         const variant = item.product_variant;
//         const productDetails = variant?.product ? {
//           id: variant.product.id,
//           name: variant.product.name,
//           price: variant.product.price,
//           offers: variant.product.offers,
//           offerPrice: variant.product.offer_price, // Use 'offer_price' from the query
//           locale: variant.product.locale,
//           image: variant.product.image,
//           localizations: variant.product.localizations,
//         } : null;

//         const formattedVariant = {
//           id: variant.id,
//           createdAt: variant.createdAt,
//           updatedAt: variant.updatedAt,
//           stock: variant.stock,
//           isActive: variant.isActive,
//           inStock: variant.inStock,
//           salesCount: variant.salesCount,
//           color_picker: variant.color_picker, // Keep this as the object
//           product: productDetails,
//           frame_size: variant.frame_size,
//         };

//         return {
//           id: item.id,
//           quantity: item.quantity,
//           createdAt: item.createdAt,
//           updatedAt: item.updatedAt,
//           product_variant: formattedVariant,
//         };
//       });

//       // Send the formatted response
//       return ctx.send({
//         success: true,
//         message: "Cart retrieved successfully",
//         cart_items: formattedCartItems,
//         total_items: formattedCartItems.length,
//       });
//     } catch (err) {
//       console.error("Error in getMyCart:", err);
//       // In a production environment, you might want a more generic error message
//       return ctx.internalServerError("An internal server error occurred.");
//     }
//   },
//   // MARK: Add Product Variant to Cart
//   async addProductToCart(ctx) {
//     try {
//       const { id: userId } = ctx.state.user;
//       
//       if (!userId) {
//         throw new ValidationError("User not authenticated.");
//       }

//       const requestBody = ctx.request.body || {};
//       const { variantId, quantity } = requestBody.data || requestBody;

//       validateBodyRequiredFields(requestBody.data || requestBody, ["variantId", "quantity"]);

//       if (quantity === 0) {
//         throw new ValidationError("Quantity cannot be zero.");
//       }

//       if (!Number.isInteger(quantity)) {
//         throw new ValidationError("Quantity must be a whole number.");
//       }

//       const { productVariant, masterProduct, totalStock, hasActiveVariant } = await getProductVariant(variantId, strapi);

//       // Comprehensive validation checks
//       if (!hasActiveVariant) {
//         throw new ValidationError("This product variant is currently not active or out of stock.");
//       }

//       if (!productVariant.isActive || !productVariant.inStock || (productVariant.stock || 0) < 1) {
//         throw new ValidationError("This specific product variant is currently not active or out of stock.");
//       }
//       
//       const { cartItems, totalQuantityInCart } = await getAllCartItemsForProduct(userId, masterProduct.id, strapi);
//       
//       const currentCartEntry = cartItems.find(item => 
//         item.product_variant && item.product_variant.id === parseInt(variantId)
//       );
//       const currentQuantityForThisVariant = currentCartEntry ? currentCartEntry.quantity : 0;
//       
//       const newTotalQuantityAcrossAllVariants = totalQuantityInCart + quantity;
//       const newQuantityForThisVariant = currentQuantityForThisVariant + quantity;
//       
//       // Handle decrement logic
//       if (quantity < 0) {
//         if (!currentCartEntry) {
//           throw new NotFoundError("Product variant not found in cart for this user to decrement.");
//         }
//         if (newQuantityForThisVariant < 0) {
//           throw new ValidationError("Cannot decrement quantity below zero.");
//         }
//         if (newQuantityForThisVariant === 0) {
//           await strapi.db.query("api::cart.cart").delete({
//             where: { id: currentCartEntry.id }
//           });
//           return ctx.send({
//             success: true,
//             message: "Product quantity decreased to zero and removed from cart.",
//             product_id: masterProduct.id, // Avoid data wrapping
//             variant_id: parseInt(variantId), // Avoid data wrapping
//             user_id: userId // Avoid data wrapping
//           });
//         }
//       } 
//       // Handle increment logic with comprehensive stock validation
//       else {
//         // Check combined stock across all variants
//         if (newTotalQuantityAcrossAllVariants > totalStock) {
//           const availableStock = totalStock - (totalQuantityInCart - currentQuantityForThisVariant);
//           throw new ValidationError(
//             `Product ${masterProduct.name} has insufficient combined stock. Available: ${availableStock}, Requested: ${quantity}.`
//           );
//         }
//         
//         // Check individual variant stock
//         if (newQuantityForThisVariant > (productVariant.stock || 0)) {
//           const availableForThisVariant = (productVariant.stock || 0) - currentQuantityForThisVariant;
//           throw new ValidationError(
//             `This product variant has insufficient stock. Available: ${availableForThisVariant}, Requested: ${quantity}.`
//           );
//         }
//       }
//       
//       let updatedCartEntry;
//       let message = "";
//       
//       if (!currentCartEntry) {
//         // FIX: Use the explicit ID to create the relation
//         updatedCartEntry = await strapi.db.query("api::cart.cart").create({
//           data: { 
//             user: userId, 
//             product_variant: parseInt(variantId), 
//             quantity: quantity 
//           },
//           populate: { 
//             product_variant: { 
//               populate: {
//                 product: {
//                   select: ["id", "name", "price", "offers", "offerPrice"],
//                   populate: { 
//                     image: { 
//                       select: ["url"] 
//                     } 
//                   }
//                 },
//                 color_picker: true
//               }
//             } 
//           }
//         });
//         message = "Product added to cart.";
//       } else {
//         updatedCartEntry = await strapi.db.query("api::cart.cart").update({
//           where: { id: currentCartEntry.id },
//           data: { quantity: newQuantityForThisVariant },
//           populate: { 
//             product_variant: { 
//               populate: {
//                 product: {
//                   select: ["id", "name", "price", "offers", "offerPrice"],
//                   populate: { 
//                     image: { 
//                       select: ["url"] 
//                     } 
//                   }
//                 },
//                 color_picker: true
//               }
//             } 
//           }
//         });
//         message = quantity > 0 ? "Product quantity updated in cart." : "Product quantity decreased in cart.";
//       }
//       
//       return ctx.send({
//         success: true,
//         message: message,
//         ...updatedCartEntry, // Avoid data wrapping
//         combined_stock_available: totalStock, // Avoid data wrapping
//         total_quantity_in_cart_all_variants: newTotalQuantityAcrossAllVariants, // Avoid data wrapping
//         is_combined_product: totalStock > (productVariant.stock || 0) // Avoid data wrapping
//       });
//     } catch (error) {
//       console.error("Error in addProductToCart:", error);
//       const customizedError = handleErrors(error);
//       return ctx.send(
//         { success: false, message: customizedError.message },
//         handleStatusCode(error) || 500
//       );
//     }
//   },

//   // MARK: Remove Product Variant From Cart
//   async removeProductFromCart(ctx) {
//     try {
//       const { id: userId } = ctx.state.user;
//       if (!userId) {
//         throw new ValidationError("User not authenticated.");
//       }

//       const { variantId } = ctx.params;
//       const parsedVariantId = parseInt(variantId, 10);

//       if (isNaN(parsedVariantId)) {
//         throw new ValidationError("Invalid Product Variant ID provided in URL. Must be a number.");
//       }

//       // FIX: Use nested object for relational query
//       const cartEntry = await strapi.db.query("api::cart.cart").findOne({
//         where: { 
//           user: userId, 
//           product_variant: { id: parsedVariantId } 
//         }
//       });

//       if (!cartEntry) {
//         throw new NotFoundError("Product variant not found in cart for this user.");
//       }

//       await strapi.db.query("api::cart.cart").delete({
//         where: { id: cartEntry.id }
//       });

//       return ctx.send({
//         success: true,
//         message: "Product variant removed from cart.",
//         product_variant_id: parsedVariantId, // Avoid data wrapping
//         user_id: userId, // Avoid data wrapping
//       });

//     } catch (error) {
//       console.error("Error in removeProductFromCart:", error);
//       const customizedError = handleErrors(error);
//       return ctx.send(
//         { success: false, message: customizedError.message },
//         handleStatusCode(error) || 500
//       );
//     }
//   },

//   // MARK: Clear entire cart
//   async clearCart(ctx) {
//     try {
//       const { id: userId } = ctx.state.user;

//       if (!userId) {
//         throw new ValidationError("User not authenticated.");
//       }

//       const cartEntries = await strapi.db.query("api::cart.cart").findMany({
//         where: { user: userId }
//       });

//       if (!cartEntries || cartEntries.length === 0) {
//         return ctx.send({
//           success: true,
//           message: "Cart is already empty for this user.",
//           user_id: userId // Avoid data wrapping
//         });
//       }

//       await strapi.db.query("api::cart.cart").deleteMany({
//         where: { user: userId }
//       });

//       return ctx.send({
//         success: true,
//         message: "Cart cleared successfully.",
//         user_id: userId, // Avoid data wrapping
//         items_removed: cartEntries.length // Avoid data wrapping
//       });

//     } catch (error) {
//       console.error("Error in clearCart:", error);
//       const customizedError = handleErrors(error);
//       return ctx.send(
//         { success: false, message: customizedError.message },
//         handleStatusCode(error) || 500
//       );
//     }
//   },

//   // MARK: Get cart summary with combined stock info
//   async getCartSummary(ctx) {
//     try {
//       const { id: userId } = ctx.state.user;

//       if (!userId) {
//         throw new ValidationError("User not authenticated.");
//       }

//       const cart = await strapi.db.query("api::cart.cart").findMany({
//         where: { user: userId },
//         populate: {
//           product_variant: {
//             select: ["id", "stock", "inStock", "isActive"],
//             populate: {
//               product: {
//                 select: ["id", "name", "price", "offers", "offerPrice", "locale"],
//                 populate: {
//                   localizations: { 
//                     select: ["id", "locale"] 
//                   }
//                 }
//               }
//             }
//           }
//         }
//       });

//       if (!cart || cart.length === 0) {
//         return ctx.send({
//           success: true,
//           message: "Cart is empty.",
//           total_items: 0, // Avoid data wrapping
//           total_unique_products: 0, // Avoid data wrapping
//           estimated_total: 0, // Avoid data wrapping
//           items_by_locale: {}, // Avoid data wrapping
//           invalid_items: [] // Avoid data wrapping
//         });
//       }

//       let totalItems = 0;
//       let estimatedTotal = 0;
//       const itemsByLocale = {};
//       const uniqueProducts = new Set();
//       const invalidItems = [];

//       cart.forEach((item, index) => {
//         try {
//           // Validate cart item structure
//           if (!item || typeof item.quantity !== 'number') {
//             console.warn(`Invalid cart item at index ${index}:`, item);
//             invalidItems.push({
//               cart_item_id: item?.id || `index_${index}`,
//               error: "Invalid cart item structure - missing or invalid quantity"
//             });
//             return;
//           }

//           // Validate product variant exists and is populated
//           if (!item.product_variant) {
//             console.warn(`Cart item ${item.id} missing product_variant:`, item);
//             invalidItems.push({
//               cart_item_id: item.id,
//               error: "Product variant not found or not properly populated"
//             });
//             return;
//           }

//           // Validate master product exists
//           if (!item.product_variant.product) {
//             console.warn(`Cart item ${item.id} missing master product:`, item.product_variant);
//             invalidItems.push({
//               cart_item_id: item.id,
//               variant_id: item.product_variant.id,
//               error: "Master product not found or not properly populated"
//             });
//             return;
//           }

//           const masterProduct = item.product_variant.product;
//           
//           // Validate required product fields
//           if (!masterProduct.id || !masterProduct.name || typeof masterProduct.price !== 'number') {
//             console.warn(`Cart item ${item.id} has invalid master product data:`, masterProduct);
//             invalidItems.push({
//               cart_item_id: item.id,
//               variant_id: item.product_variant.id,
//               product_id: masterProduct.id,
//               error: "Master product missing required fields (id, name, or price)"
//             });
//             return;
//           }

//           // Calculate totals for valid items
//           totalItems += item.quantity;
//           
//           const effectivePrice = masterProduct.offers && typeof masterProduct.offerPrice === 'number'
//             ? masterProduct.offerPrice
//             : masterProduct.price;
//             
//           estimatedTotal += effectivePrice * item.quantity;

//           const locale = masterProduct.locale || 'default';
//           if (!itemsByLocale[locale]) {
//             itemsByLocale[locale] = [];
//           }
//           
//           itemsByLocale[locale].push({
//             cart_item_id: item.id,
//             product_variant_id: item.product_variant.id,
//             product_id: masterProduct.id,
//             product_name: masterProduct.name,
//             quantity: item.quantity,
//             unit_price: masterProduct.price,
//             effective_price: effectivePrice,
//             has_offer: Boolean(masterProduct.offers && masterProduct.offerPrice),
//             subtotal: effectivePrice * item.quantity
//           });

//           // Track unique products using the master product ID
//           uniqueProducts.add(masterProduct.id);
//           
//         } catch (itemError) {
//           console.error(`Error processing cart item ${item?.id || index}:`, itemError);
//           invalidItems.push({
//             cart_item_id: item?.id || `index_${index}`,
//             error: `Processing error: ${itemError.message}`
//           });
//         }
//       });

//       const response = {
//         success: true,
//         message: invalidItems.length > 0 
//           ? `Cart summary retrieved with ${invalidItems.length} invalid items found.`
//           : "Cart summary retrieved successfully.",
//         total_items: totalItems, // Avoid data wrapping
//         total_unique_products: uniqueProducts.size, // Avoid data wrapping
//         estimated_total: Math.round(estimatedTotal * 100) / 100, // Avoid data wrapping
//         items_by_locale: itemsByLocale, // Avoid data wrapping
//         invalid_items: invalidItems // Avoid data wrapping
//       };

//       // If there are invalid items, log them for debugging
//       if (invalidItems.length > 0) {
//         console.warn(`Found ${invalidItems.length} invalid cart items for user ${userId}:`, invalidItems);
//       }

//       return ctx.send(response);
//       
//     } catch (error) {
//       console.error("Error in getCartSummary:", error);
//       const customizedError = handleErrors(error);
//       return ctx.send(
//         { success: false, message: customizedError.message },
//         handleStatusCode(error) || 500
//       );
//     }
//   }
// }));






// "use strict";

// const { createCoreController } = require("@strapi/strapi").factories;
// const { ValidationError, NotFoundError } = require("@strapi/utils").errors;

// // Helper function to handle and format errors
// const handleErrors = (error) => {
//   console.error("Error occurred:", error);
//   const errorMessage = String(error.message || "");

//   if (error instanceof ValidationError) {
//     return { message: errorMessage };
//   }
//   if (error instanceof NotFoundError) {
//     return { message: errorMessage };
//   }
//   if (errorMessage.includes("out of stock or insufficient quantity")) {
//     return { message: errorMessage };
//   }
//   if (errorMessage.includes("Product not found in cart for this user.")) {
//     return { message: errorMessage };
//   }
//   if (errorMessage.includes("Product variant not found in cart for this user.")) {
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
//   if (errorMessage.includes("product variant is currently not active")) {
//     return { message: errorMessage };
//   }
//   if (errorMessage.includes("Cannot read properties of undefined")) {
//     return { message: "Invalid data structure encountered. Please refresh and try again." };
//   }
//   if (errorMessage.includes("User not authenticated")) {
//     return { message: "User authentication required." };
//   }
//   if (errorMessage.includes("Invalid Product Variant ID")) {
//     return { message: "Invalid product variant ID provided." };
//   }
//   if (errorMessage.includes("Product variant not found")) {
//     return { message: "Product variant not found." };
//   }
//   return { message: "An unexpected error occurred." };
// };

// // Helper function to map error messages to status codes
// const handleStatusCode = (error) => {
//   if (error instanceof ValidationError) return 400;
//   if (error instanceof NotFoundError) return 404;
//   if (String(error.message || "").includes("out of stock or insufficient quantity")) {
//     return 400;
//   }
//   if (String(error.message || "").includes("Product not found in cart for this user.")) {
//     return 404;
//   }
//   if (String(error.message || "").includes("Product variant not found in cart for this user.")) {
//     return 404;
//   }
//   if (String(error.message || "").includes("product variant is currently not active")) {
//     return 400;
//   }
//   if (String(error.message || "").includes("User not authenticated")) {
//     return 401;
//   }
//   if (String(error.message || "").includes("Invalid Product Variant ID")) {
//     return 400;
//   }
//   if (String(error.message || "").includes("Product variant not found")) {
//     return 404;
//   }
//   if (String(error.message || "").includes("Cannot read properties of undefined")) {
//     return 500;
//   }
//   if (String(error.message || "").includes("Cart is already empty for this user.")) {
//     return 200;
//   }
//   if (String(error.message || "").includes("User does not have a cart yet.")) {
//     return 200;
//   }
//   return 500;
// };

// // Helper function to validate request body fields
// const validateBodyRequiredFields = (body, fields) => {
//   const missingFields = fields.filter(field => !body[field]);
//   if (missingFields.length > 0) {
//     throw new ValidationError(`Missing required fields: ${missingFields.join(', ')}`);
//   }
// };

// // Helper to get a product variant and its master product
// const getProductVariant = async (variantId, strapi) => {
//   try {
//     if (!variantId || isNaN(parseInt(variantId))) {
//       throw new ValidationError("Invalid Product Variant ID provided.");
//     }

//     const productVariant = await strapi.db.query("api::product-variant.product-variant").findOne({
//       where: { id: variantId },
//       populate: {
//         product: {
//           select: ["id", "name", "price", "offers", "offerPrice", "locale"],
//           populate: {
//             localizations: {
//               select: ["id", "locale"]
//             },
//             image: {
//               select: ["url", "name", "alternativeText"]
//             }
//           }
//         }
//       }
//     });

//     if (!productVariant) {
//       throw new NotFoundError("Product variant not found.");
//     }

//     if (!productVariant.product) {
//       throw new ValidationError("Product variant is missing master product reference.");
//     }
    
//     // Calculate combined stock based on all variants of the master product
//     const masterProduct = productVariant.product;
//     const allVariants = await strapi.db.query("api::product-variant.product-variant").findMany({
//       where: { product: masterProduct.id },
//       select: ["id", "stock", "isActive", "inStock"]
//     });

//     if (!allVariants || allVariants.length === 0) {
//       throw new ValidationError("No variants found for this product.");
//     }

//     const totalStock = allVariants.reduce((sum, variant) => {
//       const stock = typeof variant.stock === 'number' ? variant.stock : 0;
//       return sum + stock;
//     }, 0);
    
//     const hasActiveVariant = allVariants.some(variant => 
//       variant.isActive && variant.inStock && (variant.stock || 0) > 0
//     );

//     return {
//       productVariant,
//       masterProduct,
//       allVariants,
//       totalStock,
//       hasActiveVariant
//     };
//   } catch (error) {
//     console.error("Error in getProductVariant:", error);
//     throw error;
//   }
// };

// // Helper to get all cart items for a given master product
// const getAllCartItemsForProduct = async (userId, masterProductId, strapi) => {
//   try {
//     if (!userId || !masterProductId) {
//       throw new ValidationError("User ID and Master Product ID are required.");
//     }

//     const allVariants = await strapi.db.query("api::product-variant.product-variant").findMany({
//       where: { product: masterProductId },
//       select: ["id"]
//     });
    
//     if (!allVariants || allVariants.length === 0) {
//       console.warn(`No variants found for master product ${masterProductId}`);
//       return {
//         cartItems: [],
//         totalQuantityInCart: 0,
//         allVariantIds: []
//       };
//     }

//     const allVariantIds = allVariants.map(variant => variant.id).filter(id => id);

//     const cartItems = await strapi.db.query("api::cart.cart").findMany({
//       where: {
//         user: userId,
//         product_variant: { $in: allVariantIds }
//       },
//       populate: {
//         product_variant: {
//           select: ["id", "stock", "isActive", "inStock"]
//         }
//       }
//     });
    
//     const validCartItems = cartItems.filter(item => 
//       item && item.product_variant && typeof item.quantity === 'number'
//     );

//     const totalQuantityInCart = validCartItems.reduce((sum, item) => {
//       return sum + (item.quantity || 0);
//     }, 0);

//     return {
//       cartItems: validCartItems,
//       totalQuantityInCart,
//       allVariantIds
//     };
//   } catch (error) {
//     console.error("Error in getAllCartItemsForProduct:", error);
//     throw error;
//   }
// };

// module.exports = createCoreController("api::cart.cart", ({ strapi }) => ({
//   // MARK: GetCart
//   async getMyCart(ctx) {
//     try {
//       const { id: userId } = ctx.state.user;

//       if (!userId) {
//         throw new ValidationError("User not authenticated.");
//       }

//       const cart = await strapi.db.query("api::cart.cart").findMany({
//         where: { user: userId },
//         populate: {
//           product_variant: {
//             populate: {
//               product: {
//                 select: ["id", "name", "price", "offers", "offerPrice", "rating", "reviewCount", "locale"],
//                 populate: {
//                   image: {
//                     select: ["url", "name", "alternativeText"]
//                   },
//                   localizations: {
//                     select: ["id", "locale"]
//                   }
//                 }
//               },
//               color_picker: true,
//               frame_size: true
//             }
//           }
//         }
//       });

//       if (!cart || cart.length === 0) {
//         return ctx.send({
//           success: true,
//           message: "User does not have a cart yet or cart is empty.",
//           data: { cart_items: [], total_items: 0 }
//         });
//       }

//       // Consolidate product data and filter out invalid items
//       const enhancedCart = [];
//       const invalidItems = [];

//       cart.forEach((cartItem, index) => {
//         try {
//           if (!cartItem || typeof cartItem.quantity !== 'number') {
//             invalidItems.push({
//               cart_item_id: cartItem?.id || `index_${index}`,
//               error: "Invalid cart item structure"
//             });
//             return;
//           }

//           if (!cartItem.product_variant) {
//             invalidItems.push({
//               cart_item_id: cartItem.id,
//               error: "Product variant missing"
//             });
//             return;
//           }

//           const variant = cartItem.product_variant;
//           const masterProduct = variant.product;

//           if (!masterProduct) {
//             invalidItems.push({
//               cart_item_id: cartItem.id,
//               variant_id: variant.id,
//               error: "Master product missing"
//             });
//             return;
//           }

//           enhancedCart.push({
//             ...cartItem,
//             product: {
//               ...masterProduct,
//               variant: {
//                 ...variant,
//                 product: undefined // Remove duplicate product info
//               }
//             }
//           });
//         } catch (itemError) {
//           console.error(`Error processing cart item ${cartItem?.id}:`, itemError);
//           invalidItems.push({
//             cart_item_id: cartItem?.id || `index_${index}`,
//             error: itemError.message
//           });
//         }
//       });

//       const response = {
//         success: true,
//         message: invalidItems.length > 0 
//           ? `Cart retrieved with ${invalidItems.length} invalid items found.`
//           : "Cart retrieved successfully",
//         data: {
//           cart_items: enhancedCart,
//           total_items: enhancedCart.length,
//           ...(invalidItems.length > 0 && { invalid_items: invalidItems })
//         }
//       };

//       if (invalidItems.length > 0) {
//         console.warn(`Found ${invalidItems.length} invalid cart items for user ${userId}:`, invalidItems);
//       }

//       return ctx.send(response);
//     } catch (error) {
//       console.error("Error in getMyCart:", error);
//       const customizedError = handleErrors(error);
//       return ctx.send(
//         { success: false, message: customizedError.message },
//         handleStatusCode(error) || 500
//       );
//     }
//   },

//   // MARK: Add Product Variant to Cart
//   async addProductToCart(ctx) {
//     try {
//       const { id: userId } = ctx.state.user;
      
//       if (!userId) {
//         throw new ValidationError("User not authenticated.");
//       }

//       const requestBody = ctx.request.body || {};
//       const { variantId, quantity } = requestBody.data || requestBody;

//       validateBodyRequiredFields(requestBody.data || requestBody, ["variantId", "quantity"]);

//       if (quantity === 0) {
//         throw new ValidationError("Quantity cannot be zero.");
//       }

//       if (!Number.isInteger(quantity)) {
//         throw new ValidationError("Quantity must be a whole number.");
//       }

//       const { productVariant, masterProduct, totalStock, hasActiveVariant } = await getProductVariant(variantId, strapi);

//       // Comprehensive validation checks
//       if (!hasActiveVariant) {
//         throw new ValidationError("This product variant is currently not active or out of stock.");
//       }

//       if (!productVariant.isActive || !productVariant.inStock || (productVariant.stock || 0) < 1) {
//         throw new ValidationError("This specific product variant is currently not active or out of stock.");
//       }
      
//       const { cartItems, totalQuantityInCart } = await getAllCartItemsForProduct(userId, masterProduct.id, strapi);
      
//       const currentCartEntry = cartItems.find(item => 
//         item.product_variant && item.product_variant.id === parseInt(variantId)
//       );
//       const currentQuantityForThisVariant = currentCartEntry ? currentCartEntry.quantity : 0;
      
//       const newTotalQuantityAcrossAllVariants = totalQuantityInCart + quantity;
//       const newQuantityForThisVariant = currentQuantityForThisVariant + quantity;
      
//       // Handle decrement logic
//       if (quantity < 0) {
//         if (!currentCartEntry) {
//           throw new NotFoundError("Product variant not found in cart for this user to decrement.");
//         }
//         if (newQuantityForThisVariant < 0) {
//           throw new ValidationError("Cannot decrement quantity below zero.");
//         }
//         if (newQuantityForThisVariant === 0) {
//           await strapi.db.query("api::cart.cart").delete({
//             where: { id: currentCartEntry.id }
//           });
//           return ctx.send({
//             success: true,
//             message: "Product quantity decreased to zero and removed from cart.",
//             data: { 
//               product_id: masterProduct.id, 
//               variant_id: parseInt(variantId), 
//               user_id: userId 
//             }
//           });
//         }
//       } 
//       // Handle increment logic with comprehensive stock validation
//       else {
//         // Check combined stock across all variants
//         if (newTotalQuantityAcrossAllVariants > totalStock) {
//           const availableStock = totalStock - (totalQuantityInCart - currentQuantityForThisVariant);
//           throw new ValidationError(
//             `Product ${masterProduct.name} has insufficient combined stock. Available: ${availableStock}, Requested: ${quantity}.`
//           );
//         }
        
//         // Check individual variant stock
//         if (newQuantityForThisVariant > (productVariant.stock || 0)) {
//           const availableForThisVariant = (productVariant.stock || 0) - currentQuantityForThisVariant;
//           throw new ValidationError(
//             `This product variant has insufficient stock. Available: ${availableForThisVariant}, Requested: ${quantity}.`
//           );
//         }
//       }
      
//       let updatedCartEntry;
//       let message = "";
      
//       if (!currentCartEntry) {
//         updatedCartEntry = await strapi.db.query("api::cart.cart").create({
//           data: { 
//             user: userId, 
//             product_variant: parseInt(variantId), 
//             quantity: quantity 
//           },
//           populate: { 
//             product_variant: { 
//               populate: {
//                 product: {
//                   select: ["id", "name", "price", "offers", "offerPrice"],
//                   populate: { 
//                     image: { 
//                       select: ["url"] 
//                     } 
//                   }
//                 },
//                 color_picker: true
//               }
//             } 
//           }
//         });
//         message = "Product added to cart.";
//       } else {
//         updatedCartEntry = await strapi.db.query("api::cart.cart").update({
//           where: { id: currentCartEntry.id },
//           data: { quantity: newQuantityForThisVariant },
//           populate: { 
//             product_variant: { 
//               populate: {
//                 product: {
//                   select: ["id", "name", "price", "offers", "offerPrice"],
//                   populate: { 
//                     image: { 
//                       select: ["url"] 
//                     } 
//                   }
//                 },
//                 color_picker: true
//               }
//             } 
//           }
//         });
//         message = quantity > 0 ? "Product quantity updated in cart." : "Product quantity decreased in cart.";
//       }
      
//       return ctx.send({
//         success: true,
//         message: message,
//         data: {
//           ...updatedCartEntry,
//           combined_stock_available: totalStock,
//           total_quantity_in_cart_all_variants: newTotalQuantityAcrossAllVariants,
//           is_combined_product: totalStock > (productVariant.stock || 0)
//         }
//       });
//     } catch (error) {
//       console.error("Error in addProductToCart:", error);
//       const customizedError = handleErrors(error);
//       return ctx.send(
//         { success: false, message: customizedError.message },
//         handleStatusCode(error) || 500
//       );
//     }
//   },

//   // MARK: Remove Product Variant From Cart
//   async removeProductFromCart(ctx) {
//     try {
//       const { id: userId } = ctx.state.user;
//       if (!userId) {
//         throw new ValidationError("User not authenticated.");
//       }

//       const { variantId } = ctx.params;
//       const parsedVariantId = parseInt(variantId, 10);

//       if (isNaN(parsedVariantId)) {
//         throw new ValidationError("Invalid Product Variant ID provided in URL. Must be a number.");
//       }

//       const cartEntry = await strapi.db.query("api::cart.cart").findOne({
//         where: { 
//           user: userId, 
//           product_variant: parsedVariantId 
//         }
//       });

//       if (!cartEntry) {
//         throw new NotFoundError("Product variant not found in cart for this user.");
//       }

//       await strapi.db.query("api::cart.cart").delete({
//         where: { id: cartEntry.id }
//       });

//       return ctx.send({
//         success: true,
//         message: "Product variant removed from cart.",
//         data: {
//           product_variant_id: parsedVariantId,
//           user_id: userId,
//         },
//       });

//     } catch (error) {
//       console.error("Error in removeProductFromCart:", error);
//       const customizedError = handleErrors(error);
//       return ctx.send(
//         { success: false, message: customizedError.message },
//         handleStatusCode(error) || 500
//       );
//     }
//   },

//   // MARK: Clear entire cart
//   async clearCart(ctx) {
//     try {
//       const { id: userId } = ctx.state.user;

//       if (!userId) {
//         throw new ValidationError("User not authenticated.");
//       }

//       const cartEntries = await strapi.db.query("api::cart.cart").findMany({
//         where: { user: userId }
//       });

//       if (!cartEntries || cartEntries.length === 0) {
//         return ctx.send({
//           success: true,
//           message: "Cart is already empty for this user.",
//           data: { user_id: userId }
//         });
//       }

//       await strapi.db.query("api::cart.cart").deleteMany({
//         where: { user: userId }
//       });

//       return ctx.send({
//         success: true,
//         message: "Cart cleared successfully.",
//         data: {
//           user_id: userId,
//           items_removed: cartEntries.length
//         }
//       });

//     } catch (error) {
//       console.error("Error in clearCart:", error);
//       const customizedError = handleErrors(error);
//       return ctx.send(
//         { success: false, message: customizedError.message },
//         handleStatusCode(error) || 500
//       );
//     }
//   },

//   // MARK: Get cart summary with combined stock info
//   async getCartSummary(ctx) {
//     try {
//       const { id: userId } = ctx.state.user;

//       if (!userId) {
//         throw new ValidationError("User not authenticated.");
//       }

//       const cart = await strapi.db.query("api::cart.cart").findMany({
//         where: { user: userId },
//         populate: {
//           product_variant: {
//             select: ["id", "stock", "inStock", "isActive"],
//             populate: {
//               product: {
//                 select: ["id", "name", "price", "offers", "offerPrice", "locale"],
//                 populate: {
//                   localizations: { 
//                     select: ["id", "locale"] 
//                   }
//                 }
//               }
//             }
//           }
//         }
//       });

//       if (!cart || cart.length === 0) {
//         return ctx.send({
//           success: true,
//           message: "Cart is empty.",
//           data: {
//             total_items: 0,
//             total_unique_products: 0,
//             estimated_total: 0,
//             items_by_locale: {},
//             invalid_items: []
//           }
//         });
//       }

//       let totalItems = 0;
//       let estimatedTotal = 0;
//       const itemsByLocale = {};
//       const uniqueProducts = new Set();
//       const invalidItems = [];

//       cart.forEach((item, index) => {
//         try {
//           // Validate cart item structure
//           if (!item || typeof item.quantity !== 'number') {
//             console.warn(`Invalid cart item at index ${index}:`, item);
//             invalidItems.push({
//               cart_item_id: item?.id || `index_${index}`,
//               error: "Invalid cart item structure - missing or invalid quantity"
//             });
//             return;
//           }

//           // Validate product variant exists and is populated
//           if (!item.product_variant) {
//             console.warn(`Cart item ${item.id} missing product_variant:`, item);
//             invalidItems.push({
//               cart_item_id: item.id,
//               error: "Product variant not found or not properly populated"
//             });
//             return;
//           }

//           // Validate master product exists
//           if (!item.product_variant.product) {
//             console.warn(`Cart item ${item.id} missing master product:`, item.product_variant);
//             invalidItems.push({
//               cart_item_id: item.id,
//               variant_id: item.product_variant.id,
//               error: "Master product not found or not properly populated"
//             });
//             return;
//           }

//           const masterProduct = item.product_variant.product;
          
//           // Validate required product fields
//           if (!masterProduct.id || !masterProduct.name || typeof masterProduct.price !== 'number') {
//             console.warn(`Cart item ${item.id} has invalid master product data:`, masterProduct);
//             invalidItems.push({
//               cart_item_id: item.id,
//               variant_id: item.product_variant.id,
//               product_id: masterProduct.id,
//               error: "Master product missing required fields (id, name, or price)"
//             });
//             return;
//           }

//           // Calculate totals for valid items
//           totalItems += item.quantity;
          
//           const effectivePrice = masterProduct.offers && typeof masterProduct.offerPrice === 'number'
//             ? masterProduct.offerPrice
//             : masterProduct.price;
            
//           estimatedTotal += effectivePrice * item.quantity;

//           const locale = masterProduct.locale || 'default';
//           if (!itemsByLocale[locale]) {
//             itemsByLocale[locale] = [];
//           }
          
//           itemsByLocale[locale].push({
//             cart_item_id: item.id,
//             product_variant_id: item.product_variant.id,
//             product_id: masterProduct.id,
//             product_name: masterProduct.name,
//             quantity: item.quantity,
//             unit_price: masterProduct.price,
//             effective_price: effectivePrice,
//             has_offer: Boolean(masterProduct.offers && masterProduct.offerPrice),
//             subtotal: effectivePrice * item.quantity
//           });

//           // Track unique products using the master product ID
//           uniqueProducts.add(masterProduct.id);
          
//         } catch (itemError) {
//           console.error(`Error processing cart item ${item?.id || index}:`, itemError);
//           invalidItems.push({
//             cart_item_id: item?.id || `index_${index}`,
//             error: `Processing error: ${itemError.message}`
//           });
//         }
//       });

//       const response = {
//         success: true,
//         message: invalidItems.length > 0 
//           ? `Cart summary retrieved with ${invalidItems.length} invalid items found.`
//           : "Cart summary retrieved successfully.",
//         data: {
//           total_items: totalItems,
//           total_unique_products: uniqueProducts.size,
//           estimated_total: Math.round(estimatedTotal * 100) / 100, // Round to 2 decimal places
//           items_by_locale: itemsByLocale,
//           invalid_items: invalidItems
//         }
//       };

//       // If there are invalid items, log them for debugging
//       if (invalidItems.length > 0) {
//         console.warn(`Found ${invalidItems.length} invalid cart items for user ${userId}:`, invalidItems);
//       }

//       return ctx.send(response);
      
//     } catch (error) {
//       console.error("Error in getCartSummary:", error);
//       const customizedError = handleErrors(error);
//       return ctx.send(
//         { success: false, message: customizedError.message },
//         handleStatusCode(error) || 500
//       );
//     }
//   }
// }));






// "use strict";

// const { createCoreController } = require("@strapi/strapi").factories;
// const strapiUtils = require("@strapi/utils");
// const { ValidationError, NotFoundError } = strapiUtils.errors;

// // Helper function to handle and format errors
// const handleErrors = (error) => {
//   console.error("Error occurred:", error);
//   const errorMessage = String(error.message || "");

//   if (error instanceof ValidationError) {
//     return { message: errorMessage };
//   }
//   if (error instanceof NotFoundError) {
//     return { message: errorMessage };
//   }
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
//   if (errorMessage.includes("product variant is currently not active")) {
//     return { message: errorMessage };
//   }
//   return { message: "An unexpected error occurred." };
// };

// // Helper function to map error messages to status codes
// const handleStatusCode = (error) => {
//   if (error instanceof ValidationError) return 400;
//   if (error instanceof NotFoundError) return 404;
//   if (String(error.message || "").includes("out of stock or insufficient quantity")) {
//     return 400;
//   }
//   if (String(error.message || "").includes("Product not found in cart for this user.")) {
//     return 404;
//   }
//   if (String(error.message || "").includes("product variant is currently not active")) {
//     return 400;
//   }
//   if (String(error.message || "").includes("Cart is already empty for this user.")) {
//     return 200;
//   }
//   if (String(error.message || "").includes("User does not have a cart yet.")) {
//     return 200;
//   }
//   return 500;
// };

// // Helper function to validate request body fields
// const validateBodyRequiredFields = (body, fields) => {
//   const missingFields = fields.filter(field => !body[field]);
//   if (missingFields.length > 0) {
//     throw new ValidationError(`Missing required fields: ${missingFields.join(', ')}`);
//   }
// };

// // New helper to get a product variant and its master product
// const getProductVariant = async (variantId, strapi) => {
//   const productVariant = await strapi.entityService.findOne(
//     "api::product-variant.product-variant",
//     variantId,
//     {
//       populate: {
//         product: {
//           fields: ["id", "name", "price", "offers", "offerPrice", "locale"],
//           populate: {
//             localizations: {
//               fields: ["id", "locale"]
//             },
//             image: { fields: ["url", "name", "alternativeText"] }
//           }
//         }
//       }
//     }
//   );

//   if (!productVariant) {
//     throw new NotFoundError("Product variant not found.");
//   }
  
//   // Calculate combined stock based on all variants of the master product
//   const masterProduct = productVariant.product;
//   const allVariants = await strapi.entityService.findMany(
//     "api::product-variant.product-variant",
//     {
//       filters: { product: masterProduct.id },
//       fields: ["id", "stock", "isActive", "inStock"]
//     }
//   );

//   const totalStock = allVariants.reduce((sum, variant) => sum + (variant.stock || 0), 0);
//   const hasActiveVariant = allVariants.some(variant => variant.isActive && variant.inStock);

//   return {
//     productVariant,
//     masterProduct,
//     allVariants,
//     totalStock,
//     hasActiveVariant
//   };
// };

// // Helper to get all cart items for a given master product
// const getAllCartItemsForProduct = async (userId, masterProductId, strapi) => {
//   const allVariants = await strapi.entityService.findMany(
//     "api::product-variant.product-variant",
//     {
//       filters: { product: masterProductId },
//       fields: ["id"]
//     }
//   );
//   const allVariantIds = allVariants.map(variant => variant.id);

//   const cartItems = await strapi.entityService.findMany(
//     "api::cart.cart",
//     {
//       filters: {
//         user: userId,
//         product_variant: { $in: allVariantIds }
//       }
//     }
//   );
  
//   return {
//     cartItems,
//     totalQuantityInCart: cartItems.reduce((sum, item) => sum + item.quantity, 0),
//     allVariantIds
//   };
// };

// module.exports = createCoreController("api::cart.cart", ({ strapi }) => ({
//   // MARK: GetCart
//   async getMyCart(ctx) {
//     try {
//       const { id: userId } = ctx.state.user;

//       const cart = await strapi.entityService.findMany(
//         "api::cart.cart",
//         {
//           filters: { user: userId },
//           populate: {
//             product_variant: {
//               populate: {
//                 product: {
//                   fields: ["id", "name", "price", "offers", "offerPrice", "rating", "reviewCount", "locale"],
//                   populate: {
//                     image: { fields: ["url", "name", "alternativeText"] },
//                     localizations: { fields: ["id", "locale"] }
//                   }
//                 },
//                 color_picker: true,
//                 frame_size: true
//               }
//             }
//           }
//         }
//       );

//       if (!cart || cart.length === 0) {
//         return ctx.send({
//           success: true,
//           message: "User does not have a cart yet or cart is empty.",
//           data: { cart_items: [], total_items: 0 }
//         });
//       }

//       // Consolidate product data into a single object for each cart item
//       const enhancedCart = cart.map(cartItem => {
//         const variant = cartItem.product_variant;
//         const masterProduct = variant.product;
//         return {
//           ...cartItem,
//           product: {
//             ...masterProduct,
//             variant: {
//               ...variant,
//               product: undefined // Remove duplicate product info
//             }
//           }
//         };
//       });

//       return ctx.send({
//         success: true,
//         message: "Cart retrieved successfully",
//         data: {
//           cart_items: enhancedCart,
//           total_items: enhancedCart.length
//         }
//       });
//     } catch (error) {
//       const customizedError = handleErrors(error);
//       return ctx.send(
//         { success: false, message: customizedError.message },
//         handleStatusCode(error) || 500
//       );
//     }
//   },

//   // MARK: Add Product Variant to Cart
//   async addProductToCart(ctx) {
//     try {
//       const { id: userId } = ctx.state.user;
//       const { variantId, quantity } = ctx.request.body;

//       validateBodyRequiredFields(ctx.request.body, ["variantId", "quantity"]);

//       if (quantity === 0) {
//         throw new ValidationError("Quantity cannot be zero.");
//       }

//       const { productVariant, masterProduct, totalStock } = await getProductVariant(variantId, strapi);

//       if (!productVariant.isActive || !productVariant.inStock || productVariant.stock < 1) {
//         throw new ValidationError("This product variant is currently not active or out of stock.");
//       }
      
//       const { cartItems, totalQuantityInCart } = await getAllCartItemsForProduct(userId, masterProduct.id, strapi);
      
//       const currentCartEntry = cartItems.find(item => item.product_variant.id === variantId);
//       const currentQuantityForThisVariant = currentCartEntry ? currentCartEntry.quantity : 0;
      
//       const newTotalQuantityAcrossAllVariants = totalQuantityInCart + quantity;
//       const newQuantityForThisVariant = currentQuantityForThisVariant + quantity;
      
//       if (quantity < 0) {
//         if (!currentCartEntry) {
//           throw new NotFoundError("Product not found in cart for this user to decrement.");
//         }
//         if (newQuantityForThisVariant < 0) {
//           throw new ValidationError("Cannot decrement quantity below zero.");
//         }
//         if (newQuantityForThisVariant === 0) {
//           await strapi.entityService.delete("api::cart.cart", currentCartEntry.id);
//           return ctx.send({
//             success: true,
//             message: "Product quantity decreased to zero and removed from cart.",
//             data: { product_id: masterProduct.id, variant_id: variantId, user_id: userId }
//           });
//         }
//       } else if (newTotalQuantityAcrossAllVariants > totalStock) {
//         throw new ValidationError(
//           `Product ${masterProduct.name} has insufficient combined stock. Available: ${totalStock - totalQuantityInCart}.`
//         );
//       } else if (newQuantityForThisVariant > productVariant.stock) {
//         throw new ValidationError(
//           `Product variant has insufficient stock. Available: ${productVariant.stock - currentQuantityForThisVariant}.`
//         );
//       }
      
//       let updatedCartEntry;
//       let message = "";
      
//       if (!currentCartEntry) {
//         updatedCartEntry = await strapi.entityService.create(
//           "api::cart.cart",
//           {
//             data: { user: userId, product_variant: variantId, quantity: quantity },
//             populate: { product_variant: { populate: ["product", "color_picker"] } }
//           }
//         );
//         message = "Product added to cart.";
//       } else {
//         updatedCartEntry = await strapi.entityService.update(
//           "api::cart.cart",
//           currentCartEntry.id,
//           {
//             data: { quantity: newQuantityForThisVariant },
//             populate: { product_variant: { populate: ["product", "color_picker"] } }
//           }
//         );
//         message = quantity > 0 ? "Product quantity updated in cart." : "Product quantity decreased in cart.";
//       }
      
//       return ctx.send({
//         success: true,
//         message: message,
//         data: updatedCartEntry
//       });
//     } catch (error) {
//       const customizedError = handleErrors(error);
//       return ctx.send(
//         { success: false, message: customizedError.message },
//         handleStatusCode(error) || 500
//       );
//     }
//   },

//   // MARK: Remove Product Variant From Cart
//   async removeProductFromCart(ctx) {
//     try {
//       const { id: userId } = ctx.state.user;
//       if (!userId) {
//         throw new ValidationError("User not authenticated.");
//       }

//       const { variantId } = ctx.params;
//       const parsedVariantId = parseInt(variantId, 10);

//       if (isNaN(parsedVariantId)) {
//         throw new ValidationError("Invalid Product Variant ID provided in URL. Must be a number.");
//       }

//       const [cartEntry] = await strapi.entityService.findMany(
//         "api::cart.cart",
//         { filters: { user: userId, product_variant: parsedVariantId } }
//       );

//       if (!cartEntry) {
//         throw new NotFoundError("Product variant not found in cart for this user.");
//       }

//       await strapi.entityService.delete(
//         "api::cart.cart",
//         cartEntry.id
//       );

//       return ctx.send({
//         success: true,
//         message: "Product variant removed from cart.",
//         data: {
//           product_variant_id: parsedVariantId,
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

//   // MARK: Clear entire cart
//   async clearCart(ctx) {
//     try {
//       const { id: userId } = ctx.state.user;

//       const cartEntries = await strapi.entityService.findMany(
//         "api::cart.cart",
//         { filters: { user: userId } }
//       );

//       if (!cartEntries || cartEntries.length === 0) {
//         return ctx.send({
//           success: true,
//           message: "Cart is already empty for this user.",
//           data: { user_id: userId }
//         });
//       }

//       await Promise.all(
//         cartEntries.map(entry =>
//           strapi.entityService.delete("api::cart.cart", entry.id)
//         )
//       );

//       return ctx.send({
//         success: true,
//         message: "Cart cleared successfully.",
//         data: {
//           user_id: userId,
//           items_removed: cartEntries.length
//         }
//       });

//     } catch (error) {
//       const customizedError = handleErrors(error);
//       return ctx.send(
//         { success: false, message: customizedError.message },
//         handleStatusCode(error) || 500
//       );
//     }
//   },

//   // MARK: Get cart summary with combined stock info
//   async getCartSummary(ctx) {
//     try {
//       const { id: userId } = ctx.state.user;

//       const cart = await strapi.entityService.findMany(
//         "api::cart.cart",
//         {
//           filters: { user: userId },
//           populate: {
//             product_variant: {
//               fields: ["id", "stock", "inStock", "isActive"],
//               populate: {
//                 product: {
//                   fields: ["id", "name", "price", "offers", "offerPrice", "locale"],
//                   populate: {
//                     localizations: { fields: ["id", "locale"] }
//                   }
//                 }
//               }
//             }
//           }
//         }
//       );

//       if (!cart || cart.length === 0) {
//         return ctx.send({
//           success: true,
//           message: "Cart is empty.",
//           data: {
//             total_items: 0,
//             total_unique_products: 0,
//             estimated_total: 0,
//             items_by_locale: {}
//           }
//         });
//       }

//       let totalItems = 0;
//       let estimatedTotal = 0;
//       const itemsByLocale = {};
//       const uniqueProducts = new Set();

//       cart.forEach(item => {
//         totalItems += item.quantity;
//         const masterProduct = item.product_variant.product;
//         const effectivePrice = masterProduct.offers && masterProduct.offerPrice
//           ? masterProduct.offerPrice
//           : masterProduct.price;
//         estimatedTotal += effectivePrice * item.quantity;

//         const locale = masterProduct.locale || 'default';
//         if (!itemsByLocale[locale]) {
//           itemsByLocale[locale] = [];
//         }
//         itemsByLocale[locale].push({
//           product_variant_id: item.product_variant.id,
//           product_id: masterProduct.id,
//           product_name: masterProduct.name,
//           quantity: item.quantity,
//           price: effectivePrice
//         });

//         // Track unique products using the master product ID
//         uniqueProducts.add(masterProduct.id);
//       });

//       return ctx.send({
//         success: true,
//         message: "Cart summary retrieved successfully.",
//         data: {
//           total_items: totalItems,
//           total_unique_products: uniqueProducts.size,
//           estimated_total: estimatedTotal,
//           items_by_locale: itemsByLocale
//         }
//       });
//     } catch (error) {
//       const customizedError = handleErrors(error);
//       return ctx.send(
//         { success: false, message: customizedError.message },
//         handleStatusCode(error) || 500
//       );
//     }
//   }
// }));












// "use strict";

// const { createCoreController } = require("@strapi/strapi").factories;
// const strapiUtils = require("@strapi/utils");
// const { ValidationError, NotFoundError } = strapiUtils.errors;

// const handleErrors = (error) => {
//   console.error("Error occurred:", error);
//   const errorMessage = String(error.message || "");

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
//   if (String(error.message || "").includes("out of stock or insufficient quantity")) {
//     return 400;
//   }
//   if (String(error.message || "").includes("Product not found in cart for this user.")) {
//     return 404;
//   }
//   if (String(error.message || "").includes("product is currently not active")) {
//     return 400;
//   }
//   if (String(error.message || "").includes("Cart is already empty for this user.")) {
//     return 200; // Informational success, no action needed
//   }
//   if (String(error.message || "").includes("User does not have a cart yet.")) {
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

// // Helper function to get master product (base product for all localizations)
// const getMasterProduct = async (productId, strapi) => {
//   // First, get the product with localizations
//   const product = await strapi.entityService.findOne(
//     "api::product.product",
//     productId,
//     {
//       fields: ["name", "price", "stock", "inStock", "isActive", "locale"],
//       populate: {
//         localizations: {
//           fields: ["id", "locale", "stock", "inStock", "isActive"]
//         }
//       }
//     }
//   );

//   if (!product) {
//     throw new NotFoundError("Product not found.");
//   }

//   // If this product has no localizations, it's the master product
//   if (!product.localizations || product.localizations.length === 0) {
//     return {
//       masterProduct: product,
//       allVariants: [product],
//       totalStock: product.stock || 0
//     };
//   }

//   // Find the master product (usually the default locale)
//   let masterProduct = product;
//   let allVariants = [product, ...product.localizations];

//   // Calculate total stock across all variants
//   const totalStock = allVariants.reduce((sum, variant) => {
//     return sum + (variant.stock || 0);
//   }, 0);

//   // Check if any variant is active and in stock
//   const hasActiveVariant = allVariants.some(variant => variant.isActive && variant.inStock);

//   return {
//     masterProduct: {
//       ...masterProduct,
//       stock: totalStock,
//       inStock: hasActiveVariant,
//       isActive: hasActiveVariant
//     },
//     allVariants,
//     totalStock
//   };
// };

// // Helper function to get all cart items for the same product (across all locales)
// const getAllCartItemsForProduct = async (userId, productId, strapi) => {
//   const { allVariants } = await getMasterProduct(productId, strapi);
//   const allVariantIds = allVariants.map(variant => variant.id);

//   const cartItems = await strapi.entityService.findMany(
//     "api::cart.cart",
//     {
//       filters: {
//         user: userId,
//         product: { $in: allVariantIds }
//       }
//     }
//   );

//   return {
//     cartItems,
//     totalQuantityInCart: cartItems.reduce((sum, item) => sum + item.quantity, 0)
//   };
// };

// // --- END Helper functions ---

// module.exports = createCoreController("api::cart.cart", ({ strapi }) => ({
//   //MARK: GetCart
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
//                 "offers", "offerPrice", "rating", "reviewCount", "isActive", "locale"
//               ],
//               populate: {
//                 image: {
//                   fields: ["url", "name", "alternativeText"],
//                 },
//                 localizations: {
//                   fields: ["id", "locale", "stock", "inStock", "isActive"]
//                 }
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

//       // Enhance cart items with combined stock information
//       const enhancedCart = await Promise.all(cart.map(async (cartItem) => {
//         try {
//           const { masterProduct, totalStock } = await getMasterProduct(cartItem.product.id, strapi);
//           return {
//             ...cartItem,
//             product: {
//               ...cartItem.product,
//               combinedStock: totalStock,
//               isCombinedProduct: cartItem.product.localizations && cartItem.product.localizations.length > 0
//             }
//           };
//         } catch (error) {
//           console.warn(`Could not enhance cart item ${cartItem.id}:`, error);
//           return cartItem;
//         }
//       }));

//       return ctx.send({
//         success: true,
//         message: "Cart retrieved successfully",
//         data: {
//           cart_items: enhancedCart,
//           total_items: enhancedCart.length
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

//   // 2.MARK: Add Product (Now handles decrementing and cross-locale stock management)
//   async addProductToCart(ctx) {
//     try {
//       const { id: userId } = ctx.state.user;
//       const { productId, quantity } = ctx.request.body;

//       validateBodyRequiredFields(ctx.request.body, ["productId", "quantity"]);

//       if (quantity === 0) {
//         throw new ValidationError("Quantity cannot be zero.");
//       }

//       // Get master product and all variants
//       const { masterProduct, allVariants, totalStock } = await getMasterProduct(productId, strapi);

//       // --- VALIDATION CHECKS WITH COMBINED STOCK ---
//       if (!masterProduct.isActive) {
//         throw new ValidationError("This product is currently not active and cannot be added to the cart.");
//       }
//       if (!masterProduct.inStock || totalStock < 1) {
//         throw new ValidationError("This product is out of stock.");
//       }
//       // --- END VALIDATION CHECKS ---

//       // Get all existing cart items for this product (across all locales)
//       const { cartItems, totalQuantityInCart } = await getAllCartItemsForProduct(userId, productId, strapi);

//       // Find the specific cart entry for this exact product ID
//       const currentCartEntry = cartItems.find(item => item.product === productId);
//       const currentQuantityForThisVariant = currentCartEntry ? currentCartEntry.quantity : 0;

//       const newTotalQuantityAcrossAllVariants = totalQuantityInCart + quantity;
//       const newQuantityForThisVariant = currentQuantityForThisVariant + quantity;

//       // Handle decrement logic
//       if (quantity < 0) {
//         if (!currentCartEntry) {
//           throw new NotFoundError("Product not found in cart for this user to decrement.");
//         }
//         if (newQuantityForThisVariant < 0) {
//           throw new ValidationError("Cannot decrement quantity below zero.");
//         }
//         // If the new quantity is 0, remove the item
//         if (newQuantityForThisVariant === 0) {
//           await strapi.entityService.delete("api::cart.cart", currentCartEntry.id);
//           return ctx.send({
//             success: true,
//             message: "Product quantity decreased to zero and removed from cart.",
//             data: {
//               product_id: productId,
//               user_id: userId,
//               combined_stock_used: totalQuantityInCart - Math.abs(quantity)
//             }
//           });
//         }
//       }
//       // Handle increment logic with combined stock check
//       else if (newTotalQuantityAcrossAllVariants > totalStock) {
//         const availableStock = totalStock - (totalQuantityInCart - currentQuantityForThisVariant);
//         throw new ValidationError(
//           `Product ${masterProduct.name} has insufficient combined stock. ` +
//           `Available: ${availableStock}, Requested: ${quantity}, ` +
//           `Total in cart across all variants: ${totalQuantityInCart - currentQuantityForThisVariant}`
//         );
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
//                 fields: ["id", "name", "price", "offers", "offerPrice", "rating", "reviewCount", "locale"],
//                 populate: {
//                   image: { fields: ["url"] },
//                   localizations: { fields: ["id", "locale"] }
//                 },
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
//               quantity: newQuantityForThisVariant,
//             },
//             populate: {
//               product: {
//                 fields: ["id", "name", "price", "offers", "offerPrice", "rating", "reviewCount", "locale"],
//                 populate: {
//                   image: { fields: ["url"] },
//                   localizations: { fields: ["id", "locale"] }
//                 },
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
//           product_locale: updatedCartEntry.product.locale,
//           combined_stock_available: totalStock,
//           total_quantity_in_cart_all_variants: newTotalQuantityAcrossAllVariants,
//           is_combined_product: allVariants.length > 1
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

//   // 3.MARK: Remove Product From Cart
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

//   // MARK: Clear entire cart
//   async clearCart(ctx) {
//     try {
//       const { id: userId } = ctx.state.user;

//       const cartEntries = await strapi.entityService.findMany(
//         "api::cart.cart",
//         { filters: { user: userId } }
//       );

//       if (!cartEntries || cartEntries.length === 0) {
//         return ctx.send({
//           success: true,
//           message: "Cart is already empty for this user.",
//           data: { user_id: userId }
//         });
//       }

//       // Delete all cart entries for this user
//       await Promise.all(
//         cartEntries.map(entry =>
//           strapi.entityService.delete("api::cart.cart", entry.id)
//         )
//       );

//       return ctx.send({
//         success: true,
//         message: "Cart cleared successfully.",
//         data: {
//           user_id: userId,
//           items_removed: cartEntries.length
//         }
//       });

//     } catch (error) {
//       const customizedError = handleErrors(error);
//       return ctx.send(
//         { success: false, message: customizedError.message },
//         handleStatusCode(error) || 500
//       );
//     }
//   },

//   // MARK: Get cart summary with combined stock info
//   async getCartSummary(ctx) {
//     try {
//       const { id: userId } = ctx.state.user;

//       const cart = await strapi.entityService.findMany(
//         "api::cart.cart",
//         {
//           filters: { user: userId },
//           populate: {
//             product: {
//               fields: ["id", "name", "price", "offers", "offerPrice", "locale"],
//               populate: {
//                 localizations: { fields: ["id", "locale"] }
//               }
//             }
//           }
//         }
//       );

//       if (!cart || cart.length === 0) {
//         return ctx.send({
//           success: true,
//           message: "Cart is empty.",
//           data: {
//             total_items: 0,
//             total_unique_products: 0,
//             estimated_total: 0,
//             items_by_locale: {}
//           }
//         });
//       }

//       let totalItems = 0;
//       let estimatedTotal = 0;
//       const itemsByLocale = {};
//       const uniqueProducts = new Set();

//       cart.forEach(item => {
//         totalItems += item.quantity;
//         const effectivePrice = item.product.offers && item.product.offerPrice
//           ? item.product.offerPrice
//           : item.product.price;
//         estimatedTotal += effectivePrice * item.quantity;

//         const locale = item.product.locale || 'default';
//         if (!itemsByLocale[locale]) {
//           itemsByLocale[locale] = [];
//         }
//         itemsByLocale[locale].push({
//           product_id: item.product.id,
//           product_name: item.product.name,
//           quantity: item.quantity,
//           price: effectivePrice
//         });

//         // Track unique products (considering localizations as same product)
//         const productKey = item.product.localizations && item.product.localizations.length > 0
//           ? `master_${item.product.id}`
//           : item.product.id;
//         uniqueProducts.add(productKey);
//       });

//       return ctx.send({
//         success: true,
//         message: "Cart summary retrieved successfully.",
//         data: {
//           total_items: totalItems,
//           total_unique_products: uniqueProducts.size,
//           estimated_total: estimatedTotal,
//           items_by_locale: itemsByLocale
//         }
//       });

//     } catch (error) {
//       const customizedError = handleErrors(error);
//       return ctx.send(
//         { success: false, message: customizedError.message },
//         handleStatusCode(error) || 500
//       );
//     }
//   }
// }));





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

