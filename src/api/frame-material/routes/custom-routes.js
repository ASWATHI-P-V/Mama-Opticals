module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/frame-materials/:id',
      handler: 'frame-material.findOne',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    {
        method: 'GET',
        path: '/frame-materials',
        handler: 'frame-material.find',
        config: {
          auth: false,
          policies: [],
          middlewares: [],
        },
    }
  ],
};

