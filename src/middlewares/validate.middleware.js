const ApiError = require('../utils/ApiError');

const validate = (schema, target = 'body') => (req, res, next) => {
  const { error, value } = schema.validate(req[target], {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const errors = error.details.map((d) => d.message.replace(/"/g, ''));
    return next(ApiError.badRequest('Données invalides', errors));
  }

  req[target] = value;
  next();
};

module.exports = validate;
