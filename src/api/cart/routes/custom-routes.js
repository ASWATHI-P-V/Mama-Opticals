module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/cart/my-cart',
      handler: 'api::cart.cart.getMyCart',
      config: {
        policies: [],
      },
    },
    {
      method: 'POST',
      path: '/cart/add',
      handler: 'api::cart.cart.addProductToCart',
      config: {
        policies: [],
      },
    },
    {
      method: 'DELETE',
      path: '/cart/remove/:variantId', 
      handler: 'api::cart.cart.removeProductFromCart',
      config: {
        policies: [],
      },
    },
    {
      method: 'POST',
      path: '/cart/clear',
      handler: 'api::cart.cart.clearCart',
      config: {
        policies: [],
      },
    },
    {
      method: 'GET',
      path: '/cart/summary',
      handler: 'api::cart.cart.getCartSummary',
      config: {
        policies: [],
      },
    },
  ],
};





// 'use strict';

// module.exports = {
//   routes: [
//     {
//       method: "GET",
//       path: "/cart/me",
//       handler: "cart.getMyCart", // Maps to the getMyCart method in src/api/cart/controllers/cart.js
//     },
//     {
//       method: "POST",
//       path: "/cart/add",
//       handler: "cart.addProductToCart", // Maps to the addProductToCart method
      
//     },
//     {
//       method: "DELETE",
//       path: "/cart/remove/:productId", // Uses a URL parameter for productId
//       handler: "cart.removeProductFromCart", // Maps to the removeProductFromCart method
      
//     },
//     {
//       method: "POST",
//       path: "/cart/clear",
//       handler: "cart.clearCart", // Maps to the clearCart method
//     },
//     {
//       method: "GET",
//       path: "/cart/summary",
//       handler: "cart.getCartSummary", // Maps to the getCartSummary method
//     },
//   ],
// };