// src/api/spectacles-mise/controllers/spectacles-mise.js

"use strict";

module.exports = {
  findAllOptions: async (ctx) => {
    try {
      const { product } = ctx.query;
      // Fetch all colors
      const colors = await strapi.entityService.findMany("api::color.color", {
        fields: ["id", "name"],
        sort: { name: "asc" },
        filters: {
          product_variants: {
            ...(product === "spectacles"
              ? {
                  product: { $notNull: true },
                }
              : product === "contact_lens"
              ? {
                  contact_lens: { $notNull: true },
                }
              : product === "accessories"
              ? {
                  accessory: { $notNull: true },
                }
              : {}),
          },
        },
      });

      let frameSizes = [];
      if (product === "spectacles") {
        // Fetch all frame sizes only if the product is 'spectacles'
        frameSizes = await strapi.entityService.findMany(
          "api::frame-size.frame-size",
          {
            fields: ["id", "name"],
            sort: { name: "asc" },
            filters: {
              // Filter to only show frame sizes for spectacles
              products: {
                $notNull: true,
              },
            },
          }
        );
      }

      ctx.body = {
        success: true,
        message: "All colors and frame sizes retrieved successfully.",
        data: {
          colors: colors,
          frame_sizes: frameSizes,
        },
      };
    } catch (err) {
      console.error(err);
      ctx.status = 500;
      ctx.body = {
        success: false,
        message: "An internal server error occurred.",
        data: null,
      };
    }
  },
};

// // src/api/spectacles-mise/controllers/spectacles-mise.js

// "use strict";

// module.exports = {
//   findAllOptions: async (ctx) => {
//     try {
//       const { product } = ctx.query;
//       // Fetch all colors
//       const colors = await strapi.entityService.findMany("api::color.color", {
//         fields: ["id", "name"],
//         sort: { name: "asc" },
//         filters: {
//           product_variants: {
//             ...(product === "spectacles"
//               ? {
//                   product: { $notNull: true },
//                 }
//               : product === "contact_lens"
//               ? {
//                   contact_lens: { $notNull: true },
//                 }
//               : product === "accessories"
//               ? {
//                   accessory: { $notNull: true },
//                 }
//               : {}),
//           },
//         },
//       });

//       // Fetch all frame sizes
//       const frameSizes = await strapi.entityService.findMany(
//         "api::frame-size.frame-size",
//         {
//           fields: ["id", "name"],
//           sort: { name: "asc" },
//           filters: {
//             // Filter to only show frame sizes for spectacles
//             products: {
//               ...(product === "spectacles"
//                 ? { $notNull: true }
//                 : { $notNull: false })
//             },
//           },
//         }
//       );

//       // // Fetch all frame sizes
//       // const frameSizes = await strapi.entityService.findMany(
//       //   "api::frame-size.frame-size",
//       //   {
//       //     fields: ["id", "name"],
//       //     sort: { name: "asc" },
//       //   }
//       // );

//       ctx.body = {
//         success: true,
//         message: "All colors and frame sizes retrieved successfully.",
//         data: {
//           colors: colors,
//           frame_sizes: frameSizes,
//         },
//       };
//     } catch (err) {
//       console.error(err);
//       ctx.status = 500;
//       ctx.body = {
//         success: false,
//         message: "An internal server error occurred.",
//         data: null,
//       };
//     }
//   },
// };
