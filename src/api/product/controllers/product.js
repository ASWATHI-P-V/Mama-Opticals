// // src/api/product/controllers/product.js

"use strict";

const { createCoreController } = require("@strapi/strapi").factories;
const strapiUtils = require("@strapi/utils");
const { ValidationError, NotFoundError } = strapiUtils.errors;

const parseIdsToArray = (input) => {
    if (input === undefined || input === null || input === '') {
        return null;
    }
    if (Array.isArray(input)) {
        return input.map(id => {
            const parsedId = parseInt(id, 10);
            if (isNaN(parsedId)) {
                throw new ValidationError(`Invalid ID type found in array: ${id}`);
            }
            return parsedId;
        }).filter(id => !isNaN(id));
    }
    if (typeof input === 'string') {
        const ids = input.split(',').map(s => {
            const trimmedS = s.trim();
            if (trimmedS === '') return NaN;
            const parsedId = parseInt(trimmedS, 10);
            if (isNaN(parsedId)) {
                throw new ValidationError(`Invalid ID format in string: '${trimmedS}'`);
            }
            return parsedId;
        }).filter(id => !isNaN(id));
        return ids.length > 0 ? ids : null;
    }
    if (typeof input === 'number') {
        return [input];
    }
    throw new ValidationError(`Unexpected data type for IDs: ${typeof input}`);
};

const validateOneToManyRelationIds = async (target, ids, fieldName) => {
    // Return early if no IDs are provided
    if (!ids) return;

    if (!Array.isArray(ids)) {
        throw new ValidationError(`${fieldName} must be an array of IDs.`);
    }

    if (ids.length > 0) {
        // Use a single query to fetch all entities by their IDs
        const entities = await strapi.entityService.findMany(target, {
            filters: { id: { $in: ids } },
            fields: ['id'], // We only need the IDs to check for existence
        });

        // Check if the number of found entities matches the number of provided IDs
        if (entities.length !== ids.length) {
            const foundIds = new Set(entities.map(e => e.id));
            const notFoundIds = ids.filter(id => !foundIds.has(id));
            throw new NotFoundError(`Provided ${fieldName} ID(s) [${notFoundIds.join(', ')}] not found.`);
        }
    }
};


const handleErrors = (error) => {
    console.error("Error occurred:", error);
    const errorMessage = String(error.message || '');
    if (error.name === "ValidationError") return { message: errorMessage };
    if (error.name === "NotFoundError") return { message: errorMessage };
    if (errorMessage.includes("Missing required field")) return { message: errorMessage };
    if (errorMessage.includes("relation(s) of type plugin::upload.file associated with this entity do not exist")) {
        return { message: "One or more provided image IDs do not exist or are invalid." };
    }
    return { message: "An unexpected error occurred." };
};

const handleStatusCode = (error) => {
    const errorMessage = String(error.message || '');
    if (error.name === "ValidationError") return 400;
    if (error.name === "NotFoundError") return 404;
    if (errorMessage.includes("Missing required field")) return 400;
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
            throw new ValidationError(`Missing required field: ${field}`);
        }
    }
};

// Placeholder for `ImageFile`. Your custom implementation is assumed to be working.
async function ImageFile(file, width, height) {
    const [uploadedFile] = await strapi.plugins.upload.services.upload.upload({
        data: {},
        files: file,
    });
    return uploadedFile;
}
// --- END Helper Functions ---

module.exports = createCoreController("api::product.product", ({ strapi }) => ({

    async create(ctx) {
        try {
            const { body, files } = ctx.request;
            const requestData = body.data || body;

            // Step 1: Pre-process and validate data types
            const processedData = {
                ...requestData,
                lens_types: parseIdsToArray(requestData.lens_types),
                lens_coatings: parseIdsToArray(requestData.lens_coatings),
                frame_weights: parseIdsToArray(requestData.frame_weights),
                brands: parseIdsToArray(requestData.brands),
                frame_materials: parseIdsToArray(requestData.frame_materials),
                frame_shapes: parseIdsToArray(requestData.frame_shapes),
                lens_thicknesses: parseIdsToArray(requestData.lens_thicknesses),
                frame_sizes: parseIdsToArray(requestData.frame_sizes),
                colors: parseIdsToArray(requestData.colors),
                // Handle booleans coming as strings or undefined
                inStock: requestData.inStock !== undefined ? String(requestData.inStock).toLowerCase() === 'true' : undefined,
                best_seller: requestData.best_seller !== undefined ? String(requestData.best_seller).toLowerCase() === 'true' : undefined,
                isActive: requestData.isActive !== undefined ? String(requestData.isActive).toLowerCase() === 'true' : true,
            };

            // Step 2: Validate required fields and values
            validateBodyRequiredFields(processedData, ["name", "price", "stock"]);
            // Additional custom validations
            if (isNaN(processedData.price) || processedData.price < 0) {
                throw new ValidationError("Price must be a non-negative number.");
            }
            if (isNaN(processedData.stock) || processedData.stock < 0) {
                throw new ValidationError("Stock must be a non-negative integer.");
            }
            if (processedData.offerPrice !== undefined && (isNaN(processedData.offerPrice) || processedData.offerPrice >= processedData.price)) {
                throw new ValidationError("Offer price must be a valid number less than the original price.");
            }

            // Step 3: Validate existence of related entities using the improved helper
            if (processedData.category) {
                const categoryEntity = await strapi.entityService.findOne("api::category.category", processedData.category);
                if (!categoryEntity) throw new NotFoundError("Provided category not found.");
            }
            await validateOneToManyRelationIds("api::lens-type.lens-type", processedData.lens_types, "lens_types");
            await validateOneToManyRelationIds("api::lens-coating.lens-coating", processedData.lens_coatings, "lens_coatings");
            await validateOneToManyRelationIds("api::frame-weight.frame-weight", processedData.frame_weights, "frame_weights");
            await validateOneToManyRelationIds("api::brand.brand", processedData.brands, "brands");
            await validateOneToManyRelationIds("api::frame-material.frame-material", processedData.frame_materials, "frame_materials");
            await validateOneToManyRelationIds("api::frame-shape.frame-shape", processedData.frame_shapes, "frame_shapes");
            await validateOneToManyRelationIds("api::lens-thickness.lens-thickness", processedData.lens_thicknesses, "lens_thicknesses");
            await validateOneToManyRelationIds("api::frame-size.frame-size", processedData.frame_sizes, "frame_sizes");
            await validateOneToManyRelationIds("api::color.color", processedData.colors, "colors");

            // Step 4: Handle image uploads
            let uploadedImageIds = [];
            if (files && files.image) {
                const imageFiles = Array.isArray(files.image) ? files.image : [files.image];
                const processedImages = await Promise.all(
                    imageFiles.map(file => ImageFile(file, 800, 800))
                );
                uploadedImageIds = processedImages.map(img => img.id);
            }

            // Step 5: Create the new product
            const newProduct = await strapi.entityService.create(
                "api::product.product", {
                    data: {
                        ...processedData,
                        image: uploadedImageIds,
                        publishedAt: new Date(),
                    },
                    // Populate all relations to return a complete, detailed response
                    populate: [
                        "image", "category", "lens_types", "lens_coatings", "frame_weights",
                        "brands", "frame_materials", "frame_shapes", "lens_thicknesses",
                        "frame_sizes", "colors", "reviews", "wishlistedByUsers"
                    ],
                }
            );

            // Step 6: Send the final, populated response
            return ctx.send({
                success: true,
                message: "Product created successfully.",
                data: newProduct,
            });
        } catch (error) {
            const customizedError = handleErrors(error);
            ctx.status = handleStatusCode(error) || 500;
            return ctx.send({ success: false, message: customizedError.message });
        }
    },

    //MARK: Find one product by ID
    async findOne(ctx) {
        try {
            const { id } = ctx.params;
            const product = await strapi.entityService.findOne(
                "api::product.product",
                id,
                {
                    populate: [
                        'image',
                        'category',
                        'lens_types',
                        'lens_coatings',
                        'frame_weights',
                        'brands',
                        'colors',
                        'frame_materials',
                        'frame_shapes',
                        'lens_thicknesses',
                        'frame_sizes',
                        'reviews',
                        'best_seller',
                    ],
                }
            );
            if (!product) {
                throw new NotFoundError("Product not found.");
            }
            const sanitizedProduct = await strapiUtils.sanitize.contentAPI.output(
                product,
                strapi.contentType('api::product.product')
            );
            return ctx.send({
                success: true,
                message: "Product retrieved successfully.",
                data: sanitizedProduct,
            });
        } catch (error) {
            const customizedError = handleErrors(error);
            ctx.status = handleStatusCode(error) || 500;
            return ctx.send({ success: false, message: customizedError.message });
        }
    },

    //MARK: Find all products
    async find(ctx) {
        try {
            const { query } = ctx;
            let filters = {};
            let sort = [];
            let populate = [
                'image', 'category', 'lens_types', 'lens_coatings', 'frame_weights',
                'brands', 'colors', 'frame_materials', 'frame_shapes', 'lens_thicknesses',
                'frame_sizes', 'reviews', 'best_seller',
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
            if (query.price_gte) { filters.price = { ...filters.price, $gte: parseFloat(query.price_gte) }; delete query.price_gte; }
            if (query.price_lte) { filters.price = { ...filters.price, $lte: parseFloat(query.price_lte) }; delete query.price_lte; }
            if (query.offerPrice_gte) { filters.offerPrice = { ...filters.offerPrice, $gte: parseFloat(query.offerPrice_gte) }; delete query.offerPrice_gte; }
            if (query.offerPrice_lte) { filters.offerPrice = { ...filters.offerPrice, $lte: parseFloat(query.offerPrice_lte) }; delete query.offerPrice_lte; }
            if (query.inStock !== undefined) { filters.inStock = query.inStock.toLowerCase() === 'true'; delete query.inStock; }
            if (query.best_seller !== undefined) { filters.best_seller = query.best_seller.toLowerCase() === 'true'; delete query.best_seller; }
            if (query.stock_gte) { filters.stock = { ...filters.stock, $gte: parseInt(query.stock_gte) }; delete query.stock_gte; }
            if (query.stock_lte) { filters.stock = { ...filters.stock, $lte: parseInt(query.stock_lte) }; delete query.stock_lte; }
            if (query.category) { filters.category = { name: { $eqi: query.category } }; delete query.category; }
            if (query.colors) { filters.colors = { name: { $eqi: query.colors } }; delete query.colors; }
            if (query.brands) { filters.brands = { name: { $eqi: query.brands } }; delete query.brands; }
            if (query.frame_materials) { filters.frame_materials = { name: { $eqi: query.frame_materials } }; delete query.frame_materials; }
            if (query.frame_shapes) { filters.frame_shapes = { name: { $eqi: query.frame_shapes } }; delete query.frame_shapes; }
            if (query.lens_types) { filters.lens_types = { name: { $eqi: query.lens_types } }; delete query.lens_types; }
            if (query.lens_coatings) { filters.lens_coatings = { name: { $eqi: query.lens_coatings } }; delete query.lens_coatings; }
            if (query.lens_thicknesses) { filters.lens_thicknesses = { name: { $eqi: query.lens_thicknesses } }; delete query.lens_thicknesses; }
            if (query.frame_weights) { filters.frame_weights = { name: { $eqi: query.frame_weights } }; delete query.frame_weights; }
            if (query.frame_sizes) { filters.frame_sizes = { name: { $eqi: query.frame_sizes } }; delete query.frame_sizes; }
            if (query.rating_gte) { filters.rating = { ...filters.rating, $gte: parseFloat(query.rating_gte) }; delete query.rating_gte; }
            if (query.rating_lte) { filters.rating = { ...filters.rating, $lte: parseFloat(query.rating_lte) }; delete query.rating_lte; }

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
            ctx.status = handleStatusCode(error) || 500;
            return ctx.send({ success: false, message: customizedError.message });
        }
    },

    //MARK: Update product
    async update(ctx) {
        try {
            const { id } = ctx.params;
            const { body, files } = ctx.request;
            const requestData = body.data || body;

            const existingProduct = await strapi.entityService.findOne(
                "api::product.product",
                id,
                { populate: ['image', 'lens_types', 'lens_coatings', 'frame_weights', 'brands', 'frame_materials', 'frame_shapes', 'lens_thicknesses', 'frame_sizes', 'colors'] }
            );
            if (!existingProduct) {
                throw new NotFoundError("Product not found.");
            }

            // Consolidate all the processing logic into one object
            const processedData = {
                ...requestData
            };
            if (requestData.lens_types !== undefined) processedData.lens_types = parseIdsToArray(requestData.lens_types);
            if (requestData.lens_coatings !== undefined) processedData.lens_coatings = parseIdsToArray(requestData.lens_coatings);
            if (requestData.frame_weights !== undefined) processedData.frame_weights = parseIdsToArray(requestData.frame_weights);
            if (requestData.brands !== undefined) processedData.brands = parseIdsToArray(requestData.brands);
            if (requestData.frame_materials !== undefined) processedData.frame_materials = parseIdsToArray(requestData.frame_materials);
            if (requestData.frame_shapes !== undefined) processedData.frame_shapes = parseIdsToArray(requestData.frame_shapes);
            if (requestData.lens_thicknesses !== undefined) processedData.lens_thicknesses = parseIdsToArray(requestData.lens_thicknesses);
            if (requestData.frame_sizes !== undefined) processedData.frame_sizes = parseIdsToArray(requestData.frame_sizes);
            if (requestData.colors !== undefined) processedData.colors = parseIdsToArray(requestData.colors);

            // Handle boolean fields, defaulting to existing value if not provided
            if (requestData.inStock !== undefined) processedData.inStock = String(requestData.inStock).toLowerCase() === 'true';
            else processedData.inStock = existingProduct.inStock;

            if (requestData.best_seller !== undefined) processedData.best_seller = String(requestData.best_seller).toLowerCase() === 'true';
            else processedData.best_seller = existingProduct.best_seller;

            // Update inStock based on stock count if stock is explicitly updated
            if (requestData.stock !== undefined) {
                if (isNaN(requestData.stock) || requestData.stock < 0) {
                    throw new ValidationError("Stock must be a non-negative integer.");
                }
                processedData.inStock = requestData.stock > 0;
            } else {
                processedData.stock = existingProduct.stock; // Retain existing stock if not provided
            }

            // Validate numeric fields
            if (processedData.rating !== undefined && (isNaN(processedData.rating) || processedData.rating < 0 || processedData.rating > 5)) {
                throw new ValidationError("Rating must be a number between 0 and 5.");
            }
            if (processedData.offerPrice !== undefined) {
                if (isNaN(processedData.offerPrice) || processedData.offerPrice < 0) {
                    throw new ValidationError("Offer price must be a non-negative number.");
                }
                const currentPrice = processedData.price !== undefined ? processedData.price : existingProduct.price;
                if (processedData.offerPrice >= currentPrice) {
                    throw new ValidationError("Offer price must be less than the original price.");
                }
            }

            // Step 2: Validate existence of related entities efficiently
            if (processedData.category) {
                const categoryEntity = await strapi.entityService.findOne("api::category.category", processedData.category);
                if (!categoryEntity) throw new NotFoundError("Provided category not found.");
            }
            await validateOneToManyRelationIds("api::lens-type.lens-type", processedData.lens_types, "lens_types");
            await validateOneToManyRelationIds("api::lens-coating.lens-coating", processedData.lens_coatings, "lens_coatings");
            await validateOneToManyRelationIds("api::frame-weight.frame-weight", processedData.frame_weights, "frame_weights");
            await validateOneToManyRelationIds("api::brand.brand", processedData.brands, "brands");
            await validateOneToManyRelationIds("api::frame-material.frame-material", processedData.frame_materials, "frame_materials");
            await validateOneToManyRelationIds("api::frame-shape.frame-shape", processedData.frame_shapes, "frame_shapes");
            await validateOneToManyRelationIds("api::lens-thickness.lens-thickness", processedData.lens_thicknesses, "lens_thicknesses");
            await validateOneToManyRelationIds("api::frame-size.frame-size", processedData.frame_sizes, "frame_sizes");
            await validateOneToManyRelationIds("api::color.color", processedData.colors, "colors");

            // Step 3: Handle image updates
            let finalImageIds = existingProduct.image ? existingProduct.image.map(img => img.id) : [];
            if (files && files.image) {
                const newImageFiles = Array.isArray(files.image) ? files.image : [files.image];
                const uploadedNewImages = await Promise.all(
                    newImageFiles.map(file => ImageFile(file, 800, 800))
                );
                finalImageIds = uploadedNewImages.map(img => img.id);
            } else if (requestData.image !== undefined) {
                // If the client sends an empty string or an array of IDs, use that.
                const parsedImageIds = parseIdsToArray(requestData.image);
                await validateOneToManyRelationIds("plugin::upload.file", parsedImageIds, "image");
                finalImageIds = parsedImageIds;
            }
            processedData.image = finalImageIds;

            // Step 4: Update the product
            const updatedProduct = await strapi.entityService.update(
                "api::product.product",
                id,
                {
                    data: processedData,
                    // Populate all relations to return a complete, detailed response
                    populate: [
                        "image", "category", "lens_types", "lens_coatings", "frame_weights",
                        "brands", "colors", "frame_materials", "frame_shapes", "lens_thicknesses",
                        "frame_sizes", "reviews", "best_seller"
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
            ctx.status = handleStatusCode(error) || 500;
            return ctx.send({ success: false, message: customizedError.message });
        }
    },

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
            ctx.status = handleStatusCode(error) || 500;
            return ctx.send({ success: false, message: customizedError.message });
        }
    },

// "use strict";

// const { createCoreController } = require("@strapi/strapi").factories;
// const strapiUtils = require("@strapi/utils");
// const { ValidationError, NotFoundError } = strapiUtils.errors;

// // --- IMPORTANT: Helper Functions ---
// // You MUST ensure `ImageFile` is available and correctly implemented.
// // It should take a single file object and return the uploaded file object from Strapi.
// // A common place for this would be in `src/utils/media-helper.js` or `src/api/product/services/product.js`.
// // You would then import it: `const { ImageFile } = require('../../../utils/media-helper');`

// /*
// // Example `ImageFile` (formerly processImageFile) - this needs to be implemented in your project!
// // Install 'sharp': npm install sharp
// // If you put this in `src/utils/media-helper.js`, make sure to export it: `module.exports = { ImageFile };`

// const sharp = require('sharp');
// const fs = require('fs/promises');
// const path = require('path');

// async function ImageFile(file, width, height) {
//     if (!file) return null;

//     try {
//         const buffer = await fs.readFile(file.path);
//         let processedBuffer = buffer;

//         // Resize image if dimensions are provided and image is larger
//         if (width || height) {
//             const image = sharp(buffer);
//             const metadata = await image.metadata();

//             if (metadata.width > width || metadata.height > height) {
//                 processedBuffer = await image
//                     .resize(width, height, {
//                         fit: sharp.fit.inside,
//                         withoutEnlargement: true // Prevent upscaling
//                     })
//                     .toBuffer();
//             }
//         }

//         // Create a temporary file path for Strapi's upload service
//         // Ensure strapi.dirs.app.tmp exists and is writable
//         const tempFileName = `${path.basename(file.name, path.extname(file.name))}-${Date.now()}${path.extname(file.name)}`;
//         const tempPath = path.join(strapi.dirs.app.tmp, tempFileName);
//         await fs.writeFile(tempPath, processedBuffer);

//         // Prepare the file object for Strapi's upload service
//         const filesToUpload = {
//             name: file.name,
//             type: file.type,
//             size: processedBuffer.length,
//             path: tempPath, // Use the path to the processed temporary file
//         };

//         // Upload the file to Strapi's media library
//         const [uploadedFile] = await strapi.plugins.upload.services.upload.upload({
//             data: {}, // Any extra data for the upload (e.g., alternativeText, caption)
//             files: filesToUpload,
//         });

//         // Clean up the temporary file
//         await fs.unlink(tempPath);

//         return uploadedFile; // Returns the uploaded file object from Strapi
//     } catch (err) {
//         console.error("Error processing or uploading image:", err);
//         throw new Error(`Failed to process image file: ${file.name}. ${err.message}`);
//     }
// }
// */

// // --- Placeholder for ImageFile if you don't have it yet. Remove this once implemented above.
// async function ImageFile(file) {
//     console.warn("WARNING: `ImageFile` is a placeholder. Implement proper image processing and Strapi upload logic.");
//     const [uploadedFile] = await strapi.plugins.upload.services.upload.upload({
//         data: {},
//         files: file,
//     });
//     return uploadedFile;
// }
// // --- END Placeholder ---


// const handleErrors = (error) => {
//     console.error("Error occurred:", error);
//     const errorMessage = String(error.message || '');

//     if (error.name === "ValidationError") {
//         return { message: errorMessage };
//     }
//     if (error.name === "NotFoundError") {
//         return { message: errorMessage };
//     }
//     if (errorMessage.includes("Missing required field")) {
//         return { message: errorMessage };
//     }
//     // Catch the specific Yup validation error for relations not existing
//     if (errorMessage.includes("relation(s) of type plugin::upload.file associated with this entity do not exist")) {
//         return { message: "One or more provided image IDs do not exist or are invalid." };
//     }
//     return { message: "An unexpected error occurred." };
// };

// const handleStatusCode = (error) => {
//     const errorMessage = String(error.message || '');

//     if (error.name === "ValidationError") return 400;
//     if (error.name === "NotFoundError") return 404;
//     if (errorMessage.includes("Missing required field")) {
//         return 400;
//     }
//     // Catch the specific Yup validation error for relations not existing
//     if (errorMessage.includes("relation(s) of type plugin::upload.file associated with this entity do not exist")) {
//         return 400;
//     }
//     return 500;
// };

// const validateBodyRequiredFields = (body, fields) => {
//     for (const field of fields) {
//         if (
//             body[field] === undefined ||
//             body[field] === null ||
//             body[field] === ""
//         ) {
//             throw new Error(`Missing required field: ${field}`);
//         }
//     }
// };

// const parseIdsToArray = (input) => {
//     if (input === undefined || input === null || input === '') {
//         return null; // Or return an empty array [] if you prefer null for absence.
//     }

//     // If it's already an array, ensure elements are numbers (or strings that can be numbers)
//     if (Array.isArray(input)) {
//         return input.map(id => {
//             const parsedId = parseInt(id, 10);
//             if (isNaN(parsedId)) {
//                 throw new ValidationError(`Invalid ID type found in array: ${id}`);
//             }
//             return parsedId;
//         }).filter(id => !isNaN(id)); // Filter out any remaining NaN from empty strings
//     }

//     // If it's a string, attempt to parse it
//     if (typeof input === 'string') {
//         // Handle comma-separated IDs (e.g., "1,2,3")
//         const ids = input.split(',').map(s => {
//             const trimmedS = s.trim();
//             if (trimmedS === '') return NaN; // Handle empty strings from "1,,2"
//             const parsedId = parseInt(trimmedS, 10);
//             if (isNaN(parsedId)) {
//                 throw new ValidationError(`Invalid ID format in string: '${trimmedS}'`);
//             }
//             return parsedId;
//         }).filter(id => !isNaN(id)); // Filter out NaN from failed parses or empty strings

//         return ids.length > 0 ? ids : null;
//     }

//     // If it's a single number, wrap it in an array
//     if (typeof input === 'number') {
//         return [input];
//     }

//     // For any other unexpected type
//     throw new ValidationError(`Unexpected data type for IDs: ${typeof input}`);
// };

// module.exports = createCoreController("api::product.product", ({ strapi }) => ({

//     //MARK:Create a new product
//     async create(ctx) {
//         try {
//             const { body, files } = ctx.request;
//             const requestData = body.data || body;

//             // --- Log for debugging: See what requestData looks like initially ---
//             console.log('--- CREATE: Raw requestData ---');
//             console.log(requestData);
//             console.log('Type of requestData.lens_types:', typeof requestData.lens_types);
//             console.log('Is requestData.lens_types an Array (raw)?', Array.isArray(requestData.lens_types));
//             console.log('Value of requestData.lens_types (raw):', requestData.lens_types);
//             console.log('---------------------------------');

//             // Process array fields
//             const processedLensTypes = parseIdsToArray(requestData.lens_types);
//             const processedLensCoatings = parseIdsToArray(requestData.lens_coatings);
//             const processedFrameWeights = parseIdsToArray(requestData.frame_weights);
//             const processedBrands = parseIdsToArray(requestData.brands);
//             const processedFrameMaterials = parseIdsToArray(requestData.frame_materials);
//             const processedFrameShapes = parseIdsToArray(requestData.frame_shapes);
//             const processedLensThicknesses = parseIdsToArray(requestData.lens_thicknesses);
//             const processedFrameSizes = parseIdsToArray(requestData.frame_sizes);
//             const processedColors = parseIdsToArray(requestData.colors);

//             const {
//                 name,
//                 description,
//                 price,
//                 stock,
//                 category,
//                 salesCount,
//                 offers,
//                 offerPrice,
//                 rating,
//                 reviewCount,
//                 best_seller,
//                 // Do NOT destructure lens_types etc. here directly from requestData anymore,
//                 // as we're using the processed versions.
//             } = requestData;

//             // Validate required fields
//             validateBodyRequiredFields(requestData, ["name", "price", "stock"]);

//             // --- Validation for inStock (String to Boolean conversion) ---
//             let processedInStock;
//             if (requestData.inStock !== undefined) {
//                 processedInStock = String(requestData.inStock).toLowerCase() === 'true';
//             } else {
//                 processedInStock = stock > 0;
//             }
//             // --- End inStock Validation ---

//             // --- Validation for best_seller (String to Boolean conversion) ---
//             let processedBestSeller = false;
//             if (requestData.best_seller !== undefined) {
//                 processedBestSeller = String(requestData.best_seller).toLowerCase() === 'true';
//             }
//             // --- End best_seller Validation ---


//             // Basic type/value validation for price and stock
//             if (isNaN(price) || price < 0) {
//                 throw new ValidationError("Price must be a non-negative number.");
//             }
//             if (isNaN(stock) || stock < 0) {
//                 throw new ValidationError("Stock must be a non-negative integer.");
//             }

//             if (rating !== undefined && (isNaN(rating) || rating < 0 || rating > 5)) {
//                 throw new ValidationError("Rating must be a number between 0 and 5.");
//             }
//             if (reviewCount !== undefined && (isNaN(reviewCount) || reviewCount < 0)) {
//                 throw new ValidationError("Review count must be a non-negative integer.");
//             }
//             if (offerPrice !== undefined && (isNaN(offerPrice) || offerPrice < 0)) {
//                 throw new ValidationError("Offer price must be a non-negative number.");
//             }
//             if (offerPrice !== undefined && offerPrice >= price) {
//                 throw new ValidationError("Offer price must be less than the original price.");
//             }

//             // Validate existence of related entities for manyToOne (category)
//             if (category) {
//                 if (Array.isArray(category)) {
//                     throw new ValidationError("Category must be a single ID, not an array.");
//                 }
//                 const categoryEntity = await strapi.entityService.findOne("api::category.category", category);
//                 if (!categoryEntity) {
//                     throw new NotFoundError("Provided category not found.");
//                 }
//             }

//             // Validate existence of related entities for oneToMany relations (expect arrays of IDs)
//             // This function now expects an actual array, thanks to parseIdsToArray
//             const validateOneToManyRelationIds = async (target, ids, fieldName) => {
//                 if (ids !== null) { // Changed from `ids !== undefined && ids !== null`
//                     if (!Array.isArray(ids)) {
//                         // This case should ideally not be hit if parseIdsToArray works correctly
//                         throw new ValidationError(`${fieldName} must be an array of IDs.`);
//                     }
//                     for (const id_item of ids) {
//                         // Type check simplified, as parseIdsToArray should ensure they are numbers
//                         if (typeof id_item !== 'number') {
//                              throw new ValidationError(`Invalid ID type in ${fieldName} array after parsing: ${id_item}. Expected number.`);
//                         }
//                         const entity = await strapi.entityService.findOne(target, id_item);
//                         if (!entity) {
//                             throw new NotFoundError(`Provided ${fieldName} ID ${id_item} not found.`);
//                         }
//                     }
//                 }
//             };

//             await validateOneToManyRelationIds("api::lens-type.lens-type", processedLensTypes, "lens_types");
//             await validateOneToManyRelationIds("api::lens-coating.lens-coating", processedLensCoatings, "lens_coatings");
//             await validateOneToManyRelationIds("api::frame-weight.frame-weight", processedFrameWeights, "frame_weights");
//             await validateOneToManyRelationIds("api::brand.brand", processedBrands, "brands");
//             await validateOneToManyRelationIds("api::frame-material.frame-material", processedFrameMaterials, "frame_materials");
//             await validateOneToManyRelationIds("api::frame-shape.frame-shape", processedFrameShapes, "frame_shapes");
//             await validateOneToManyRelationIds("api::lens-thickness.lens-thickness", processedLensThicknesses, "lens_thicknesses");
//             await validateOneToManyRelationIds("api::frame-size.frame-size", processedFrameSizes, "frame_sizes");
//             await validateOneToManyRelationIds("api::color.color", processedColors, "colors");

//             // Multi-Image Upload Logic for Product Creation
//             let uploadedImageIds = [];
//             if (files && files.image) {
//                 const imageFiles = Array.isArray(files.image) ? files.image : [files.image];
//                 if (imageFiles.length > 0) {
//                     const processedImages = await Promise.all(
//                         imageFiles.map(file => ImageFile(file, 800, 800))
//                     );
//                     uploadedImageIds = processedImages.map(img => img.id);
//                 }
//             }

//             // Create the new product
//             const newProduct = await strapi.entityService.create(
//                 "api::product.product",
//                 {
//                     data: {
//                         name,
//                         description,
//                         price,
//                         stock: stock,
//                         inStock: processedInStock,
//                         image: uploadedImageIds,
//                         category,
//                         lens_types: processedLensTypes, // Use processed arrays
//                         lens_coatings: processedLensCoatings,
//                         frame_weights: processedFrameWeights,
//                         brands: processedBrands,
//                         frame_materials: processedFrameMaterials,
//                         frame_shapes: processedFrameShapes,
//                         lens_thicknesses: processedLensThicknesses,
//                         frame_sizes: processedFrameSizes,
//                         colors: processedColors,
//                         salesCount: salesCount || 0,
//                         offers,
//                         offerPrice,
//                         rating: rating || 0,
//                         reviewCount: reviewCount || 0,
//                         best_seller: processedBestSeller,
//                         publishedAt: new Date(),
//                     },
//                     populate: [
//                         "image",
//                         "category",
//                         "lens_types",
//                         "lens_coatings",
//                         "frame_weights",
//                         "brands",
//                         "colors",
//                         "frame_materials",
//                         "frame_shapes",
//                         "lens_thicknesses",
//                         "frame_sizes",
//                         "wishlistedByUsers",
//                         "reviews",
//                         "best_seller",
//                     ],
//                 }
//             );

//             return ctx.send({
//                 success: true,
//                 message: "Product created successfully.",
//                 data: {
//                     product_id: newProduct.id,
//                     product_name: newProduct.name,
//                     image_ids: uploadedImageIds,
//                     best_seller: newProduct.best_seller,
//                 },
//             });
//         } catch (error) {
//             const customizedError = handleErrors(error);
//             return ctx.send(
//                 { success: false, message: customizedError.message },
//                 handleStatusCode(error) || 500
//             );
//         }
//     },

    //MARK:find one product by ID
    // async findOne(ctx) {
    //     try {
    //         const { id } = ctx.params; // Product ID from URL parameters
    //         const product = await strapi.entityService.findOne(
    //             "api::product.product",
    //             id,
    //             {
    //                 populate: [
    //                     'image',
    //                     'category', 
    //                     'lens_types',
    //                     'lens_coatings',
    //                     'frame_weights',
    //                     'brands',
    //                     'colors',
    //                     'frame_materials',
    //                     'frame_shapes',
    //                     'lens_thicknesses',
    //                     'frame_sizes',
    //                     'reviews',
    //                     'best_seller',
    //                 ],
    //             }
    //         );
    //         if (!product) {
    //             throw new NotFoundError("Product not found.");
    //         }
    //         const sanitizedProduct = await strapiUtils.sanitize.contentAPI.output(
    //             product,
    //             strapi.contentType('api::product.product')
    //         );
    //         return ctx.send({
    //             success: true,
    //             message: "Product retrieved successfully.",
    //             data: sanitizedProduct,
    //         });
    //       } catch (error) {
    //         const customizedError = handleErrors(error);
    //         return ctx.send(
    //             { success: false, message: customizedError.message },
    //             handleStatusCode(error) || 500
    //         );
    //     }
    //   },

    // //MARK:Find all products
    // async find(ctx) {
    //     // ... (No changes needed here for this specific issue)
    //     try {
    //         const { query } = ctx;
    //         let filters = {};
    //         let sort = [];
    //         let populate = [
    //             'image',
    //             'category',
    //             'lens_types',
    //             'lens_coatings',
    //             'frame_weights',
    //             'brands',
    //             "colors",
    //             'frame_materials',
    //             'frame_shapes',
    //             'lens_thicknesses',
    //             'frame_sizes',
    //             'reviews',
    //             'best_seller', // NEW: Populate best_seller
    //         ];

    //         // --- 1. Search (using '_q' for fuzzy search across specified fields) ---
    //         if (query._q) {
    //             filters.$or = [
    //                 { name: { $containsi: query._q } },
    //                 { description: { $containsi: query._q } },
    //                 { colors: { name: { $containsi: query._q } } },
    //                 { brands: { name: { $containsi: query._q } } },
    //                 { frame_materials: { name: { $containsi: query._q } } },
    //                 { frame_shapes: { name: { $containsi: query._q } } },
    //                 { lens_types: { name: { $containsi: query._q } } },
    //                 { lens_coatings: { name: { $containsi: query._q } } },
    //                 { lens_thicknesses: { name: { $containsi: query._q } } },
    //                 { frame_weights: { name: { $containsi: query._q } } },
    //                 { frame_sizes: { name: { $containsi: query._q } } },
    //             ];
    //             delete query._q;
    //         }

    //         // --- 2. Filtering ---

    //         // Price Range
    //         if (query.price_gte) {
    //             filters.price = { ...filters.price, $gte: parseFloat(query.price_gte) };
    //             delete query.price_gte;
    //         }
    //         if (query.price_lte) {
    //             filters.price = { ...filters.price, $lte: parseFloat(query.price_lte) };
    //             delete query.price_lte;
    //         }

    //         // Offer Price Range
    //         if (query.offerPrice_gte) {
    //             filters.offerPrice = { ...filters.offerPrice, $gte: parseFloat(query.offerPrice_gte) };
    //             delete query.offerPrice_gte;
    //         }
    //         if (query.offerPrice_lte) {
    //             filters.offerPrice = { ...filters.offerPrice, $lte: parseFloat(query.offerPrice_lte) };
    //             delete query.offerPrice_lte;
    //         }

    //         // Availability (inStock - Boolean field)
    //         if (query.inStock !== undefined) {
    //             filters.inStock = query.inStock.toLowerCase() === 'true'; // Convert string to boolean for filtering
    //             delete query.inStock;
    //         }

    //         // NEW: Best Seller Filter
    //         if (query.best_seller !== undefined) {
    //             filters.best_seller = query.best_seller.toLowerCase() === 'true'; // Convert string to boolean for filtering
    //             delete query.best_seller;
    //         }

    //         // Stock Range
    //         if (query.stock_gte) {
    //             filters.stock = { ...filters.stock, $gte: parseInt(query.stock_gte) };
    //             delete query.stock_gte;
    //         }
    //         if (query.stock_lte) {
    //             filters.stock = { ...filters.stock, $lte: parseInt(query.stock_lte) };
    //             delete query.stock_lte;
    //         }

    //         // Category (by name)
    //         if (query.category) {
    //             filters.category = { name: { $eqi: query.category } };
    //             delete query.category;
    //         }

    //         // Color (assuming relation to 'Color' CT)
    //         if (query.colors) {
    //             filters.colors = { name: { $eqi: query.colors } };
    //             delete query.colors;
    //         }

    //         // Filter by related content type's name
    //         if (query.brands) {
    //             filters.brands = { name: { $eqi: query.brands } };
    //             delete query.brands;
    //         }
    //         if (query.frame_materials) {
    //             filters.frame_materials = { name: { $eqi: query.frame_materials } };
    //             delete query.frame_materials;
    //         }
    //         if (query.frame_shapes) {
    //             filters.frame_shapes = { name: { $eqi: query.frame_shapes } };
    //             delete query.frame_shapes;
    //         }
    //         if (query.lens_types) {
    //             filters.lens_types = { name: { $eqi: query.lens_types } };
    //             delete query.lens_types;
    //         }
    //         if (query.lens_coatings) {
    //             filters.lens_coatings = { name: { $eqi: query.lens_coatings } };
    //             delete query.lens_coatings;
    //         }
    //         if (query.lens_thicknesses) {
    //             filters.lens_thicknesses = { name: { $eqi: query.lens_thicknesses } };
    //             delete query.lens_thicknesses;
    //         }
    //         if (query.frame_weights) {
    //             filters.frame_weights = { name: { $eqi: query.frame_weights } };
    //             delete query.frame_weights;
    //         }
    //         if (query.frame_sizes) {
    //             filters.frame_sizes = { name: { $eqi: query.frame_sizes } };
    //             delete query.frame_sizes;
    //         }

    //         // Rating (gte)
    //         if (query.rating_gte) {
    //             filters.rating = { ...filters.rating, $gte: parseFloat(query.rating_gte) };
    //             delete query.rating_gte;
    //         }
    //         if (query.rating_lte) {
    //             filters.rating = { ...filters.rating, $lte: parseFloat(query.rating_lte) };
    //             delete query.rating_lte;
    //         }


    //         // --- 3. Sorting ---
    //         if (query._sort) {
    //             const sortParams = Array.isArray(query._sort) ? query._sort : [query._sort];
    //             sort = sortParams.map(s => {
    //                 const [field, order] = s.split(':');
    //                 if (field.includes('.')) {
    //                     const [relation, subField] = field.split('.');
    //                     return { [relation]: { [subField]: order.toLowerCase() } };
    //                 }
    //                 return { [field]: order.toLowerCase() };
    //             });
    //             delete query._sort;
    //         } else {
    //             sort.push({ createdAt: 'desc' });
    //         }

    //         // --- 4. Pagination ---
    //         const page = parseInt(query.page || 1);
    //         const pageSize = parseInt(query.pageSize || 10);
    //         const start = (page - 1) * pageSize;
    //         const limit = pageSize;

    //         const findOptions = {
    //             filters: filters,
    //             sort: sort,
    //             populate: populate,
    //             start: start,
    //             limit: limit,
    //         };

    //         const products = await strapi.entityService.findMany("api::product.product", findOptions);
    //         const total = await strapi.entityService.count("api::product.product", { filters: filters });

    //         const sanitizedProducts = await Promise.all(
    //             products.map((product) =>
    //                 strapiUtils.sanitize.contentAPI.output(product, strapi.contentType('api::product.product'))
    //             )
    //         );

    //         return ctx.send({
    //             success: true,
    //             message: "Products retrieved successfully.",
    //             data: {
    //                 products: sanitizedProducts,
    //                 meta: {
    //                     pagination: {
    //                         page: page,
    //                         pageSize: limit,
    //                         pageCount: Math.ceil(total / limit),
    //                         total: total,
    //                     },
    //                 },
    //             },
    //         });

    //     } catch (error) {
    //         const customizedError = handleErrors(error);
    //         return ctx.send(
    //             { success: false, message: customizedError.message },
    //             handleStatusCode(error) || 500
    //         );
    //     }
    // },

    // /**
    //  * Allows updating product details and its relations (expects arrays of IDs for oneToMany).
    //  * PUT /api/products/:id
    //  */
    // //MARK: Update product
    // async update(ctx) {
    //     try {
    //         const { id } = ctx.params;
    //         const { body, files } = ctx.request;
    //         const requestData = body.data || body;

    //         // --- Log for debugging: See what requestData looks like initially ---
    //         console.log('--- UPDATE: Raw requestData ---');
    //         console.log(requestData);
    //         console.log('Type of requestData.lens_types:', typeof requestData.lens_types);
    //         console.log('Is requestData.lens_types an Array (raw)?', Array.isArray(requestData.lens_types));
    //         console.log('Value of requestData.lens_types (raw):', requestData.lens_types);
    //         console.log('---------------------------------');

    //         const existingProduct = await strapi.entityService.findOne(
    //             "api::product.product",
    //             id,
    //             { populate: ['image'] }
    //         );

    //         if (!existingProduct) {
    //             throw new NotFoundError("Product not found.");
    //         }

    //         // Process array fields for update
    //         const processedLensTypes = requestData.lens_types !== undefined ? parseIdsToArray(requestData.lens_types) : existingProduct.lens_types.map(lt => lt.id);
    //         const processedLensCoatings = requestData.lens_coatings !== undefined ? parseIdsToArray(requestData.lens_coatings) : existingProduct.lens_coatings.map(lc => lc.id);
    //         const processedFrameWeights = requestData.frame_weights !== undefined ? parseIdsToArray(requestData.frame_weights) : existingProduct.frame_weights.map(fw => fw.id);
    //         const processedBrands = requestData.brands !== undefined ? parseIdsToArray(requestData.brands) : existingProduct.brands.map(b => b.id);
    //         const processedFrameMaterials = requestData.frame_materials !== undefined ? parseIdsToArray(requestData.frame_materials) : existingProduct.frame_materials.map(fm => fm.id);
    //         const processedFrameShapes = requestData.frame_shapes !== undefined ? parseIdsToArray(requestData.frame_shapes) : existingProduct.frame_shapes.map(fs => fs.id);
    //         const processedLensThicknesses = requestData.lens_thicknesses !== undefined ? parseIdsToArray(requestData.lens_thicknesses) : existingProduct.lens_thicknesses.map(lt => lt.id);
    //         const processedFrameSizes = requestData.frame_sizes !== undefined ? parseIdsToArray(requestData.frame_sizes) : existingProduct.frame_sizes.map(fs => fs.id);
    //         const processedColors = requestData.colors !== undefined ? parseIdsToArray(requestData.colors) : existingProduct.colors.map(c => c.id);


    //         // --- Validation for inStock (String to Boolean conversion) ---
    //         let processedInStock;
    //         if (requestData.inStock !== undefined) {
    //             processedInStock = String(requestData.inStock).toLowerCase() === 'true';
    //         } else {
    //             processedInStock = existingProduct.inStock;
    //         }

    //         if (requestData.stock !== undefined) {
    //             if (isNaN(requestData.stock) || requestData.stock < 0) {
    //                 throw new ValidationError("Stock must be a non-negative integer.");
    //             }
    //             processedInStock = requestData.stock > 0;
    //         }
    //         // --- End inStock Validation ---

    //         // --- Validation for best_seller (String to Boolean conversion) ---
    //         let processedBestSeller = existingProduct.best_seller;
    //         if (requestData.best_seller !== undefined) {
    //             processedBestSeller = String(requestData.best_seller).toLowerCase() === 'true';
    //         }
    //         // --- End best_seller Validation ---


    //         // Validate rating if provided
    //         if (requestData.rating !== undefined && (isNaN(requestData.rating) || requestData.rating < 0 || requestData.rating > 5)) {
    //             throw new ValidationError("Rating must be a number between 0 and 5.");
    //         }
    //         // Validate reviewCount if provided
    //         if (requestData.reviewCount !== undefined && (isNaN(requestData.reviewCount) || requestData.reviewCount < 0)) {
    //             throw new ValidationError("Review count must be a non-negative integer.");
    //         }
    //         // Validate offerPrice if provided
    //         if (requestData.offerPrice !== undefined) {
    //             if (isNaN(requestData.offerPrice) || requestData.offerPrice < 0) {
    //                 throw new ValidationError("Offer price must be a non-negative number.");
    //             }
    //             const currentPrice = requestData.price !== undefined ? requestData.price : existingProduct.price;
    //             if (requestData.offerPrice >= currentPrice) {
    //                 throw new ValidationError("Offer price must be less than the original price.");
    //             }
    //         }

    //         // Validate existence of related entities for manyToOne (category)
    //         if (requestData.category !== undefined) {
    //             if (Array.isArray(requestData.category)) {
    //                 throw new ValidationError("Category must be a single ID, not an array.");
    //             }
    //             const categoryEntity = await strapi.entityService.findOne("api::category.category", requestData.category);
    //             if (!categoryEntity) {
    //                 throw new NotFoundError("Provided category not found.");
    //             }
    //         }

    //         // The validateOneToManyRelationIds function remains the same,
    //         // as it now receives already-processed arrays.
    //         const validateOneToManyRelationIds = async (target, ids, fieldName) => {
    //             if (ids !== null) { // Changed from `ids !== undefined && ids !== null`
    //                 if (!Array.isArray(ids)) {
    //                     throw new ValidationError(`${fieldName} must be an array of IDs.`);
    //                 }
    //                 for (const id_item of ids) {
    //                     if (typeof id_item !== 'number') { // Already parsed by parseIdsToArray
    //                         throw new ValidationError(`Invalid ID type in ${fieldName} array after parsing: ${id_item}. Expected number.`);
    //                     }
    //                     const entity = await strapi.entityService.findOne(target, id_item);
    //                     if (!entity) {
    //                         throw new NotFoundError(`Provided ${fieldName} ID ${id_item} not found.`);
    //                     }
    //                 }
    //             }
    //         };

    //         if (processedLensTypes !== null) await validateOneToManyRelationIds("api::lens-type.lens-type", processedLensTypes, "lens_types");
    //         if (processedLensCoatings !== null) await validateOneToManyRelationIds("api::lens-coating.lens-coating", processedLensCoatings, "lens_coatings");
    //         if (processedFrameWeights !== null) await validateOneToManyRelationIds("api::frame-weight.frame-weight", processedFrameWeights, "frame_weights");
    //         if (processedBrands !== null) await validateOneToManyRelationIds("api::brand.brand", processedBrands, "brands");
    //         if (processedFrameMaterials !== null) await validateOneToManyRelationIds("api::frame-material.frame-material", processedFrameMaterials, "frame_materials");
    //         if (processedFrameShapes !== null) await validateOneToManyRelationIds("api::frame-shape.frame-shape", processedFrameShapes, "frame_shapes");
    //         if (processedLensThicknesses !== null) await validateOneToManyRelationIds("api::lens-thickness.lens-thickness", processedLensThicknesses, "lens_thicknesses");
    //         if (processedFrameSizes !== null) await validateOneToManyRelationIds("api::frame-size.frame-size", processedFrameSizes, "frame_sizes");
    //         if (processedColors !== null) await validateOneToManyRelationIds("api::color.color", processedColors, "colors");


    //         // Multi-Image Update Logic for Product Update
    //         let finalImageIds = [];

    //         if (files && files.image) {
    //             const newImageFiles = Array.isArray(files.image) ? files.image : [files.image];
    //             if (newImageFiles.length > 0) {
    //                 const uploadedNewImages = await Promise.all(
    //                     newImageFiles.map(file => ImageFile(file, 800, 800))
    //                 );
    //                 finalImageIds = uploadedNewImages.map(img => img.id);
    //             }
    //         } else if (requestData.image !== undefined) {
    //             // If no new files, but image IDs were explicitly sent in requestData.image
    //             // This means existing images might be kept or removed based on the array sent
    //             const parsedImageIds = parseIdsToArray(requestData.image);
    //             if (parsedImageIds !== null) {
    //                 for (const imgId of parsedImageIds) {
    //                      const imageEntity = await strapi.entityService.findOne("plugin::upload.file", imgId);
    //                      if (!imageEntity) {
    //                          throw new NotFoundError(`Provided image ID ${imgId} not found for image update.`);
    //                      }
    //                 }
    //                 finalImageIds = parsedImageIds;
    //             } else {
    //                 finalImageIds = []; // Explicitly empty the image array if null/empty string is sent
    //             }
    //         } else {
    //             // If no new files and no explicit image IDs in requestData, retain existing images
    //             finalImageIds = existingProduct.image ? existingProduct.image.map(img => img.id) : [];
    //         }


    //         const updateData = { ...requestData };
    //         updateData.image = finalImageIds;
    //         updateData.inStock = processedInStock;
    //         updateData.best_seller = processedBestSeller;

    //         // Override the array fields with our processed versions
    //         updateData.lens_types = processedLensTypes;
    //         updateData.lens_coatings = processedLensCoatings;
    //         updateData.frame_weights = processedFrameWeights;
    //         updateData.brands = processedBrands;
    //         updateData.frame_materials = processedFrameMaterials;
    //         updateData.frame_shapes = processedFrameShapes;
    //         updateData.lens_thicknesses = processedLensThicknesses;
    //         updateData.frame_sizes = processedFrameSizes;
    //         updateData.colors = processedColors;


    //         // Update the product
    //         const updatedProduct = await strapi.entityService.update(
    //             "api::product.product",
    //             id,
    //             {
    //                 data: updateData,
    //                 populate: [
    //                     "image",
    //                     "category",
    //                     "lens_types",
    //                     "lens_coatings",
    //                     "frame_weights",
    //                     "brands",
    //                     "colors",
    //                     "frame_materials",
    //                     "frame_shapes",
    //                     "lens_thicknesses",
    //                     "frame_sizes",
    //                     "wishlistedByUsers",
    //                     "reviews",
    //                     "best_seller",
    //                 ],
    //             }
    //         );

    //         const sanitizedProduct = await strapiUtils.sanitize.contentAPI.output(updatedProduct, strapi.contentType('api::product.product'));

    //         return ctx.send({
    //             success: true,
    //             message: "Product updated successfully.",
    //             data: sanitizedProduct,
    //         });
    //     } catch (error) {
    //         const customizedError = handleErrors(error);
    //         return ctx.send(
    //             { success: false, message: customizedError.message },
    //             handleStatusCode(error) || 500
    //         );
    //     }
    // },

    // //MARK: Delete product
    // async delete(ctx) {
    //     // ... (No changes needed here for this specific issue)
    //     try {
    //         const { id } = ctx.params;

    //         const existingProduct = await strapi.entityService.findOne(
    //             "api::product.product",
    //             id
    //         );

    //         if (!existingProduct) {
    //             throw new NotFoundError("Product not found.");
    //         }

    //         const deletedProduct = await strapi.entityService.delete(
    //             "api::product.product",
    //             id
    //         );

    //         return ctx.send({
    //             success: true,
    //             message: "Product deleted successfully.",
    //             data: {
    //                 id: deletedProduct.id,
    //                 name: deletedProduct.name,
    //             },
    //         });
    //     } catch (error) {
    //         const customizedError = handleErrors(error);
    //         return ctx.send(
    //             { success: false, message: customizedError.message },
    //             handleStatusCode(error) || 500
    //         );
    //     }
    // },


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
