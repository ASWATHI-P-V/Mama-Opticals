exports.handleErrors = (error) => {
  if (error.name === "ValidationError" && error.details?.errors) {
    const errors = error.details.errors;
    const errorMessages = [];

    if (errors.some((e) => e.path.includes("phone"))) {
      errorMessages.push("Phone number already exists.");
    }

    if (errors.some((e) => e.path.includes("email"))) {
      errorMessages.push("Email address already exists.");
    }

    if (errorMessages.length > 0) {
      error.message = errorMessages.join(" ");
    }
  }

  return error;
};



exports.userAllDetails = async (userId) => {
  const populate = {
    // Already present: User's profile image
    profileImage: {
      fields: ["id"],
    },
    // E-commerce specific relationships:
    orders: { // Assuming a 'User has many Orders' relationship
      fields: ["id"],
      populate: {
        order_items: { // Assuming an 'Order has many Order Items' relationship
          fields: ["id"],
        },
      },
    },
    addresses: { // Assuming a 'User has many Addresses' relationship
      fields: ["id"],
    },
    wishlists: { // Assuming a 'User has many Wishlists' or 'User has many Product_Favorites' relationship
      fields: ["id"],
      // If wishlist items are separate entities, you might need another nested populate here
      // e.g., populate: { products: { fields: ["id"] } }
    },
    reviews: { // Assuming a 'User has many Product Reviews' relationship
      fields: ["id"],
    },
    cart: { // Assuming a 'User has one Cart' relationship
      fields: ["id"],
      populate: {
        cart_items: { // Assuming 'Cart has many Cart Items'
          fields: ["id"],
        },
      },
    },
    payment_methods: { // Assuming a 'User has many Payment Methods' relationship
      fields: ["id"],
    },
    // Add any other e-commerce specific relations your project has
    // e.g., transactions, refund_requests, coupons, etc.
  };

  const userFound = await strapi.entityService.findOne(
    "plugin::users-permissions.user", // Assuming users are still managed by users-permissions plugin
    userId,
    {
      fields: ["id"], // Only fetch user's own ID initially, details are in populate
      populate: {
        ...populate,
      },
    }
  );

  return userFound;
};

/**
 * Deletes all related e-commerce data for a given user.
 * This function expects the 'user' object to be pre-populated with
 * the IDs of its relations using a function like 'userAllDetails'.
 *
 * @param {object} user - The user object with populated relations (containing only IDs).
 */
exports.deleteUserRelationDetails = async (user) => {
  if (!user) {
    console.warn("deleteUserRelationDetails: No user object provided. Skipping deletion.");
    return;
  }

  console.log(`Starting deletion of related data for user ID: ${user.id}`); // Added console log

  // Delete profile image
  if (user.profileImage) {
    console.log(`Deleting profile image for user ${user.id}: ${user.profileImage.id}`); // Added console log
    await strapi.plugins.upload.services.upload.remove(user.profileImage);
  }

  // Delete orders and their items
  if (user.orders && user.orders.length > 0) {
    console.log(`Deleting ${user.orders.length} orders for user ${user.id}`); // Added console log
    for (const order of user.orders) {
      if (order.order_items && order.order_items.length > 0) {
        console.log(`Deleting ${order.order_items.length} order items for order ${order.id}`); // Added console log
        await Promise.all(order.order_items.map(item =>
          strapi.entityService.delete('api::order-item.order-item', item.id) // <<-- REPLACE WITH YOUR ORDER_ITEM UID
          .catch(e => console.error(`Error deleting order item ${item.id}:`, e.message)) // Added error handling
        ));
      }
      await strapi.entityService.delete('api::order.order', order.id) // <<-- REPLACE WITH YOUR ORDER UID
      .catch(e => console.error(`Error deleting order ${order.id}:`, e.message)); // Added error handling
    }
  }

  // Delete addresses
  if (user.addresses && user.addresses.length > 0) {
    console.log(`Deleting ${user.addresses.length} addresses for user ${user.id}`); // Added console log
    await Promise.all(user.addresses.map(address =>
      strapi.entityService.delete('api::address.address', address.id) // <<-- REPLACE WITH YOUR ADDRESS UID
      .catch(e => console.error(`Error deleting address ${address.id}:`, e.message)) // Added error handling
    ));
  }

  // Delete wishlists
  if (user.wishlists && user.wishlists.length > 0) {
    console.log(`Deleting ${user.wishlists.length} wishlists for user ${user.id}`); // Added console log
    await Promise.all(user.wishlists.map(wishlist =>
      strapi.entityService.delete('api::wishlist.wishlist', wishlist.id) // <<-- REPLACE WITH YOUR WISHLIST UID
      .catch(e => console.error(`Error deleting wishlist ${wishlist.id}:`, e.message)) // Added error handling
    ));
  }

  // Delete reviews
  if (user.reviews && user.reviews.length > 0) {
    console.log(`Deleting ${user.reviews.length} reviews for user ${user.id}`); // Added console log
    await Promise.all(user.reviews.map(review =>
      strapi.entityService.delete('api::review.review', review.id) // <<-- REPLACE WITH YOUR REVIEW UID
      .catch(e => console.error(`Error deleting review ${review.id}:`, e.message)) // Added error handling
    ));
  }

  // Delete cart and its items (assuming user has one cart, and it's deleted)
  if (user.cart) {
    console.log(`Deleting cart ${user.cart.id} for user ${user.id}`); // Added console log
    if (user.cart.cart_items && user.cart.cart_items.length > 0) {
      console.log(`Deleting ${user.cart.cart_items.length} cart items for cart ${user.cart.id}`); // Added console log
      await Promise.all(user.cart.cart_items.map(item =>
        strapi.entityService.delete('api::cart-item.cart-item', item.id) // <<-- REPLACE WITH YOUR CART_ITEM UID
        .catch(e => console.error(`Error deleting cart item ${item.id}:`, e.message)) // Added error handling
      ));
    }
    await strapi.entityService.delete('api::cart.cart', user.cart.id) // <<-- REPLACE WITH YOUR CART UID
    .catch(e => console.error(`Error deleting cart ${user.cart.id}:`, e.message)); // Added error handling
  }

  // Delete payment methods
  if (user.payment_methods && user.payment_methods.length > 0) {
    console.log(`Deleting ${user.payment_methods.length} payment methods for user ${user.id}`); // Added console log
    await Promise.all(user.payment_methods.map(method =>
      strapi.entityService.delete('api::payment-method.payment-method', method.id) // <<-- REPLACE WITH YOUR PAYMENT_METHOD UID
      .catch(e => console.error(`Error deleting payment method ${method.id}:`, e.message)) // Added error handling
    ));
  }

  console.log(`Finished deleting related data for user ID: ${user.id}`); // Added console log

  // Important: The user object itself is deleted in the calling controller (`deleteAccount`)
};




// exports.calculateIsProfileCompleted = (user) => {
//   return !!(user?.name && user?.email && user?.phone && user?.userLocationTown);
// };

// exports.formatUserLocation = (userLocationTown) => {
//   if (userLocationTown) {
//     return {
//       locationDistrict: {
//         id: userLocationTown.locationDistrict.id,
//         name: userLocationTown.locationDistrict.name,
//       },
//       locationTown: {
//         id: userLocationTown.id,
//         name: userLocationTown.name,
//         ...(userLocationTown?.latitude && {
//           latitude: userLocationTown.latitude,
//         }),
//         ...(userLocationTown?.longitude && {
//           longitude: userLocationTown.longitude,
//         }),
//       },
//     };
//   }

//   return null;
// };

// exports.transferUserAds = async (transferPhone) => {
//   return await strapi.entityService.findMany("api::ad.ad", {
//     publicationState: "live",
//     sort: { createdAt: "desc" },
//     filters: {
//       transferPhone: transferPhone,
//     },
//     populate: {
//       adFavourites: {
//         fields: ["id"],
//       },
//       adChats: {
//         fields: ["id"],
//       },
//     },
//   });
// };

// exports.transferAds = async (adId, userId) => {
//   const adTransferred = await strapi.entityService.update("api::ad.ad", adId, {
//     data: {
//       user: userId,
//       transferPhone: null,
//     },
//   });

//   if (adTransferred) {
//     if (adTransferred.adChats?.length) {
//       await Promise.all(
//         adTransferred.adChats.map(async (chat) => {
//           return await strapi.entityService.delete(
//             "api::ad-chat.ad-chat",
//             chat.id
//           );
//         })
//       );
//     }
//   }
// };

// exports.transferUserShowrooms = async (transferPhone) => {
//   return await strapi.entityService.findMany("api::ad-showroom.ad-showroom", {
//     publicationState: "live",
//     sort: { createdAt: "desc" },
//     filters: {
//       transferPhone: transferPhone,
//     },
//   });
// };

// exports.transferShowrooms = async (showroomId, userId) => {
//   return await strapi.entityService.update(
//     "api::ad-showroom.ad-showroom",
//     showroomId,
//     {
//       data: {
//         user: userId,
//         transferPhone: null,
//       },
//     }
//   );
// };


// exports.userAllDetails = async (userId) => {
//   const populate = {
//     profileImage: {
//       fields: ["id"],
//     },
//     ads: {
//       fields: ["id"],
//       populate: {
//         images: {
//           fields: ["id"],
//         },
//         adFavourites: {
//           fields: ["id"],
//         },
//         adChats: {
//           fields: ["id"],
//         },
//       },
//     },
//     adShowrooms: {
//       fields: ["id"],
//       populate: {
//         images: {
//           fields: ["id"],
//         },
//         logo: {
//           fields: ["id"],
//         },
//         adShowroomOperators: {
//           fields: ["id"],
//           populate: {
//             adShowrooms: true,
//           },
//         },
//         adShowroomRatings: {
//           fields: ["id"],
//         },
//       },
//     },
//     adSubscriptions: {
//       fields: ["id"],
//     },
//     adBoosts: {
//       fields: ["id"],
//     },
//   };

//   const userFound = await strapi.entityService.findOne(
//     "plugin::users-permissions.user",
//     userId,
//     {
//       fields: ["id"],
//       populate: {
//         ...populate,
//       },
//     }
//   );

//   return userFound;
// };

// exports.deleteAds = async (ad) => {
//   const adDeleted = await strapi.entityService.delete("api::ad.ad", ad.id);

//   if (adDeleted) {
//     if (ad.images?.length) {
//       await Promise.all(
//         ad.images.map(async (image) => {
//           await strapi.entityService.delete("plugin::upload.file", image.id);

//           return await strapi.plugins.upload.services.upload.remove(image);
//         })
//       );
//     }

//     if (ad.adChats?.length) {
//       await Promise.all(
//         ad.adChats.map(async (chat) => {
//           return await strapi.entityService.delete(
//             "api::ad-chat.ad-chat",
//             chat.id
//           );
//         })
//       );
//     }
//   }
// };

// exports.deleteUserRelationDetails = async (user) => {
//   if (user.profileImage) {
//     await strapi.entityService.delete(
//       "plugin::upload.file",
//       user.profileImage.id
//     );

//     return await strapi.plugins.upload.services.upload.remove(
//       user.profileImage
//     );
//   }

//   if (user.ads?.length) {
//     await Promise.all(user.ads.map((ad) => exports.deleteAds(ad)));
//   }

//   if (user.adShowrooms?.length) {
//     await Promise.all(
//       user.adShowrooms.map(async (showroom) => {
//         await strapi.entityService.delete(
//           "api::ad-showroom.ad-showroom",
//           showroom.id
//         );

//         if (showroom?.images?.length) {
//           await Promise.all(
//             showroom.images.map(async (image) => {
//               await strapi.entityService.delete(
//                 "plugin::upload.file",
//                 image.id
//               );

//               return await strapi.plugins["upload"].services.upload.remove(
//                 image
//               );
//             })
//           );
//         }

//         if (showroom?.logo) {
//           await strapi.entityService.delete(
//             "plugin::upload.file",
//             showroom.logo.id
//           );

//           return await strapi.plugins.upload.services.upload.remove(
//             showroom.logo
//           );
//         }

//         if (showroom?.adShowroomOperators?.length) {
//           await Promise.all(
//             showroom.adShowroomOperators.map(async (operator) => {
//               if (operator?.adShowrooms?.length === 1) {
//                 return await strapi.entityService.delete(
//                   "api::ad-showroo-operato.ad-showroo-operato",
//                   operator.id
//                 );
//               }
//             })
//           );
//         }

//         if (showroom?.adShowroomRatings?.length) {
//           await Promise.all(
//             showroom.adShowroomRatings.map(async (rating) => {
//               return await strapi.entityService.delete(
//                 "api::ad-showroo-rating.ad-showroo-rating",
//                 rating.id
//               );
//             })
//           );
//         }
//       })
//     );
//   }

//   if (user.adSubscriptions?.length) {
//     await Promise.all(
//       user.adSubscriptions.map(async (subscription) => {
//         return await strapi.entityService.delete(
//           "api::ad-subscription.ad-subscription",
//           subscription.id
//         );
//       })
//     );
//   }

//   if (user.adBoosts?.length) {
//     await Promise.all(
//       user.adBoosts.map(async (boost) => {
//         return await strapi.entityService.delete(
//           "api::ad-boost.ad-boost",
//           boost.id
//         );
//       })
//     );
//   }
// };
