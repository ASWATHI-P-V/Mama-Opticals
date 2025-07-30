// 'use strict';

// /**
//  * eye-power controller
//  */

// const { createCoreController } = require('@strapi/strapi').factories;
// const { NotFoundError, UnauthorizedError, ValidationError } = require('@strapi/utils').errors;

// module.exports = createCoreController('api::eye-power.eye-power', ({ strapi }) => ({

//   // Helper function to format the single entry response
//   // This helps keep the response consistent for create, findOne, update, delete
//   _formatEyePowerEntry(entry) {
//     if (!entry) return null;

//     const formatted = {
//       id: entry.id,
//       name: entry.name,
//       age: entry.age,
//       prescription_date: entry.prescription_date,
//       clinic_name: entry.clinic_name,
//       notes: entry.notes,
//       is_manualentry: entry.is_manualentry,
//       right_eyeSPH: entry.right_eyeSPH,
//       right_eyeCYL: entry.right_eyeCYL,
//       right_eyeAXIS: entry.right_eyeAXIS,
//       left_eyeSPH: entry.left_eyeSPH,
//       left_eyeCYL: entry.left_eyeCYL,
//       left_eyeAXIS: entry.left_eyeAXIS,
//       prescription_image: null, // Default to null
//       prescription_image_url: null // Default to null
//     };

//     // Populate image details if available
//     // For single entries, Strapi's entityService.findOne/create/update returns direct object
//     if (entry.prescription_image) {
//       formatted.prescription_image = {
//         id: entry.prescription_image.id,
//         url: entry.prescription_image.url,
//         formats: entry.prescription_image.formats,
//       };
//       formatted.prescription_image_url = entry.prescription_image.url;
//     }

//     return formatted;
//   },

//   // Override the default create method
//   async create(ctx) {
//     const { user } = ctx.state;
//     const { request } = ctx;

//     if (!user) {
//       throw new UnauthorizedError('Authentication required.');
//     }

//     let requestData = {};
//     if (request.body) {
//       if (typeof request.body.data === 'string') {
//         try {
//           requestData = JSON.parse(request.body.data);
//         } catch (e) {
//           throw new ValidationError('Invalid JSON in "data" field of multipart request.');
//         }
//       } else if (typeof request.body === 'object' && request.body !== null) {
//         requestData = request.body;
//       }
//     }

//     const { is_manualentry = false, ...data } = requestData;

//     if (is_manualentry) {
//       if (!data.name || !data.prescription_date) {
//         throw new ValidationError('Name and Prescription Date are required for manual entry.');
//       }
//       if (request.files && request.files.prescription_image) {
//         throw new ValidationError('Cannot upload an image when "is_manualentry" is true.');
//       }
//     } else {
//       if (!request.files || !request.files.prescription_image) {
//         throw new ValidationError('Prescription image is required for image upload.');
//       }
//       if (data.right_eyeSPH || data.left_eyeSPH || data.right_eyeCYL || data.left_eyeCYL || data.right_eyeAXIS || data.left_eyeAXIS) {
//         throw new ValidationError('Cannot provide manual eye power data when "is_manualentry" is false and an image is expected.');
//       }
//     }

//     data.user = user.id;

//     let uploadedFile = null;
//     if (!is_manualentry && request.files && request.files.prescription_image) {
//       const { prescription_image } = request.files;
//       uploadedFile = await strapi.plugins.upload.services.upload.upload({
//         data: {},
//         files: prescription_image,
//       });
//       data.prescription_image = uploadedFile[0].id;
//     }

//     try {
//       const entry = await strapi.entityService.create('api::eye-power.eye-power', {
//         data: {
//           ...data,
//           is_manualentry: is_manualentry,
//           publishedAt: new Date(),
//         },
//         populate: { prescription_image: { fields: ['url', 'formats'] } } // Populate for immediate response formatting
//       });

//       return ctx.send({
//         success: true,
//         message: 'Eye power record created successfully.',
//         data: this._formatEyePowerEntry(entry)
//       }, 201); // Use 201 Created status code
//     } catch (error) {
//       console.error('Error creating eye power:', error);
//       // Ensure errors are handled by your global error handler if using one,
//       // or directly here if not. Assuming a global handler will catch `throw error`.
//       throw error;
//     }
//   },

//   // Override the default find (list all) method
//   async find(ctx) {
//     const { user } = ctx.state;
//     if (!user) {
//       throw new UnauthorizedError('Authentication required.');
//     }

//     ctx.query.filters = {
//       ...ctx.query.filters,
//       user: user.id,
//     };

//     ctx.query.populate = {
//       ...ctx.query.populate,
//       prescription_image: {
//         fields: ['url', 'formats']
//       }
//     };

//     const { data, meta } = await super.find(ctx);

//     const formattedData = data.map(item => ({
//       id: item.id,
//       name: item.attributes.name,
//       prescription_date: item.attributes.prescription_date,
//       clinic_name: item.attributes.clinic_name,
//       is_manualentry: item.attributes.is_manualentry,
//       right_eyeSPH: item.attributes.right_eyeSPH,
//       right_eyeCYL: item.attributes.right_eyeCYL,
//       right_eyeAXIS: item.attributes.right_eyeAXIS,
//       left_eyeSPH: item.attributes.left_eyeSPH,
//       left_eyeCYL: item.attributes.left_eyeCYL,
//       left_eyeAXIS: item.attributes.left_eyeAXIS,
//       prescription_image_url: item.attributes.prescription_image?.data?.attributes?.url,
//     }));

//     // Return success, message, data, and meta for lists
//     return ctx.send({
//       success: true,
//       message: 'Eye power records retrieved successfully.',
//       data: formattedData,
//       meta: meta
//     }, 200);
//   },

//   // Override the default findOne method (get a single record)
//   async findOne(ctx) {
//     const { id } = ctx.params;
//     const { user } = ctx.state;

//     if (!user) {
//       throw new UnauthorizedError('Authentication required.');
//     }

//     const entry = await strapi.entityService.findOne('api::eye-power.eye-power', id, {
//       populate: { prescription_image: { fields: ['url', 'formats'] } },
//     });

//     if (!entry || entry.user?.id !== user.id) {
//       throw new NotFoundError('Eye power record not found or you do not have permission.');
//     }

//     return ctx.send({
//       success: true,
//       message: 'Eye power record retrieved successfully.',
//       data: this._formatEyePowerEntry(entry)
//     }, 200);
//   },

//   // Override the default update method
//   async update(ctx) {
//     const { id } = ctx.params;
//     const { user } = ctx.state;
//     const { request } = ctx;

//     if (!user) {
//       throw new UnauthorizedError('Authentication required.');
//     }

//     const existingEntry = await strapi.entityService.findOne('api::eye-power.eye-power', id, {
//         populate: ['user', 'prescription_image']
//     });

//     if (!existingEntry || existingEntry.user?.id !== user.id) {
//       throw new NotFoundError('Eye power record not found or you do not have permission to update.');
//     }

//     let requestData = {};
//     if (request.body) {
//       if (typeof request.body.data === 'string') {
//         try {
//           requestData = JSON.parse(request.body.data);
//         } catch (e) {
//           throw new ValidationError('Invalid JSON in "data" field of multipart request.');
//         }
//       } else if (typeof request.body === 'object' && request.body !== null) {
//         requestData = request.body;
//       }
//     }

//     const { is_manualentry = existingEntry.is_manualentry, ...data } = requestData;

//     let uploadedFile = null;
//     if (request.files && request.files.prescription_image) {
//         const { prescription_image } = request.files;
//         uploadedFile = await strapi.plugins.upload.services.upload.upload({
//             data: {},
//             files: prescription_image,
//         });
//         data.prescription_image = uploadedFile[0].id;
//     } else if (is_manualentry && existingEntry.prescription_image) {
//         data.prescription_image = null;
//     } else if (!is_manualentry && !request.files?.prescription_image && !existingEntry.prescription_image) {
//         throw new ValidationError('Prescription image is required when "is_manualentry" is false and no image exists.');
//     }

//     const updatedEntry = await strapi.entityService.update('api::eye-power.eye-power', id, {
//       data: {
//         ...data,
//         is_manualentry: is_manualentry,
//       },
//       populate: { prescription_image: { fields: ['url', 'formats'] } }
//     });

//     return ctx.send({
//       success: true,
//       message: 'Eye power record updated successfully.',
//       data: this._formatEyePowerEntry(updatedEntry)
//     }, 200);
//   },

//   // Override the default delete method
//   async delete(ctx) {
//     const { id } = ctx.params;
//     const { user } = ctx.state;

//     if (!user) {
//       throw new UnauthorizedError('Authentication required.');
//     }

//     const existingEntry = await strapi.entityService.findOne('api::eye-power.eye-power', id, {
//         populate: ['user', 'prescription_image']
//     });

//     if (!existingEntry || existingEntry.user?.id !== user.id) {
//       throw new NotFoundError('Eye power record not found or you do not have permission to delete.');
//     }

//     const deletedEntry = await strapi.entityService.delete('api::eye-power.eye-power', id);

//     if (existingEntry.prescription_image) {
//         await strapi.plugins.upload.services.upload.remove(existingEntry.prescription_image.id);
//     }

//     return ctx.send({
//       success: true,
//       message: 'Eye power record deleted successfully.',
//       data: this._formatEyePowerEntry(deletedEntry) // Return the deleted entry details
//     }, 200);
//   },
// }));

'use strict';

/**
 * eye-power controller
 */

const { createCoreController } = require('@strapi/strapi').factories;
const { NotFoundError, UnauthorizedError, ValidationError } = require('@strapi/utils').errors;

module.exports = createCoreController('api::eye-power.eye-power', ({ strapi }) => ({

  _formatEyePowerEntry(entry) {
    if (!entry) return null;

    const formatted = {
      id: entry.id,
      name: entry.name,
      age: entry.age,
      prescription_date: entry.prescription_date,
      clinic_name: entry.clinic_name,
      notes: entry.notes,
      is_manualentry: entry.is_manualentry,
      right_eyeSPH: entry.right_eyeSPH,
      right_eyeCYL: entry.right_eyeCYL,
      right_eyeAXIS: entry.right_eyeAXIS,
      left_eyeSPH: entry.left_eyeSPH,
      left_eyeCYL: entry.left_eyeCYL,
      left_eyeAXIS: entry.left_eyeAXIS,
      prescription_image: null,
      prescription_image_url: null
    };

    if (entry.prescription_image) {
      formatted.prescription_image = {
        id: entry.prescription_image.id,
        url: entry.prescription_image.url,
        formats: entry.prescription_image.formats,
      };
      formatted.prescription_image_url = entry.prescription_image.url;
    }

    return formatted;
  },

  async create(ctx) {
    const { user } = ctx.state;
    const { request } = ctx;

    if (!user) {
      throw new UnauthorizedError('Authentication required.');
    }

    let requestData = {};
    if (request.body) {
        if (typeof request.body.data === 'string') { // multipart/form-data with 'data' field
            try {
                requestData = JSON.parse(request.body.data);
            } catch (e) {
                throw new ValidationError('Invalid JSON in "data" field of multipart request.');
            }
        } else if (typeof request.body === 'object' && request.body !== null) { // application/json
            requestData = request.body;
        }
    }

    // --- CRITICAL CHANGE HERE ---
    // Convert is_manualentry to a proper boolean
    let is_manualentry_parsed = false;
    if (typeof requestData.is_manualentry === 'boolean') {
        is_manualentry_parsed = requestData.is_manualentry;
    } else if (typeof requestData.is_manualentry === 'string') {
        // Convert "true" to true, "false" to false (case-insensitive)
        is_manualentry_parsed = (requestData.is_manualentry.toLowerCase() === 'true');
    }
    // If requestData.is_manualentry is undefined or other type, it defaults to false from initialization

    const { is_manualentry, ...data } = requestData; // Keep original destructuring for 'data'

    // Now use is_manualentry_parsed for logic
    if (is_manualentry_parsed) { // Use the parsed boolean here
      if (!data.name || !data.prescription_date) {
        throw new ValidationError('Name and Prescription Date are required for manual entry.');
      }
      // This check is now correct: if is_manualentry is TRUE (parsed), and image exists
      if (request.files && request.files.prescription_image) {
          throw new ValidationError('Cannot upload an image when "is_manualentry" is true.');
      }
    } else { // This means is_manualentry_parsed is false
      if (!request.files || !request.files.prescription_image) {
        throw new ValidationError('Prescription image is required for image upload.');
      }
      if (data.right_eyeSPH || data.left_eyeSPH || data.right_eyeCYL || data.left_eyeCYL || data.right_eyeAXIS || data.left_eyeAXIS) {
        throw new ValidationError('Cannot provide manual eye power data when "is_manualentry" is false and an image is expected.');
      }
    }

    data.user = user.id;

    let uploadedFile = null;
    if (!is_manualentry_parsed && request.files && request.files.prescription_image) { // Use parsed boolean
      const { prescription_image } = request.files;
      uploadedFile = await strapi.plugins.upload.services.upload.upload({
        data: {},
        files: prescription_image,
      });
      data.prescription_image = uploadedFile[0].id;
    }


    try {
      const entry = await strapi.entityService.create('api::eye-power.eye-power', {
        data: {
          ...data,
          is_manualentry: is_manualentry_parsed, // Assign the parsed boolean to the database field
          publishedAt: new Date(),
        },
        populate: { prescription_image: { fields: ['url', 'formats'] } }
      });

      return ctx.send({
        success: true,
        message: 'Eye power record created successfully.',
        data: this._formatEyePowerEntry(entry)
      }, 201);
    } catch (error) {
      console.error('Error creating eye power:', error);
      throw error;
    }
  },

  // --- Apply the same parsing logic to the 'update' method ---
  async update(ctx) {
    const { id } = ctx.params;
    const { user } = ctx.state;
    const { request } = ctx;

    if (!user) {
      throw new UnauthorizedError('Authentication required.');
    }

    const existingEntry = await strapi.entityService.findOne('api::eye-power.eye-power', id, {
        populate: ['user', 'prescription_image']
    });

    if (!existingEntry || existingEntry.user?.id !== user.id) {
      throw new NotFoundError('Eye power record not found or you do not have permission to update.');
    }

    let requestData = {};
    if (request.body) {
      if (typeof request.body.data === 'string') {
        try {
          requestData = JSON.parse(request.body.data);
        } catch (e) {
          throw new ValidationError('Invalid JSON in "data" field of multipart request.');
        }
      } else if (typeof request.body === 'object' && request.body !== null) {
        requestData = request.body;
      }
    }

    // --- CRITICAL CHANGE HERE FOR UPDATE METHOD TOO ---
    let is_manualentry_parsed = existingEntry.is_manualentry; // Default to existing value
    if (typeof requestData.is_manualentry === 'boolean') {
        is_manualentry_parsed = requestData.is_manualentry;
    } else if (typeof requestData.is_manualentry === 'string') {
        is_manualentry_parsed = (requestData.is_manualentry.toLowerCase() === 'true');
    }

    const { is_manualentry, ...data } = requestData; // Keep original destructuring for 'data'


    let uploadedFile = null;
    if (request.files && request.files.prescription_image) {
        const { prescription_image } = request.files;
        uploadedFile = await strapi.plugins.upload.services.upload.upload({
            data: {},
            files: prescription_image,
        });
        data.prescription_image = uploadedFile[0].id;
    } else if (is_manualentry_parsed && existingEntry.prescription_image) { // Use parsed boolean
        data.prescription_image = null;
    } else if (!is_manualentry_parsed && !request.files?.prescription_image && !existingEntry.prescription_image) { // Use parsed boolean
        throw new ValidationError('Prescription image is required when "is_manualentry" is false and no image exists.');
    }

    const updatedEntry = await strapi.entityService.update('api::eye-power.eye-power', id, {
      data: {
        ...data,
        is_manualentry: is_manualentry_parsed, // Assign the parsed boolean to the database field
      },
      populate: { prescription_image: { fields: ['url', 'formats'] } }
    });

    return ctx.send({
      success: true,
      message: 'Eye power record updated successfully.',
      data: this._formatEyePowerEntry(updatedEntry)
    }, 200);
  },

  // ... (find and delete methods remain the same)
  async find(ctx) {
    const { user } = ctx.state;
    if (!user) {
      throw new UnauthorizedError('Authentication required.');
    }

    ctx.query.filters = {
      ...ctx.query.filters,
      user: user.id,
    };

    ctx.query.populate = {
      ...ctx.query.populate,
      prescription_image: {
        fields: ['url', 'formats']
      }
    };

    const { data, meta } = await super.find(ctx);

    const formattedData = data.map(item => ({
      id: item.id,
      name: item.attributes.name,
      prescription_date: item.attributes.prescription_date,
      clinic_name: item.attributes.clinic_name,
      is_manualentry: item.attributes.is_manualentry,
      right_eyeSPH: item.attributes.right_eyeSPH,
      right_eyeCYL: item.attributes.right_eyeCYL,
      right_eyeAXIS: item.attributes.right_eyeAXIS,
      left_eyeSPH: item.attributes.left_eyeSPH,
      left_eyeCYL: item.attributes.left_eyeCYL,
      left_eyeAXIS: item.attributes.left_eyeAXIS,
      prescription_image_url: item.attributes.prescription_image?.data?.attributes?.url,
    }));

    return ctx.send({
      success: true,
      message: 'Eye power records retrieved successfully.',
      data: formattedData,
      meta: meta
    }, 200);
  },

  async findOne(ctx) {
    const { id } = ctx.params;
    const { user } = ctx.state;

    if (!user) {
      throw new UnauthorizedError('Authentication required.');
    }

    const entry = await strapi.entityService.findOne('api::eye-power.eye-power', id, {
      populate: { prescription_image: { fields: ['url', 'formats'] } },
    });

    if (!entry || entry.user?.id !== user.id) {
      throw new NotFoundError('Eye power record not found or you do not have permission.');
    }

    return ctx.send({
      success: true,
      message: 'Eye power record retrieved successfully.',
      data: this._formatEyePowerEntry(entry)
    }, 200);
  },

  async delete(ctx) {
    const { id } = ctx.params;
    const { user } = ctx.state;

    if (!user) {
      throw new UnauthorizedError('Authentication required.');
    }

    const existingEntry = await strapi.entityService.findOne('api::eye-power.eye-power', id, {
        populate: ['user', 'prescription_image']
    });

    if (!existingEntry || existingEntry.user?.id !== user.id) {
      throw new NotFoundError('Eye power record not found or you do not have permission to delete.');
    }

    const deletedEntry = await strapi.entityService.delete('api::eye-power.eye-power', id);

    if (existingEntry.prescription_image) {
        await strapi.plugins.upload.services.upload.remove(existingEntry.prescription_image.id);
    }

    return ctx.send({
      success: true,
      message: 'Eye power record deleted successfully.',
      data: this._formatEyePowerEntry(deletedEntry)
    }, 200);
  },
}));