'use strict';

/**
 * Formats an array of image objects to a consistent structure.
 *
 * @param {Array} images The raw image data from Strapi.
 * @returns {Array} An array of formatted image objects.
 */
const imageFormatter = (images) => {
  if (!images || !Array.isArray(images)) {
    return [];
  }

  return images.map((image) => {
    return {
      id: image.id,
      url: image.url,
      formats: {
        thumbnail: image.formats?.thumbnail ? { url: image.formats.thumbnail.url } : null,
        small: image.formats?.small ? { url: image.formats.small.url } : null,
      },
    };
  });
};

module.exports = imageFormatter;