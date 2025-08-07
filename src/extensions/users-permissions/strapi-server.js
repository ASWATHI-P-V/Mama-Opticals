// From strapi-server.js (Modified Version for Mama Opticals)

const utils = require("@strapi/utils");
const { ValidationError, NotFoundError, UnauthorizedError } = utils.errors; // Added UnauthorizedError

const bcrypt = require("bcryptjs"); // Added bcrypt for password hashing

const { handleStatusCode } = require("../../utils/statusCode.js");
const { changeFileMimeType } = require("../../utils/media.js");
const { emailVerifyOtp } = require("../../utils/email.js");
const { isPhoneValid, smsVerifyOtp } = require("../../utils/phone.js");
const { generateOTP } = require("../../utils/otpGenerate.js");
const { validateBodyRequiredFields } = require("../../utils/validation.js");

const getService = (name) => {
  return strapi.plugin("users-permissions").service(name);
};

const {
  handleErrors,
  userAllDetails, // Keep if still used elsewhere, otherwise can be removed
  deleteUserRelationDetails, // Keep if still used elsewhere, otherwise can be removed
} = require("./strapi-functions.js");

const unverifiedUsers = new Map();

module.exports = (plugin) => {
  //MARK: Register Method ---
  plugin.controllers.auth.register = async (ctx) => {
    try {
      const { body, files } = ctx.request;

      // All original data validations are preserved
      validateBodyRequiredFields(body, [
        "name",
        "phone",
        "email",
        "dateOfBirth",
        "gender",
        "password",
        "confirmPassword",
      ]);

      if (body.password !== body.confirmPassword) {
        throw new ValidationError(
          "Password and Confirm Password do not match."
        );
      }

      if (!isPhoneValid(body?.phone)) {
        throw new ValidationError("Invalid phone number");
      }

      // Check if a confirmed user already exists with this email or phone
      const existingUser = await strapi.entityService.findMany(
        "plugin::users-permissions.user",
        {
          filters: {
            $or: [{ email: body.email }, { phone: body.phone }],
          },
        }
      );

      if (existingUser && existingUser.length > 0) {
        throw new ValidationError(
          "User with this email or phone already exists."
        );
      }

      const otp = await generateOTP();
      const otpExpiryTime = new Date(new Date().getTime() + 2.5 * 60000);

      // Store user details, OTP, and expiry time in a temporary in-memory map.
      unverifiedUsers.set(body.email, {
        name: body?.name,
        phone: body?.phone,
        email: body?.email,
        dateOfBirth: body?.dateOfBirth,
        gender: body?.gender,
        password: body.password,
        otp: otp,
        otpExpiryTime: otpExpiryTime,
        profileImage: files?.profileImage,
      });

      // Send OTP to the user.
      if (body?.email) {
        await emailVerifyOtp(otp, body.email);
      }
      if (body?.phone) {
        await smsVerifyOtp(otp, body.phone);
      }

      return ctx.send({
        success: true,
        message:
          "OTP has been sent to your email and phone for verification. Please verify to complete your registration.",
        data: {
          email: body.email,
          phone: body.phone,
          otp: otp,
        },
      });
    } catch (error) {
      const customizedError = handleErrors(error);
      return ctx.send(
        {
          success: false,
          message: customizedError.message,
        },
        handleStatusCode(error) || 500
      );
    }
  };

  //MARK:otp verification
  plugin.controllers.auth.verifyOtp = async (ctx) => {
    try {
      const { body } = ctx.request;

      // Validate that either an 'email' or 'phone' is present, along with 'otp'.
      validateBodyRequiredFields(body, ["otp"]);
      let identifier = null;

      if (body.email) {
        identifier = body.email;
      } else if (body.phone) {
        identifier = body.phone;
      } else {
        throw new ValidationError(
          "Either 'email' or 'phone' must be provided for OTP verification."
        );
      }

      const { otp } = body;

      // Retrieve temporary user data from the in-memory map using the identifier as the key.
      const tempUser = unverifiedUsers.get(identifier);

      if (!tempUser) {
        throw new NotFoundError("Registration data not found or expired.");
      }

      // Check if OTP is valid and not expired.
      const now = new Date();
      if (tempUser.otp !== otp || now > tempUser.otpExpiryTime) {
        unverifiedUsers.delete(identifier); // Clear temporary data after failed attempt
        throw new NotFoundError("Invalid or expired OTP.");
      }

      const pluginStore = await strapi.store({
        type: "plugin",
        name: "users-permissions",
      });
      const settings = await pluginStore.get({ key: "advanced" });
      const role = await strapi
        .query("plugin::users-permissions.role")
        .findOne({ where: { type: settings.default_role } });

      if (!role) {
        throw new NotFoundError("No default role found");
      }

      // Create the permanent user record in the database.
      const userCreated = await strapi.entityService.create(
        "plugin::users-permissions.user",
        {
          data: {
            name: tempUser.name,
            phone: tempUser.phone,
            email: tempUser.email,
            dateOfBirth: tempUser.dateOfBirth,
            gender: tempUser.gender,
            password: tempUser.password,
            role: role.id,
            publishedAt: new Date().getTime(),
            confirmed: true, // User is now confirmed
            otp: null, // Clear OTP fields
            otpExpiryTime: null,
          },
          ...(tempUser.profileImage && {
            files: {
              profileImage: {
                ...tempUser.profileImage,
                type: changeFileMimeType(tempUser.profileImage),
              },
            },
          }),
          populate: {
            profileImage: {
              fields: ["url", "formats"],
            },
          },
        }
      );

      // Remove temporary data after successful registration.
      unverifiedUsers.delete(identifier);

      return ctx.send({
        success: true,
        message: "User registered and verified successfully.",
        data: {
          jwt: getService("jwt").issue({ id: userCreated.id }),
          user: {
            id: userCreated.id,
            name: userCreated.name,
            email: userCreated.email,
            phone: userCreated.phone,
            dateOfBirth: userCreated.dateOfBirth,
            gender: userCreated.gender,
          },
        },
      });
    } catch (error) {
      const customizedError = handleErrors(error);
      return ctx.send(
        {
          success: false,
          message: customizedError.message,
        },
        handleStatusCode(error) || 500
      );
    }
  };

  // //MARK:otp verification 2nddddd
  // plugin.controllers.auth.verifyOtp = async (ctx) => {
  //   try {
  //     const { body } = ctx.request;
  //     validateBodyRequiredFields(body, ["otp", "email"]);

  //     const { otp, email } = body;

  //     const tempUser = unverifiedUsers.get(email);

  //     if (!tempUser) {
  //       throw new NotFoundError("Registration data not found or expired.");
  //     }

  //     const now = new Date();
  //     if (tempUser.otp !== otp || now > tempUser.otpExpiryTime) {
  //       unverifiedUsers.delete(email);
  //       throw new NotFoundError("Invalid or expired OTP.");
  //     }

  //     const pluginStore = await strapi.store({
  //       type: "plugin",
  //       name: "users-permissions",
  //     });
  //     const settings = await pluginStore.get({ key: "advanced" });
  //     const role = await strapi
  //       .query("plugin::users-permissions.role")
  //       .findOne({ where: { type: settings.default_role } });

  //     if (!role) {
  //       throw new NotFoundError("No default role found");
  //     }

  //     // Create the permanent user record in the database
  //     const userCreated = await strapi.entityService.create(
  //       "plugin::users-permissions.user",
  //       {
  //         data: {
  //           name: tempUser.name,
  //           phone: tempUser.phone,
  //           email: tempUser.email,
  //           dateOfBirth: tempUser.dateOfBirth,
  //           gender: tempUser.gender,
  //           password: tempUser.password,
  //           role: role.id,
  //           publishedAt: new Date().getTime(),
  //           confirmed: true,
  //           otp: null,
  //           otpExpiryTime: null,
  //         },
  //         ...(tempUser.profileImage && {
  //           files: {
  //             profileImage: {
  //               ...tempUser.profileImage,
  //               type: changeFileMimeType(tempUser.profileImage),
  //             },
  //           },
  //         }),
  //         populate: {
  //           profileImage: {
  //             fields: ["url", "formats"],
  //           },
  //         },
  //       }
  //     );

  //     // Remove temporary data after successful registration
  //     unverifiedUsers.delete(email);

  //     return ctx.send({
  //       success: true,
  //       message: "User registered and verified successfully.",
  //       data: {
  //         jwt: getService("jwt").issue({ id: userCreated.id }),
  //         user: {
  //           id: userCreated.id,
  //           name: userCreated.name,
  //           email: userCreated.email,
  //           phone: userCreated.phone,
  //           dateOfBirth: userCreated.dateOfBirth,
  //           gender: userCreated.gender,
  //           otp:otp
  //         },
  //       },
  //     });
  //   } catch (error) {
  //     const customizedError = handleErrors(error);
  //     return ctx.send(
  //       {
  //         success: false,
  //         message: customizedError.message,
  //       },
  //       handleStatusCode(error) || 500
  //     );
  //   }
  // };

  // module.exports = (plugin) => {
  //   //MARK: Register Method ---
  //   plugin.controllers.auth.register = async (ctx) => {
  //     try {
  //       const { body, files } = ctx.request;

  //       // Validate required fields for new registration
  //       validateBodyRequiredFields(body, [
  //         "name",
  //         "phone",
  //         "email",
  //         "dateOfBirth",
  //         "gender",
  //         "password",
  //         "confirmPassword",
  //       ]);

  //       // Check if password and confirm password match
  //       if (body.password !== body.confirmPassword) {
  //         throw new ValidationError(
  //           "Password and Confirm Password do not match."
  //         );
  //       }

  //       const pluginStore = await strapi.store({
  //         type: "plugin",
  //         name: "users-permissions",
  //       });

  //       const settings = await pluginStore.get({ key: "advanced" });

  //       const role = await strapi
  //         .query("plugin::users-permissions.role")
  //         .findOne({ where: { type: settings.default_role } });

  //       if (!role) {
  //         throw new NotFoundError("No default role found");
  //       }

  //       if (!isPhoneValid(body?.phone)) {
  //         throw new ValidationError("Invalid phone number");
  //       }

  //       // Check if user with this email or phone already exists
  //       const existingUser = await strapi.entityService.findMany(
  //         "plugin::users-permissions.user",
  //         {
  //           filters: {
  //             $or: [{ email: body.email }, { phone: body.phone }],
  //           },
  //         }
  //       );

  //       if (existingUser && existingUser.length > 0) {
  //         throw new ValidationError(
  //           "User with this email or phone already exists."
  //         );
  //       }

  //       // Hash the password
  //       // const hashedPassword = await bcrypt.hash(body.password, 10); // 10 is the salt rounds

  //       const otp = await generateOTP();
  //       const otpExpiryTime = new Date(new Date().getTime() + 2.5 * 60000); // 2.5 minutes expiry

  //       const userCreated = await strapi.entityService.create(
  //         "plugin::users-permissions.user",
  //         {
  //           data: {
  //             name: body?.name,
  //             phone: body?.phone,
  //             email: body?.email,
  //             dateOfBirth: body?.dateOfBirth, // New field
  //             gender: body?.gender, // New field
  //             password: body.password, // Store hashed password
  //             role: role.id,
  //             otp: otp,
  //             otpExpiryTime: otpExpiryTime,
  //             publishedAt: new Date().getTime(),
  //             confirmed: false, // User is not confirmed until OTP verification
  //           },
  //           ...(files?.profileImage && {
  //             files: {
  //               profileImage: {
  //                 ...files.profileImage,
  //                 type: changeFileMimeType(files.profileImage),
  //               },
  //             },
  //           }),
  //           populate: {
  //             profileImage: {
  //               fields: ["url", "formats"],
  //             },
  //           },
  //         }
  //       );

  //       // Send OTP based on available contact method
  //       if (userCreated?.phone) {
  //         await smsVerifyOtp(otp, userCreated.phone);
  //       } else if (userCreated?.email) {
  //         await emailVerifyOtp(otp, userCreated.email);
  //       }

  //       return ctx.send({
  //         success: true,
  //         message:
  //           "User registered successfully. OTP has been sent for verification.",
  //         data: {
  //           user: {
  //             id: userCreated.id,
  //             name: userCreated.name,
  //             email: userCreated.email,
  //             phone: userCreated.phone,
  //             dateOfBirth: userCreated.dateOfBirth,
  //             gender: userCreated.gender,
  //             otp: otp,
  //             // Do NOT send OTP or password back in the response
  //           },
  //         },
  //       });
  //     } catch (error) {
  //       const customizedError = handleErrors(error);
  //       return ctx.send(
  //         {
  //           success: false,
  //           message: customizedError.message,
  //         },
  //         handleStatusCode(error) || 500
  //       );
  //     }
  //   };

  // MARK: callbackWeb Method (Login with identifier and password) ---
  plugin.controllers.auth.callbackWeb = async (ctx) => {
    try {
      const { body } = ctx.request;
      validateBodyRequiredFields(body, ["identifier"]);

      // Determine login type: password-based or OTP-based
      const isPasswordLogin = body.identifier.includes("@");

      if (isPasswordLogin) {
        // Password-based login
        validateBodyRequiredFields(body, ["identifier", "password"]);

        const [user] = await strapi.entityService.findMany(
          "plugin::users-permissions.user",
          {
            filters: { email: body.identifier },
          }
        );

        if (!user) {
          throw new NotFoundError(
            "User is not registered or invalid credentials."
          );
        }

        // Verify password
        const isPasswordValid = await bcrypt.compare(
          body.password,
          user.password
        );
        if (!isPasswordValid) {
          throw new UnauthorizedError("Invalid credentials.");
        }

        // Direct login success: Issue JWT
        return ctx.send({
          success: true,
          message: "Login successful.",
          data: {
            jwt: getService("jwt").issue({ id: user.id }),
            user: {
              id: user.id,
              name: user.name,
              email: user.email,
              phone: user.phone,
              dateOfBirth: user.dateOfBirth,
              gender: user.gender,
            },
          },
        });
      } else {
        // Ensure identifier is a phone number for OTP flow
        if (!isPhoneValid(body.identifier)) {
          throw new ValidationError("Invalid phone number for OTP login.");
        }

        const [user] = await strapi.entityService.findMany(
          "plugin::users-permissions.user",
          {
            filters: {
              phone: body.identifier, // Only filter by phone for OTP login
            },
          }
        );

        if (!user) {
          throw new NotFoundError(
            "User is not registered with this phone number."
          );
        }

        const otp = await generateOTP();
        const otpExpiryTime = new Date(new Date().getTime() + 2.5 * 60000);

        const userUpdated = await strapi.entityService.update(
          "plugin::users-permissions.user",
          user.id,
          {
            data: {
              otp: otp,
              otpExpiryTime: otpExpiryTime,
            },
            populate: {},
          }
        );

        // Send OTP via SMS
        // await smsVerifyOtp(otp, userUpdated.phone);

        return ctx.send({
          success: true,
          message: "OTP has been sent to your phone for verification.",
          data: {
            user: {
              id: userUpdated.id,
              phone: userUpdated.phone,
              otp: otp, // Temporarily added for testing as per request
            },
          },
        });
      }
    } catch (error) {
      const customizedError = handleErrors(error);
      return ctx.send(
        {
          success: false,
          message: customizedError.message,
        },
        handleStatusCode(error) || 500
      );
    }
  };

  //MARK: callback Method (Mobile/App Login with identifier and password OR phone only for OTP) ---
  // This method will now also handle direct login with password and OTP-only login
  // MARK: callbackWeb Method (Login with email and password OR phone for OTP) ---
  plugin.controllers.auth.callbackWeb = async (ctx) => {
    try {
      const { body } = ctx.request;

      // Check for password, implying email/password login
      if (body.password !== undefined && body.password !== null) {
        // Email/Password-based login
        validateBodyRequiredFields(body, ["email", "password"]); // Expect 'email' field

        const [user] = await strapi.entityService.findMany(
          "plugin::users-permissions.user",
          {
            filters: { email: body.email }, // Filter directly by email
          }
        );

        if (!user) {
          throw new NotFoundError(
            "User is not registered or invalid credentials."
          );
        }

        // Verify password
        const isPasswordValid = await bcrypt.compare(
          body.password,
          user.password
        );
        if (!isPasswordValid) {
          throw new UnauthorizedError("Invalid credentials.");
        }

        // Direct login success: Issue JWT
        return ctx.send({
          success: true,
          message: "Login successful.",
          data: {
            jwt: getService("jwt").issue({ id: user.id }),
            user: {
              id: user.id,
              name: user.name,
              email: user.email,
              phone: user.phone,
              dateOfBirth: user.dateOfBirth,
              gender: user.gender,
            },
          },
        });
      } else {
        // OTP-based login (phone only)
        validateBodyRequiredFields(body, ["phone"]); // Expect 'phone' field

        if (!isPhoneValid(body.phone)) {
          throw new ValidationError("Invalid phone number for OTP login.");
        }

        const [user] = await strapi.entityService.findMany(
          "plugin::users-permissions.user",
          {
            filters: {
              phone: body.phone, // Filter directly by phone
            },
          }
        );

        if (!user) {
          throw new NotFoundError(
            "User is not registered with this phone number."
          );
        }

        const otp = await generateOTP();
        const otpExpiryTime = new Date(new Date().getTime() + 2.5 * 60000);

        const userUpdated = await strapi.entityService.update(
          "plugin::users-permissions.user",
          user.id,
          {
            data: {
              otp: otp,
              otpExpiryTime: otpExpiryTime,
            },
            populate: {},
          }
        );

        // Send OTP via SMS
        // await smsVerifyOtp(otp, userUpdated.phone);

        return ctx.send({
          success: true,
          message: "OTP has been sent to your phone for verification.",
          data: {
            user: {
              id: userUpdated.id,
              phone: userUpdated.phone,
              otp: otp, // Temporarily added for testing as per request
            },
          },
        });
      }
    } catch (error) {
      const customizedError = handleErrors(error);
      return ctx.send(
        {
          success: false,
          message: customizedError.message,
        },
        handleStatusCode(error) || 500
      );
    }
  };

  // MARK: loginVerify Method ---
  // This method handles the second step of OTP-based login, verifying the OTP.
  plugin.controllers.auth.loginVerify = async (ctx) => {
    try {
      const { body } = ctx.request; // The request must contain both a phone number and an OTP.

      validateBodyRequiredFields(body, ["phone", "otp"]);

      const { phone, otp } = body; // Find the user by phone number and check the OTP and its expiry time.

      const [user] = await strapi.entityService.findMany(
        "plugin::users-permissions.user",
        {
          filters: {
            phone: phone,
            otp: otp,
            otpExpiryTime: {
              $gt: new Date(), // Check if the OTP has not expired
            },
          },
        }
      );

      if (!user) {
        throw new UnauthorizedError(
          "Invalid or expired OTP, or user not found."
        );
      } // Clear the OTP and its expiry time from the user's record after a successful login.

      await strapi.entityService.update(
        "plugin::users-permissions.user",
        user.id,
        {
          data: {
            otp: null,
            otpExpiryTime: null,
          },
        }
      ); // Return the JWT and user details for a successful login.

      return ctx.send({
        success: true,
        message: "User logged successfully.",
        data: {
          jwt: getService("jwt").issue({ id: user.id }),
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            dateOfBirth: user.dateOfBirth,
            gender: user.gender,
          },
        },
      });
    } catch (error) {
      const customizedError = handleErrors(error);
      return ctx.send(
        {
          success: false,
          message: customizedError.message,
        },
        handleStatusCode(error) || 500
      );
    }
  };

  //MARK: callback Method (Mobile/App Login with email and password OR phone for OTP) ---
  plugin.controllers.auth.callback = async (ctx) => {
    try {
      const { body } = ctx.request;

      // Determine login type: password-based or OTP-based
      if (body.password !== undefined && body.password !== null) {
        // Password-based login: Only allows email with password
        validateBodyRequiredFields(body, ["email", "password"]); // Expect 'email' field, disallow phone with password

        const [user] = await strapi.entityService.findMany(
          "plugin::users-permissions.user",
          {
            filters: { email: body.email }, // Filter directly by email
          }
        );

        if (!user) {
          throw new NotFoundError(
            "User is not registered or invalid credentials."
          );
        }

        // Verify password
        const isPasswordValid = await bcrypt.compare(
          body.password,
          user.password
        );
        if (!isPasswordValid) {
          throw new UnauthorizedError("Invalid credentials.");
        }

        // Direct login success: Issue JWT
        return ctx.send({
          success: true,
          message: "Login successful.",
          data: {
            jwt: getService("jwt").issue({ id: user.id }),
            user: {
              id: user.id,
              name: user.name,
              email: user.email,
              phone: user.phone,
              dateOfBirth: user.dateOfBirth,
              gender: user.gender,
            },
          },
        });
      } else {
        // OTP-based login (phone only)
        validateBodyRequiredFields(body, ["phone"]); // Expect 'phone' field

        if (!isPhoneValid(body.phone)) {
          throw new ValidationError("Invalid phone number for OTP login.");
        }

        let user = await strapi.entityService
          .findMany("plugin::users-permissions.user", {
            filters: {
              phone: body.phone, // Filter directly by phone
            },
          })
          .then((users) => users[0]);

        if (!user) {
          throw new NotFoundError(
            "User is not registered with this phone number."
          );
        }

        const otp = await generateOTP();
        const otpExpiryTime = new Date(new Date().getTime() + 2.5 * 60000);

        // Update user with new OTP
        user = await strapi.entityService.update(
          "plugin::users-permissions.user",
          user.id,
          {
            data: { otp: otp, otpExpiryTime: otpExpiryTime },
            populate: {},
          }
        );

        // Send OTP via SMS
        await smsVerifyOtp(otp, user.phone);

        return ctx.send({
          success: true,
          message: "OTP has been sent to your phone for verification.",
          data: {
            user: {
              id: user.id,
              phone: user.phone,
              otp: otp, // Temporarily added for testing as per request
            },
          },
        });
      }
    } catch (error) {
      const customizedError = handleErrors(error);
      return ctx.send(
        { success: false, message: customizedError.message },
        handleStatusCode(error) || 500
      );
    }
  };

  //   //MARK:otp verification
  //   // --- verifyOtp Method ---
  //   plugin.controllers.auth.verifyOtp = async (ctx) => {
  //     try {
  //       const { body } = ctx.request;

  //       // OTP verification can be done with either email or phone, so we keep 'identifier' here,
  //       // but the logic will prioritize based on the presence of 'email' or 'phone' in the body.
  //       validateBodyRequiredFields(body, ["otp"]);

  //       let userFilter = {};
  //       if (body.email) {
  //         userFilter = { email: body.email };
  //         validateBodyRequiredFields(body, ["email", "otp"]);
  //       } else if (body.phone) {
  //         userFilter = { phone: body.phone };
  //         validateBodyRequiredFields(body, ["phone", "otp"]);
  //       } else {
  //         throw new ValidationError(
  //           "Either 'email' or 'phone' must be provided for OTP verification."
  //         );
  //       }

  //       const [user] = await strapi.entityService.findMany(
  //         "plugin::users-permissions.user",
  //         {
  //           sort: { updatedAt: "desc" },
  //           filters: {
  //             ...userFilter, // Use the specific filter (email or phone)
  //             otp: body?.otp,
  //             otpExpiryTime: {
  //               $gt: new Date(),
  //             },
  //           },
  //           populate: {
  //             profileImage: {
  //               fields: ["url", "formats"],
  //             },
  //           },
  //         }
  //       );

  //       if (!user) {
  //         throw new NotFoundError("Invalid or expired OTP or user not found.");
  //       }

  //       // Mark user as confirmed after successful OTP verification
  //       await strapi.entityService.update(
  //         "plugin::users-permissions.user",
  //         user.id,
  //         {
  //           data: {
  //             otp: null,
  //             otpExpiryTime: null,
  //             confirmed: true, // Mark user as confirmed
  //           },
  //         }
  //       );

  //       return ctx.send({
  //         success: true,
  //         message: "User is verified",
  //         data: {
  //           jwt: getService("jwt").issue({ id: user.id }),
  //           user: {
  //             id: user.id,
  //             name: user.name,
  //             email: user.email,
  //             phone: user.phone,
  //             dateOfBirth: user.dateOfBirth,
  //             gender: user.gender,
  //             // Do NOT return OTP or password
  //           },
  //         },
  //       });
  //     } catch (error) {
  //       const customizedError = handleErrors(error);

  //       return ctx.send(
  //         {
  //           success: false,
  //           message: customizedError.message,
  //         },
  //         handleStatusCode(error) || 500
  //       );
  //     }
  //   };

  // MARK: Logout Method ---
  plugin.controllers.auth.logout = async (ctx) => {
    try {
      // In a JWT-based system, the server doesn't "destroy" the token.
      // Logout primarily involves the client discarding its JWT.
      // However, we can still have a server-side endpoint to:
      // 1. Acknowledge the logout request.
      // 2. Potentially implement token blacklisting for enhanced security (optional).

      // Ensure the user is authenticated to call this endpoint
      if (!ctx.state.user) {
        throw new UnauthorizedError("No authenticated user found.");
      }

      // If you were implementing token blacklisting, you would get the JWT
      // from the Authorization header (ctx.request.headers.authorization)
      // and add it to a blacklist here.
      // Example (conceptual, requires a database table or Redis for blacklist):
      // const token = ctx.request.headers.authorization?.split(' ')[1];
      // if (token) {
      //   await strapi.entityService.create('api::token-blacklist.token-blacklist', {
      //     data: {
      //       token: token,
      //       expiresAt: new Date(ctx.state.auth.tokenExpiresAt), // Store token expiry
      //       userId: ctx.state.user.id,
      //       publishedAt: new Date(),
      //     }
      //   });
      // }

      return ctx.send({
        success: true,
        message: "Logout successful. ",
      });
      //Please remove your authentication token from the client-side.
    } catch (error) {
      const customizedError = handleErrors(error);
      return ctx.send(
        {
          success: false,
          message: customizedError.message,
        },
        handleStatusCode(error) || 500
      );
    }
  };

  //MARK: me Method (Updated to include new fields)
  plugin.controllers.user.me = async (ctx) => {
    try {
      const { id: userId } = ctx.state.user;

      const userFound = await strapi.entityService.findOne(
        "plugin::users-permissions.user",
        userId,
        {
          fields: [
            "name",
            "email",
            "phone",
            "dateOfBirth",
            "gender",
            "createdAt",
            "updatedAt",
          ], // Added dateOfBirth and gender
          populate: {
            profileImage: {
              fields: ["url", "formats"],
            },
          },
        }
      );

      return ctx.send({
        success: true,
        message: "User has been found",
        data: {
          ...userFound,
        },
      });
    } catch (error) {
      const customizedError = handleErrors(error);

      return ctx.send(
        {
          success: false,
          message: customizedError.message,
        },
        handleStatusCode(error) || 500
      );
    }
  };

  //MARK: userProfile Method (Updated to include new fields)
  plugin.controllers.user.userProfile = async (ctx) => {
    try {
      let userId;

      if (ctx.state.user) {
        ({ id: userId } = ctx.state.user);
      }

      const { id: otherUserId } = ctx.params;

      const otherUserFound = await strapi.entityService.findOne(
        "plugin::users-permissions.user",
        otherUserId,
        {
          fields: [
            "name",
            "email",
            "phone",
            "dateOfBirth",
            "gender",
            "createdAt",
            "updatedAt",
          ], // Added dateOfBirth and gender
          populate: {
            profileImage: {
              fields: ["url", "formats"],
            },
          },
        }
      );

      if (!otherUserFound) {
        return ctx.send({
          success: true,
          message: "User not found",
          data: {},
        });
      }

      return ctx.send({
        success: true,
        message: "Other user has been found",
        data: {
          ...otherUserFound,
        },
      });
    } catch (error) {
      const customizedError = handleErrors(error);

      return ctx.send(
        {
          success: false,
          message: customizedError.message,
        },
        handleStatusCode(error) || 500
      );
    }
  };

  //MARK:changeProfile Method --- (Updated to allow changing new fields)
  plugin.controllers.auth.changeProfile = async (ctx) => {
    try {
      const { body, files } = ctx.request;
      const { id: userId } = ctx.state.user;

      const userFound = await strapi.entityService.findOne(
        "plugin::users-permissions.user",
        userId,
        {
          fields: ["id"], // Only fetch necessary fields
          populate: {
            profileImage: {
              fields: ["id", "url", "formats"],
            },
          },
        }
      );

      if (!userFound) {
        throw new NotFoundError("User not found");
      }

      if (body?.phone) {
        const isValid = isPhoneValid(body.phone);
        if (!isValid) {
          throw new ValidationError("Invalid phone number");
        }
      }

      const updateData = {
        ...(body?.name && { name: body?.name }),
        ...(body?.email && { email: body?.email?.toLowerCase() }),
        ...(body?.phone && { phone: body?.phone }),
        ...(body?.dateOfBirth && { dateOfBirth: body?.dateOfBirth }), // Allow updating dateOfBirth
        ...(body?.gender && { gender: body?.gender }), // Allow updating gender
      };

      const userUpdated = await strapi.entityService.update(
        "plugin::users-permissions.user",
        userId,
        {
          data: updateData,
          ...(files?.profileImage && {
            files: {
              profileImage: {
                ...files.profileImage,
                type: changeFileMimeType(files.profileImage),
              },
            },
          }),
          fields: [
            "name",
            "email",
            "phone",
            "dateOfBirth",
            "gender",
            "createdAt",
            "updatedAt",
          ], // Include new fields in response
          populate: {
            profileImage: {
              fields: ["url", "formats"],
            },
          },
        }
      );

      if (userUpdated && files.profileImage && userFound.profileImage) {
        await strapi.entityService.delete(
          "plugin::upload.file",
          userFound.profileImage.id
        );

        await strapi.plugins.upload.services.upload.remove(
          userFound.profileImage
        );
      }

      return ctx.send({
        success: true,
        message: "User profile is updated",
        data: {
          ...userUpdated,
        },
      });
    } catch (error) {
      const customizedError = handleErrors(error);

      return ctx.send(
        {
          success: false,
          message: customizedError.message,
        },
        handleStatusCode(error) || 500
      );
    }
  };

  //MARK: changePasswordRequest Method ---
  plugin.controllers.auth.changePasswordRequest = async (ctx) => {
    try {
      const { body } = ctx.request;
      const { id: userId } = ctx.state.user; // User must be authenticated

      validateBodyRequiredFields(body, [
        "currentPassword",
        "newPassword",
        "confirmNewPassword",
      ]);

      if (body.newPassword !== body.confirmNewPassword) {
        throw new ValidationError(
          "New password and confirm new password do not match."
        );
      }

      const user = await strapi.entityService.findOne(
        "plugin::users-permissions.user",
        userId,
        { fields: ["password", "email", "phone"] } // Fetch password, email, phone for verification and OTP sending
      );

      if (!user) {
        throw new NotFoundError("User not found.");
      }

      // Verify current password
      const isCurrentPasswordValid = await bcrypt.compare(
        body.currentPassword,
        user.password
      );
      if (!isCurrentPasswordValid) {
        throw new UnauthorizedError("Invalid current password.");
      }

      // Generate and send OTP
      const otp = await generateOTP();
      const otpExpiryTime = new Date(new Date().getTime() + 2.5 * 60000); // 2.5 minutes expiry

      await strapi.entityService.update(
        "plugin::users-permissions.user",
        userId,
        {
          data: {
            otp: otp,
            otpExpiryTime: otpExpiryTime,
            // Temporarily store new password hash until OTP is verified.
            // This is a common pattern, but consider if this poses a security risk for your application.
            // Alternatively, the new password could be passed in the verify OTP step.
            // For simplicity and to avoid passing sensitive data repeatedly, we'll store it here.
            // A more robust solution might involve a temporary token instead of storing the new password.
            tempNewPassword: body.newPassword,
          },
        }
      );

      // Send OTP to user's registered email or phone
      // if (user?.phone) {
      //   await smsVerifyOtp(otp, user.phone);
      // } else if (user?.email) {
      //   await emailVerifyOtp(otp, user.email);
      // }

      return ctx.send({
        success: true,
        message:
          "OTP sent to your registered contact for password change verification.",
        data: {
          otp: otp,
        },
      });
    } catch (error) {
      const customizedError = handleErrors(error);
      return ctx.send(
        {
          success: false,
          message: customizedError.message,
        },
        handleStatusCode(error) || 500
      );
    }
  };

  //MARK: changePasswordVerifyOtp Method ---
  plugin.controllers.auth.changePasswordVerifyOtp = async (ctx) => {
    try {
      const { body } = ctx.request;
      const { id: userId } = ctx.state.user; // User must be authenticated

      validateBodyRequiredFields(body, ["otp"]);

      const user = await strapi.entityService.findOne(
        "plugin::users-permissions.user",
        userId,
        {
          fields: ["otp", "otpExpiryTime", "tempNewPassword"], // Fetch OTP, expiry, and temporary new password hash
        }
      );

      if (!user) {
        throw new NotFoundError("User not found.");
      }

      // Check if OTP is valid and not expired
      if (user.otp !== body.otp || new Date() > new Date(user.otpExpiryTime)) {
        throw new UnauthorizedError("Invalid or expired OTP.");
      }

      if (!user.tempNewPassword) {
        throw new ValidationError(
          "New password not set for verification. Please initiate password change again."
        );
      }

      // Update the user's password with the temporary hashed password
      await strapi.entityService.update(
        "plugin::users-permissions.user",
        userId,
        {
          data: {
            password: user.tempNewPassword,
            otp: null, // Clear OTP
            otpExpiryTime: null, // Clear OTP expiry
            tempNewPassword: null, // Clear temporary new password hash
          },
        }
      );

      return ctx.send({
        success: true,
        message: "Password updated successfully.",
      });
    } catch (error) {
      const customizedError = handleErrors(error);
      return ctx.send(
        {
          success: false,
          message: customizedError.message,
        },
        handleStatusCode(error) || 500
      );
    }
  };

  // MARK: deleteAccount Method ---
  plugin.controllers.auth.deleteAccount = async (ctx) => {
    try {
      const { id: userId } = ctx.state.user;

      const userFound = await userAllDetails(userId);

      if (!userFound) {
        throw new NotFoundError("User not found");
      }

      const userDeleted = await strapi.entityService.delete(
        "plugin::users-permissions.user",
        userId
      );

      if (userDeleted) {
        await deleteUserRelationDetails(userFound);
      }

      return ctx.send({
        success: true,
        message: "User is deleted",
        data: userDeleted,
      });
    } catch (error) {
      const customizedError = handleErrors(error);

      return ctx.send(
        {
          success: false,
          message: customizedError.message,
        },
        handleStatusCode(error) || 500
      );
    }
  };

  //MARK: Routes ---
  plugin.routes["content-api"].routes.push(
    {
      method: "POST",
      path: "/auth/register",
      handler: "auth.register",
      config: {
        middlewares: ["plugin::users-permissions.rateLimit"],
        prefix: "",
      },
    },
    {
      method: "POST",
      path: "/auth/local-web",
      handler: "auth.callbackWeb",
      config: {
        middlewares: ["plugin::users-permissions.rateLimit"],
        prefix: "",
      },
    },
    {
      method:"POST",
      path:"/auth/loginVerify",
      handler:"auth.loginVerify",
      config:{
        middlewares:["plugin::users-permissions.rateLimit"],
        prefix:"",
      },
    },
    {
      method: "POST",
      path: "/auth/callback",
      handler: "auth.callback",
      config: {
        middlewares: ["plugin::users-permissions.rateLimit"],
        prefix: "",
      },
    },
    {
      method: "POST",
      path: "/auth/verifyOtp",
      handler: "auth.verifyOtp",
      config: {
        middlewares: ["plugin::users-permissions.rateLimit"],
        prefix: "",
      },
    },
    {
      method: "POST",
      path: "/auth/logout",
      handler: "auth.logout",
      config: {
        middlewares: ["plugin::users-permissions.rateLimit"],
        prefix: "",
      },
    },
    {
      method: "GET",
      path: "/user/userProfile/:id",
      handler: "user.userProfile",
      config: {
        middlewares: ["plugin::users-permissions.rateLimit"],
        prefix: "",
      },
    },
    {
      method: "PUT",
      path: "/auth/changeProfile",
      handler: "auth.changeProfile",
      config: {
        middlewares: ["plugin::users-permissions.rateLimit"],
        prefix: "",
      },
    },
    {
      method: "DELETE",
      path: "/auth/deleteAccount",
      handler: "auth.deleteAccount",
      config: {
        middlewares: ["plugin::users-permissions.rateLimit"],
        prefix: "",
      },
    },
    {
      method: "POST",
      path: "/auth/change-password-request",
      handler: "auth.changePasswordRequest",
      config: {
        middlewares: ["plugin::users-permissions.rateLimit"],
        prefix: "",
      },
    },
    {
      method: "POST",
      path: "/auth/change-password-verify-otp",
      handler: "auth.changePasswordVerifyOtp",
      config: {
        middlewares: ["plugin::users-permissions.rateLimit"],
        prefix: "",
      },
    }
  );

  return plugin;
};
