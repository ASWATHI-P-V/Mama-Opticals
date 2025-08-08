module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/lens-types/:id',
      handler: 'lens-type.findOne',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    {
        method: 'GET',
        path: '/lens-types',
        handler: 'lens-type.find',
        config: {
          auth: false,
          policies: [],
          middlewares: [],
        },
    }
  ],
};

