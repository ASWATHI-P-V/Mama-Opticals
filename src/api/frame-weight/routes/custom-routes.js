module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/frame-weights/:id',
      handler: 'frame-weight.findOne',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    {
        method: 'GET',
        path: '/frame-weights',
        handler: 'frame-weight.find',
        config: {
          auth: false,
          policies: [],
          middlewares: [],
        },
    }
  ],
};

