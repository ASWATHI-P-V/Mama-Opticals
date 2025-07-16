const utils = require("@strapi/utils");
const { NotFoundError } = utils.errors;

exports.validateBodyRequiredFields = (body, requiredFields) => {
  requiredFields.forEach((field) => {
    if (!(field in body)) {
      throw new NotFoundError(`The field ${field} is required in body`);
    }
  });
};

exports.validateQueryRequiredFields = (query, requiredFields) => {
  requiredFields.forEach((field) => {
    if (!(field in query)) {
      throw new NotFoundError(`The field ${field} is required in query`);
    }
  });
};

exports.validateParamsRequiredFields = (params, requiredFields) => {
  requiredFields.forEach((field) => {
    if (!(field in params)) {
      throw new NotFoundError(`The field ${field} is required in params`);
    }
  });
};
