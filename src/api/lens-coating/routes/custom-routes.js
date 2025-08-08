module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/lens-coatings/:id',
      handler: 'lens-coating.findOne',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    {
        method: 'GET',
        path: '/lens-coatings',
        handler: 'lens-coating.find',
        config: {
          auth: false,
          policies: [],
          middlewares: [],
        },
    }
  ],
};

