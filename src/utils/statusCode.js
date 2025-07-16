const utils = require("@strapi/utils");

const { ValidationError, NotFoundError } = utils.errors;

exports.handleStatusCode = (error) => {
  try {
    let statusCode;

    if (error instanceof ValidationError) {
      statusCode = 400;
    } else if (error instanceof NotFoundError) {
      statusCode = 404;
    } else {
      statusCode = 500;
    }

    return statusCode;
  } catch (error) {
    return false;
  }
};
