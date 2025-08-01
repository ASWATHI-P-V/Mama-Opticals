// // src/api/product/controllers/product.js

// "use strict";

// /**
//  * product controller
//  */

// const { createCoreController } = require("@strapi/strapi").factories;
// const strapiUtils = require("@strapi/utils"); // Import the entire @strapi/utils module
// const { ValidationError, NotFoundError } = strapiUtils.errors; // Access ValidationError from the imported module


// const handleErrors = (error) => {
//   console.error("Error occurred:", error);
//   const errorMessage = String(error.message || ''); // Ensure message is a string for robust comparison

//   // Prioritize Strapi's ValidationError messages
//   if (error.name === "ValidationError") {
//     return { message: errorMessage };
//   }
//   if (error.name === "NotFoundError") {
//     return { message: errorMessage };
//   }
//   // Fallback for generic errors, including "Missing required field" from validateBodyRequiredFields
//   if (errorMessage.includes("Missing required field")) {
//     return { message: errorMessage };
//   }
//   // Fallback for any other unexpected errors
//   return { message: "An unexpected error occurred." };
// };

// const handleStatusCode = (error) => {
//   const errorMessage = String(error.message || ''); // Ensure message is a string for robust comparison

//   // Prioritize Strapi's ValidationError status
//   if (error.name === "ValidationError") return 400;
//   if (error.name === "NotFoundError") return 404;
//   // Fallback for generic errors, including "Missing required field" from validateBodyRequiredFields
//   if (errorMessage.includes("Missing required field")) {
//     return 400;
//   }
//   // If it's a generic error not matching specific messages, assume 500 for server-side issues
//   return 500;
// };

// // NotFoundError is already defined above, no need to redefine
// const validateBodyRequiredFields = (body, fields) => {
//   for (const field of fields) {
//     if (
//       body[field] === undefined ||
//       body[field] === null ||
//       body[field] === ""
//     ) {
//       throw new Error(`Missing required field: ${field}`);
//     }
//   }
// };


// module.exports = createCoreController("api::product.product", ({ strapi }) => ({
  
//   //MARK:Create a new product
//   async create(ctx) {
//     try {
//       // Strapi v4 typically wraps request body in 'data'
//       const requestData = ctx.request.body.data || ctx.request.body;
//       const {
//         name,
//         description,
//         price,
//         inStock,
//         stock,
//         image,
//         category,
//         lens_types,
//         lens_coatings,
//         frame_weights,
//         brands,
//         frame_materials,
//         frame_shapes,
//         lens_thicknesses,
//         frame_sizes,
//         colors,
//         salesCount,
//         offers,      
//         offerPrice,  
//         rating,    
//         reviewCount, 
//       } = requestData;

//       // Validate required fields
//       validateBodyRequiredFields(requestData, ["name", "price", "stock"]);

//       // Basic type/value validation for price and stock
//       if (isNaN(price) || price < 0) {
//         throw new ValidationError("Price must be a non-negative number.");
//       }
//       if (isNaN(stock) || stock < 0) {
//         throw new ValidationError("Stock must be a non-negative integer.");
//       }
//       if (typeof inStock !== "boolean" && inStock !== undefined && inStock !== null) {
//         throw new ValidationError("inStock must be a boolean (true/false).");
//       }
//       if (rating !== undefined && (isNaN(rating) || rating < 0 || rating > 5)) { // <-- ADDED: Validate rating
//         throw new ValidationError("Rating must be a number between 0 and 5.");
//       }
//       if (reviewCount !== undefined && (isNaN(reviewCount) || reviewCount < 0)) { // <-- ADDED: Validate reviewCount
//         throw new ValidationError("Review count must be a non-negative integer.");
//       }
//       if (offerPrice !== undefined && (isNaN(offerPrice) || offerPrice < 0)) { // <-- ADDED: Validate offerPrice
//         throw new ValidationError("Offer price must be a non-negative number.");
//       }
//       if (offerPrice !== undefined && offerPrice >= price) { // Offer price must be less than original price
//         throw new ValidationError("Offer price must be less than the original price.");
//       }


//       // Validate existence of related entities for manyToOne (category)
//       if (category) {
//         if (Array.isArray(category)) {
//             throw new ValidationError("Category must be a single ID, not an array.");
//         }
//         const categoryEntity = await strapi.entityService.findOne("api::category.category", category);
//         if (!categoryEntity) {
//           throw new NotFoundError("Provided category not found.");
//         }
//       }

//       // Validate existence of related entities for oneToMany relations (expect arrays of IDs)
//       const validateOneToManyRelationIds = async (target, ids, fieldName) => {
//         if (ids !== undefined && ids !== null) { // Allow empty array or null/undefined if not required
//             if (!Array.isArray(ids)) {
//                 throw new ValidationError(`${fieldName} must be an array of IDs.`);
//             }
//             for (const id of ids) {
//                 if (typeof id !== 'number' && typeof id !== 'string') { // IDs can be numbers or strings
//                     throw new ValidationError(`Invalid ID type in ${fieldName} array.`);
//                 }
//                 const entity = await strapi.entityService.findOne(target, id);
//                 if (!entity) {
//                     throw new NotFoundError(`Provided ${fieldName} ID ${id} not found.`);
//                 }
//             }
//         }
//       };

//       await validateOneToManyRelationIds("api::lens-type.lens-type", lens_types, "lens_types");
//       await validateOneToManyRelationIds("api::lens-coating.lens-coating", lens_coatings, "lens_coatings");
//       await validateOneToManyRelationIds("api::frame-weight.frame-weight", frame_weights, "frame_weights");
//       await validateOneToManyRelationIds("api::brand.brand", brands, "brands");
//       await validateOneToManyRelationIds("api::frame-material.frame-material", frame_materials, "frame_materials");
//       await validateOneToManyRelationIds("api::frame-shape.frame-shape", frame_shapes, "frame_shapes");
//       await validateOneToManyRelationIds("api::lens-thickness.lens-thickness", lens_thicknesses, "lens_thicknesses");
//       await validateOneToManyRelationIds("api::frame-size.frame-size", frame_sizes, "frame_sizes");
//       await validateOneToManyRelationIds("api::color.color", colors, "colors");

//       // Create the new product
//       const newProduct = await strapi.entityService.create(
//         "api::product.product",
//         {
//           data: {
//             name,
//             description,
//             price,
//             stock: stock,
//             inStock: inStock !== undefined ? inStock : (stock > 0), // Default based on stock if not provided
//             image, // This expects the image ID if it's already uploaded
//             category, // This expects the category ID
//             lens_types, // Expects array of IDs
//             lens_coatings, // Expects array of IDs
//             frame_weights, // Expects array of IDs
//             brands, // Expects array of IDs
//             frame_materials, // Expects array of IDs
//             frame_shapes, // Expects array of IDs
//             lens_thicknesses, // Expects array of IDs
//             frame_sizes, // Expects array of IDs
//             colors,
//             salesCount: salesCount || 0, // Default salesCount to 0 if not provided
//             offers,      // <-- ADDED
//             offerPrice,  // <-- ADDED
//             rating: rating || 0,      // <-- ADDED: Default to 0
//             reviewCount: reviewCount || 0, // <-- ADDED: Default to 0
//             publishedAt: new Date(), // Publish immediately upon creation
//           },
//           // Populate all relations to get full details in the response
//           populate: [
//             "image",
//             "category",
//             "lens_types",
//             "lens_coatings",
//             "frame_weights",
//             "brands",
//             "colors",
//             "frame_materials",
//             "frame_shapes",
//             "lens_thicknesses",
//             "frame_sizes",
//             "wishlistedByUsers",
//             "reviews" 
//           ],
//         }
//       );

//       return ctx.send({
//         success: true,
//         message: "Product created successfully.",
//         data: {
//           product_id: newProduct.id,
//           product_name: newProduct.name
//         },
//       });
//     } catch (error) {
//       const customizedError = handleErrors(error);
//       return ctx.send(
//         { success: false, message: customizedError.message },
//         handleStatusCode(error) || 500
//       );
//     }
//   },

 
//   //MARK:Find all products
//   async find(ctx) {
//     try {
//       const { query } = ctx; // Access query parameters
//       let filters = {};
//       let sort = [];
//       // Populate all relations using their plural names as per your schema
//       let populate = [
//         'image',
//         'category',
//         'lens_types',
//         'lens_coatings',
//         'frame_weights',
//         'brands',
//         "colors",
//         'frame_materials',
//         'frame_shapes',
//         'lens_thicknesses',
//         'frame_sizes',
//         'reviews' 
//       ];

//       // --- 1. Search (using '_q' for fuzzy search across specified fields) ---
//       if (query._q) {
//         // Apply search across 'name', 'description', and new related fields
//         filters.$or = [
//           { name: { $containsi: query._q } },
//           { description: { $containsi: query._q } },
//           { colors: { name: { $containsi: query._q } } },
//           { brands: { name: { $containsi: query._q } } },
//           { frame_materials: { name: { $containsi: query._q } } },
//           { frame_shapes: { name: { $containsi: query._q } } },
//           { lens_types: { name: { $containsi: query._q } } },
//           { lens_coatings: { name: { $containsi: query._q } } },
//           { lens_thicknesses: { name: { $containsi: query._q } } },
//           { frame_weights: { name: { $containsi: query._q } } },
//           { frame_sizes: { name: { $containsi: query._q } } },
//           { colors: { name: { $containsi: query._q } } }
//         ];
//         delete query._q; // Remove _q from the direct query to prevent conflicts
//       }

//       // --- 2. Filtering ---

//       // Price Range
//       if (query.price_gte) {
//         filters.price = { ...filters.price, $gte: parseFloat(query.price_gte) };
//         delete query.price_gte;
//       }
//       if (query.price_lte) {
//         filters.price = { ...filters.price, $lte: parseFloat(query.price_lte) };
//         delete query.price_lte;
//       }

//       // Offer Price Range (if you add this field to your schema)
//       if (query.offerPrice_gte) {
//         filters.offerPrice = { ...filters.offerPrice, $gte: parseFloat(query.offerPrice_gte) };
//         delete query.offerPrice_gte;
//       }
//       if (query.offerPrice_lte) {
//         filters.offerPrice = { ...filters.offerPrice, $lte: parseFloat(query.offerPrice_lte) };
//         delete query.offerPrice_lte;
//       }

//       // Availability (inStock - Boolean field)
//       if (query.inStock !== undefined) {
//         filters.inStock = query.inStock === 'true';
//         delete query.inStock;
//       }

//       // Stock Range (new filter)
//       if (query.stock_gte) {
//         filters.stock = { ...filters.stock, $gte: parseInt(query.stock_gte) };
//         delete query.stock_gte;
//       }
//       if (query.stock_lte) {
//         filters.stock = { ...filters.stock, $lte: parseInt(query.stock_lte) };
//         delete query.stock_lte;
//       }

//       // Category (by name)
//       if (query.category) {
//         filters.category = { name: { $eqi: query.category } };
//         delete query.category;
//       }

//       // Color (Text field on Product)
//       if (query.colors) {
//         filters.colors = { $eqi: query.colors }; // Case-insensitive exact match for colors
//         delete query.colors;
//       }

//       // Filter by related content type's name (plural field names as per your schema)
//       // Note: Filtering oneToMany relations by nested fields like 'name' can be complex
//       // and might require custom query logic or specific database indexing depending on Strapi's ORM.
//       // Filtering by ID (e.g., ?brands_id=1) is generally more direct for oneToMany.
//       if (query.brands) {
//         filters.brands = { name: { $eqi: query.brands } };
//         delete query.brands;
//       }
//       if (query.frame_materials) {
//         filters.frame_materials = { name: { $eqi: query.frame_materials } };
//         delete query.frame_materials;
//       }
//       if (query.frame_shapes) {
//         filters.frame_shapes = { name: { $eqi: query.frame_shapes } };
//         delete query.frame_shapes;
//       }
//       if (query.lens_types) {
//         filters.lens_types = { name: { $eqi: query.lens_types } };
//         delete query.lens_types;
//       }
//       if (query.lens_coatings) {
//         filters.lens_coatings = { name: { $eqi: query.lens_coatings } };
//         delete query.lens_coatings;
//       }
//       if (query.lens_thicknesses) {
//         filters.lens_thicknesses = { name: { $eqi: query.lens_thicknesses } };
//         delete query.lens_thicknesses;
//       }
//       if (query.frame_weights) {
//         filters.frame_weights = { name: { $eqi: query.frame_weights } };
//         delete query.frame_weights;
//       }
//       if (query.frame_sizes) {
//         filters.frame_sizes = { name: { $eqi: query.frame_sizes } };
//         delete query.frame_sizes;
//       }

//       // Rating (gte) (New filter)
//       if (query.rating_gte) {
//         filters.rating = { ...filters.rating, $gte: parseFloat(query.rating_gte) };
//         delete query.rating_gte;
//       }
//       if (query.rating_lte) { // New filter: rating less than or equal to
//         filters.rating = { ...filters.rating, $lte: parseFloat(query.rating_lte) };
//         delete query.rating_lte;
//       }


//       // --- 3. Sorting ---
//       if (query._sort) {
//         const sortParams = Array.isArray(query._sort) ? query._sort : [query._sort];
//         sort = sortParams.map(s => {
//           const [field, order] = s.split(':');
//           // Handle sorting by relation names if needed, e.g., 'brands.name:asc'
//           if (field.includes('.')) {
//             const [relation, subField] = field.split('.');
//             return { [relation]: { [subField]: order.toLowerCase() } };
//           }
//           return { [field]: order.toLowerCase() };
//         });
//         delete query._sort;
//       } else {
//         // Default sorting: Newest arrivals
//         sort.push({ createdAt: 'desc' });
//       }

//       // --- 4. Pagination ---
//       const page = parseInt(query.page || 1);
//       const pageSize = parseInt(query.pageSize || 10);
//       const start = (page - 1) * pageSize;
//       const limit = pageSize;

//       // --- Construct final query options for entityService.findMany ---
//       const findOptions = {
//         filters: filters,
//         sort: sort,
//         populate: populate,
//         start: start,
//         limit: limit,
//       };

//       // Fetch products and total count separately for pagination metadata
//       const products = await strapi.entityService.findMany("api::product.product", findOptions);
//       const total = await strapi.entityService.count("api::product.product", { filters: filters });

//       // Sanitize the output to remove sensitive fields if any (though not expected for products)
//       const sanitizedProducts = await Promise.all(
//         products.map((product) =>
//           strapiUtils.sanitize.contentAPI.output(product, strapi.contentType('api::product.product'))
//         )
//       );

//       // Return response with data and pagination metadata
//       return ctx.send({ // Changed ctx.body to ctx.send
//         success: true,
//         message: "Products retrieved successfully.",
//         data: {
//           products: sanitizedProducts, // Nested under 'products' key
//           meta: {
//             pagination: {
//               page: page,
//               pageSize: limit,
//               pageCount: Math.ceil(total / limit),
//               total: total,
//             },
//           },
//         },
//       });

//     } catch (error) {
//       const customizedError = handleErrors(error); // Using your existing error handler
//       return ctx.send(
//         { success: false, message: customizedError.message },
//         handleStatusCode(error) || 500 // Using your existing status code handler
//       );
//     }
//   },

//   /**
//    * Allows updating product details and its relations (expects arrays of IDs for oneToMany).
//    * PUT /api/products/:id
//    */
//   //MARK: Update product
//   async update(ctx) {
//     try {
//       const { id } = ctx.params; // Product ID from URL parameters
//       const requestData = ctx.request.body.data || ctx.request.body; // Strapi v4 wraps body in 'data'

//       // Check if the product exists
//       const existingProduct = await strapi.entityService.findOne(
//         "api::product.product",
//         id
//       );

//       if (!existingProduct) {
//         throw new NotFoundError("Product not found.");
//       }

//       // Validate stock if provided
//       if (requestData.stock !== undefined) {
//         if (isNaN(requestData.stock) || requestData.stock < 0) {
//           throw new ValidationError("Stock must be a non-negative integer.");
//         }
//         // Automatically update inStock based on stock if stock is provided
//         requestData.inStock = requestData.stock > 0;
//       } else {
//         // If stock is not provided in the update, but inStock is, validate inStock
//         if (requestData.inStock !== undefined && typeof requestData.inStock !== "boolean") {
//           throw new ValidationError("inStock must be a boolean (true/false).");
//         }
//       }

//       // Validate rating if provided
//       if (requestData.rating !== undefined && (isNaN(requestData.rating) || requestData.rating < 0 || requestData.rating > 5)) {
//         throw new ValidationError("Rating must be a number between 0 and 5.");
//       }
//       // Validate reviewCount if provided
//       if (requestData.reviewCount !== undefined && (isNaN(requestData.reviewCount) || requestData.reviewCount < 0)) {
//         throw new ValidationError("Review count must be a non-negative integer.");
//       }
//       // Validate offerPrice if provided
//       if (requestData.offerPrice !== undefined) {
//         if (isNaN(requestData.offerPrice) || requestData.offerPrice < 0) {
//           throw new ValidationError("Offer price must be a non-negative number.");
//         }
//         // If updating offerPrice, ensure it's less than the current product price
//         // (assuming price is also in requestData or fetched from existingProduct)
//         const currentPrice = requestData.price !== undefined ? requestData.price : existingProduct.price;
//         if (requestData.offerPrice >= currentPrice) {
//           throw new ValidationError("Offer price must be less than the original price.");
//         }
//       }


//       // Validate existence of related entities for manyToOne (category)
//       if (requestData.category !== undefined) {
//           if (Array.isArray(requestData.category)) {
//               throw new ValidationError("Category must be a single ID, not an array.");
//           }
//           const categoryEntity = await strapi.entityService.findOne("api::category.category", requestData.category);
//           if (!categoryEntity) {
//               throw new NotFoundError("Provided category not found.");
//           }
//       }

//       // Validate existence of related entities for oneToMany relations (expect arrays of IDs)
//       const validateOneToManyRelationIds = async (target, ids, fieldName) => {
//         if (ids !== undefined && ids !== null) { // Allow empty array or null/undefined if not required
//             if (!Array.isArray(ids)) {
//                 throw new ValidationError(`${fieldName} must be an array of IDs.`);
//             }
//             for (const id of ids) {
//                 if (typeof id !== 'number' && typeof id !== 'string') { // IDs can be numbers or strings
//                     throw new ValidationError(`Invalid ID type in ${fieldName} array.`);
//                 }
//                 const entity = await strapi.entityService.findOne(target, id);
//                 if (!entity) {
//                     throw new NotFoundError(`Provided ${fieldName} ID ${id} not found.`);
//                 }
//             }
//         }
//       };

//       if (requestData.lens_types !== undefined) await validateOneToManyRelationIds("api::lens-type.lens-type", requestData.lens_types, "lens_types");
//       if (requestData.lens_coatings !== undefined) await validateOneToManyRelationIds("api::lens-coating.lens-coating", requestData.lens_coatings, "lens_coatings");
//       if (requestData.frame_weights !== undefined) await validateOneToManyRelationIds("api::frame-weight.frame-weight", requestData.frame_weights, "frame_weights");
//       if (requestData.brands !== undefined) await validateOneToManyRelationIds("api::brand.brand", requestData.brands, "brands");
//       if (requestData.frame_materials !== undefined) await validateOneToManyRelationIds("api::frame-material.frame-material", requestData.frame_materials, "frame_materials");
//       if (requestData.frame_shapes !== undefined) await validateOneToManyRelationIds("api::frame-shape.frame-shape", requestData.frame_shapes, "frame_shapes");
//       if (requestData.lens_thicknesses !== undefined) await validateOneToManyRelationIds("api::lens-thickness.lens-thickness", requestData.lens_thicknesses, "lens_thicknesses");
//       if (requestData.frame_sizes !== undefined) await validateOneToManyRelationIds("api::frame-size.frame-size", requestData.frame_sizes, "frame_sizes");
//       if (requestData.colors !== undefined) await validateOneToManyRelationIds("api::color.color", requestData.colors, "colors");

//       // Update the product
//       const updatedProduct = await strapi.entityService.update(
//         "api::product.product",
//         id,
//         {
//           data: requestData, // Pass the entire request data (Strapi handles updates to relations by ID/array of IDs)
//           populate: [
//             "image",
//             "category",
//             "lens_types",
//             "lens_coatings",
//             "frame_weights",
//             "brands",
//             "colors",
//             "frame_materials",
//             "frame_shapes",
//             "lens_thicknesses",
//             "frame_sizes",
//             "wishlistedByUsers",
//             "reviews" 
//           ],
//         }
//       );

//       // Sanitize the output
//       const sanitizedProduct = await strapiUtils.sanitize.contentAPI.output(updatedProduct, strapi.contentType('api::product.product'));

//       return ctx.send({
//         success: true,
//         message: "Product updated successfully.",
//         data: sanitizedProduct,
//       });
//     } catch (error) {
//       const customizedError = handleErrors(error);
//       return ctx.send(
//         { success: false, message: customizedError.message },
//         handleStatusCode(error) || 500
//       );
//     }
//   },

//   /**
//    * an existing product.
//    * DELETE /api/products/:id
//    */
//   //MARK: Delete product
//   async delete(ctx) {
//     try {
//       const { id } = ctx.params; // Product ID from URL parameters

//       // Check if the product exists
//       const existingProduct = await strapi.entityService.findOne(
//         "api::product.product",
//         id
//       );

//       if (!existingProduct) {
//         throw new NotFoundError("Product not found.");
//       }

//       const deletedProduct = await strapi.entityService.delete(
//         "api::product.product",
//         id
//       );

//       return ctx.send({
//         success: true,
//         message: "Product deleted successfully.",
//         data: {
//           id: deletedProduct.id,
//           name: deletedProduct.name, // Return some identifying info about the deleted product
//         },
//       });
//     } catch (error) {
//       const customizedError = handleErrors(error);
//       return ctx.send(
//         { success: false, message: customizedError.message },
//         handleStatusCode(error) || 500
//       );
//     }
//   },

// src/api/product/controllers/product.js

"use strict";

/**
 * product controller
 */

const { createCoreController } = require("@strapi/strapi").factories;
const strapiUtils = require("@strapi/utils");
const { ValidationError, NotFoundError } = strapiUtils.errors;

// --- IMPORTANT: Helper Functions ---
// You MUST ensure `ImageFile` is available and correctly implemented.
// It should take a single file object and return the uploaded file object from Strapi.
// A common place for this would be in `src/utils/media-helper.js` or `src/api/product/services/product.js`.
// You would then import it: `const { ImageFile } = require('../../../utils/media-helper');`

/*
// Example `ImageFile` (formerly processImageFile) - this needs to be implemented in your project!
// Install 'sharp': npm install sharp
// If you put this in `src/utils/media-helper.js`, make sure to export it: `module.exports = { ImageFile };`

const sharp = require('sharp');
const fs = require('fs/promises');
const path = require('path');

async function ImageFile(file, width, height) {
    if (!file) return null;

    try {
        const buffer = await fs.readFile(file.path);
        let processedBuffer = buffer;

        // Resize image if dimensions are provided and image is larger
        if (width || height) {
            const image = sharp(buffer);
            const metadata = await image.metadata();

            if (metadata.width > width || metadata.height > height) {
                processedBuffer = await image
                    .resize(width, height, {
                        fit: sharp.fit.inside,
                        withoutEnlargement: true // Prevent upscaling
                    })
                    .toBuffer();
            }
        }

        // Create a temporary file path for Strapi's upload service
        // Ensure strapi.dirs.app.tmp exists and is writable
        const tempFileName = `${path.basename(file.name, path.extname(file.name))}-${Date.now()}${path.extname(file.name)}`;
        const tempPath = path.join(strapi.dirs.app.tmp, tempFileName);
        await fs.writeFile(tempPath, processedBuffer);

        // Prepare the file object for Strapi's upload service
        const filesToUpload = {
            name: file.name,
            type: file.type,
            size: processedBuffer.length,
            path: tempPath, // Use the path to the processed temporary file
        };

        // Upload the file to Strapi's media library
        const [uploadedFile] = await strapi.plugins.upload.services.upload.upload({
            data: {}, // Any extra data for the upload (e.g., alternativeText, caption)
            files: filesToUpload,
        });

        // Clean up the temporary file
        await fs.unlink(tempPath);

        return uploadedFile; // Returns the uploaded file object from Strapi
    } catch (err) {
        console.error("Error processing or uploading image:", err);
        throw new Error(`Failed to process image file: ${file.name}. ${err.message}`);
    }
}
*/

// --- Placeholder for ImageFile if you don't have it yet. Remove this once implemented above.
async function ImageFile(file) {
    console.warn("WARNING: `ImageFile` is a placeholder. Implement proper image processing and Strapi upload logic.");
    // This very basic placeholder directly uploads the file received by Strapi
    // without any resizing. This is primarily for demonstrating the controller logic.
    const [uploadedFile] = await strapi.plugins.upload.services.upload.upload({
        data: {},
        files: file,
    });
    return uploadedFile;
}
// --- END Placeholder ---


const handleErrors = (error) => {
    console.error("Error occurred:", error);
    const errorMessage = String(error.message || '');

    if (error.name === "ValidationError") {
        return { message: errorMessage };
    }
    if (error.name === "NotFoundError") {
        return { message: errorMessage };
    }
    if (errorMessage.includes("Missing required field")) {
        return { message: errorMessage };
    }
    // Catch the specific Yup validation error for relations not existing
    if (errorMessage.includes("relation(s) of type plugin::upload.file associated with this entity do not exist")) {
        return { message: "One or more provided image IDs do not exist or are invalid." };
    }
    return { message: "An unexpected error occurred." };
};

const handleStatusCode = (error) => {
    const errorMessage = String(error.message || '');

    if (error.name === "ValidationError") return 400;
    if (error.name === "NotFoundError") return 404;
    if (errorMessage.includes("Missing required field")) {
        return 400;
    }
    // Catch the specific Yup validation error for relations not existing
    if (errorMessage.includes("relation(s) of type plugin::upload.file associated with this entity do not exist")) {
        return 400;
    }
    return 500;
};

const validateBodyRequiredFields = (body, fields) => {
    for (const field of fields) {
        if (
            body[field] === undefined ||
            body[field] === null ||
            body[field] === ""
        ) {
            throw new Error(`Missing required field: ${field}`);
        }
    }
};


module.exports = createCoreController("api::product.product", ({ strapi }) => ({

    //MARK:Create a new product
    async create(ctx) {
        try {
            const { body, files } = ctx.request;
            const requestData = body.data || body;

            const {
                name,
                description,
                price,
                // inStock will be processed from string to boolean
                stock,
                // image field is handled separately from `files`
                category,
                lens_types,
                lens_coatings,
                frame_weights,
                brands,
                frame_materials,
                frame_shapes,
                lens_thicknesses,
                frame_sizes,
                colors,
                salesCount,
                offers,
                offerPrice,
                rating,
                reviewCount,
                best_seller, // NEW: best_seller field
            } = requestData;

            // Validate required fields
            validateBodyRequiredFields(requestData, ["name", "price", "stock"]);

            // --- Validation for inStock (String to Boolean conversion) ---
            let processedInStock;
            if (requestData.inStock !== undefined) {
                // Convert string "true" to true, anything else to false (for form-data)
                processedInStock = String(requestData.inStock).toLowerCase() === 'true';
            } else {
                // If not provided, default based on stock
                processedInStock = stock > 0;
            }
            // --- End inStock Validation ---

            // --- Validation for best_seller (String to Boolean conversion) ---
            let processedBestSeller = false; // Default to false if not provided
            if (requestData.best_seller !== undefined) {
                processedBestSeller = String(requestData.best_seller).toLowerCase() === 'true';
            }
            // --- End best_seller Validation ---


            // Basic type/value validation for price and stock
            if (isNaN(price) || price < 0) {
                throw new ValidationError("Price must be a non-negative number.");
            }
            if (isNaN(stock) || stock < 0) {
                throw new ValidationError("Stock must be a non-negative integer.");
            }
            // Note: inStock validation `typeof inStock !== "boolean"` is now replaced by the conversion logic above.

            if (rating !== undefined && (isNaN(rating) || rating < 0 || rating > 5)) {
                throw new ValidationError("Rating must be a number between 0 and 5.");
            }
            if (reviewCount !== undefined && (isNaN(reviewCount) || reviewCount < 0)) {
                throw new ValidationError("Review count must be a non-negative integer.");
            }
            if (offerPrice !== undefined && (isNaN(offerPrice) || offerPrice < 0)) {
                throw new ValidationError("Offer price must be a non-negative number.");
            }
            if (offerPrice !== undefined && offerPrice >= price) {
                throw new ValidationError("Offer price must be less than the original price.");
            }

            // Validate existence of related entities for manyToOne (category)
            if (category) {
                if (Array.isArray(category)) {
                    throw new ValidationError("Category must be a single ID, not an array.");
                }
                const categoryEntity = await strapi.entityService.findOne("api::category.category", category);
                if (!categoryEntity) {
                    throw new NotFoundError("Provided category not found.");
                }
            }

            // Validate existence of related entities for oneToMany relations (expect arrays of IDs)
            const validateOneToManyRelationIds = async (target, ids, fieldName) => {
                if (ids !== undefined && ids !== null) {
                    if (!Array.isArray(ids)) {
                        throw new ValidationError(`${fieldName} must be an array of IDs.`);
                    }
                    for (const id_item of ids) {
                        if (typeof id_item !== 'number' && typeof id_item !== 'string') {
                            throw new ValidationError(`Invalid ID type in ${fieldName} array.`);
                        }
                        const entity = await strapi.entityService.findOne(target, id_item);
                        if (!entity) {
                            throw new NotFoundError(`Provided ${fieldName} ID ${id_item} not found.`);
                        }
                    }
                }
            };

            await validateOneToManyRelationIds("api::lens-type.lens-type", lens_types, "lens_types");
            await validateOneToManyRelationIds("api::lens-coating.lens-coating", lens_coatings, "lens_coatings");
            await validateOneToManyRelationIds("api::frame-weight.frame-weight", frame_weights, "frame_weights");
            await validateOneToManyRelationIds("api::brand.brand", brands, "brands");
            await validateOneToManyRelationIds("api::frame-material.frame-material", frame_materials, "frame_materials");
            await validateOneToManyRelationIds("api::frame-shape.frame-shape", frame_shapes, "frame_shapes");
            await validateOneToManyRelationIds("api::lens-thickness.lens-thickness", lens_thicknesses, "lens_thicknesses");
            await validateOneToManyRelationIds("api::frame-size.frame-size", frame_sizes, "frame_sizes");
            await validateOneToManyRelationIds("api::color.color", colors, "colors");

            // Multi-Image Upload Logic for Product Creation
            let uploadedImageIds = [];
            if (files && files.image) {
                const imageFiles = Array.isArray(files.image) ? files.image : [files.image];
                if (imageFiles.length > 0) {
                    const processedImages = await Promise.all(
                        imageFiles.map(file => ImageFile(file, 800, 800)) // Renamed to ImageFile
                    );
                    uploadedImageIds = processedImages.map(img => img.id);
                }
            }

            // Create the new product
            const newProduct = await strapi.entityService.create(
                "api::product.product",
                {
                    data: {
                        name,
                        description,
                        price,
                        stock: stock,
                        inStock: processedInStock, // Use the processed boolean value
                        image: uploadedImageIds,
                        category,
                        lens_types,
                        lens_coatings,
                        frame_weights,
                        brands,
                        frame_materials,
                        frame_shapes,
                        lens_thicknesses,
                        frame_sizes,
                        colors,
                        salesCount: salesCount || 0,
                        offers,
                        offerPrice,
                        rating: rating || 0,
                        reviewCount: reviewCount || 0,
                        best_seller: processedBestSeller, // NEW: Assign processed best_seller
                        publishedAt: new Date(),
                    },
                    // Populate all relations to get full details in the response
                    populate: [
                        "image",
                        "category",
                        "lens_types",
                        "lens_coatings",
                        "frame_weights",
                        "brands",
                        "colors",
                        "frame_materials",
                        "frame_shapes",
                        "lens_thicknesses",
                        "frame_sizes",
                        "wishlistedByUsers",
                        "reviews",
                        "best_seller", // NEW: Populate best_seller
                    ],
                }
            );

            return ctx.send({
                success: true,
                message: "Product created successfully.",
                data: {
                    product_id: newProduct.id,
                    product_name: newProduct.name,
                    image_ids: uploadedImageIds,
                    best_seller: newProduct.best_seller, // NEW: Return best_seller status
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

    //MARK:Find all products
    async find(ctx) {
        try {
            const { query } = ctx;
            let filters = {};
            let sort = [];
            let populate = [
                'image',
                'category',
                'lens_types',
                'lens_coatings',
                'frame_weights',
                'brands',
                "colors",
                'frame_materials',
                'frame_shapes',
                'lens_thicknesses',
                'frame_sizes',
                'reviews',
                'best_seller', // NEW: Populate best_seller
            ];

            // --- 1. Search (using '_q' for fuzzy search across specified fields) ---
            if (query._q) {
                filters.$or = [
                    { name: { $containsi: query._q } },
                    { description: { $containsi: query._q } },
                    { colors: { name: { $containsi: query._q } } },
                    { brands: { name: { $containsi: query._q } } },
                    { frame_materials: { name: { $containsi: query._q } } },
                    { frame_shapes: { name: { $containsi: query._q } } },
                    { lens_types: { name: { $containsi: query._q } } },
                    { lens_coatings: { name: { $containsi: query._q } } },
                    { lens_thicknesses: { name: { $containsi: query._q } } },
                    { frame_weights: { name: { $containsi: query._q } } },
                    { frame_sizes: { name: { $containsi: query._q } } },
                ];
                delete query._q;
            }

            // --- 2. Filtering ---

            // Price Range
            if (query.price_gte) {
                filters.price = { ...filters.price, $gte: parseFloat(query.price_gte) };
                delete query.price_gte;
            }
            if (query.price_lte) {
                filters.price = { ...filters.price, $lte: parseFloat(query.price_lte) };
                delete query.price_lte;
            }

            // Offer Price Range
            if (query.offerPrice_gte) {
                filters.offerPrice = { ...filters.offerPrice, $gte: parseFloat(query.offerPrice_gte) };
                delete query.offerPrice_gte;
            }
            if (query.offerPrice_lte) {
                filters.offerPrice = { ...filters.offerPrice, $lte: parseFloat(query.offerPrice_lte) };
                delete query.offerPrice_lte;
            }

            // Availability (inStock - Boolean field)
            if (query.inStock !== undefined) {
                filters.inStock = query.inStock.toLowerCase() === 'true'; // Convert string to boolean for filtering
                delete query.inStock;
            }

            // NEW: Best Seller Filter
            if (query.best_seller !== undefined) {
                filters.best_seller = query.best_seller.toLowerCase() === 'true'; // Convert string to boolean for filtering
                delete query.best_seller;
            }

            // Stock Range
            if (query.stock_gte) {
                filters.stock = { ...filters.stock, $gte: parseInt(query.stock_gte) };
                delete query.stock_gte;
            }
            if (query.stock_lte) {
                filters.stock = { ...filters.stock, $lte: parseInt(query.stock_lte) };
                delete query.stock_lte;
            }

            // Category (by name)
            if (query.category) {
                filters.category = { name: { $eqi: query.category } };
                delete query.category;
            }

            // Color (assuming relation to 'Color' CT)
            if (query.colors) {
                filters.colors = { name: { $eqi: query.colors } };
                delete query.colors;
            }

            // Filter by related content type's name
            if (query.brands) {
                filters.brands = { name: { $eqi: query.brands } };
                delete query.brands;
            }
            if (query.frame_materials) {
                filters.frame_materials = { name: { $eqi: query.frame_materials } };
                delete query.frame_materials;
            }
            if (query.frame_shapes) {
                filters.frame_shapes = { name: { $eqi: query.frame_shapes } };
                delete query.frame_shapes;
            }
            if (query.lens_types) {
                filters.lens_types = { name: { $eqi: query.lens_types } };
                delete query.lens_types;
            }
            if (query.lens_coatings) {
                filters.lens_coatings = { name: { $eqi: query.lens_coatings } };
                delete query.lens_coatings;
            }
            if (query.lens_thicknesses) {
                filters.lens_thicknesses = { name: { $eqi: query.lens_thicknesses } };
                delete query.lens_thicknesses;
            }
            if (query.frame_weights) {
                filters.frame_weights = { name: { $eqi: query.frame_weights } };
                delete query.frame_weights;
            }
            if (query.frame_sizes) {
                filters.frame_sizes = { name: { $eqi: query.frame_sizes } };
                delete query.frame_sizes;
            }

            // Rating (gte)
            if (query.rating_gte) {
                filters.rating = { ...filters.rating, $gte: parseFloat(query.rating_gte) };
                delete query.rating_gte;
            }
            if (query.rating_lte) {
                filters.rating = { ...filters.rating, $lte: parseFloat(query.rating_lte) };
                delete query.rating_lte;
            }


            // --- 3. Sorting ---
            if (query._sort) {
                const sortParams = Array.isArray(query._sort) ? query._sort : [query._sort];
                sort = sortParams.map(s => {
                    const [field, order] = s.split(':');
                    if (field.includes('.')) {
                        const [relation, subField] = field.split('.');
                        return { [relation]: { [subField]: order.toLowerCase() } };
                    }
                    return { [field]: order.toLowerCase() };
                });
                delete query._sort;
            } else {
                sort.push({ createdAt: 'desc' });
            }

            // --- 4. Pagination ---
            const page = parseInt(query.page || 1);
            const pageSize = parseInt(query.pageSize || 10);
            const start = (page - 1) * pageSize;
            const limit = pageSize;

            const findOptions = {
                filters: filters,
                sort: sort,
                populate: populate,
                start: start,
                limit: limit,
            };

            const products = await strapi.entityService.findMany("api::product.product", findOptions);
            const total = await strapi.entityService.count("api::product.product", { filters: filters });

            const sanitizedProducts = await Promise.all(
                products.map((product) =>
                    strapiUtils.sanitize.contentAPI.output(product, strapi.contentType('api::product.product'))
                )
            );

            return ctx.send({
                success: true,
                message: "Products retrieved successfully.",
                data: {
                    products: sanitizedProducts,
                    meta: {
                        pagination: {
                            page: page,
                            pageSize: limit,
                            pageCount: Math.ceil(total / limit),
                            total: total,
                        },
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
     * Allows updating product details and its relations (expects arrays of IDs for oneToMany).
     * PUT /api/products/:id
     */
    //MARK: Update product
    async update(ctx) {
        try {
            const { id } = ctx.params;
            const { body, files } = ctx.request;
            const requestData = body.data || body;

            const existingProduct = await strapi.entityService.findOne(
                "api::product.product",
                id,
                { populate: ['image'] }
            );

            if (!existingProduct) {
                throw new NotFoundError("Product not found.");
            }

            // --- Validation for inStock (String to Boolean conversion) ---
            let processedInStock;
            if (requestData.inStock !== undefined) {
                processedInStock = String(requestData.inStock).toLowerCase() === 'true';
            } else {
                // If not provided in update, retain existing value
                processedInStock = existingProduct.inStock;
            }

            // If stock is provided in the update, override inStock based on it
            if (requestData.stock !== undefined) {
                if (isNaN(requestData.stock) || requestData.stock < 0) {
                    throw new ValidationError("Stock must be a non-negative integer.");
                }
                processedInStock = requestData.stock > 0;
            }
            // --- End inStock Validation ---

            // --- Validation for best_seller (String to Boolean conversion) ---
            let processedBestSeller = existingProduct.best_seller; // Retain existing value by default
            if (requestData.best_seller !== undefined) {
                processedBestSeller = String(requestData.best_seller).toLowerCase() === 'true';
            }
            // --- End best_seller Validation ---


            // Validate rating if provided
            if (requestData.rating !== undefined && (isNaN(requestData.rating) || requestData.rating < 0 || requestData.rating > 5)) {
                throw new ValidationError("Rating must be a number between 0 and 5.");
            }
            // Validate reviewCount if provided
            if (requestData.reviewCount !== undefined && (isNaN(requestData.reviewCount) || requestData.reviewCount < 0)) {
                throw new ValidationError("Review count must be a non-negative integer.");
            }
            // Validate offerPrice if provided
            if (requestData.offerPrice !== undefined) {
                if (isNaN(requestData.offerPrice) || requestData.offerPrice < 0) {
                    throw new ValidationError("Offer price must be a non-negative number.");
                }
                const currentPrice = requestData.price !== undefined ? requestData.price : existingProduct.price;
                if (requestData.offerPrice >= currentPrice) {
                    throw new ValidationError("Offer price must be less than the original price.");
                }
            }

            // Validate existence of related entities for manyToOne (category)
            if (requestData.category !== undefined) {
                if (Array.isArray(requestData.category)) {
                    throw new ValidationError("Category must be a single ID, not an array.");
                }
                const categoryEntity = await strapi.entityService.findOne("api::category.category", requestData.category);
                if (!categoryEntity) {
                    throw new NotFoundError("Provided category not found.");
                }
            }

            // Validate existence of related entities for oneToMany relations (expect arrays of IDs)
            const validateOneToManyRelationIds = async (target, ids, fieldName) => {
                if (ids !== undefined && ids !== null) {
                    if (!Array.isArray(ids)) {
                        throw new ValidationError(`${fieldName} must be an array of IDs.`);
                    }
                    for (const id_item of ids) {
                        if (typeof id_item !== 'number' && typeof id_item !== 'string') {
                            throw new ValidationError(`Invalid ID type in ${fieldName} array.`);
                        }
                        const entity = await strapi.entityService.findOne(target, id_item);
                        if (!entity) {
                            throw new NotFoundError(`Provided ${fieldName} ID ${id_item} not found.`);
                        }
                    }
                }
            };

            if (requestData.lens_types !== undefined) await validateOneToManyRelationIds("api::lens-type.lens-type", requestData.lens_types, "lens_types");
            if (requestData.lens_coatings !== undefined) await validateOneToManyRelationIds("api::lens-coating.lens-coating", requestData.lens_coatings, "lens_coatings");
            if (requestData.frame_weights !== undefined) await validateOneToManyRelationIds("api::frame-weight.frame-weight", requestData.frame_weights, "frame_weights");
            if (requestData.brands !== undefined) await validateOneToManyRelationIds("api::brand.brand", requestData.brands, "brands");
            if (requestData.frame_materials !== undefined) await validateOneToManyRelationIds("api::frame-material.frame-material", requestData.frame_materials, "frame_materials");
            if (requestData.frame_shapes !== undefined) await validateOneToManyRelationIds("api::frame-shape.frame-shape", requestData.frame_shapes, "frame_shapes");
            if (requestData.lens_thicknesses !== undefined) await validateOneToManyRelationIds("api::lens-thickness.lens-thickness", requestData.lens_thicknesses, "lens_thicknesses");
            if (requestData.frame_sizes !== undefined) await validateOneToManyRelationIds("api::frame-size.frame-size", requestData.frame_sizes, "frame_sizes");
            if (requestData.colors !== undefined) await validateOneToManyRelationIds("api::color.color", requestData.colors, "colors");

            // Multi-Image Update Logic for Product Update
            let finalImageIds = [];

            // 1. Handle newly uploaded files
            if (files && files.image) {
                const newImageFiles = Array.isArray(files.image) ? files.image : [files.image];
                if (newImageFiles.length > 0) {
                    const uploadedNewImages = await Promise.all(
                        newImageFiles.map(file => ImageFile(file, 800, 800)) // Renamed to ImageFile
                    );
                    finalImageIds = uploadedNewImages.map(img => img.id);
                }
            }

            // 2. Handle existing image IDs sent in the request body
            if (finalImageIds.length === 0 && requestData.image !== undefined) {
                if (!Array.isArray(requestData.image)) {
                    throw new ValidationError("Product 'image' field must be an array of image IDs when updating without new files.");
                }

                for (const imgId of requestData.image) {
                    if (imgId === null || imgId === undefined || imgId === '') {
                        continue;
                    }
                    if (typeof imgId !== 'number' && typeof imgId !== 'string') {
                        throw new ValidationError(`Invalid ID type in 'image' array: ${imgId}.`);
                    }
                    const imageEntity = await strapi.entityService.findOne("plugin::upload.file", imgId);
                    if (!imageEntity) {
                        throw new NotFoundError(`Provided image ID ${imgId} not found.`);
                    }
                }
                finalImageIds = requestData.image;
            }

            const updateData = { ...requestData };
            updateData.image = finalImageIds;
            updateData.inStock = processedInStock; // Use the processed boolean value
            updateData.best_seller = processedBestSeller; // NEW: Use the processed boolean value


            // Update the product
            const updatedProduct = await strapi.entityService.update(
                "api::product.product",
                id,
                {
                    data: updateData,
                    populate: [
                        "image",
                        "category",
                        "lens_types",
                        "lens_coatings",
                        "frame_weights",
                        "brands",
                        "colors",
                        "frame_materials",
                        "frame_shapes",
                        "lens_thicknesses",
                        "frame_sizes",
                        "wishlistedByUsers",
                        "reviews",
                        "best_seller", // NEW: Populate best_seller
                    ],
                }
            );

            const sanitizedProduct = await strapiUtils.sanitize.contentAPI.output(updatedProduct, strapi.contentType('api::product.product'));

            return ctx.send({
                success: true,
                message: "Product updated successfully.",
                data: sanitizedProduct,
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
     * Deletes an existing product.
     * DELETE /api/products/:id
     */
    //MARK: Delete product
    async delete(ctx) {
        try {
            const { id } = ctx.params;

            const existingProduct = await strapi.entityService.findOne(
                "api::product.product",
                id
            );

            if (!existingProduct) {
                throw new NotFoundError("Product not found.");
            }

            const deletedProduct = await strapi.entityService.delete(
                "api::product.product",
                id
            );

            return ctx.send({
                success: true,
                message: "Product deleted successfully.",
                data: {
                    id: deletedProduct.id,
                    name: deletedProduct.name,
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


  //MARK:ADD WHISHLIST
  async addToWishlist(ctx) {
    try {
      const { id: userId } = ctx.state.user;
      const { productId } = ctx.params; // Product ID from URL parameters

      const product = await strapi.entityService.findOne(
        "api::product.product",
        productId,
        { populate: ["wishlistedByUsers"] } // Populate to check existing users
      );

      if (!product) {
        throw new NotFoundError("Product not found.");
      }

      // Check if user has already wishlisted this product
      const isAlreadyWishlisted = product.wishlistedByUsers.some(
        (user) => user.id === userId
      );

      if (isAlreadyWishlisted) {
        return ctx.send({
          success: true,
          message: "Product is already in your wishlist.",
          data: {
            product_id: productId,
            user_id: userId,
          },
        });
      }

      // Add the user to the product's 'wishlistedByUsers' relation
      const updatedProduct = await strapi.entityService.update(
        "api::product.product",
        productId,
        {
          data: {
            wishlistedByUsers: [
              ...product.wishlistedByUsers.map((u) => u.id),
              userId,
            ],
          },
          populate: ["wishlistedByUsers"], // Populate updated relation for response
        }
      );

      return ctx.send({
        success: true,
        message: "Product added to wishlist.",
        data: {
          product_id: updatedProduct.id,
          wishlisted_by_user_ids: updatedProduct.wishlistedByUsers.map(
            (u) => u.id
          ),
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

  // 2. Remove Product from Wishlist Method
  // DELETE /api/products/:productId/wishlist
  async removeFromWishlist(ctx) {
    try {
      const { id: userId } = ctx.state.user;
      const { productId } = ctx.params; // Product ID from URL parameters

      const product = await strapi.entityService.findOne(
        "api::product.product",
        productId,
        { populate: ["wishlistedByUsers"] } // Populate to check existing users
      );

      if (!product) {
        throw new NotFoundError("Product not found.");
      }

      // Check if user has actually wishlisted this product
      const isWishlisted = product.wishlistedByUsers.some(
        (user) => user.id === userId
      );

      if (!isWishlisted) {
        return ctx.send({
          success: true,
          message: "Product is not in your wishlist.",
          data: {
            product_id: productId,
            user_id: userId,
          },
        });
      }

      // Remove the user from the product's 'wishlistedByUsers' relation
      const updatedProduct = await strapi.entityService.update(
        "api::product.product",
        productId,
        {
          data: {
            // Filter out the current user's ID from the relation
            wishlistedByUsers: product.wishlistedByUsers
              .filter((u) => u.id !== userId)
              .map((u) => u.id),
          },
          populate: ["wishlistedByUsers"], // Populate updated relation for response
        }
      );

      return ctx.send({
        success: true,
        message: "Product removed from wishlist.",
        data: {
          product_id: updatedProduct.id,
          wishlisted_by_user_ids: updatedProduct.wishlistedByUsers.map(
            (u) => u.id
          ),
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

  // 3. Get User's Wishlist (all products wishlisted by the current user)
  // GET /api/products/my-wishlist
  async getMyWishlist(ctx) {
    try {
      const { id: userId } = ctx.state.user;

      const wishlistedProducts = await strapi.entityService.findMany(
        "api::product.product",
        {
          filters: {
            // Filter products where 'wishlistedByUsers' relation contains the current user's ID
            wishlistedByUsers: userId,
          },
          populate: {
            image: {
              fields: ["url", "name", "alternativeText"],
            },
            category: {
              // Populate category if needed
              fields: ["name"],
            },
            reviews: { // <-- ADDED: Populate reviews for wishlist display
                fields: ["rating", "comment", "createdAt"],
                populate: { user: { fields: ["username"] } } // Get reviewer's username
            }
          },
          // You can't easily sort by "added date" with this model, as there's no specific timestamp on the join table.
          // Sorting here would be by product fields like name, price, or creation date of the product.
          sort: [{ createdAt: "desc" }], // Example: sort by product creation date
        }
      );

      if (!wishlistedProducts || wishlistedProducts.length === 0) {
        return ctx.send({
          success: true,
          message: "Your wishlist is empty.",
          data: {
            products: [],
            total_items_in_wishlist: 0,
          },
        });
      }

      return ctx.send({
        success: true,
        message: "Wishlist retrieved successfully.",
        data: {
          products: wishlistedProducts,
          total_items_in_wishlist: wishlistedProducts.length,
          user_id: userId,
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

  // 4. Clear User's Entire Wishlist (remove all products from their wishlist)
  // DELETE /api/products/my-wishlist/clear
  async clearMyWishlist(ctx) {
    try {
      const { id: userId } = ctx.state.user;

      // Find all products currently wishlisted by the user
      const productsToClear = await strapi.entityService.findMany(
        "api::product.product",
        {
          filters: {
            wishlistedByUsers: userId,
          },
          populate: ["wishlistedByUsers"], // Need to populate to update the relation
        }
      );

      if (!productsToClear || productsToClear.length === 0) {
        return ctx.send({
          success: true,
          message: "Your wishlist is already empty.",
          data: null,
        });
      }

      // For each product, remove the current user from its wishlistedByUsers relation
      for (const product of productsToClear) {
        await strapi.entityService.update("api::product.product", product.id, {
          data: {
            wishlistedByUsers: product.wishlistedByUsers
              .filter((u) => u.id !== userId)
              .map((u) => u.id),
          },
        });
      }

      return ctx.send({
        success: true,
        message: "Your wishlist has been cleared.",
        data: null,
      });
    } catch (error) {
      const customizedError = handleErrors(error);
      return ctx.send(
        { success: false, message: customizedError.message },
        handleStatusCode(error) || 500
      );
    }
  },

  //MARK: Add a review to a product
  // POST /api/products/:productId/review
  async addReview(ctx) {
    try {
      const { id: userId } = ctx.state.user;
      const { productId } = ctx.params;
      const requestData = ctx.request.body.data || ctx.request.body;
      const { rating, comment } = requestData;

      validateBodyRequiredFields(requestData, ["rating"]);

      if (isNaN(rating) || rating < 1 || rating > 5) {
        throw new ValidationError("Rating must be an integer between 1 and 5.");
      }
      if (comment && typeof comment !== 'string') {
        throw new ValidationError("Comment must be a string.");
      }

      const product = await strapi.entityService.findOne(
        "api::product.product",
        productId,
        { populate: ["reviews"] } // Populate existing reviews to calculate new average
      );

      if (!product) {
        throw new NotFoundError("Product not found.");
      }

      // Check if the user has already reviewed this product
      const existingReview = product.reviews.find(review => review.user && review.user.id === userId);
      if (existingReview) {
          throw new ValidationError("You have already submitted a review for this product. You can update your existing review.");
      }

      // Create the new review entry
      const newReview = await strapi.entityService.create("api::review.review", {
        data: {
          rating: parseInt(rating),
          comment: comment || null,
          user: userId,
          product: productId,
          publishedAt: new Date(),
        },
      });

      // Calculate new average rating and update review count for the product
      const currentReviews = product.reviews || [];
      const totalRatings = currentReviews.reduce((sum, r) => sum + r.rating, 0) + parseInt(rating);
      const newReviewCount = currentReviews.length + 1;
      const newAverageRating = totalRatings / newReviewCount;

      await strapi.entityService.update("api::product.product", productId, {
        data: {
          rating: parseFloat(newAverageRating.toFixed(2)), // Store with 2 decimal places
          reviewCount: newReviewCount,
        },
      });

      return ctx.send({
        success: true,
        message: "Review added successfully.",
        data: {
          review: {
            id: newReview.id,
            rating: newReview.rating,
            comment: newReview.comment,
            product_id: productId,
            user_id: userId,
          },
          product_updated_rating: parseFloat(newAverageRating.toFixed(2)),
          product_updated_review_count: newReviewCount,
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

  //MARK: Get reviews for a specific product
  // GET /api/products/:productId/reviews
  async getProductReviews(ctx) {
    try {
      const { productId } = ctx.params;

      const product = await strapi.entityService.findOne(
        "api::product.product",
        productId,
        { populate: { reviews: { populate: { user: { fields: ["username", "email", "name"] } } } } } // Populate reviews and their associated user
      );

      if (!product) {
        throw new NotFoundError("Product not found.");
      }

      const reviews = product.reviews.map(review => ({
        id: review.id,
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt,
        updatedAt: review.updatedAt,
        user: {
          id: review.user ? review.user.id : null,
          username: review.user ? review.user.username : null,
          name: review.user ? review.user.name : null,
          email: review.user ? review.user.email : null,
        }
      }));

      return ctx.send({
        success: true,
        message: "Product reviews retrieved successfully.",
        data: {
          product_id: productId,
          product_name: product.name,
          average_rating: product.rating,
          total_reviews: product.reviewCount,
          reviews: reviews,
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
}));
