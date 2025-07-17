// From strapi-server.js (Simplified Version)

const utils = require("@strapi/utils");
const { ValidationError, NotFoundError } = utils.errors;

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
  userAllDetails,
  deleteUserRelationDetails,
} = require("./strapi-functions.js");

module.exports = (plugin) => {
  //MARK: Register Method ---
  plugin.controllers.auth.register = async (ctx) => {
    try {
      const { body, files } = ctx.request;

      validateBodyRequiredFields(body, ["name", "phone", "email"]);

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

      if (!isPhoneValid(body?.phone)) {
        throw new ValidationError("Invalid phone number");
      }

      const otp = await generateOTP();
      const otpExpiryTime = new Date(new Date().getTime() + 2.5 * 60000); // 2.5 minutes expiry

      const userCreated = await strapi.entityService.create(
        "plugin::users-permissions.user",
        {
          data: {
            name: body?.name,
            phone: body?.phone,
            email: body?.email,
            role: role.id,
            otp: otp,
            otpExpiryTime: otpExpiryTime,
            publishedAt: new Date().getTime(),
          },
          ...(files?.profileImage && {
            files: {
              profileImage: {
                ...files.profileImage,
                type: changeFileMimeType(files.profileImage),
              },
            },
          }),
          // fields: ["name", "phone", "email", "createdAt", "updatedAt"],
          populate: {
            profileImage: {
              fields: ["url", "formats"],
            },
          },
        }
      );

      if (userCreated?.phone) {
        await smsVerifyOtp(otp, userCreated.phone);
      } else if (userCreated?.email) {
        await emailVerifyOtp(otp, userCreated.email);
      }

      // Removed: transferToUserAds and transferToUserShowrooms logic

      return ctx.send({
        success: true,
        message:
          "User registered successfully. OTP has been sent for verification.",
        data: {
          user: {
            id: userCreated.id,
            name: userCreated.name,
            email: userCreated.email,
            phone: userCreated.phone,
            otp: userCreated.otp,
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

  // MARK: callbackWeb Method ---
  plugin.controllers.auth.callbackWeb = async (ctx) => {
    try {
      const { body } = ctx.request;

      validateBodyRequiredFields(body, ["identifier"]);

      const [user] = await strapi.entityService.findMany(
        "plugin::users-permissions.user",
        {
          filters: {
            $or: [
              {
                email: body.identifier,
              },
              {
                phone: body.identifier,
              },
            ],
          },
        }
      );

      if (!user) {
        throw new NotFoundError("User is not registered");
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
          // fields: ["name", "email", "phone", "createdAt", "updatedAt"],
          populate: {},
        }
      );

      if (body.identifier === user?.phone) {
        await smsVerifyOtp(otp, user.phone);
      } else if (body.identifier === user?.email) {
        await emailVerifyOtp(otp, user.email);
      }

      return ctx.send({
        success: true,
        message: "Otp has been sent",
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

  //MARK:callback Method ---
  plugin.controllers.auth.callback = async (ctx) => {
    try {
      const { body } = ctx.request;

      validateBodyRequiredFields(body, ["identifier"]);

      let user = await strapi.entityService
        .findMany("plugin::users-permissions.user", {
          filters: {
            $or: [{ email: body.identifier }, { phone: body.identifier }],
          },
        })
        .then((users) => users[0]);

      const otp = await generateOTP();
      const otpExpiryTime = new Date(new Date().getTime() + 2.5 * 60000);

      if (user) {
        user = await strapi.entityService.update(
          "plugin::users-permissions.user",
          user.id,
          {
            data: { otp: otp, otpExpiryTime: otpExpiryTime },
            // fields: ["name", "email", "phone", "createdAt", "updatedAt"],
            populate: {},
          }
        );
        if (body.identifier === user?.phone) {
          await smsVerifyOtp(otp, user.phone);
        } else if (body.identifier === user?.email) {
          // await emailVerifyOtp(otp, user.email);
        }

        return ctx.send({
          success: true,
          message: "OTP has been sent to existing user",
          data: {
            ...user,
          },
        });
      } else {
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

        let value = null;
        if (body.identifier.includes("@")) {
          value = { email: body.identifier };
        } else {
          value = { phone: body.identifier };
          if (!isPhoneValid(body.identifier)) {
            throw new ValidationError("Invalid phone number");
          }
        }

        if (!value) {
          throw new ValidationError("Invalid identifier");
        }

        user = await strapi.entityService.create(
          "plugin::users-permissions.user",
          {
            data: {
              ...value,
              role: role.id,
              otp: otp,
              otpExpiryTime: otpExpiryTime,
              publishedAt: new Date().getTime(),
            },
            fields: ["name", "email", "phone", "createdAt", "updatedAt"],
            populate: {},
          }
        );

        if (user?.phone) {
          // Removed: transferToUserAds and transferToUserShowrooms logic
          await smsVerifyOtp(otp, user.phone);
        } else if (user?.email) {
          // await emailVerifyOtp(otp, user.email);
        }

        return ctx.send({
          success: true,
          message: "User is created and OTP has been sent for verification",
          data: {
            ...user,
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
  //MARK:otp verification
  // --- verifyOtp Method ---
  plugin.controllers.auth.verifyOtp = async (ctx) => {
    try {
      const { body } = ctx.request;

      validateBodyRequiredFields(body, ["otp"]);

      const [user] = await strapi.entityService.findMany(
        "plugin::users-permissions.user",
        {
          sort: { updatedAt: "desc" },
          filters: {
            otp: body?.otp,
            otpExpiryTime: {
              $gt: new Date(),
            },
          },
          fields: ["name", "email", "phone", "createdAt", "updatedAt"],
          populate: {
            profileImage: {
              fields: ["url", "formats"],
            },
          },
        }
      );

      if (!user) {
        throw new NotFoundError("Invalid or expired OTP");
      }

      await strapi.entityService.update(
        "plugin::users-permissions.user",
        user.id,
        {
          data: {
            otp: null,
            otpExpiryTime: null,
          },
        }
      );

      return ctx.send({
        success: true,
        message: "User is verified",
        data: {
          jwt: getService("jwt").issue({ id: user.id }),
          user: {
            ...user,
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

  //MARK: me Method
  plugin.controllers.user.me = async (ctx) => {
    try {
      const { id: userId } = ctx.state.user;

      const userFound = await strapi.entityService.findOne(
        "plugin::users-permissions.user",
        userId,
        {
          fields: ["name", "email", "phone", "createdAt", "updatedAt"],
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

  //MARK: userProfile Method
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
          fields: ["name", "email", "phone", "createdAt", "updatedAt"],
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

  //MARK:changeProfile Method ---
  plugin.controllers.auth.changeProfile = async (ctx) => {
    try {
      const { body, files } = ctx.request;
      const { id: userId } = ctx.state.user;

      const userFound = await strapi.entityService.findOne(
        "plugin::users-permissions.user",
        userId,
        {
          fields: ["id"],
          populate: {
            profileImage: {
              fields: ["url", "formats"],
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

      const userUpdated = await strapi.entityService.update(
        "plugin::users-permissions.user",
        userId,
        {
          data: {
            ...(body?.name && {
              name: body?.name,
            }),
            ...(body?.email && {
              email: body?.email?.toLowerCase(),
            }),
            ...(body?.phone && {
              phone: body?.phone,
            }),
          },
          ...(files?.profileImage && {
            files: {
              profileImage: {
                ...files.profileImage,
                type: changeFileMimeType(files.profileImage),
              },
            },
          }),
          fields: ["name", "email", "phone", "createdAt", "updatedAt"],
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
        message: "User is updated",
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

// MARK: deleteAccount Method ---

  // plugin.controllers.auth.deleteAccount = async (ctx) => {
  //   try {
  //     const { id: userId } = ctx.state.user;

  //     const userFound = await userAllDetails(userId); // This fetches full details for relation deletion

  //     if (!userFound) {
  //       throw new NotFoundError("User not found");
  //     }

  //     // Delete related data first
  //     await deleteUserRelationDetails(userFound);

  //     // Then delete the user itself
  //     const userDeleted = await strapi.entityService.delete(
  //       "plugin::users-permissions.user",
  //       userId,
  //       {
  //         // Specify the fields you want to get back for the response
  //         fields: ["name", "email", "phone", "createdAt", "updatedAt"],
  //         populate: {
  //           profileImage: {
  //             fields: ["url", "formats"], // Populate profileImage if it was on the user
  //           },
  //         },
  //       }
  //     );

  //     // Format the response data to match your 'me' function's output
  //     // Note: If profileImage was successfully deleted along with the user,
  //     // it will be null here, reflecting the actual state.
  //     return ctx.send({
  //       success: true,
  //       message: "User is deleted successfully", // More explicit message
  //       data: {
  //         id: userDeleted.id,
  //         name: userDeleted.name,
  //         email: userDeleted.email,
  //         phone: userDeleted.phone,
  //         createdAt: userDeleted.createdAt,
  //         updatedAt: userDeleted.updatedAt,
  //         profileImage: userDeleted.profileImage || null, // Ensure it's null if not present
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
      path: "/auth/local-web",
      handler: "auth.callbackWeb",
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
    }
  );

  return plugin;
};

//MARK:user create
// module.exports = (plugin) => {
//   plugin.controllers.auth.register = async (ctx) => {
//     try {
//       const { body, files } = ctx.request;

//       // Validate required fields in the request body
//       // Only 'name', 'phone', 'email' are now required
//       validateBodyRequiredFields(body, ["name", "phone", "email"]);

//       // Retrieve advanced settings from the users-permissions plugin store
//       const pluginStore = await strapi.store({
//         type: "plugin",
//         name: "users-permissions",
//       });
//       const settings = await pluginStore.get({ key: "advanced" });

//       // Find the default role to assign to the new user
//       const role = await strapi
//         .query("plugin::users-permissions.role")
//         .findOne({ where: { type: settings.default_role } });

//       if (!role) {
//         throw new NotFoundError("No default role found");
//       }

//       // Validate the phone number format
//       // This function would be in "../../utils/phone.js"
//       if (!isPhoneValid(body?.phone)) {
//         throw new ValidationError("Invalid phone number");
//       }

//       // Create the new user entity
//       const userCreated = await strapi.entityService.create(
//         "plugin::users-permissions.user", // Target model
//         {
//           data: {
//             name: body?.name,
//             phone: body?.phone,
//             email: body?.email,
//             // userLocationTown removed
//             role: role.id, // Assign the default role
//             publishedAt: new Date().getTime(), // Set publication time
//           },
//           // Handle profile image upload if present
//           ...(files?.profileImage && {
//             files: {
//               profileImage: {
//                 ...files.profileImage,
//                 // Change file MIME type if necessary (function in "../../utils/media.js")
//                 type: changeFileMimeType(files.profileImage),
//               },
//             },
//           }),
//           // Specify fields to return in the response
//           // fields: ["name", "phone", "email", "createdAt", "updatedAt"],
//           // Populate related data for the response (profileImage kept)
//           populate: {
//             profileImage: {
//               fields: ["url", "formats"],
//             },
//           },
//         }
//       );

//       // isProfileCompleted calculation removed
//       // transferToUserAds logic removed
//       // transferToUserShowrooms logic removed

//       // Send the successful response
//       return ctx.send({
//         success: true,
//         message: "User is created",
//         data: {
//           jwt: getService("jwt").issue({ id: userCreated.id }), // Issue a JWT token for the new user
//           userCreated: {
//             ...userCreated,
//             // isProfileCompleted removed from response
//           },
//         },
//       });
//     } catch (error) {
//       // Handle and customize any errors that occur
//       // These functions are from "./strapi-functions.js" and "../../utils/statusCode.js"
//       const customizedError = handleErrors(error);
//       return ctx.send(
//         {
//           success: false,
//           message: customizedError.message,
//         },
//         handleStatusCode(error) || 500 // Determine appropriate HTTP status code
//       );
//     }
//   };

//   // ... (other controllers remain unchanged)

//   // This part defines the POST route for registration
//   plugin.routes["content-api"].routes.push(
//     {
//       method: "POST",
//       path: "/auth/register", // The endpoint for registration
//       handler: "auth.register", // Maps to the controller defined above
//       config: {
//         middlewares: ["plugin::users-permissions.rateLimit"], // Apply rate limiting middleware
//         prefix: "", // No additional prefix for this route
//       },
//     }
//     // ... (other routes remain unchanged)
//   );

//   return plugin;
// };
