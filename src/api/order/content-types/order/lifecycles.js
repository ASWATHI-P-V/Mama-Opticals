// path: src/api/order/content-types/order/lifecycles.js

module.exports = {
  async beforeUpdate(event) {
    const { data, where } = event.params; // data is the new data being saved, where is the filter for the record (e.g., { id: 123 })

    // If 'status' is not being updated, or if there's no ID (e.g., a bulk update without specific IDs),
    // we might not need to proceed with date updates.
    if (!data.status || !where || !where.id) {
      return;
    }

    // Fetch the existing order to compare the old status with the new status
    const existingOrder = await strapi.db.query('api::order.order').findOne({
      where: { id: where.id },
      select: ['status', 'orderedAt', 'shippedAt', 'deliveredAt'] // Only select necessary fields for performance
    });

    if (!existingOrder) {
      // This should ideally not happen if 'where.id' is valid, but good to check.
      return;
    }

    const newStatus = data.status;
    const oldStatus = existingOrder.status;
    const now = new Date(); // Get current timestamp

    // --- Logic for 'orderedAt' ---
    // Set orderedAt when status transitions to 'pending' or 'confirmed' for the first time
    // assuming 'pending' or 'confirmed' is the initial state after creation.
    // If you always create orders with 'pending', then this check can be slightly adjusted.
    const isNewOrderState = (oldStatus !== 'pending' && oldStatus !== 'confirmed') && (newStatus === 'pending' || newStatus === 'confirmed');
    const isStatusBecomingOrdered = (newStatus === 'pending' || newStatus === 'confirmed');

    if (isStatusBecomingOrdered && !existingOrder.orderedAt) {
      // Only set if it's becoming ordered status AND it hasn't been set already
      data.orderedAt = now;
      strapi.log.debug(`Order ${where.id}: Setting orderedAt to ${now.toISOString()} due to status becoming ${newStatus}.`);
    }


    // --- Logic for 'shippedAt' ---
    // Set shippedAt when status transitions to 'shipped'
    if (newStatus === 'shipped' && oldStatus !== 'shipped') {
      data.shippedAt = now;
      strapi.log.debug(`Order ${where.id}: Setting shippedAt to ${now.toISOString()} due to status transition to shipped.`);
    }

    // --- Logic for 'deliveredAt' ---
    // Set deliveredAt when status transitions to 'delivered'
    if (newStatus === 'delivered' && oldStatus !== 'delivered') {
      data.deliveredAt = now;
      strapi.log.debug(`Order ${where.id}: Setting deliveredAt to ${now.toISOString()} due to status transition to delivered.`);
    }

    // You can also add logic for 'cancelled' if you have a `cancelledAt` field
    /*
    if (newStatus === 'cancelled' && oldStatus !== 'cancelled' && !existingOrder.cancelledAt) {
      data.cancelledAt = now;
      strapi.log.debug(`Order ${where.id}: Setting cancelledAt to ${now.toISOString()} due to status transition to cancelled.`);
    }
    */
  },
};