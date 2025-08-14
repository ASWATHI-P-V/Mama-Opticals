module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/types',
      handler: 'type.find',
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};
