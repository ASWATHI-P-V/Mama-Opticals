// src/api/product-variant/controllers/product-variant.js

"use strict";

/**
 * product-variant controller
 */

const { createCoreController } = require("@strapi/strapi").factories;
const { sanitize } = require('@strapi/utils');
module.exports = createCoreController(
  "api::product-variant.product-variant",
  ({ strapi }) => ({
    // Add your custom method here
    async findProductVariants(ctx) {
      try {
        const { id } = ctx.params;

        if (!id) {
          return ctx.badRequest({
            success: false,
            message: "Product ID is required.",
            data: null,
          });
        }

        const variants = await strapi.entityService.findMany(
          "api::product-variant.product-variant",
          {
            filters: {
              product: { id: id },
              isActive: true,
              stock: { $gt: 0 },
            },
            populate: {
              color: true,
              frame_size: true,
              product: {
                populate: {
                  image: true,
                  category: true,
                  brands: true,
                },
              },
            },
          }
        );

        if (!variants || variants.length === 0) {
          return ctx.notFound({
            success: false,
            message: "No active variants found for this product.",
            data: null,
          });
        }

        const colors = new Set();
        const frameSizes = new Set();
        let productDetails = null;

        variants.forEach((variant) => {
          if (variant.color) {
            colors.add(JSON.stringify(variant.color));
          }
          if (variant.frame_size) {
            frameSizes.add(JSON.stringify(variant.frame_size));
          }
          if (!productDetails && variant.product) {
            productDetails = variant.product;
          }
        });

        const uniqueColors = Array.from(colors).map((c) => JSON.parse(c));
        const uniqueFrameSizes = Array.from(frameSizes).map((s) =>
          JSON.parse(s)
        );

        
        const sanitizedProduct = productDetails
          ? await sanitize.contentAPI.output(
              productDetails,
              strapi.contentType("api::product.product")
            )
          : null;
        return ctx.send({
          success: true,
          message: "Product variants retrieved successfully.",
          data: {
            product: sanitizedProduct,
            colors: uniqueColors,
            frame_sizes: uniqueFrameSizes,
          },
        });
      } catch (err) {
        console.error(err);
        ctx.status = 500;
        return ctx.send({
          success: false,
          message: "An internal server error occurred.",
          data: null,
        });
      }
    },
  })
);
