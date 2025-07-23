"use strict";

const { createCoreController } = require("@strapi/strapi").factories;

// ===========================================================================
// Helper Functions: (Ensure these are correctly imported/defined in your project)
// ===========================================================================
// These helpers should ideally be in a shared utility file (e.g., `src/utils/`).
// For this example, they are included directly.
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
// --- END Helper Functions ---

module.exports = createCoreController("api::order.order", ({ strapi }) => ({

    // Custom method: Create an order from the user's cart
    // POST /api/orders/create-from-cart
    async createFromCart(ctx) {
        try {
            const { id: userId } = ctx.state.user;
            const { shippingAddress, paymentMethod, orderID } = ctx.request.body.data || ctx.request.body;

            validateBodyRequiredFields(ctx.request.body.data || ctx.request.body, ["shippingAddress", "paymentMethod"]);

            // Fetch all individual cart entries for the user.
            // Each 'api::cart.cart' entry represents one product in the cart with its quantity.
            const cartEntries = await strapi.entityService.findMany(
                "api::cart.cart", // THIS IS CRITICAL: Ensure this UID matches your Cart Content Type exactly.
                {
                    filters: { user: userId },
                    populate: { product: true } // Populate product details to get price and stock
                }
            );

            if (!cartEntries || cartEntries.length === 0) {
                throw new Error("Your cart is empty. Cannot create an order.");
            }

            let totalAmount = 0;
            const productIdsInOrder = []; // To connect products to the Order via Many-to-Many
            const productsToUpdateStock = [];

            // Process each cart entry
            for (const cartEntry of cartEntries) {
                const product = cartEntry.product; // The populated product object
                const quantity = cartEntry.quantity; // The quantity from the cart entry

                if (!product) {
                    // This case should ideally not happen with good data integrity
                    throw new NotFoundError(`Product associated with cart entry ID ${cartEntry.id} not found.`);
                }
                if (product.inStock === false || product.stock < quantity) {
                    throw new Error(`Product "${product.name}" is out of stock or insufficient quantity (Available: ${product.stock}, Requested: ${quantity}).`);
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
                            fields: ['name', 'price', 'description', 'inStock'], // Select relevant product fields
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