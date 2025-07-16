const otpGenerator = require("otp-generator");

exports.generateOTP = async () => {
  let otp;
  let isUnique = false;
  let attemptCount = 0;
  const maxAttempts = 9999;

  while (!isUnique) {
    otp = otpGenerator.generate(4, {
      lowerCaseAlphabets: false,
      upperCaseAlphabets: false,
      specialChars: false,
    });

    const existingUser = await strapi.entityService.findMany(
      "plugin::users-permissions.user",
      {
        filters: {
          otp: otp,
          otpExpiryTime: {
            $gte: new Date(),
          },
        },
      }
    );

    if (existingUser.length === 0) {
      isUnique = true;
    } else if (attemptCount >= maxAttempts) {
      isUnique = true;
    }

    attemptCount++;
  }

  return otp;
};
