// src/api/product-variant/controllers/product-variant.js

"use strict";

const { createCoreController } = require("@strapi/strapi").factories;
const { sanitize } = require('@strapi/utils');
module.exports = createCoreController(
  "api::product-variant.product-variant",
  ({ strapi }) => ({
    async findProductVariants(ctx) {
      try {
        const { id } = ctx.params;
        const user = ctx.state.user;

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
              color_picker: true,
              frame_size: true,
              product: {
                populate: {
                  image: true,
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
        let totalCombinedStock = 0;

        variants.forEach((variant) => {
          if (variant.color_picker) {
            colors.add(JSON.stringify(variant.color_picker));
          }
          if (variant.frame_size) {
            frameSizes.add(JSON.stringify(variant.frame_size));
          }
          if (!productDetails && variant.product) {
            productDetails = variant.product;
          }
          totalCombinedStock += variant.stock;
        });

        // Initialize cart-related variables
        let totalQuantityInCart = 0;
        let variantQuantitiesInCart = new Map();

        // If a user is authenticated, query their cart for this product
        if (user && user.id) {
          const cartItems = await strapi.db.query("api::cart.cart").findMany({
            where: {
              user: user.id,
              product_variant: {
                product: { id: id }
              }
            },
            select: ["quantity"],
            populate: {
              product_variant: {
                select: ["id"]
              }
            }
          });
          
          if (cartItems && cartItems.length > 0) {
            cartItems.forEach(item => {
              if (item.product_variant && item.quantity) {
                totalQuantityInCart += item.quantity;
                variantQuantitiesInCart.set(item.product_variant.id, item.quantity);
              }
            });
          }
        }

        const uniqueColors = Array.from(colors).map((c) => JSON.parse(c));
        const uniqueFrameSizes = Array.from(frameSizes).map((s) => JSON.parse(s));

        const sanitizedProduct = productDetails
          ? await sanitize.contentAPI.output(
              productDetails,
              strapi.contentType("api::product.product")
            )
          : null;
          
        const sanitizedVariants = await sanitize.contentAPI.output(
          variants,
          strapi.contentType("api::product-variant.product-variant")
        );
        
        // Map over the sanitized variants to add the available stock
        const variantsWithAvailableStock = sanitizedVariants.map(variant => {
          const quantityInCart = variantQuantitiesInCart.get(variant.id) || 0;
          return {
            ...variant,
            // Calculate available stock by subtracting the quantity in the cart
            available_stock: variant.stock - quantityInCart
          };
        });

        return ctx.send({
          success: true,
          message: "Product variants retrieved successfully.",
          data: {
            product: sanitizedProduct,
            colors: uniqueColors,
            frame_sizes: uniqueFrameSizes,
            variants: variantsWithAvailableStock,
            combined_stock_total: totalCombinedStock,
            // Calculate combined stock available by subtracting total cart quantity
            combined_stock_available: totalCombinedStock - totalQuantityInCart,
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




// // src/api/product-variant/controllers/product-variant.js

// "use strict";

// const { createCoreController } = require("@strapi/strapi").factories;
// const { sanitize } = require('@strapi/utils');
// module.exports = createCoreController(
//   "api::product-variant.product-variant",
//   ({ strapi }) => ({
//     // Add your custom method here
//     async findProductVariants(ctx) {
//       try {
//         const { id } = ctx.params;

//         if (!id) {
//           return ctx.badRequest({
//             success: false,
//             message: "Product ID is required.",
//             data: null,
//           });
//         }

//         const variants = await strapi.entityService.findMany(
//           "api::product-variant.product-variant",
//           {
//             filters: {
//               product: { id: id },
//               isActive: true,
//               stock: { $gt: 0 },
//             },
//             populate: {
//               color: true,
//               frame_size: true,
//               product: {
//                 populate: {
//                   image: true,
//                   category: true,
//                   brands: true,
//                 },
//               },
//             },
//           }
//         );

//         if (!variants || variants.length === 0) {
//           return ctx.notFound({
//             success: false,
//             message: "No active variants found for this product.",
//             data: null,
//           });
//         }

//         const colors = new Set();
//         const frameSizes = new Set();
//         let productDetails = null;

//         variants.forEach((variant) => {
//           if (variant.color) {
//             colors.add(JSON.stringify(variant.color));
//           }
//           if (variant.frame_size) {
//             frameSizes.add(JSON.stringify(variant.frame_size));
//           }
//           if (!productDetails && variant.product) {
//             productDetails = variant.product;
//           }
//         });

//         const uniqueColors = Array.from(colors).map((c) => JSON.parse(c));
//         const uniqueFrameSizes = Array.from(frameSizes).map((s) =>
//           JSON.parse(s)
//         );

        
//         const sanitizedProduct = productDetails
//           ? await sanitize.contentAPI.output(
//               productDetails,
//               strapi.contentType("api::product.product")
//             )
//           : null;
//         return ctx.send({
//           success: true,
//           message: "Product variants retrieved successfully.",
//           data: {
//             product: sanitizedProduct,
//             colors: uniqueColors,
//             frame_sizes: uniqueFrameSizes,
//           },
//         });
//       } catch (err) {
//         console.error(err);
//         ctx.status = 500;
//         return ctx.send({
//           success: false,
//           message: "An internal server error occurred.",
//           data: null,
//         });
//       }
//     },
//   })
// );
