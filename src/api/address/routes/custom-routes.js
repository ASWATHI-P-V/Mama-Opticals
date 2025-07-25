// Path: src/api/address/routes/address.js

module.exports = {
  routes: [
    {
      method: "POST",
      path: "/addresses",
      handler: "address.create",
    },
    {
      method: "GET",
      path: "/addresses",
      handler: "address.find",
    },
    {
      method: "GET",
      path: "/addresses/:id",
      handler: "address.findOne",
    },
    {
      method: "PUT",
      path: "/addresses/:id",
      handler: "address.update",
    },
    {
      method: "DELETE",
      path: "/addresses/:id",
      handler: "address.delete",
    },
    {
      method: "PUT",
      path: "/addresses/setDefault/:id",
      handler: "address.setDefault",
    }
  ],
};
