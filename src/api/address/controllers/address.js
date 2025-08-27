// Path: src/api/address/controllers/address.js

"use strict";

const { createCoreController } = require("@strapi/strapi").factories;
const strapiUtils = require("@strapi/utils"); // Import the entire @strapi/utils module
const { ValidationError } = strapiUtils.errors; // Ensure ValidationError is imported from @strapi/utils

// --- Local Helper Functions (as provided by user) ---
const handleErrors = (error) => {
  console.error("Error occurred:", error);
  const errorMessage = String(error.message || ''); // Ensure message is a string for robust comparison

  // Prioritize Strapi's ValidationError messages
  if (error.name === "ValidationError") {
    return { message: errorMessage };
  }
  if (error.name === "NotFoundError") {
    return { message: errorMessage };
  }
  // Fallback for generic errors, including "Missing required field" from validateBodyRequiredFields
  if (errorMessage.includes("Missing required field")) {
    return { message: errorMessage };
  }
  // Fallback for any other unexpected errors
  return { message: "An unexpected error occurred." };
};

const handleStatusCode = (error) => {
  const errorMessage = String(error.message || ''); // Ensure message is a string for robust comparison

  // Prioritize Strapi's ValidationError status
  if (error.name === "ValidationError") return 400;
  if (error.name === "NotFoundError") return 404;
  // Fallback for generic errors, including "Missing required field" from validateBodyRequiredFields
  if (errorMessage.includes("Missing required field")) {
    return 400;
  }
  // If it's a generic error not matching specific messages, assume 500 for server-side issues
  return 500;
};

class NotFoundError extends Error {
  constructor(message = "Not Found") {
    super(message);
    this.name = "NotFoundError";
  }
}

const validateBodyRequiredFields = (body, fields) => {
  for (const field of fields) {
    if (
      body[field] === undefined ||
      body[field] === null ||
      body[field] === ""
    ) {
      // Throw a generic Error here, which will be caught by handleErrors/handleStatusCode
      throw new Error(`Missing required field: ${field}`);
    }
  }
};
// --- End Local Helper Functions ---

module.exports = createCoreController("api::address.address", ({ strapi }) => ({
  /**
   * Create a new address for the authenticated user.
   * If is_default is true, unset other default addresses for this user.
   */
  async create(ctx) {
    try {
      const { id: userId } = ctx.state.user; // Get authenticated user ID
      const { body } = ctx.request;

      // Validate required fields for address creation based on the UPDATED schema
      const requiredFields = [
        "name",
        "address_name",
        "phone",
        "locality_name",
        "country_name",
      ];
      validateBodyRequiredFields(body, requiredFields); // Using the local validation helper

      // Check if the user already has any addresses
      const userHasAddresses = await strapi.entityService.findMany("api::address.address", {
        filters: { user: userId },
        limit: 1 // Just need to know if any exist
      });

      let newAddressIsDefault = false;

      // Logic for setting 'is_default' for the new address
      if (body.is_default === true) {
        // If explicitly requested as default, set it and unset others
        newAddressIsDefault = true;
        // FIX: Find IDs first, then update by ID to avoid 'Unknown column' error
        const currentDefaultAddresses = await strapi.entityService.findMany('api::address.address', {
          filters: { user: userId, is_default: true },
          fields: ['id'] // Only fetch IDs
        });
        if (currentDefaultAddresses.length > 0) {
          const idsToUnset = currentDefaultAddresses.map(addr => addr.id);
          await strapi.db.query('api::address.address').updateMany({
            where: { id: { $in: idsToUnset } },
            data: { is_default: false },
          });
        }
      } else if (!userHasAddresses.length) {
        // If it's the very first address for the user and not explicitly set to false, make it default
        newAddressIsDefault = true;
      }
      // If body.is_default is explicitly false, or if it's not the first address and not explicitly true,
      // then newAddressIsDefault remains false.

      // Create the new address linked to the user
      const newAddress = await strapi.entityService.create(
        "api::address.address",
        {
          data: {
            ...body,
            user: userId, // Link to the authenticated user
            is_default: newAddressIsDefault, // Use the determined default status
            publishedAt: new Date(), // Ensure it's published
          },
        }
      );

      // Sanitize the output
      const sanitizedAddress = await strapiUtils.sanitize.contentAPI.output(newAddress, strapi.contentType('api::address.address'));

      return ctx.send({
        success: true,
        message: "Address created successfully.",
        data: sanitizedAddress,
      });
    } catch (error) {
      const customizedError = handleErrors(error);
      return ctx.send(
        { success: false, message: customizedError.message },
        handleStatusCode(error) || 500
      );
    }
  },

  /**
   * List all addresses for the authenticated user.
   */
  async find(ctx) {
    try {
      const { id: userId } = ctx.state.user; // Get authenticated user ID
      const { query } = ctx;

      const filters = { user: userId }; // Filter by the authenticated user

      // Add pagination and sorting if needed (similar to product controller)
      const page = parseInt(query.page || 1);
      const pageSize = parseInt(query.pageSize || 10);
      const start = (page - 1) * pageSize;
      const limit = pageSize;

      const findOptions = {
        filters: filters,
        sort: query._sort || { createdAt: "desc" }, // Default sort by newest
        start: start,
        limit: limit,
      };

      const addresses = await strapi.entityService.findMany(
        "api::address.address",
        findOptions
      );
      const total = await strapi.entityService.count("api::address.address", {
        filters: filters,
      });

      const sanitizedAddresses = await Promise.all(
        addresses.map((address) =>
          strapiUtils.sanitize.contentAPI.output(
            address,
            strapi.contentType("api::address.address")
          )
        )
      );

      return ctx.send({
        success: true,
        message: "Addresses retrieved successfully.",
        data: sanitizedAddresses,
        meta: {
          pagination: {
            page: page,
            pageSize: limit,
            pageCount: Math.ceil(total / limit),
            total: total,
          },
        },
      });
    } catch (error) {
      const customizedError = handleErrors(error);
      return ctx.send(
        { success: false, message: customizedError.message },
        handleStatusCode(error) || 500
      );
    }
  },

  /**
   * Get a single address by ID for the authenticated user.
   */
  async findOne(ctx) {
    try {
      const { id: userId } = ctx.state.user; // Get authenticated user ID
      const { id: addressId } = ctx.params;

      const address = await strapi.entityService.findOne(
        "api::address.address",
        addressId,
        {
          filters: { user: userId }, // Ensure the address belongs to the user
        }
      );

      if (!address) {
        throw new NotFoundError(
          "Address not found or you do not have permission to access it."
        );
      }

      const sanitizedAddress = await strapiUtils.sanitize.contentAPI.output(
        address,
        strapi.contentType("api::address.address")
      );

      return ctx.send({
        success: true,
        message: "Address retrieved successfully.",
        data: sanitizedAddress,
      });
    } catch (error) {
      const customizedError = handleErrors(error);
      return ctx.send(
        { success: false, message: customizedError.message },
        handleStatusCode(error) || 500
      );
    }
  },

  /**
   * Update an existing address for the authenticated user.
   * Handles setting/unsetting default address logic.
   */
  async update(ctx) {
    try {
      const { id: userId } = ctx.state.user; // Get authenticated user ID
      const { id: addressId } = ctx.params;
      const { body } = ctx.request;

      const existingAddress = await strapi.entityService.findOne(
        "api::address.address",
        addressId,
        {
          filters: { user: userId }, // Ensure the address belongs to the user
        }
      );

      if (!existingAddress) {
        throw new NotFoundError(
          "Address not found or you do not have permission to update it."
        );
      }

      // If the address is being set as default, unset other defaults
      // Only perform this if is_default is explicitly set to true in the body
      // and it's different from the existing address's is_default status
      if (body.is_default === true && existingAddress.is_default === false) {
        // FIX: Find IDs first, then update by ID to avoid 'Unknown column' error
        const currentDefaultAddresses = await strapi.entityService.findMany('api::address.address', {
          filters: { user: userId, is_default: true },
          fields: ['id'] // Only fetch IDs
        });
        if (currentDefaultAddresses.length > 0) {
          const idsToUnset = currentDefaultAddresses.map(addr => addr.id);
          await strapi.db.query('api::address.address').updateMany({
            where: { id: { $in: idsToUnset } },
            data: { is_default: false },
          });
        }
      }

      const updatedAddress = await strapi.entityService.update(
        "api::address.address",
        addressId,
        {
          data: body,
        }
      );

      const sanitizedAddress = await strapiUtils.sanitize.contentAPI.output(
        updatedAddress,
        strapi.contentType("api::address.address")
      );

      return ctx.send({
        success: true,
        message: "Address updated successfully.",
        data: sanitizedAddress,
      });
    } catch (error) {
      const customizedError = handleErrors(error);
      return ctx.send(
        { success: false, message: customizedError.message },
        handleStatusCode(error) || 500
      );
    }
  },

  /**
   * Delete an address for the authenticated user.
   * Prevents deletion if it's the only default address.
   */
  async delete(ctx) {
    try {
      const { id: userId } = ctx.state.user; // Get authenticated user ID
      const { id: addressId } = ctx.params;

      const addressToDelete = await strapi.entityService.findOne(
        "api::address.address",
        addressId,
        {
          filters: { user: userId }, // Ensure the address belongs to the user
        }
      );

      if (!addressToDelete) {
        throw new NotFoundError(
          "Address not found or you do not have permission to delete it."
        );
      }

      // MODIFIED LOGIC: If the address is default, prevent deletion entirely.
      if (addressToDelete.is_default) {
        // Throw a Strapi ValidationError for proper handling and 400 status
        throw new ValidationError(
          "Cannot delete the default address. Please set another address as default first, or update this address to be non-default."
        );
      }

      const deletedAddress = await strapi.entityService.delete(
        "api::address.address",
        addressId
      );

      const sanitizedAddress = await strapiUtils.sanitize.contentAPI.output(
        deletedAddress,
        strapi.contentType("api::address.address")
      );

      return ctx.send({
        success: true,
        message: "Address deleted successfully.",
        data: sanitizedAddress,
      });
    } catch (error) {
      const customizedError = handleErrors(error);
      return ctx.send(
        { success: false, message: customizedError.message },
        handleStatusCode(error) || 500
      );
    }
  },

  /**
   * Set a specific address as the default for the authenticated user.
   */
  async setDefault(ctx) {
    try {
      const { id: userId } = ctx.state.user; // Get authenticated user ID
      const { id: addressId } = ctx.params;

      const targetAddress = await strapi.entityService.findOne(
        "api::address.address",
        addressId,
        {
          filters: { user: userId }, // Ensure the address belongs to the user
        }
      );

      if (!targetAddress) {
        throw new NotFoundError(
          "Address not found or you do not have permission to set it as default."
        );
      }

      // FIX: Find IDs first, then update by ID to avoid 'Unknown column' error
      const currentDefaultAddresses = await strapi.entityService.findMany('api::address.address', {
        filters: { user: userId, is_default: true },
        fields: ['id'] // Only fetch IDs
      });
      if (currentDefaultAddresses.length > 0) {
        const idsToUnset = currentDefaultAddresses.map(addr => addr.id);
        await strapi.db.query('api::address.address').updateMany({
          where: { id: { $in: idsToUnset } },
          data: { is_default: false },
        });
      }

      // Set the target address as default
      const updatedAddress = await strapi.entityService.update(
        "api::address.address",
        addressId,
        {
          data: { is_default: true },
        }
      );

      const sanitizedAddress = await strapiUtils.sanitize.contentAPI.output(
        updatedAddress,
        strapi.contentType("api::address.address")
      );

      return ctx.send({
        success: true,
        message: "Address set as default successfully.",
        data: sanitizedAddress,
      });
    } catch (error) {
      const customizedError = handleErrors(error);
      return ctx.send(
        { success: false, message: customizedError.message },
        handleStatusCode(error) || 500
      );
    }
  },
}));
