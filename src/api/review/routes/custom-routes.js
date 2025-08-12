module.exports = {
  routes: [
    {
      method: "GET",
      path: "/reviews",
      handler: "review.find",
      config: { auth: { required: false } },
    },
    {
      method: "GET",
      path: "/reviews/:id",
      handler: "review.findOne",
      config: { auth: { required: false } },
    },
    {
      method: "POST",
      path: "/reviews",
      handler: "review.create",
      config: { auth: { required: true } }, // Must be logged in
    },
    {
      method: "DELETE",
      path: "/reviews/:id",
      handler: "review.delete",
      config: { auth: { required: true } }, // Must be logged in
    },
  ],
};
