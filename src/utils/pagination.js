const utils = require("@strapi/utils");

const { ValidationError } = utils.errors;

exports.calculatePagination = (page, limit) => {
  if (!page || !limit) return {};

  if (page < 1 || limit < 1) {
    throw new ValidationError("Page and limit must be greater than 0");
  }

  const pageNumber = parseInt(page, 10) || 1;
  const pageSize = parseInt(limit, 10) || 10;
  const start = (pageNumber - 1) * pageSize;
  return { start, limit: pageSize };
};
