// src/api/spectacles-mise/routes/spectacles-mise.js

module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/spectacles-mise/options',
      handler: 'spectacles-mise.findAllOptions',
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};