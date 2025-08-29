// 'use strict';

// const { createCoreController } = require('@strapi/strapi').factories;
// const strapiUtils = require("@strapi/utils");
// const { ValidationError, NotFoundError } = strapiUtils.errors;

// // A basic error handler function for consistency
// const handleErrors = (error) => {
//   console.error("Error occurred:", error);
//   const errorMessage = String(error.message || '');
//   if (error instanceof ValidationError) {
//     return { message: errorMessage };
//   }
//   if (error instanceof NotFoundError) {
//     return { message: errorMessage };
//   }
//   return { message: "An unexpected error occurred." };
// };

// const handleStatusCode = (error) => {
//   if (error instanceof ValidationError) return 400;
//   if (error instanceof NotFoundError) return 404;
//   return 500;
// };

// module.exports = createCoreController("api::type.type", ({ strapi }) => ({
//   /**
//    * Find all 'types' and return a success message with the data.
//    *
//    * @param {object} ctx Koa context.
//    * @returns {object} The response object with success status and data.
//    */
//   async find(ctx) {
//     try {
//       // Fetch all types using Strapi's entity service
//       const types = await strapi.entityService.findMany("api::type.type", {
//         populate: ['image'],
//       });

//       // Sanitize the output to ensure no sensitive data is exposed
//       const sanitizedTypes = await Promise.all(
//         types.map((type) =>
//           strapiUtils.sanitize.contentAPI.output(
//             type,
//             strapi.contentType("api::type.type")
//           )
//         )
//       );

//       // Return a success response in the desired format
//       return ctx.send({
//         success: true,
//         message: "Types retrieved successfully.",
//         data: sanitizedTypes,
//       });

//     } catch (error) {
//       // Handle any errors that occur during the process
//       const customizedError = handleErrors(error);
//       ctx.status = handleStatusCode(error) || 500;
//       return ctx.send({ success: false, message: customizedError.message });
//     }
//   },
// }));

'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const strapiUtils = require("@strapi/utils");
const { ValidationError, NotFoundError } = strapiUtils.errors;

// A basic error handler function for consistency
const handleErrors = (error) => {
  console.error("Error occurred:", error);
  const errorMessage = String(error.message || '');
  if (error instanceof ValidationError) {
    return { message: errorMessage };
  }
  if (error instanceof NotFoundError) {
    return { message: errorMessage };
  }
  return { message: "An unexpected error occurred." };
};

const handleStatusCode = (error) => {
  if (error instanceof ValidationError) return 400;
  if (error instanceof NotFoundError) return 404;
  return 500;
};

module.exports = createCoreController("api::type.type", ({ strapi }) => ({
  /**
   * Find all 'types' and return a success message with the data,
   * including all associated eyeware.
   *
   * @param {object} ctx Koa context.
   * @returns {object} The response object with success status and data.
   */
  async find(ctx) {
    try {
      // Fetch all types and deeply populate the 'eyeware' relation
      const types = await strapi.entityService.findMany("api::type.type", {
        populate: {
          image: true,
          eyeware_type: {
            populate: {
              sunglasses: {
                populate: {
                  brands: true,
                  reviews: true,
                  images: true,
                },
              },
              computer_glasses: {
                populate: {
                  brands: true,
                  reviews: true,
                  images: true,
                },
              },
              prescription_glasses: {
                populate: {
                  brands: true,
                  reviews: true,
                  images: true,
                },
              },
              contact_lenses: {
                populate: {
                  brands: true,
                  reviews: true,
                  images: true,
                },
              },
              accessories: {
                populate: {
                  brands: true,
                  reviews: true,
                  images: true,
                },
              },
            },
          },
        },
      });

      // The Strapi entity service automatically sanitizes the output,
      // so manual sanitization is no longer needed.
      
      // Return a success response in the desired format
      return ctx.send({
        success: true,
        message: "Types retrieved successfully.",
        data: types,
      });

    } catch (error) {
      // Handle any errors that occur during the process
      const customizedError = handleErrors(error);
      ctx.status = handleStatusCode(error) || 500;
      return ctx.send({ success: false, message: customizedError.message });
    }
  },
}));

