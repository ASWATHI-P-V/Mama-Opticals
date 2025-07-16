module.exports = [
  "strapi::logger",
  "strapi::errors",
  {
    name: "strapi::security",
    config: {
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          "connect-src": ["'self'", "https:"],
          "script-src": ["https://cdnjs.cloudflare.com"],
          "media-src": [
            "'self'",
            "data:",
            "blob:",
            "https://cdnjs.cloudflare.com",
          ],
          "img-src": [
            "'self'",
            "data:",
            "blob:",
            "https://cdnjs.cloudflare.com",
          ],
        },
      },
    },
  },
  "strapi::cors",
  "strapi::poweredBy",
  "strapi::query",
  "strapi::body",
  "strapi::session",
  "strapi::favicon",
  "strapi::public",
];
