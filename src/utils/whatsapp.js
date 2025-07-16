const axios = require("axios");

exports.sendWhatsappMessage = async (otp, phone) => {
  try {
    const req = {
      phone: phone,
      message: `Your OTP from Esymate is ${otp}. It is valid for 2 minutes. Do not share this code with anyone.`,
    };

    await axios.post("https://zendbird.com/api/messages/send", req, {
      headers: {
        "X-API-KEY": process.env.ZENDBIRD_API_KEY,
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    throw error;
  }
};
