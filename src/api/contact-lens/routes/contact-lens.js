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
      path: '/contact-lenses/:id',
      handler: 'contact-lens.findOne',
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};