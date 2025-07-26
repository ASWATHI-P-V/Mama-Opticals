"use strict";

const { createCoreController } = require("@strapi/strapi").factories;
const strapiUtils = require("@strapi/utils"); // Import strapiUtils to access ValidationError
const { ValidationError, NotFoundError } = strapiUtils.errors; // Destructure specific errors

// ===========================================================================
// Helper Functions: (Using Strapi's built-in errors where appropriate)
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
  // Specifically catch the custom stock error message
  if (errorMessage.includes("out of stock or insufficient quantity")) {
    return { message: errorMessage };
  }
  if (errorMessage.includes("Your cart is empty.")) { // Catch custom cart empty error
    return { message: errorMessage };
  }
  // Fallback for any other unexpected errors
  return { message: "An unexpected error occurred." };
};

const handleStatusCode = (error) => {
  if (error instanceof ValidationError) return 400; // Bad Request
  if (error instanceof NotFoundError) return 404; // Not Found
  // For custom errors like "out of stock", a 400 Bad Request is appropriate
  if (String(error.message || '').includes("out of stock or insufficient quantity")) {
    return 400;
  }
  if (String(error.message || '').includes("Your cart is empty.")) {
    return 400;
  }
  return 500; // Internal Server Error for unhandled errors
};

// NotFoundError and validateBodyRequiredFields are already defined in your context
// and are consistent with Strapi's error handling.
// Re-importing validateBodyRequiredFields from utils/validation.js is recommended
// const { validateBodyRequiredFields } = require('../../../utils/validation');

const validateBodyRequiredFields = (body, fields) => {
  const missingFields = fields.filter(field => !body[field]);
  if (missingFields.length > 0) {
    throw new ValidationError(`Missing required fields: ${missingFields.join(', ')}`);
  }
};
// --- END Helper Functions ---

module.exports = createCoreController("api::order.order", ({ strapi }) => ({

    // Custom method: Create an order from the user's cart
    // POST /api/orders/create-from-cart
    async createFromCart(ctx) {
        try {
            const { id: userId } = ctx.state.user;
            // Safely access request body
            const requestBody = ctx.request.body || {};
            const { shippingAddress, paymentMethod, orderID } = requestBody.data || requestBody;

            validateBodyRequiredFields(requestBody.data || requestBody, ["shippingAddress", "paymentMethod"]);

            // Fetch all individual cart entries for the user.
            const cartEntries = await strapi.entityService.findMany(
                "api::cart.cart", // THIS IS CRITICAL: Ensure this UID matches your Cart Content Type exactly.
                {
                    filters: { user: userId },
                    populate: { product: true } // Populate product details to get price and stock
                }
            );

            if (!cartEntries || cartEntries.length === 0) {
                throw new ValidationError("Your cart is empty. Cannot create an order."); // Use ValidationError
            }

            let totalAmount = 0;
            const productIdsInOrder = []; // To connect products to the Order via Many-to-Many
            const productsToUpdateStock = []; // Re-added for stock updates

            // Process each cart entry
            for (const cartEntry of cartEntries) {
                const product = cartEntry.product; // The populated product object
                const quantity = cartEntry.quantity; // The quantity from the cart entry

                if (!product) {
                    // This case should ideally not happen with good data integrity
                    throw new NotFoundError(`Product associated with cart entry ID ${cartEntry.id} not found.`);
                }
                // Check stock before proceeding
                if (product.inStock === false || product.stock === undefined || product.stock < quantity) {
                    // Changed to remove quotes around product.name
                    throw new ValidationError(`Product ${product.name} is out of stock or insufficient quantity (Available: ${product.stock !== undefined ? product.stock : 'N/A'}, Requested: ${quantity}).`);
                }

                totalAmount += product.price * quantity;
                productIdsInOrder.push(product.id);

                productsToUpdateStock.push({
                    id: product.id,
                    newStock: product.stock - quantity
                });
            }

            // Create the new Order
            const newOrder = await strapi.entityService.create("api::order.order", {
                data: {
                    orderID: orderID || `ORD-${Date.now()}-${userId}`,
                    status: 'pending',
                    user: userId,
                    products: productIdsInOrder, // Connect all products from the cart to the order
                    totalAmount: totalAmount,
                    shippingAddress: shippingAddress,
                    paymentMethod: paymentMethod,
                    paymentStatus: 'pending',
                    orderedAt: new Date(),
                },
                populate: ['user', 'products'] // Populate to return the full order details
            });

            // Update product stocks
            for (const productUpdate of productsToUpdateStock) {
                await strapi.entityService.update(
                    "api::product.product",
                    productUpdate.id,
                    {
                        data: {
                            stock: productUpdate.newStock,
                            inStock: productUpdate.newStock > 0
                        }
                    }
                );
            }

            // Clear the user's cart by deleting all individual cart entries
            for (const cartEntry of cartEntries) {
                await strapi.entityService.delete("api::cart.cart", cartEntry.id);
            }

            return ctx.send({
                success: true,
                message: "Order created successfully from your cart and cart cleared.",
                data: newOrder,
            });

        } catch (error) {
            const customizedError = handleErrors(error);
            return ctx.send(
                { success: false, message: customizedError.message },
                handleStatusCode(error) || 500
            );
        }
    },

    // Custom method to get all orders for the authenticated user
    // GET /api/orders/me
    async getMyOrders(ctx) {
        try {
            const { id: userId } = ctx.state.user;

            // Fetch all orders associated with the current user
            const orders = await strapi.entityService.findMany(
                "api::order.order",
                {
                    filters: {
                        user: userId,
                    },
                    // Populate products to get their details within each order
                    populate: {
                        products: {
                            fields: ['name', 'price', 'description', 'inStock', 'stock', 'offers', 'offerPrice', 'rating', 'reviewCount'], // Select relevant product fields including new ones
                            populate: {
                                image: {
                                    fields: ["url", "name", "alternativeText"], // For product image
                                },
                            },
                        },
                    },
                    sort: [{ orderedAt: 'desc' }], // Sort by most recent orders first
                }
            );

            if (!orders || orders.length === 0) {
                return ctx.send({
                    success: true,
                    message: "You have no orders yet.",
                    data: {
                        orders: [],
                        total_orders: 0,
                    },
                });
            }

            return ctx.send({
                success: true,
                message: "Orders retrieved successfully.",
                data: {
                    orders: orders,
                    total_orders: orders.length,
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
}));
