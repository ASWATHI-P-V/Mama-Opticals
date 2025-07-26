// src/api/review/routes/review.js

"use strict";

const { createCoreRouter } = require("@strapi/strapi").factories;

module.exports = createCoreRouter("api::review.review", {
  routes: [
    {
      method: "GET",
      path: "/reviews",
      handler: "review.find",
    },

    {
      method: "GET",
      path: "/reviews/:id",
      handler: "review.findOne",
    },

    {
      method: "POST",
      path: "/reviews",
      handler: "review.create",
    },

    {
      method: "PUT",
      path: "/reviews/:id",
      handler: "review.update",
    },

    {
      method: "DELETE",
      path: "/reviews/:id",
      handler: "review.delete",
    },
  ],
});
