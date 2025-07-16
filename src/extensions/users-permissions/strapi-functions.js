exports.handleErrors = (error) => {
  if (error.name === "ValidationError" && error.details?.errors) {
    const errors = error.details.errors;
    const errorMessages = [];

    if (errors.some((e) => e.path.includes("phone"))) {
      errorMessages.push("Phone number already exists.");
    }

    if (errors.some((e) => e.path.includes("email"))) {
      errorMessages.push("Email address already exists.");
    }

    if (errorMessages.length > 0) {
      error.message = errorMessages.join(" ");
    }
  }

  return error;
};

exports.calculateIsProfileCompleted = (user) => {
  return !!(user?.name && user?.email && user?.phone && user?.userLocationTown);
};

exports.formatUserLocation = (userLocationTown) => {
  if (userLocationTown) {
    return {
      locationDistrict: {
        id: userLocationTown.locationDistrict.id,
        name: userLocationTown.locationDistrict.name,
      },
      locationTown: {
        id: userLocationTown.id,
        name: userLocationTown.name,
        ...(userLocationTown?.latitude && {
          latitude: userLocationTown.latitude,
        }),
        ...(userLocationTown?.longitude && {
          longitude: userLocationTown.longitude,
        }),
      },
    };
  }

  return null;
};

exports.transferUserAds = async (transferPhone) => {
  return await strapi.entityService.findMany("api::ad.ad", {
    publicationState: "live",
    sort: { createdAt: "desc" },
    filters: {
      transferPhone: transferPhone,
    },
    populate: {
      adFavourites: {
        fields: ["id"],
      },
      adChats: {
        fields: ["id"],
      },
    },
  });
};

exports.transferAds = async (adId, userId) => {
  const adTransferred = await strapi.entityService.update("api::ad.ad", adId, {
    data: {
      user: userId,
      transferPhone: null,
    },
  });

  if (adTransferred) {
    if (adTransferred.adChats?.length) {
      await Promise.all(
        adTransferred.adChats.map(async (chat) => {
          return await strapi.entityService.delete(
            "api::ad-chat.ad-chat",
            chat.id
          );
        })
      );
    }
  }
};

exports.transferUserShowrooms = async (transferPhone) => {
  return await strapi.entityService.findMany("api::ad-showroom.ad-showroom", {
    publicationState: "live",
    sort: { createdAt: "desc" },
    filters: {
      transferPhone: transferPhone,
    },
  });
};

exports.transferShowrooms = async (showroomId, userId) => {
  return await strapi.entityService.update(
    "api::ad-showroom.ad-showroom",
    showroomId,
    {
      data: {
        user: userId,
        transferPhone: null,
      },
    }
  );
};

exports.userAllDetails = async (userId) => {
  const populate = {
    profileImage: {
      fields: ["id"],
    },
    ads: {
      fields: ["id"],
      populate: {
        images: {
          fields: ["id"],
        },
        adFavourites: {
          fields: ["id"],
        },
        adChats: {
          fields: ["id"],
        },
      },
    },
    adShowrooms: {
      fields: ["id"],
      populate: {
        images: {
          fields: ["id"],
        },
        logo: {
          fields: ["id"],
        },
        adShowroomOperators: {
          fields: ["id"],
          populate: {
            adShowrooms: true,
          },
        },
        adShowroomRatings: {
          fields: ["id"],
        },
      },
    },
    adSubscriptions: {
      fields: ["id"],
    },
    adBoosts: {
      fields: ["id"],
    },
  };

  const userFound = await strapi.entityService.findOne(
    "plugin::users-permissions.user",
    userId,
    {
      fields: ["id"],
      populate: {
        ...populate,
      },
    }
  );

  return userFound;
};

exports.deleteAds = async (ad) => {
  const adDeleted = await strapi.entityService.delete("api::ad.ad", ad.id);

  if (adDeleted) {
    if (ad.images?.length) {
      await Promise.all(
        ad.images.map(async (image) => {
          await strapi.entityService.delete("plugin::upload.file", image.id);

          return await strapi.plugins.upload.services.upload.remove(image);
        })
      );
    }

    if (ad.adChats?.length) {
      await Promise.all(
        ad.adChats.map(async (chat) => {
          return await strapi.entityService.delete(
            "api::ad-chat.ad-chat",
            chat.id
          );
        })
      );
    }
  }
};

exports.deleteUserRelationDetails = async (user) => {
  if (user.profileImage) {
    await strapi.entityService.delete(
      "plugin::upload.file",
      user.profileImage.id
    );

    return await strapi.plugins.upload.services.upload.remove(
      user.profileImage
    );
  }

  if (user.ads?.length) {
    await Promise.all(user.ads.map((ad) => exports.deleteAds(ad)));
  }

  if (user.adShowrooms?.length) {
    await Promise.all(
      user.adShowrooms.map(async (showroom) => {
        await strapi.entityService.delete(
          "api::ad-showroom.ad-showroom",
          showroom.id
        );

        if (showroom?.images?.length) {
          await Promise.all(
            showroom.images.map(async (image) => {
              await strapi.entityService.delete(
                "plugin::upload.file",
                image.id
              );

              return await strapi.plugins["upload"].services.upload.remove(
                image
              );
            })
          );
        }

        if (showroom?.logo) {
          await strapi.entityService.delete(
            "plugin::upload.file",
            showroom.logo.id
          );

          return await strapi.plugins.upload.services.upload.remove(
            showroom.logo
          );
        }

        if (showroom?.adShowroomOperators?.length) {
          await Promise.all(
            showroom.adShowroomOperators.map(async (operator) => {
              if (operator?.adShowrooms?.length === 1) {
                return await strapi.entityService.delete(
                  "api::ad-showroo-operato.ad-showroo-operato",
                  operator.id
                );
              }
            })
          );
        }

        if (showroom?.adShowroomRatings?.length) {
          await Promise.all(
            showroom.adShowroomRatings.map(async (rating) => {
              return await strapi.entityService.delete(
                "api::ad-showroo-rating.ad-showroo-rating",
                rating.id
              );
            })
          );
        }
      })
    );
  }

  if (user.adSubscriptions?.length) {
    await Promise.all(
      user.adSubscriptions.map(async (subscription) => {
        return await strapi.entityService.delete(
          "api::ad-subscription.ad-subscription",
          subscription.id
        );
      })
    );
  }

  if (user.adBoosts?.length) {
    await Promise.all(
      user.adBoosts.map(async (boost) => {
        return await strapi.entityService.delete(
          "api::ad-boost.ad-boost",
          boost.id
        );
      })
    );
  }
};
