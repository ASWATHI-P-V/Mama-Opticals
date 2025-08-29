module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/contact-lenses',
      handler: 'contact-lens.find',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/contact-lenses/getMyWishlist',
      handler: 'contact-lens.getMyWishlist',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/contact-lenses/:id',
      handler: 'contact-lens.findOne',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/contact-lenses/:id/similar',
      handler: 'contact-lens.findSimilar',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'POST',
      path: '/contact-lenses/toggleWishlist/:lensId',
      handler: 'contact-lens.toggleWishlist',
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ]
};