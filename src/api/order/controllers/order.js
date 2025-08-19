"use strict";


const { createCoreController } = require("@strapi/strapi").factories;
const strapiUtils = require("@strapi/utils");
const { ValidationError, NotFoundError } = strapiUtils.errors;

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
    if (errorMessage.includes("Your cart is empty.")) {
        return { message: errorMessage };
    }
    if (errorMessage.includes("Product not found in cart")) {
        return { message: errorMessage };
    }
    if (errorMessage.includes("Cannot read properties of undefined")) {
        return { message: "Invalid data structure encountered. Please try again." };
    }
    return { message: "An unexpected error occurred." };
};

// Helper function to map error messages to status codes
const handleStatusCode = (error) => {
    const errorMessage = String(error.message || "");

    if (error instanceof ValidationError) return 400;
    if (error instanceof NotFoundError) return 404;
    if (errorMessage.includes("out of stock or insufficient quantity")) {
        return 400;
    }
    if (errorMessage.includes("Your cart is empty.")) {
        return 400;
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

module.exports = createCoreController("api::order.order", ({ strapi }) => ({

    //MARK:Create order 
    // POST /api/orders/create-from-cart
    async createFromCart(ctx) {
        try {
            const { id: userId } = ctx.state.user;
            if (!userId) {
                // Return a specific unauthorized error if the user is not authenticated.
                return ctx.unauthorized("Authentication required to create an order.");
            }

            const requestBody = ctx.request.body || {};
            // Destructure the expected fields from the request body
            const { address, paymentMethod, orderID } = requestBody.data || requestBody;

            // Validate that the request body has the required fields
            validateBodyRequiredFields(requestBody.data || requestBody, ["address", "paymentMethod"]);

            // Fetch cart entries and populate product variant and the master product
            const cartEntries = await strapi.entityService.findMany(
                "api::cart.cart", {
                    filters: { user: userId },
                    populate: { 
                        product_variant: { 
                            populate: {
                                product: true
                            }
                        } 
                    }
                }
            );

            // Check if the cart is empty before proceeding
            if (!cartEntries || cartEntries.length === 0) {
                throw new ValidationError("Your cart is empty. Cannot create an order.");
            }

            let totalAmount = 0;
            const orderItems = [];
            const variantsToUpdateStock = [];
            const variantIDsToRemove = [];

            for (const cartEntry of cartEntries) {
                const variant = cartEntry.product_variant;
                const quantity = cartEntry.quantity;

                // Validate that the variant and its product exist
                if (!variant || !variant.product) {
                    throw new NotFoundError(`Product variant associated with cart entry ID ${cartEntry.id} not found.`);
                }

                const product = variant.product;

                // Check for stock at the product variant level
                if (variant.inStock === false || variant.stock === undefined || variant.stock < quantity) {
                    throw new ValidationError(
                        `Product variant ${variant.id} for ${product.name} is out of stock or has insufficient quantity (Available: ${variant.stock !== undefined ? variant.stock : 'N/A'}, Requested: ${quantity}).`
                    );
                }

                // Determine the effective price (offerPrice if available, otherwise regular price)
                const effectivePrice = product.offers && typeof product.offerPrice === 'number'
                    ? product.offerPrice
                    : product.price;

                // Calculate total amount
                totalAmount += effectivePrice * quantity;

                // Store detailed item information for the order history
                orderItems.push({
                    product_id: product.id,
                    product_name: product.name,
                    quantity: quantity,
                    price: product.price,
                    offerPrice: product.offerPrice,
                    variant_id: variant.id,
                    variant_color: variant.color_picker ? variant.color_picker.name : null,
                    variant_frame_size: variant.frame_size ? variant.frame_size.name : null,
                });

                // Collect stock updates for each variant
                variantsToUpdateStock.push({
                    id: variant.id,
                    newStock: variant.stock - quantity,
                    salesCount: (variant.salesCount || 0) + quantity,
                });
                
                // Collect cart entry IDs to be removed
                variantIDsToRemove.push(cartEntry.id);
            }

            // Create the new Order with detailed item data
            const newOrder = await strapi.entityService.create("api::order.order", {
                data: {
                    orderID: orderID || `ORD-${Date.now()}-${userId}`,
                    status: 'confirmed', // This will trigger the lifecycles.js to set orderedAt
                    user: userId,
                    items: orderItems, // Store the detailed array of items
                    totalAmount: totalAmount,
                    address: address, 
                    paymentMethod: paymentMethod,
                    paymentStatus: 'pending',
                },
                populate: {
                    user: {
                        fields: ["id", "email", "phone", "name"],
                    },
                    address: {
                        fields: ["id","address_name","phone"],
                    },
                },
            });

            // Update product variant stocks and sales count
            for (const variantUpdate of variantsToUpdateStock) {
                await strapi.entityService.update(
                    "api::product-variant.product-variant",
                    variantUpdate.id, {
                        data: {
                            stock: variantUpdate.newStock,
                            inStock: variantUpdate.newStock > 0,
                            salesCount: variantUpdate.salesCount
                        }
                    }
                );
            }

            // Clear the user's cart by deleting all collected cart entries
            await strapi.db.query("api::cart.cart").deleteMany({
                where: { id: { $in: variantIDsToRemove } }
            });

            return ctx.send({
                success: true,
                message: "Order created successfully from your cart and cart cleared.",
                data: newOrder,
            });

        } catch (error) {
            const customizedError = handleErrors(error);
            return ctx.send({
                success: false,
                message: customizedError.message
            }, handleStatusCode(error) || 500);
        }
    },

    // MARK:get orders 
    // GET /api/orders/me
    async getMyOrders(ctx) {
        try {
            const { id: userId } = ctx.state.user;

            const orders = await strapi.entityService.findMany(
                "api::order.order",
                {
                    filters: {
                        user: userId,
                    },
                    populate: {
                        products: {
                            fields: ['name', 'price', 'description'],
                        },
                        address: {
                        fields: ["id","address_name","phone"],
                    },
                    },
                    sort: [{ orderedAt: 'desc' }],
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

    // MARK: Order Tracking
    async trackOrder(ctx) {
        try {
            const { orderId } = ctx.params;
            const { id: userId } = ctx.state.user;

            if (!orderId) {
                throw new ValidationError("Order ID is required for tracking.");
            }

            const order = await strapi.entityService.findMany(
                "api::order.order",
                {
                    filters: {
                        orderID: orderId,
                        user: userId,
                    },
                    populate: {
                        products: {
                            fields: ['name', 'price', 'description'],
                        
                        },
                        address: {
                        fields: ["id","address_name","phone"],
                    },
                    },
                }
            );

            if (!order || order.length === 0) {
                throw new NotFoundError(`Order with ID '${orderId}' not found for this user.`);
            }

            const orderDetails = order[0];
            let statusMessage = "Unknown order status.";
            let trackingInfo = {};

            switch (orderDetails.status) {
                case 'pending':
                case 'confirmed':
                    statusMessage = `Your order #${orderDetails.orderID} has been placed successfully.`;
                    trackingInfo = {
                        currentStatus: "Order Placed",
                        estimatedShipDate: "Within 1-2 business days",
                        orderDate: orderDetails.orderedAt ? new Date(orderDetails.orderedAt).toLocaleString() : 'N/A',
                        nextStep: "We are processing your order and preparing it for shipment."
                    };
                    break;
                case 'shipped':
                    statusMessage = `Good news! Your order #${orderDetails.orderID} is on its way.`;
                    trackingInfo = {
                        currentStatus: "Order on the Way",
                        shippedDate: orderDetails.shippedAt ? new Date(orderDetails.shippedAt).toLocaleString() : 'Soon',
                        estimatedDeliveryDate: new Date(new Date().getTime() + 3 * 24 * 60 * 60 * 1000).toDateString(),
                        trackingNumber: orderDetails.trackingId || "MAMAOPT-TRK123456789", // Use the new trackingId field
                        nextStep: "Anticipate delivery within the next few days."
                    };
                    break;
                case 'delivered':
                    statusMessage = `Your order #${orderDetails.orderID} has been delivered!`;
                    trackingInfo = {
                        currentStatus: "Delivered",
                        deliveredDate: orderDetails.deliveredAt ? new Date(orderDetails.deliveredAt).toLocaleString() : 'Recent',
                        deliveryConfirmation: "Enjoy your purchase!",
                        nextStep: "Thank you for shopping with Mama Opticals."
                    };
                    break;
                case 'cancelled':
                    statusMessage = `Your order #${orderDetails.orderID} has been cancelled.`;
                    trackingInfo = {
                        currentStatus: "Cancelled",
                        cancellationReason: "Please contact support for details.",
                        nextStep: "We apologize for any inconvenience."
                    };
                    break;
                default:
                    statusMessage = `Order #${orderDetails.orderID} status: ${orderDetails.status}.`;
                    trackingInfo = {
                        currentStatus: orderDetails.status,
                        nextStep: "Please check back later for updates."
                    };
            }

            return ctx.send({
                success: true,
                message: statusMessage,
                data: {
                    order: orderDetails,
                    trackingInfo: trackingInfo,
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




// "use strict";

// const { createCoreController } = require("@strapi/strapi").factories;
// const strapiUtils = require("@strapi/utils"); // Import strapiUtils to access ValidationError
// const { ValidationError, NotFoundError } = strapiUtils.errors; // Destructure specific errors

// const handleErrors = (error) => {
//   console.error("Error occurred:", error);
//   const errorMessage = String(error.message || '');

//   if (error instanceof ValidationError) {
//     return { message: errorMessage };
//   }
//   if (error instanceof NotFoundError) {
//     return { message: errorMessage };
//   }
//   // Specifically catch the custom stock error message
//   if (errorMessage.includes("out of stock or insufficient quantity")) {
//     return { message: errorMessage };
//   }
//   if (errorMessage.includes("Your cart is empty.")) { // Catch custom cart empty error
//     return { message: errorMessage };
//   }
//   // Fallback for any other unexpected errors
//   return { message: "An unexpected error occurred." };
// };

// const handleStatusCode = (error) => {
//   if (error instanceof ValidationError) return 400; // Bad Request
//   if (error instanceof NotFoundError) return 404; // Not Found
//   // For custom errors like "out of stock", a 400 Bad Request is appropriate
//   if (String(error.message || '').includes("out of stock or insufficient quantity")) {
//     return 400;
//   }
//   if (String(error.message || '').includes("Your cart is empty.")) {
//     return 400;
//   }
//   return 500; // Internal Server Error for unhandled errors
// };

// // NotFoundError and validateBodyRequiredFields are already defined in your context
// // and are consistent with Strapi's error handling.
// // Re-importing validateBodyRequiredFields from utils/validation.js is recommended
// // const { validateBodyRequiredFields } = require('../../../utils/validation');

// const validateBodyRequiredFields = (body, fields) => {
//   const missingFields = fields.filter(field => !body[field]);
//   if (missingFields.length > 0) {
//     throw new ValidationError(`Missing required fields: ${missingFields.join(', ')}`);
//   }
// };
// // --- END Helper Functions ---

// module.exports = createCoreController("api::order.order", ({ strapi }) => ({

//     // Custom method: Create an order from the user's cart
//     // POST /api/orders/create-from-cart
//     async createFromCart(ctx) {
//         try {
//             const { id: userId } = ctx.state.user;
//             // Safely access request body
//             const requestBody = ctx.request.body || {};
//             const { shippingAddress, paymentMethod, orderID } = requestBody.data || requestBody;

//             validateBodyRequiredFields(requestBody.data || requestBody, ["shippingAddress", "paymentMethod"]);

//             // Fetch all individual cart entries for the user.
//             const cartEntries = await strapi.entityService.findMany(
//                 "api::cart.cart", // THIS IS CRITICAL: Ensure this UID matches your Cart Content Type exactly.
//                 {
//                     filters: { user: userId },
//                     populate: { product: true } // Populate product details to get price and stock
//                 }
//             );

//             if (!cartEntries || cartEntries.length === 0) {
//                 throw new ValidationError("Your cart is empty. Cannot create an order."); // Use ValidationError
//             }

//             let totalAmount = 0;
//             const productIdsInOrder = []; // To connect products to the Order via Many-to-Many
//             const productsToUpdateStock = []; // Re-added for stock updates

//             // Process each cart entry
//             for (const cartEntry of cartEntries) {
//                 const product = cartEntry.product; // The populated product object
//                 const quantity = cartEntry.quantity; // The quantity from the cart entry

//                 if (!product) {
//                     // This case should ideally not happen with good data integrity
//                     throw new NotFoundError(`Product associated with cart entry ID ${cartEntry.id} not found.`);
//                 }
//                 // Check stock before proceeding
//                 if (product.inStock === false || product.stock === undefined || product.stock < quantity) {
//                     // Changed to remove quotes around product.name
//                     throw new ValidationError(`Product ${product.name} is out of stock or insufficient quantity (Available: ${product.stock !== undefined ? product.stock : 'N/A'}, Requested: ${quantity}).`);
//                 }

//                 totalAmount += product.price * quantity;
//                 productIdsInOrder.push(product.id);

//                 productsToUpdateStock.push({
//                     id: product.id,
//                     newStock: product.stock - quantity
//                 });
//             }

//             // Create the new Order
//             const newOrder = await strapi.entityService.create("api::order.order", {
//                 data: {
//                     orderID: orderID || `ORD-${Date.now()}-${userId}`,
//                     status: 'pending',
//                     user: userId,
//                     products: productIdsInOrder, // Connect all products from the cart to the order
//                     totalAmount: totalAmount,
//                     shippingAddress: shippingAddress,
//                     paymentMethod: paymentMethod,
//                     paymentStatus: 'pending'
//                 },
//                 populate: ['user', 'products'] // Populate to return the full order details
//             });

//             // Update product stocks
//             for (const productUpdate of productsToUpdateStock) {
//                 await strapi.entityService.update(
//                     "api::product.product",
//                     productUpdate.id,
//                     {
//                         data: {
//                             stock: productUpdate.newStock,
//                             inStock: productUpdate.newStock > 0
//                         }
//                     }
//                 );
//             }

//             // Clear the user's cart by deleting all individual cart entries
//             for (const cartEntry of cartEntries) {
//                 await strapi.entityService.delete("api::cart.cart", cartEntry.id);
//             }

//             return ctx.send({
//                 success: true,
//                 message: "Order created successfully from your cart and cart cleared.",
//                 data: newOrder,
//             });

//         } catch (error) {
//             const customizedError = handleErrors(error);
//             return ctx.send(
//                 { success: false, message: customizedError.message },
//                 handleStatusCode(error) || 500
//             );
//         }
//     },

//     // Custom method to get all orders for the authenticated user
//     // GET /api/orders/me
//     async getMyOrders(ctx) {
//         try {
//             const { id: userId } = ctx.state.user;

//             // Fetch all orders associated with the current user
//             const orders = await strapi.entityService.findMany(
//                 "api::order.order",
//                 {
//                     filters: {
//                         user: userId,
//                     },
//                     // Populate products to get their details within each order
//                     populate: {
//                         products: {
//                             fields: ['name', 'price', 'description', 'inStock', 'stock', 'offers', 'offerPrice', 'rating', 'reviewCount'], // Select relevant product fields including new ones
//                             populate: {
//                                 image: {
//                                     fields: ["url", "name", "alternativeText"], // For product image
//                                 },
//                             },
//                         },
//                     },
//                     sort: [{ orderedAt: 'desc' }], // Sort by most recent orders first
//                 }
//             );

//             if (!orders || orders.length === 0) {
//                 return ctx.send({
//                     success: true,
//                     message: "You have no orders yet.",
//                     data: {
//                         orders: [],
//                         total_orders: 0,
//                     },
//                 });
//             }

//             return ctx.send({
//                 success: true,
//                 message: "Orders retrieved successfully.",
//                 data: {
//                     orders: orders,
//                     total_orders: orders.length,
//                     user_id: userId,
//                 },
//             });
//         } catch (error) {
//             const customizedError = handleErrors(error);
//             return ctx.send(
//                 { success: false, message: customizedError.message },
//                 handleStatusCode(error) || 500
//             );
//         }
//     },
//     // MARK: Order Tracking
//     async trackOrder(ctx) {
//         try {
//             const { orderId } = ctx.params; // Get the orderId from the URL parameters
//             const { id: userId } = ctx.state.user; // Get the authenticated user's ID

//             if (!orderId) {
//                 throw new ValidationError("Order ID is required for tracking.");
//             }

//             // Find the order by its custom orderID and ensure it belongs to the authenticated user
//             const order = await strapi.entityService.findMany(
//                 "api::order.order",
//                 {
//                     filters: {
//                         orderID: orderId, // Filter by the custom orderID
//                         user: userId,     // Ensure it belongs to the current user
//                     },
//                     populate: {
//                         products: {
//                             fields: ['name', 'price', 'description', 'inStock', 'stock', 'offers', 'offerPrice', 'rating', 'reviewCount'],
//                             populate: {
//                                 image: {
//                                     fields: ["url", "name", "alternativeText"],
//                                 },
//                             },
//                         },
//                     },
//                 }
//             );

//             if (!order || order.length === 0) {
//                 throw new NotFoundError(`Order with ID '${orderId}' not found for this user.`);
//             }

//             const orderDetails = order[0]; // Get the single order object
//             let statusMessage = "Unknown order status.";
//             let trackingInfo = {}; // Object to hold specific tracking details

//             // Logic to customize response based on order status
//             switch (orderDetails.status) {
//                 case 'pending':
//                 case 'confirmed':
//                     statusMessage = `Your order #${orderDetails.orderID} has been placed successfully.`;
//                     trackingInfo = {
//                         currentStatus: "Order Placed",
//                         estimatedShipDate: "Within 1-2 business days", // Placeholder
//                         orderDate: orderDetails.orderedAt ? new Date(orderDetails.orderedAt).toLocaleString() : 'N/A',
//                         nextStep: "We are processing your order and preparing it for shipment."
//                     };
//                     break;
//                 case 'shipped':
//                     statusMessage = `Good news! Your order #${orderDetails.orderID} is on its way.`;
//                     trackingInfo = {
//                         currentStatus: "Order on the Way",
//                         shippedDate: orderDetails.shippedAt ? new Date(orderDetails.shippedAt).toLocaleString() : 'Soon', // Assuming 'shippedAt' field
//                         estimatedDeliveryDate: new Date(new Date().getTime() + 3 * 24 * 60 * 60 * 1000).toDateString(), // Example: 3 days from now
//                         trackingNumber: "MAMAOPT-TRK123456789", // Placeholder: Replace with actual tracking number
//                         nextStep: "Anticipate delivery within the next few days."
//                     };
//                     break;
//                 case 'delivered':
//                     statusMessage = `Your order #${orderDetails.orderID} has been delivered!`;
//                     trackingInfo = {
//                         currentStatus: "Delivered",
//                         deliveredDate: orderDetails.deliveredAt ? new Date(orderDetails.deliveredAt).toLocaleString() : 'Recent', // Assuming 'deliveredAt' field
//                         deliveryConfirmation: "Enjoy your purchase!",
//                         nextStep: "Thank you for shopping with Mama Opticals."
//                     };
//                     break;
//                 case 'cancelled':
//                     statusMessage = `Your order #${orderDetails.orderID} has been cancelled.`;
//                     trackingInfo = {
//                         currentStatus: "Cancelled",
//                         cancellationReason: "Please contact support for details.", 
//                         nextStep: "We apologize for any inconvenience."
//                     };
//                     break;
//                 default:
//                     statusMessage = `Order #${orderDetails.orderID} status: ${orderDetails.status}.`;
//                     trackingInfo = {
//                         currentStatus: orderDetails.status,
//                         nextStep: "Please check back later for updates."
//                     };
//             }


//             return ctx.send({
//                 success: true,
//                 message: statusMessage, // Dynamic message
//                 data: {
//                     order: orderDetails, // Still include the full order details
//                     trackingInfo: trackingInfo, // Add specific tracking details based on status
//                 },
//             });

//         } catch (error) {
//             const customizedError = handleErrors(error);
//             return ctx.send(
//                 { success: false, message: customizedError.message },
//                 handleStatusCode(error) || 500
//             );
//         }
//     },
// }));
