// src/api/product/routes/product.js

module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/products',
      handler: 'api::product.product.find', 
    },
    {
      method: 'POST',
      path: '/products/toggleWishlist/:productId',
      handler: 'api::product.product.toggleWishlist',
    },
    // {
    //   method: 'DELETE',
    //   path: '/products/:productId/wishlist',
    //   handler: 'api::product.product.removeFromWishlist',
    // },
    {
      method: 'GET',
      path: '/products/my-wishlist',
      handler: 'api::product.product.getMyWishlist',
    },
    // { 
    //   method: 'DELETE',
    //   path: '/products/my-wishlist/clear',
    //   handler: 'api::product.product.clearMyWishlist',
    // },
  ],
};