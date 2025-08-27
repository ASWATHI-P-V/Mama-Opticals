module.exports = {
  async afterCreate(event) {
    const { result } = event;
    // Check which entity was reviewed and update its stats
    if (result.product?.id) {
      await updateProductReviewStats(result.product.id);
    } else if (result.contact_lens?.id) {
      await updateContactLensReviewStats(result.contact_lens.id);
    } else if (result.accessory?.id) {
      await updateAccessoryReviewStats(result.accessory.id);
    }
  },

  async afterUpdate(event) {
    const { result } = event;
    if (result.product?.id) {
      await updateProductReviewStats(result.product.id);
    } else if (result.contact_lens?.id) {
      await updateContactLensReviewStats(result.contact_lens.id);
    } else if (result.accessory?.id) {
      await updateAccessoryReviewStats(result.accessory.id);
    }
  },

  async afterDelete(event) {
    const { result } = event;
    if (result.product?.id) {
      await updateProductReviewStats(result.product.id);
    } else if (result.contact_lens?.id) {
      await updateContactLensReviewStats(result.contact_lens.id);
    } else if (result.accessory?.id) {
      await updateAccessoryReviewStats(result.accessory.id);
    }
  },
};

// You need to create these new functions for your new content types
async function updateProductReviewStats(entityId) {
    // Fetch all reviews for the product
  const reviews = await strapi.db.query("api::review.review").findMany({
    where: { product: entityId },
    select: ["rating"],
  });

  const reviewCount = reviews.length;
  const averageRating =
    reviewCount > 0
      ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviewCount
      : 0;

  // Update the product with new stats
  await strapi.db.query("api::product.product").update({
    where: { id: entityId },
    data: {
      reviewCount,
      average_rating: parseFloat(averageRating.toFixed(2)),
    },
  });
}

async function updateContactLensReviewStats(entityId) {
    // Similar to the product function, but target 'api::contact-lens.contact-lens'
    const reviews = await strapi.db.query("api::review.review").findMany({
        where: { contact_lens: entityId },
        select: ["rating"],
    });
    const reviewCount = reviews.length;
    const averageRating = reviewCount > 0 ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviewCount : 0;
    await strapi.db.query("api::contact-lens.contact-lens").update({
        where: { id: entityId },
        data: {
            reviewCount,
            average_rating: parseFloat(averageRating.toFixed(2)),
        },
    });
}
async function updateAccessoryReviewStats(entityId) {
    // Similar logic for accessories, targeting 'api::accessory.accessory'
    const reviews = await strapi.db.query("api::review.review").findMany({
        where: { accessory: entityId },
        select: ["rating"],
    });
    const reviewCount = reviews.length;
    const averageRating = reviewCount > 0 ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviewCount : 0;
    await strapi.db.query("api::accessory.accessory").update({
        where: { id: entityId },
        data: {
            reviewCount,
            average_rating: parseFloat(averageRating.toFixed(2)),
        },
    });
}

// module.exports = {
//   async afterCreate(event) {
//     const { result } = event;
//     if (result.product?.id) {
//       await updateProductReviewStats(result.product.id);
//     }
//   },

//   async afterUpdate(event) {
//     const { result } = event;
//     if (result.product?.id) {
//       await updateProductReviewStats(result.product.id);
//     }
//   },

//   async afterDelete(event) {
//     const { result } = event;
//     if (result.product?.id) {
//       await updateProductReviewStats(result.product.id);
//     }
//   },
// };

// async function updateProductReviewStats(productId) {
//   // Fetch all reviews for the product
//   const reviews = await strapi.db.query("api::review.review").findMany({
//     where: { product: productId },
//     select: ["rating"],
//   });

//   const reviewCount = reviews.length;
//   const averageRating =
//     reviewCount > 0
//       ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviewCount
//       : 0;

//   // Update the product with new stats
//   await strapi.db.query("api::product.product").update({
//     where: { id: productId },
//     data: {
//       reviewCount,
//       average_rating: parseFloat(averageRating.toFixed(2)),
//     },
//   });
// }
