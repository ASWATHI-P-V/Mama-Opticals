module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/brands/:id',
      handler: 'brand.findOne',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    {
        method: 'GET',
        path: '/brands',
        handler: 'brand.find',
        config: {
          auth: false,
          policies: [],
          middlewares: [],
        },
    }
  ],
};

