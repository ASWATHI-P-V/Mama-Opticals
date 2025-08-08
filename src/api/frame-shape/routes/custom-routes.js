module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/frame-shapes/:id',
      handler: 'frame-shape.findOne',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    {
        method: 'GET',
        path: '/frame-shapes',
        handler: 'frame-shape.find',
        config: {
          auth: false,
          policies: [],
          middlewares: [],
        },
    }
  ],
};

