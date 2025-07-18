// src/api/product/routes/product.js

module.exports = {
  routes: [
    // Keep your existing auto-generated routes (find, findOne, create, update, delete) here
    // Example:
    // {
    //   method: 'GET',
    //   path: '/products',
    //   handler: 'api::product.product.find',
    //   config: { policies: [] },
    // },
    // {
    //   method: 'GET',
    //   path: '/products/:id',
    //   handler: 'api::product.product.findOne',
    //   config: { policies: [] },
    // },
    // ... other auto-generated routes

    // ---- NEW WISHLIST ROUTES ----

    {
      method: 'POST',
      path: '/products/:productId/wishlist',
      handler: 'api::product.product.addToWishlist',
    },
    {
      method: 'DELETE',
      path: '/products/:productId/wishlist',
      handler: 'api::product.product.removeFromWishlist',
    },
    {
      method: 'GET',
      path: '/products/my-wishlist',
      handler: 'api::product.product.getMyWishlist',
    },
    { // IMPORTANT: Place specific routes before general ones!
      method: 'DELETE',
      path: '/products/my-wishlist/clear',
      handler: 'api::product.product.clearMyWishlist',
    },
  ],
};