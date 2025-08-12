module.exports = {
  async afterCreate(event) {
    const { result } = event;
    if (result.product?.id) {
      await updateProductReviewStats(result.product.id);
    }
  },

  async afterUpdate(event) {
    const { result } = event;
    if (result.product?.id) {
      await updateProductReviewStats(result.product.id);
    }
  },

  async afterDelete(event) {
    const { result } = event;
    if (result.product?.id) {
      await updateProductReviewStats(result.product.id);
    }
  },
};

async function updateProductReviewStats(productId) {
  // Fetch all reviews for the product
  const reviews = await strapi.db.query("api::review.review").findMany({
    where: { product: productId },
    select: ["rating"],
  });

  const reviewCount = reviews.length;
  const averageRating =
    reviewCount > 0
      ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviewCount
      : 0;

  // Update the product with new stats
  await strapi.db.query("api::product.product").update({
    where: { id: productId },
    data: {
      reviewCount,
      average_rating: parseFloat(averageRating.toFixed(2)),
    },
  });
}
