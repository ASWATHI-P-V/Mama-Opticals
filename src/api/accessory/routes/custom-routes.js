module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/accessories',
      handler: 'accessory.find',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/accessories/getMyWishlist',
      handler: 'accessory.getMyWishlist',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/accessories/:id',
      handler: 'accessory.findOne',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/accessories/:id/similar',
      handler: 'accessory.findSimilar',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'POST',
      path: '/accessories/toggleWishlist/:accessoryId',
      handler: 'accessory.toggleWishlist',
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ]
};