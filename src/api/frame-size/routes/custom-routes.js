module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/frame-sizes/:id',
      handler: 'frame-size.findOne',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    {
        method: 'GET',
        path: '/frame-sizes',
        handler: 'frame-size.find',
        config: {
          auth: false,
          policies: [],
          middlewares: [],
        },
    }
  ],
};

