module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/lens-thickness/:id',
      handler: 'lens-thickness.findOne',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    {
        method: 'GET',
        path: '/lens-thickness',
        handler: 'lens-thickness.find',
        config: {
          auth: false,
          policies: [],
          middlewares: [],
        },
    }
  ],
};

