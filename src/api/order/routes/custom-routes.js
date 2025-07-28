module.exports = {
  routes: [
    // Default Strapi Core Routes (can be uncommented or removed based on your needs)
    // {
    //   method: 'GET',
    //   path: '/orders',
    //   handler: 'api::order.order.find',
    //   config: { policies: [] },
    // },
    // {
    //   method: 'GET',
    //   path: '/orders/:id',
    //   handler: 'api::order.order.findOne',
    //   config: { policies: [] },
    // },
    // {
    //   method: 'POST',
    //   path: '/orders',
    //   handler: 'api::order.order.create', // Default Strapi create, expects data:{...}
    //   config: { policies: [] },
    // },
    // {
    //   method: 'PUT',
    //   path: '/orders/:id',
    //   handler: 'api::order.order.update',
    //   config: { policies: [] },
    // },
    // {
    //   method: 'DELETE',
    //   path: '/orders/:id',
    //   handler: 'api::order.order.delete',
    //   config: { policies: [] },
    // },

    // Custom route to create an order from the user's cart
    {
      method: "POST",
      path: "/orders/create-from-cart",
      handler: "api::order.order.createFromCart",
      config: {
        policies: [],
        middlewares: [],
        auth: {
          // Ensures only authenticated users can use this
          scope: ["api::order.order.createFromCart"],
        },
      },
    },

    // Custom route to get all orders for the authenticated user
    {
      method: "GET",
      path: "/orders/me",
      handler: "api::order.order.getMyOrders",
      config: {
        policies: [],
        middlewares: [],
        auth: {
          scope: ["api::order.order.getMyOrders"],
        },
      },
    },
    {
      method: "GET",
      path: "/orders/track/:orderId",
      handler: "order.trackOrder",
      config: {
        auth: {
          scope: ["api::order.order.trackOrder"],
        },
        middlewares: [],
        policies: [],
      },
    },
  ],
};
