'use strict';

/**
 * custom-cart router.
 *
 * This file defines custom API routes for the 'Cart' content type,
 * linking them to custom methods in the 'Cart' controller.
 */

module.exports = {
  routes: [
    {
      method: "GET",
      path: "/cart/me",
      handler: "cart.getMyCart", // Maps to the getMyCart method in src/api/cart/controllers/cart.js
    },
    {
      method: "POST",
      path: "/cart/add",
      handler: "cart.addProductToCart", // Maps to the addProductToCart method
      
    },
    {
      method: "DELETE",
      path: "/cart/remove/:productId", // Uses a URL parameter for productId
      handler: "cart.removeProductFromCart", // Maps to the removeProductFromCart method
      
    },
    {
      method: "DELETE",
      path: "/cart/clear",
      handler: "cart.clearCart", // Maps to the clearCart method
      
    },
  ],
};