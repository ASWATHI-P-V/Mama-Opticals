"use strict";

const { createCoreController } = require("@strapi/strapi").factories;
const strapiUtils = require("@strapi/utils");
const { ValidationError, NotFoundError } = strapiUtils.errors;
const { sanitize } = require("@strapi/utils");

const parseIdsToArray = (input) => {
  if (input === undefined || input === null || input === "") {
    return null;
  }
  if (Array.isArray(input)) {
    return input
      .map((id) => {
        const parsedId = parseInt(id, 10);
        if (isNaN(parsedId)) {
          throw new ValidationError(`Invalid ID type found in array: ${id}`);
        }
        return parsedId;
      })
      .filter((id) => !isNaN(id));
  }
  if (typeof input === "string") {
    const ids = input
      .split(",")
      .map((s) => {
        const trimmedS = s.trim();
        if (trimmedS === "") return NaN;
        const parsedId = parseInt(trimmedS, 10);
        if (isNaN(parsedId)) {
          throw new ValidationError(
            `Invalid ID format in string: '${trimmedS}'`
          );
        }
        return parsedId;
      })
      .filter((id) => !isNaN(id));
    return ids.length > 0 ? ids : null;
  }
  if (typeof input === "number") {
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
      fields: ["id"], // We only need the IDs to check for existence
    });

    // Check if the number of found entities matches the number of provided IDs
    if (entities.length !== ids.length) {
      const foundIds = new Set(entities.map((e) => e.id));
      const notFoundIds = ids.filter((id) => !foundIds.has(id));
      throw new NotFoundError(
        `Provided ${fieldName} ID(s) [${notFoundIds.join(", ")}] not found.`
      );
    }
  }
};

const handleErrors = (error) => {
  console.error("Error occurred:", error);
  const errorMessage = String(error.message || "");
  if (error.name === "ValidationError") return { message: errorMessage };
  if (error.name === "NotFoundError") return { message: errorMessage };
  if (errorMessage.includes("Missing required field"))
    return { message: errorMessage };
  if (
    errorMessage.includes(
      "relation(s) of type plugin::upload.file associated with this entity do not exist"
    )
  ) {
    return {
      message: "One or more provided image IDs do not exist or are invalid.",
    };
  }
  return { message: "An unexpected error occurred." };
};

const handleStatusCode = (error) => {
  const errorMessage = String(error.message || "");
  if (error.name === "ValidationError") return 400;
  if (error.name === "NotFoundError") return 404;
  if (errorMessage.includes("Missing required field")) return 400;
  if (
    errorMessage.includes(
      "relation(s) of type plugin::upload.file associated with this entity do not exist"
    )
  ) {
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

// Helper function to get an array of values from a query parameter
const getArrayFromQueryParam = (param) => {
  if (!param) return [];
  if (Array.isArray(JSON.parse(param))) {
    return JSON.parse(param);
  }
  if (typeof param === "string") {
    // Updated to handle comma-separated strings correctly
    return param
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  return [String(param)];
};

//MARK:product create

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
        inStock:
          requestData.inStock !== undefined
            ? String(requestData.inStock).toLowerCase() === "true"
            : undefined,
        best_seller:
          requestData.best_seller !== undefined
            ? String(requestData.best_seller).toLowerCase() === "true"
            : undefined,
        isActive:
          requestData.isActive !== undefined
            ? String(requestData.isActive).toLowerCase() === "true"
            : true,
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
      if (
        processedData.offerPrice !== undefined &&
        (isNaN(processedData.offerPrice) ||
          processedData.offerPrice >= processedData.price)
      ) {
        throw new ValidationError(
          "Offer price must be a valid number less than the original price."
        );
      }

      // Step 3: Validate existence of related entities using the improved helper
      if (processedData.category) {
        const categoryEntity = await strapi.entityService.findOne(
          "api::category.category",
          processedData.category
        );
        if (!categoryEntity)
          throw new NotFoundError("Provided category not found.");
      }
      await validateOneToManyRelationIds(
        "api::lens-type.lens-type",
        processedData.lens_types,
        "lens_types"
      );
      await validateOneToManyRelationIds(
        "api::lens-coating.lens-coating",
        processedData.lens_coatings,
        "lens_coatings"
      );
      await validateOneToManyRelationIds(
        "api::frame-weight.frame-weight",
        processedData.frame_weights,
        "frame_weights"
      );
      await validateOneToManyRelationIds(
        "api::brand.brand",
        processedData.brands,
        "brands"
      );
      await validateOneToManyRelationIds(
        "api::frame-material.frame-material",
        processedData.frame_materials,
        "frame_materials"
      );
      await validateOneToManyRelationIds(
        "api::frame-shape.frame-shape",
        processedData.frame_shapes,
        "frame_shapes"
      );
      await validateOneToManyRelationIds(
        "api::lens-thickness.lens-thickness",
        processedData.lens_thicknesses,
        "lens_thicknesses"
      );
      await validateOneToManyRelationIds(
        "api::frame-size.frame-size",
        processedData.frame_sizes,
        "frame_sizes"
      );
      await validateOneToManyRelationIds(
        "api::color.color",
        processedData.colors,
        "colors"
      );

      // Step 4: Handle image uploads
      let uploadedImageIds = [];
      if (files && files.image) {
        const imageFiles = Array.isArray(files.image)
          ? files.image
          : [files.image];
        const processedImages = await Promise.all(
          imageFiles.map((file) => ImageFile(file, 800, 800))
        );
        uploadedImageIds = processedImages.map((img) => img.id);
      }

      // Step 5: Create the new product
      const newProduct = await strapi.entityService.create(
        "api::product.product",
        {
          data: {
            ...processedData,
            image: uploadedImageIds,
            publishedAt: new Date(),
          },
          // Populate all relations to return a complete, detailed response
          populate: [
            "image",
            "category",
            "lens_types",
            "lens_coatings",
            "frame_weights",
            "brands",
            "frame_materials",
            "frame_shapes",
            "lens_thicknesses",
            "frame_sizes",
            "colors",
            "reviews",
            "wishlistedByUsers",
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
async findOne(ctx) {
    try {
      const { id } = ctx.params;
      const user = ctx.state.user;

      const populate = {
        image: true,
        category: true,
        lens_types: true,
        lens_coatings: true,
        frame_weights: true,
        brands: true,
        frame_materials: true,
        frame_shapes: true,
        lens_thicknesses: true,
        reviews: true,
        // Populate the 'variants' relation and its nested 'eyewear_type' relation
        variants: {
          populate: {
            color_picker: true,
            frame_size: true,
            color: true,
            eyewear_type: true
          },
        },
      };

      const product = await strapi.entityService.findOne(
        "api::product.product",
        id,
        { populate }
      );

      if (!product) {
        throw new NotFoundError("Product not found.");
      }

      // Check if the current user has wishlisted this product
      let isWishlisted = false;
      if (user && user.id) {
        const wishlistCheck = await strapi.db
          .query("api::product.product")
          .findOne({
            where: { id: id, wishlistedByUsers: { id: user.id } },
            select: ["id"],
          });
        isWishlisted = !!wishlistCheck;
      }

      const sanitizedProduct = await strapiUtils.sanitize.contentAPI.output(
        product,
        strapi.contentType("api::product.product")
      );

      // --- START: MODIFICATION TO MAKE BRAND A SINGLE OBJECT WITH ONLY ID AND NAME ---
      if (
        sanitizedProduct.brands &&
        Array.isArray(sanitizedProduct.brands) &&
        sanitizedProduct.brands.length > 0
      ) {
        const brand = sanitizedProduct.brands[0];
        sanitizedProduct.brands = {
          id: brand.id,
          name: brand.name,
        };
      } else {
        sanitizedProduct.brands = null;
      }

      // Extract unique colors and frame sizes from variants
      const color_picker = new Set();
      const frameSizes = new Set();
      const color = new Set();

      if (
        sanitizedProduct.variants &&
        Array.isArray(sanitizedProduct.variants)
      ) {
        sanitizedProduct.variants.forEach((variant) => {
          if (variant.color_picker) {
            color_picker.add(JSON.stringify(variant.color_picker));
          }
          if (variant.frame_size) {
            frameSizes.add(JSON.stringify(variant.frame_size));
          }
          if (variant.color) {
            color.add(JSON.stringify(variant.color));
          }
        });
      }

      // Add the new eyeware_type key from the first variant
      if (sanitizedProduct.variants && sanitizedProduct.variants.length > 0 && sanitizedProduct.variants[0].eyewear_type && sanitizedProduct.variants[0].eyewear_type.name) {
        sanitizedProduct.eyewear_type = sanitizedProduct.variants[0].eyewear_type.name;
      } else {
        sanitizedProduct.eyewear_type = null;
      }

      // Final product object with the requested changes
      const finalProduct = {
        ...sanitizedProduct,
        isWishlisted: isWishlisted,
        color_picker: Array.from(color_picker).map((c) => JSON.parse(c)),
        frame_sizes: Array.from(frameSizes).map((s) => JSON.parse(s)),
        color: Array.from(color).map((s) => JSON.parse(s)),
        category: sanitizedProduct.category ? [sanitizedProduct.category] : [],
        average_rating: sanitizedProduct.average_rating,
        reviewCount: sanitizedProduct.reviewCount,
      };

      // Remove the old field to clean up the response
      delete finalProduct.wishlistedByUsers;
      // Remove the original type field to clean up the response
      delete finalProduct.type;

      return ctx.send({
        success: true,
        message: "Product retrieved successfully.",
        data: finalProduct,
      });
    } catch (error) {
      const customizedError = handleErrors(error);
      ctx.status = handleStatusCode(error) || 500;
      return ctx.send({ success: false, message: customizedError.message });
    }
  },

  /**
   * Find all products and return a success message with the data,
   * including a new 'eyeware_type' key for each product.
   *
   * @param {object} ctx Koa context.
   * @returns {object} The response object with success status and data.
   */
  async find(ctx) {
    try {
      const { query } = ctx;
      const user = ctx.state.user;

      let filters = {};
      let sort = [];

      const populate = {
        image: true,
        category: true,
        lens_types: true,
        lens_coatings: true,
        frame_weights: true,
        brands: true,
        frame_materials: true,
        frame_shapes: true,
        lens_thicknesses: true,
        reviews: true,
        // Populate the 'variants' relation and its nested 'eyewear_type' relation
        variants: {
          populate: {
            color_picker: true,
            frame_size: true,
            color: true,
            eyewear_type: true
          },
        },
        localizations: true,
      };

      // Extract locale from the query, defaulting to 'en' if not provided
      const locale = query.locale || "en";
      delete query.locale;

      // --- 1. Search (using '_q' for fuzzy search across specified fields) ---
      if (query._q) {
        filters.$or = [
          { name: { $containsi: query._q } },
          { description: { $containsi: query._q } },
          { variants: { color: { name: { $containsi: query._q } } } },
          { brands: { name: { $containsi: query._q } } },
          { frame_materials: { name: { $containsi: query._q } } },
          { frame_shapes: { name: { $containsi: query._q } } },
          { lens_types: { name: { $containsi: query._q } } },
          { lens_coatings: { name: { $containsi: query._q } } },
          { lens_thicknesses: { name: { $containsi: query._q } } },
          { frame_weights: { name: { $containsi: query._q } } },
        ];
        delete query._q;
      }

      // --- 2. Filtering ---
      if (query.price_gte) {
        filters.price = { ...filters.price, $gte: parseFloat(query.price_gte) };
        delete query.price_gte;
      }
      if (query.price_lte) {
        filters.price = { ...filters.price, $lte: parseFloat(query.price_lte) };
        delete query.price_lte;
      }
      if (query.offerPrice_gte) {
        filters.offerPrice = {
          ...filters.offerPrice,
          $gte: parseFloat(query.offerPrice_gte),
        };
        delete query.offerPrice_gte;
      }
      if (query.offerPrice_lte) {
        filters.offerPrice = {
          ...filters.offerPrice,
          $lte: parseFloat(query.offerPrice_lte),
        };
        delete query.offerPrice_lte;
      }
      if (query.best_seller !== undefined) {
        filters.best_seller = query.best_seller.toLowerCase() === "true";
        delete query.best_seller;
      }

      // Updated filtering logic for multiple values
      if (query.category) {
        const categories = getArrayFromQueryParam(query.category);
        if (categories.length > 0) {
          filters.category = { id: { $in: categories } };
        }
        delete query.category;
      }
      if (query.brands) {
        const brands = getArrayFromQueryParam(query.brands);
        if (brands.length > 0) {
          filters.brands = { id: { $in: brands } };
        }
        delete query.brands;
      }
      if (query.frame_materials) {
        const materials = getArrayFromQueryParam(query.frame_materials);
        if (materials.length > 0) {
          filters.frame_materials = { id: { $in: materials } };
        }
        delete query.frame_materials;
      }
      if (query.frame_shapes) {
        const shapes = getArrayFromQueryParam(query.frame_shapes);
        if (shapes.length > 0) {
          filters.frame_shapes = { id: { $in: shapes } };
        }
        delete query.frame_shapes;
      }
      if (query.lens_types) {
        const types = getArrayFromQueryParam(query.lens_types);
        if (types.length > 0) {
          filters.lens_types = { id: { $in: types } };
        }
        delete query.lens_types;
      }
      if (query.lens_coatings) {
        const coatings = getArrayFromQueryParam(query.lens_coatings);
        if (coatings.length > 0) {
          filters.lens_coatings = { id: { $in: coatings } };
        }
        delete query.lens_coatings;
      }
      if (query.lens_thicknesses) {
        const thicknesses = getArrayFromQueryParam(query.lens_thicknesses);
        if (thicknesses.length > 0) {
          filters.lens_thicknesses = { id: { $in: thicknesses } };
        }
        delete query.lens_thicknesses;
      }
      if (query.frame_weights) {
        const weights = getArrayFromQueryParam(query.frame_weights);
        if (weights.length > 0) {
          filters.frame_weights = { id: { $in: weights } };
        }
        delete query.frame_weights;
      }
      if (query.rating_gte) {
        filters.average_rating = {
          ...filters.average_rating,
          $gte: parseFloat(query.rating_gte),
        };
        delete query.rating_gte;
      }
      if (query.rating_lte) {
        filters.average_rating = {
          ...filters.average_rating,
          $lte: parseFloat(query.rating_lte),
        };
        delete query.rating_lte;
      }
      if (query.inStock !== undefined) {
        filters.variants = {
          ...filters.variants,
          inStock: query.inStock.toLowerCase() === "true",
        };
        delete query.inStock;
      }
      if (query.stock_gte) {
        filters.variants = {
          ...filters.variants,
          stock: { $gte: parseInt(query.stock_gte) },
        };
        delete query.stock_gte;
      }
      if (query.stock_lte) {
        filters.variants = {
          ...filters.variants,
          stock: { $lte: parseInt(query.stock_lte) },
        };
        delete query.stock_lte;
      }
      if (query.colors) {
        const colors = getArrayFromQueryParam(query.colors);
        if (colors.length > 0) {
          filters.variants = {
            ...filters.variants,
            color: { id: { $in: colors } },
          };
        }
        delete query.colors;
      }
      if (query.frame_sizes) {
        const sizes = getArrayFromQueryParam(query.frame_sizes);
        if (sizes.length > 0) {
          filters.variants = {
            ...filters.variants,
            frame_size: { id: { $in: sizes } },
          };
        }
        delete query.frame_sizes;
      }

      // --- 3. Sorting ---
      if (query._sort) {
        const sortParams = Array.isArray(query._sort)
          ? query._sort
          : [query._sort];
        sort = sortParams.map((s) => {
          const [field, order] = s.split(":");
          if (field.includes(".")) {
            const [relation, subField] = field.split(".");
            return { [relation]: { [subField]: order.toLowerCase() } };
          }
          return { [field]: order.toLowerCase() };
        });
        delete query._sort;
      } else {
        sort.push({ createdAt: "desc" });
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
        locale: locale,
      };

      const products = await strapi.entityService.findMany(
        "api::product.product",
        findOptions
      );
      const total = await strapi.entityService.count("api::product.product", {
        filters: filters,
        locale: locale,
      });

      // Fetch the authenticated user's wishlist IDs if a user exists
      let wishlistedIds = new Set();
      if (user && user.id) {
        const userWishlistProducts = await strapi.db
          .query("api::product.product")
          .findMany({
            where: { wishlistedByUsers: { id: user.id } },
            select: ["id"],
            populate: {
              localizations: {
                select: ["id"],
              },
            },
          });

        if (userWishlistProducts) {
          userWishlistProducts.forEach((product) => {
            wishlistedIds.add(product.id);
            if (product.localizations && Array.isArray(product.localizations)) {
              product.localizations.forEach((localization) => {
                wishlistedIds.add(localization.id);
              });
            }
          });
        }
      }

      const productsWithOriginalId = products.map((product) => {
        const originalProduct = product.localizations?.find(
          (loc) => loc.locale === "en"
        );
        return {
          ...product,
          originalId: originalProduct ? originalProduct.id : product.id,
        };
      });

      const sanitizedProducts = await Promise.all(
        productsWithOriginalId.map(async (product) => {
          const sanitized = await strapiUtils.sanitize.contentAPI.output(
            product,
            strapi.contentType("api::product.product")
          );

          // Add the new eyeware_type key from the first variant
          if (sanitized.variants && sanitized.variants.length > 0 && sanitized.variants[0].eyewear_type && sanitized.variants[0].eyewear_type.name) {
            sanitized.eyewear_type = sanitized.variants[0].eyewear_type.name;
          } else {
            sanitized.eyewear_type = null;
          }
          // Remove the original type field to clean up the response
          delete sanitized.type;

          // --- START: MODIFICATION TO MAKE BRAND A SINGLE OBJECT WITH ONLY ID AND NAME ---
          if (
            sanitized.brands &&
            Array.isArray(sanitized.brands) &&
            sanitized.brands.length > 0
          ) {
            const brand = sanitized.brands[0];
            sanitized.brands = {
              id: brand.id,
              name: brand.name,
            };
          } else {
            sanitized.brands = null;
          }

          // Extract unique colors and frame sizes from variants
          const color_picker = new Set();
          const frameSizes = new Set();
          const color = new Set();

          if (sanitized.variants && Array.isArray(sanitized.variants)) {
            sanitized.variants.forEach((variant) => {
              if (variant.color_picker) {
                color_picker.add(JSON.stringify(variant.color_picker));
              }
              if (variant.frame_size) {
                frameSizes.add(JSON.stringify(variant.frame_size));
              }
              if (variant.color) {
                color.add(JSON.stringify(variant.color));
              }
            });
          }

          // Apply the transformations directly
          const isWishlisted = wishlistedIds.has(sanitized.originalId);
          const categoryAsList = sanitized.category ? [sanitized.category] : [];

          // Return the new object with the extracted lists
          return {
            ...sanitized,
            isWishlisted: isWishlisted,
            color_picker: Array.from(color_picker).map((c) => JSON.parse(c)),
            frame_sizes: Array.from(frameSizes).map((s) => JSON.parse(s)),
            color: Array.from(color).map((c) => JSON.parse(c)),
            category: categoryAsList,
            average_rating: sanitized.average_rating,
            reviewCount: sanitized.reviewCount,
          };
        })
      );

      const message= sanitizedProducts.length > 0 ? "Products retrieved successfully." : "No products found matching the criteria.";

      return ctx.send({
        success: true,
        message: message,
        data: {
          products: sanitizedProducts,
          page: page,
          pageSize: limit,
          pageCount: Math.ceil(total / limit),
          total: total,
        },
      });
    } catch (error) {
      const customizedError = handleErrors(error);
      ctx.status = handleStatusCode(error) || 500;
      return ctx.send({ success: false, message: customizedError.message });
    }
  },
  // //MARK: Find one product

  // async findOne(ctx) {
  //   try {
  //     const { id } = ctx.params;
  //     const user = ctx.state.user;

  //     const populate = {
  //       image: true,
  //       category: true,
  //       lens_types: true,
  //       lens_coatings: true,
  //       frame_weights: true,
  //       brands: true,
  //       frame_materials: true,
  //       frame_shapes: true,
  //       lens_thicknesses: true,
  //       reviews: true,
  //       type: {
  //         populate: {
  //           eyeware_type: true
  //         }
  //       },
  //       best_seller: true,
  //       variants: {
  //         populate: {
  //           color_picker: true,
  //           frame_size: true,
  //           color: true,
  //           eyeware_type: true
  //         },
  //       },
  //     };

  //     const product = await strapi.entityService.findOne(
  //       "api::product.product",
  //       id,
  //       { populate }
  //     );

  //     if (!product) {
  //       throw new NotFoundError("Product not found.");
  //     }

  //     // Check if the current user has wishlisted this product
  //     let isWishlisted = false;
  //     if (user && user.id) {
  //       const wishlistCheck = await strapi.db
  //         .query("api::product.product")
  //         .findOne({
  //           where: { id: id, wishlistedByUsers: { id: user.id } },
  //           select: ["id"],
  //         });
  //       isWishlisted = !!wishlistCheck;
  //     }

  //     const sanitizedProduct = await strapiUtils.sanitize.contentAPI.output(
  //       product,
  //       strapi.contentType("api::product.product")
  //     );
  //     // --- START: MODIFICATION TO MAKE BRAND A SINGLE OBJECT WITH ONLY ID AND NAME ---
  //     if (
  //       sanitizedProduct.brands &&
  //       Array.isArray(sanitizedProduct.brands) &&
  //       sanitizedProduct.brands.length > 0
  //     ) {
  //       const brand = sanitizedProduct.brands[0];
  //       sanitizedProduct.brands = {
  //         id: brand.id,
  //         name: brand.name,
  //       };
  //     } else {
  //       sanitizedProduct.brands = null;
  //     }

  //     // Extract unique colors and frame sizes from variants
  //     const color_picker = new Set();
  //     const frameSizes = new Set();
  //     const color = new Set();

  //     if (
  //       sanitizedProduct.variants &&
  //       Array.isArray(sanitizedProduct.variants)
  //     ) {
  //       sanitizedProduct.variants.forEach((variant) => {
  //         if (variant.color_picker) {
  //           color_picker.add(JSON.stringify(variant.color_picker));
  //         }
  //         if (variant.frame_size) {
  //           frameSizes.add(JSON.stringify(variant.frame_size));
  //         }
  //         if (variant.color) {
  //           color.add(JSON.stringify(variant.color));
  //         }
  //       });
  //     }

  //     // Add the new eyeware_type key
  //     if (sanitizedProduct.type && sanitizedProduct.type.eyeware && sanitizedProduct.type.eyeware.name) {
  //       sanitizedProduct.eyeware_type = sanitizedProduct.type.eyeware.name;
  //     } else {
  //       sanitizedProduct.eyeware_type = null;
  //     }

  //     // // Add the new eyeware_type key
  //     // if (sanitizedProduct.type && sanitizedProduct.type.eyeware && sanitizedProduct.type.eyeware.name) {
  //     //   sanitizedProduct.eyeware_type = sanitizedProduct.type.eyeware.name;
  //     // } else {
  //     //   sanitizedProduct.eyeware_type = null;
  //     // }

  //     // Remove the original type field
  //     delete sanitizedProduct.type;

  //     // Final product object with the requested changes
  //     const finalProduct = {
  //       ...sanitizedProduct,
  //       isWishlisted: isWishlisted,
  //       color_picker: Array.from(color_picker).map((c) => JSON.parse(c)),
  //       frame_sizes: Array.from(frameSizes).map((s) => JSON.parse(s)),
  //       color: Array.from(color).map((s) => JSON.parse(s)),
  //       category: sanitizedProduct.category ? [sanitizedProduct.category] : [],
  //       average_rating: sanitizedProduct.average_rating,
  //       reviewCount: sanitizedProduct.reviewCount,
  //     };

  //     // Remove the old field to clean up the response
  //     delete finalProduct.wishlistedByUsers;

  //     return ctx.send({
  //       success: true,
  //       message: "Product retrieved successfully.",
  //       data: finalProduct,
  //     });
  //   } catch (error) {
  //     const customizedError = handleErrors(error);
  //     ctx.status = handleStatusCode(error) || 500;
  //     return ctx.send({ success: false, message: customizedError.message });
  //   }
  // },

  // // MARK: Find all products
  // async find(ctx) {
  //   try {
  //     const { query } = ctx;
  //     const user = ctx.state.user;

  //     let filters = {};
  //     let sort = [];

  //     const populate = {
  //       image: true,
  //       category: true,
  //       lens_types: true,
  //       lens_coatings: true,
  //       frame_weights: true,
  //       brands: true,
  //       frame_materials: true,
  //       frame_shapes: true,
  //       lens_thicknesses: true,
  //       reviews: true,
  //       type: {
  //         populate: {
  //           eyeware_type: true
  //         }
  //       },
  //       best_seller: true,
  //       variants: {
  //         populate: {
  //           color_picker: true,
  //           frame_size: true,
  //           color: true,
  //         },
  //       },
  //       localizations: true,
  //     };

  //     // Extract locale from the query, defaulting to 'en' if not provided
  //     const locale = query.locale || "en";
  //     delete query.locale;

  //     // --- 1. Search (using '_q' for fuzzy search across specified fields) ---
  //     if (query._q) {
  //       filters.$or = [
  //         { name: { $containsi: query._q } },
  //         { description: { $containsi: query._q } },
  //         { variants: { color: { name: { $containsi: query._q } } } },
  //         { brands: { name: { $containsi: query._q } } },
  //         { frame_materials: { name: { $containsi: query._q } } },
  //         { frame_shapes: { name: { $containsi: query._q } } },
  //         { lens_types: { name: { $containsi: query._q } } },
  //         { lens_coatings: { name: { $containsi: query._q } } },
  //         { lens_thicknesses: { name: { $containsi: query._q } } },
  //         { frame_weights: { name: { $containsi: query._q } } },
  //       ];
  //       delete query._q;
  //     }

  //     // --- 2. Filtering ---
  //     if (query.price_gte) {
  //       filters.price = { ...filters.price, $gte: parseFloat(query.price_gte) };
  //       delete query.price_gte;
  //     }
  //     if (query.price_lte) {
  //       filters.price = { ...filters.price, $lte: parseFloat(query.price_lte) };
  //       delete query.price_lte;
  //     }
  //     if (query.offerPrice_gte) {
  //       filters.offerPrice = {
  //         ...filters.offerPrice,
  //         $gte: parseFloat(query.offerPrice_gte),
  //       };
  //       delete query.offerPrice_gte;
  //     }
  //     if (query.offerPrice_lte) {
  //       filters.offerPrice = {
  //         ...filters.offerPrice,
  //         $lte: parseFloat(query.offerPrice_lte),
  //       };
  //       delete query.offerPrice_lte;
  //     }
  //     if (query.best_seller !== undefined) {
  //       filters.best_seller = query.best_seller.toLowerCase() === "true";
  //       delete query.best_seller;
  //     }

  //     // Updated filtering logic for multiple values
  //     if (query.category) {
  //       const categories = getArrayFromQueryParam(query.category);
  //       if (categories.length > 0) {
  //         filters.category = { id: { $in: categories } };
  //       }
  //       delete query.category;
  //     }
  //     if (query.brands) {
  //       const brands = getArrayFromQueryParam(query.brands);
  //       // console.log("Brands filter array:", brands);
  //       if (brands.length > 0) {
  //         filters.brands = { id: { $in: brands } };
  //       }
  //       delete query.brands;
  //     }
  //     if (query.frame_materials) {
  //       const materials = getArrayFromQueryParam(query.frame_materials);
  //       if (materials.length > 0) {
  //         filters.frame_materials = { id: { $in: materials } };
  //       }
  //       delete query.frame_materials;
  //     }
  //     if (query.frame_shapes) {
  //       const shapes = getArrayFromQueryParam(query.frame_shapes);
  //       if (shapes.length > 0) {
  //         filters.frame_shapes = { id: { $in: shapes } };
  //       }
  //       delete query.frame_shapes;
  //     }
  //     if (query.lens_types) {
  //       const types = getArrayFromQueryParam(query.lens_types);
  //       if (types.length > 0) {
  //         filters.lens_types = { id: { $in: types } };
  //       }
  //       delete query.lens_types;
  //     }
  //     if (query.lens_coatings) {
  //       const coatings = getArrayFromQueryParam(query.lens_coatings);
  //       if (coatings.length > 0) {
  //         filters.lens_coatings = { id: { $in: coatings } };
  //       }
  //       delete query.lens_coatings;
  //     }
  //     if (query.lens_thicknesses) {
  //       // Filter logic for an array of lens thicknesses.
  //       const thicknesses = getArrayFromQueryParam(query.lens_thicknesses);
  //       if (thicknesses.length > 0) {
  //         // Find products where the lens_thicknesses field's name is in the provided array.
  //         // This assumes that the `lens_thicknesses` relation has a `name` field that is a string like "1.5".
  //         filters.lens_thicknesses = { id: { $in: thicknesses } };
  //       }
  //       delete query.lens_thicknesses;
  //     }
  //     if (query.frame_weights) {
  //       const weights = getArrayFromQueryParam(query.frame_weights);
  //       if (weights.length > 0) {
  //         filters.frame_weights = { id: { $in: weights } };
  //       }
  //       delete query.frame_weights;
  //     }
  //     if (query.rating_gte) {
  //       filters.average_rating = {
  //         ...filters.average_rating,
  //         $gte: parseFloat(query.rating_gte),
  //       };
  //       delete query.rating_gte;
  //     }
  //     if (query.rating_lte) {
  //       filters.average_rating = {
  //         ...filters.average_rating,
  //         $lte: parseFloat(query.rating_lte),
  //       };
  //       delete query.rating_lte;
  //     }
  //     if (query.inStock !== undefined) {
  //       filters.variants = {
  //         ...filters.variants,
  //         inStock: query.inStock.toLowerCase() === "true",
  //       };
  //       delete query.inStock;
  //     }
  //     if (query.stock_gte) {
  //       filters.variants = {
  //         ...filters.variants,
  //         stock: { $gte: parseInt(query.stock_gte) },
  //       };
  //       delete query.stock_gte;
  //     }
  //     if (query.stock_lte) {
  //       filters.variants = {
  //         ...filters.variants,
  //         stock: { $lte: parseInt(query.stock_lte) },
  //       };
  //       delete query.stock_lte;
  //     }
  //     if (query.colors) {
  //       const colors = getArrayFromQueryParam(query.colors);
  //       if (colors.length > 0) {
  //         filters.variants = {
  //           ...filters.variants,
  //           color: { id: { $in: colors } },
  //         };
  //       }
  //       delete query.colors;
  //     }
  //     if (query.frame_sizes) {
  //       const sizes = getArrayFromQueryParam(query.frame_sizes);
  //       if (sizes.length > 0) {
  //         filters.variants = {
  //           ...filters.variants,
  //           frame_size: { id: { $in: sizes } },
  //         };
  //       }
  //       delete query.frame_sizes;
  //     }

  //     // --- 3. Sorting ---
  //     if (query._sort) {
  //       const sortParams = Array.isArray(query._sort)
  //         ? query._sort
  //         : [query._sort];
  //       sort = sortParams.map((s) => {
  //         const [field, order] = s.split(":");
  //         if (field.includes(".")) {
  //           const [relation, subField] = field.split(".");
  //           return { [relation]: { [subField]: order.toLowerCase() } };
  //         }
  //         return { [field]: order.toLowerCase() };
  //       });
  //       delete query._sort;
  //     } else {
  //       sort.push({ createdAt: "desc" });
  //     }

  //     // --- 4. Pagination ---
  //     const page = parseInt(query.page || 1);
  //     const pageSize = parseInt(query.pageSize || 10);
  //     const start = (page - 1) * pageSize;
  //     const limit = pageSize;

  //     const findOptions = {
  //       filters: filters,
  //       sort: sort,
  //       populate: populate,
  //       start: start,
  //       limit: limit,
  //       locale: locale,
  //     };

  //     const products = await strapi.entityService.findMany(
  //       "api::product.product",
  //       findOptions
  //     );
  //     const total = await strapi.entityService.count("api::product.product", {
  //       filters: filters,
  //       locale: locale,
  //     });

  //     // Fetch the authenticated user's wishlist IDs if a user exists
  //     let wishlistedIds = new Set();
  //     if (user && user.id) {
  //       // Find all wishlisted products for the current user and populate their localizations
  //       const userWishlistProducts = await strapi.db
  //         .query("api::product.product")
  //         .findMany({
  //           where: { wishlistedByUsers: { id: user.id } },
  //           select: ["id"],
  //           populate: {
  //             localizations: {
  //               select: ["id"],
  //             },
  //           },
  //         });

  //       if (userWishlistProducts) {
  //         userWishlistProducts.forEach((product) => {
  //           // Add the main product ID to the set
  //           wishlistedIds.add(product.id);

  //           // Add all localized product IDs to the set
  //           if (product.localizations && Array.isArray(product.localizations)) {
  //             product.localizations.forEach((localization) => {
  //               wishlistedIds.add(localization.id);
  //             });
  //           }
  //         });
  //       }
  //     }

  //     const productsWithOriginalId = products.map((product) => {
  //       const originalProduct = product.localizations?.find(
  //         (loc) => loc.locale === "en"
  //       );
  //       return {
  //         ...product,
  //         originalId: originalProduct ? originalProduct.id : product.id,
  //       };
  //     });

  //     const sanitizedProducts = await Promise.all(
  //       productsWithOriginalId.map(async (product) => {
  //         const sanitized = await strapiUtils.sanitize.contentAPI.output(
  //           product,
  //           strapi.contentType("api::product.product")
  //         );

  //         // --- START: MODIFICATION TO MAKE BRAND A SINGLE OBJECT WITH ONLY ID AND NAME ---
  //         if (
  //           sanitized.brands &&
  //           Array.isArray(sanitized.brands) &&
  //           sanitized.brands.length > 0
  //         ) {
  //           const brand = sanitized.brands[0];
  //           sanitized.brands = {
  //             id: brand.id,
  //             name: brand.name,
  //           };
  //         } else {
  //           sanitized.brands = null;
  //         }

  //         // Extract unique colors and frame sizes from variants
  //         const color_picker = new Set();
  //         const frameSizes = new Set();
  //         const color = new Set();

  //         if (sanitized.variants && Array.isArray(sanitized.variants)) {
  //           sanitized.variants.forEach((variant) => {
  //             if (variant.color_picker) {
  //               color_picker.add(JSON.stringify(variant.color_picker));
  //             }
  //             if (variant.frame_size) {
  //               frameSizes.add(JSON.stringify(variant.frame_size));
  //             }
  //             if (variant.color) {
  //               color.add(JSON.stringify(variant.color));
  //             }
  //           });
  //         }

  //         // Apply the transformations directly
  //         const isWishlisted = wishlistedIds.has(sanitized.originalId);
  //         const categoryAsList = sanitized.category ? [sanitized.category] : [];

  //         // Return the new object with the extracted lists
  //         return {
  //           ...sanitized,
  //           isWishlisted: isWishlisted,
  //           color_picker: Array.from(color_picker).map((c) => JSON.parse(c)),
  //           frame_sizes: Array.from(frameSizes).map((s) => JSON.parse(s)),
  //           color: Array.from(color).map((c) => JSON.parse(c)),
  //           category: categoryAsList,
  //           average_rating: sanitized.average_rating,
  //           reviewCount: sanitized.reviewCount,
  //         };
  //       })
  //     );

  //    const message= sanitizedProducts.length > 0 ? "Products retrieved successfully." : "No products found matching the criteria.";

  //     return ctx.send({
  //       success: true,
  //       message: message,
  //       data: {
  //         products: sanitizedProducts,
  //         page: page,
  //         pageSize: limit,
  //         pageCount: Math.ceil(total / limit),
  //         total: total,
  //       },
  //     });
  //   } catch (error) {
  //     const customizedError = handleErrors(error);
  //     ctx.status = handleStatusCode(error) || 500;
  //     return ctx.send({ success: false, message: customizedError.message });
  //   }
  // },
  //MARK: Update product
  async update(ctx) {
    try {
      const { id } = ctx.params;
      const { body, files } = ctx.request;
      const requestData = body.data || body;

      const existingProduct = await strapi.entityService.findOne(
        "api::product.product",
        id,
        {
          populate: [
            "image",
            "lens_types",
            "lens_coatings",
            "frame_weights",
            "brands",
            "frame_materials",
            "frame_shapes",
            "lens_thicknesses",
            "frame_sizes",
            "colors",
          ],
        }
      );
      if (!existingProduct) {
        throw new NotFoundError("Product not found.");
      }

      // Consolidate all the processing logic into one object
      const processedData = {
        ...requestData,
      };
      if (requestData.lens_types !== undefined)
        processedData.lens_types = parseIdsToArray(requestData.lens_types);
      if (requestData.lens_coatings !== undefined)
        processedData.lens_coatings = parseIdsToArray(
          requestData.lens_coatings
        );
      if (requestData.frame_weights !== undefined)
        processedData.frame_weights = parseIdsToArray(
          requestData.frame_weights
        );
      if (requestData.brands !== undefined)
        processedData.brands = parseIdsToArray(requestData.brands);
      if (requestData.frame_materials !== undefined)
        processedData.frame_materials = parseIdsToArray(
          requestData.frame_materials
        );
      if (requestData.frame_shapes !== undefined)
        processedData.frame_shapes = parseIdsToArray(requestData.frame_shapes);
      if (requestData.lens_thicknesses !== undefined)
        processedData.lens_thicknesses = parseIdsToArray(
          requestData.lens_thicknesses
        );
      if (requestData.frame_sizes !== undefined)
        processedData.frame_sizes = parseIdsToArray(requestData.frame_sizes);
      if (requestData.colors !== undefined)
        processedData.colors = parseIdsToArray(requestData.colors);

      // Handle boolean fields, defaulting to existing value if not provided
      if (requestData.inStock !== undefined)
        processedData.inStock =
          String(requestData.inStock).toLowerCase() === "true";
      else processedData.inStock = existingProduct.inStock;

      if (requestData.best_seller !== undefined)
        processedData.best_seller =
          String(requestData.best_seller).toLowerCase() === "true";
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
      if (
        processedData.rating !== undefined &&
        (isNaN(processedData.rating) ||
          processedData.rating < 0 ||
          processedData.rating > 5)
      ) {
        throw new ValidationError("Rating must be a number between 0 and 5.");
      }
      if (processedData.offerPrice !== undefined) {
        if (isNaN(processedData.offerPrice) || processedData.offerPrice < 0) {
          throw new ValidationError(
            "Offer price must be a non-negative number."
          );
        }
        const currentPrice =
          processedData.price !== undefined
            ? processedData.price
            : existingProduct.price;
        if (processedData.offerPrice >= currentPrice) {
          throw new ValidationError(
            "Offer price must be less than the original price."
          );
        }
      }

      // Step 2: Validate existence of related entities efficiently
      if (processedData.category) {
        const categoryEntity = await strapi.entityService.findOne(
          "api::category.category",
          processedData.category
        );
        if (!categoryEntity)
          throw new NotFoundError("Provided category not found.");
      }
      await validateOneToManyRelationIds(
        "api::lens-type.lens-type",
        processedData.lens_types,
        "lens_types"
      );
      await validateOneToManyRelationIds(
        "api::lens-coating.lens-coating",
        processedData.lens_coatings,
        "lens_coatings"
      );
      await validateOneToManyRelationIds(
        "api::frame-weight.frame-weight",
        processedData.frame_weights,
        "frame_weights"
      );
      await validateOneToManyRelationIds(
        "api::brand.brand",
        processedData.brands,
        "brands"
      );
      await validateOneToManyRelationIds(
        "api::frame-material.frame-material",
        processedData.frame_materials,
        "frame_materials"
      );
      await validateOneToManyRelationIds(
        "api::frame-shape.frame-shape",
        processedData.frame_shapes,
        "frame_shapes"
      );
      await validateOneToManyRelationIds(
        "api::lens-thickness.lens-thickness",
        processedData.lens_thicknesses,
        "lens_thicknesses"
      );
      await validateOneToManyRelationIds(
        "api::frame-size.frame-size",
        processedData.frame_sizes,
        "frame_sizes"
      );
      await validateOneToManyRelationIds(
        "api::color.color",
        processedData.colors,
        "colors"
      );

      // Step 3: Handle image updates
      let finalImageIds = existingProduct.image
        ? existingProduct.image.map((img) => img.id)
        : [];
      if (files && files.image) {
        const newImageFiles = Array.isArray(files.image)
          ? files.image
          : [files.image];
        const uploadedNewImages = await Promise.all(
          newImageFiles.map((file) => ImageFile(file, 800, 800))
        );
        finalImageIds = uploadedNewImages.map((img) => img.id);
      } else if (requestData.image !== undefined) {
        // If the client sends an empty string or an array of IDs, use that.
        const parsedImageIds = parseIdsToArray(requestData.image);
        await validateOneToManyRelationIds(
          "plugin::upload.file",
          parsedImageIds,
          "image"
        );
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
            "reviews",
            "best_seller",
          ],
        }
      );

      const sanitizedProduct = await strapiUtils.sanitize.contentAPI.output(
        updatedProduct,
        strapi.contentType("api::product.product")
      );

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

  // MARK: Find similar products by a product ID
  async findSimilar(ctx) {
    try {
      const { id } = ctx.params;
      const { locale } = ctx.query;
      const user = ctx.state.user;

      // Step 1: Find the original product by its ID
      const originalProduct = await strapi.entityService.findOne(
        "api::product.product",
        id,
        {
          populate: ["brands", "category", "frame_materials", "frame_shapes"],
          // locale: locale,
        }
      );

      // LOG THE FOUND PRODUCT TO DEBUG
      console.log(
        "Original Product found:",
        JSON.stringify(originalProduct, null, 2)
      );

      if (!originalProduct) {
        throw new NotFoundError("Product not found.");
      }

      // Step 2: Extract relevant IDs for filtering
      const categoryId = originalProduct.category?.id;
      const brandsIds = originalProduct.brands?.map((brand) => brand.id);
      const frameMaterialsIds = originalProduct.frame_materials?.map(
        (material) => material.id
      );
      const frameShapesIds = originalProduct.frame_shapes?.map(
        (shape) => shape.id
      );

      // Step 3: Build the dynamic filter
      const filters = {
        $and: [
          {
            id: {
              $ne: id,
            },
          }, // Exclude the original product
          {
            $or: [],
          },
        ],
      };

      if (categoryId) {
        filters.$and[1].$or.push({
          category: {
            id: {
              $eq: categoryId,
            },
          },
        });
      }
      if (brandsIds && brandsIds.length > 0) {
        filters.$and[1].$or.push({
          brands: {
            id: {
              $in: brandsIds,
            },
          },
        });
      }
      if (frameMaterialsIds && frameMaterialsIds.length > 0) {
        filters.$and[1].$or.push({
          frame_materials: {
            id: {
              $in: frameMaterialsIds,
            },
          },
        });
      }
      if (frameShapesIds && frameShapesIds.length > 0) {
        filters.$and[1].$or.push({
          frame_shapes: {
            id: {
              $in: frameShapesIds,
            },
          },
        });
      }

      // LOG THE FINAL FILTER TO DEBUG
      console.log(
        "Final filter for similar products query:",
        JSON.stringify(filters, null, 2)
      );

      // If no filters can be applied, return an empty array
      if (filters.$and[1].$or.length === 0) {
        return ctx.send({
          success: true,
          message: "No similar products found.",
          data: [],
        });
      }

      // --- WISH LIST: Fetch the authenticated user's wishlist IDs including localizations ---
      let wishlistedIds = new Set();
      if (user && user.id) {
        const userWishlistProducts = await strapi.db
          .query("api::product.product")
          .findMany({
            where: {
              wishlistedByUsers: {
                id: user.id,
              },
            },
            select: ["id"],
            populate: {
              localizations: {
                select: ["id"],
              },
            },
          });

        if (userWishlistProducts) {
          userWishlistProducts.forEach((product) => {
            // Add the main product ID to the set
            wishlistedIds.add(product.id);

            // Add all localized product IDs to the set
            if (product.localizations && Array.isArray(product.localizations)) {
              product.localizations.forEach((localization) => {
                wishlistedIds.add(localization.id);
              });
            }
          });
        }
      }

      // Step 4: Find similar products based on the dynamic filter
      const similarProducts = await strapi.entityService.findMany(
        "api::product.product",
        {
          filters: filters,
          populate: [
            "image",
            "category",
            "brands",
            "frame_materials",
            "frame_shapes",
            "variants",
            "variants.color_picker",
            "variants.frame_size",
            "localizations",
          ],
          limit: 10, // You can adjust the limit for similar products
          // locale: locale,
        }
      );

      console.log(similarProducts, "Similar Products Found");

      // Step 5: Sanitize and format the response
      const sanitizedProducts = await Promise.all(
        similarProducts.map(async (product) => {
          const sanitized = await strapiUtils.sanitize.contentAPI.output(
            product,
            strapi.contentType("api::product.product")
          );

          // Format the brand to a single object with ID and name
          if (
            sanitized.brands &&
            Array.isArray(sanitized.brands) &&
            sanitized.brands.length > 0
          ) {
            const brand = sanitized.brands[0];
            sanitized.brands = {
              id: brand.id,
              name: brand.name,
            };
          } else {
            sanitized.brands = null;
          }

          // --- COLOR PICKER & FRAME SIZES: Extract unique colors and frame sizes from variants ---
          const color_picker = new Set();
          const frameSizes = new Set();
          const color = new Set();

          if (sanitized.variants && Array.isArray(sanitized.variants)) {
            sanitized.variants.forEach((variant) => {
              if (variant.color_picker) {
                color_picker.add(JSON.stringify(variant.color_picker));
              }
              if (variant.frame_size) {
                frameSizes.add(JSON.stringify(variant.frame_size));
              }
              if (variant.color) {
                color.add(JSON.stringify(variant.color));
              }
            });
          }

          const originalProductId = product.localizations?.find(
            (loc) => loc.locale === "en"
          )?.id;

          // Apply the transformations directly
          const isWishlisted = wishlistedIds.has(
            originalProductId || sanitized.id
          );
          const categoryAsList = sanitized.category ? [sanitized.category] : [];

          // Return the new object with the extracted lists
          return {
            ...sanitized,
            isWishlisted: isWishlisted,
            color_picker: Array.from(color_picker).map((c) => JSON.parse(c)),
            frame_sizes: Array.from(frameSizes).map((s) => JSON.parse(s)),
            color: Array.from(color).map((c) => JSON.parse(c)),
            category: categoryAsList,
            average_rating: sanitized.average_rating,
            reviewCount: sanitized.reviewCount,
          };
        })
      );

      // Step 6: Send the final response
      return ctx.send({
        success: true,
        message: "Similar products retrieved successfully.",
        data: sanitizedProducts,
      });
    } catch (error) {
      const customizedError = handleErrors(error);
      ctx.status = handleStatusCode(error) || 500;
      return ctx.send({
        success: false,
        message: customizedError.message,
      });
    }
  },

  // MARK: Toggle Wishlist + Return Updated Wishlist
  async toggleWishlist(ctx) {
    try {
      const { id: userId } = ctx.state.user;
      const { productId } = ctx.params;

      // 1. Find product with wishlistedByUsers
      const product = await strapi.entityService.findOne(
        "api::product.product",
        productId,
        { populate: ["wishlistedByUsers"] }
      );

      if (!product) {
        throw new NotFoundError("Product not found.");
      }

      const isWishlisted = product.wishlistedByUsers.some(
        (user) => user.id === userId
      );

      let updatedWishlistUsers;
      let message;

      if (isWishlisted) {
        // Remove from wishlist
        updatedWishlistUsers = product.wishlistedByUsers
          .filter((u) => u.id !== userId)
          .map((u) => u.id);
        message = "Product removed from wishlist.";
      } else {
        // Add to wishlist
        updatedWishlistUsers = [
          ...product.wishlistedByUsers.map((u) => u.id),
          userId,
        ];
        message = "Product added to wishlist.";
      }

      // 2. Update wishlist relation
      await strapi.entityService.update("api::product.product", productId, {
        data: { wishlistedByUsers: updatedWishlistUsers },
      });

      // 3. Get updated wishlist products for the current user
      const wishlistedProducts = await strapi.entityService.findMany(
        "api::product.product",
        {
          filters: { wishlistedByUsers: userId },
          populate: {
            image: {
              fields: ["url", "name", "alternativeText"],
            },
            category: { fields: ["name"] },
            reviews: {
              fields: ["rating", "comment", "createdAt"],
              populate: { user: { fields: ["name"] } },
            },
          },
          sort: [{ createdAt: "desc" }],
        }
      );

      return ctx.send({
        success: true,
        message,
        data: {
          product_id: productId,
          isWishlisted: !isWishlisted,
          wishlist: {
            products: wishlistedProducts,
            total_items_in_wishlist: wishlistedProducts.length,
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

  // GET /api/products/my-wishlist
  async getMyWishlist(ctx) {
    try {
      const { id: userId } = ctx.state.user;

      const wishlistedProducts = await strapi.entityService.findMany(
        "api::product.product",
        {
          filters: {
            wishlistedByUsers: userId, // Only products where current user is in wishlist
          },
          populate: {
            image: { fields: ["url", "name", "alternativeText"] },
            category: { fields: ["name"] },
            reviews: {
              fields: ["rating", "comment", "createdAt"],
              populate: { user: { fields: ["name"] } }, // FIXED: replaced username
            },
          },
          sort: [{ createdAt: "desc" }],
        }
      );

      return ctx.send({
        success: true,
        message: "Wishlist retrieved successfully.",
        data: {
          products: wishlistedProducts,
          total_items_in_wishlist: wishlistedProducts.length,
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
      if (comment && typeof comment !== "string") {
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
      const existingReview = product.reviews.find(
        (review) => review.user && review.user.id === userId
      );
      if (existingReview) {
        throw new ValidationError(
          "You have already submitted a review for this product. You can update your existing review."
        );
      }

      // Create the new review entry
      const newReview = await strapi.entityService.create(
        "api::review.review",
        {
          data: {
            rating: parseInt(rating),
            comment: comment || null,
            user: userId,
            product: productId,
            publishedAt: new Date(),
          },
        }
      );

      // Calculate new average rating and update review count for the product
      const currentReviews = product.reviews || [];
      const totalRatings =
        currentReviews.reduce((sum, r) => sum + r.rating, 0) + parseInt(rating);
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
        {
          populate: {
            reviews: {
              populate: { user: { fields: ["username", "email", "name"] } },
            },
          },
        } // Populate reviews and their associated user
      );

      if (!product) {
        throw new NotFoundError("Product not found.");
      }

      const reviews = product.reviews.map((review) => ({
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
        },
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
