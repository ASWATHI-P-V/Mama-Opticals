const axios = require("axios");
const phoneNumberLib = require("google-libphonenumber");

const phoneUtil = phoneNumberLib.PhoneNumberUtil.getInstance();

exports.isPhoneValid = (phone) => {
  try {
    return phoneUtil.isValidNumber(phoneUtil.parseAndKeepRawInput(phone));
  } catch (error) {
    return false;
  }
};

exports.smsVerifyOtp = async (otp, phone) => {
  try {
    const sanitizedPhone = phone.startsWith("+") ? phone.slice(1) : phone;

    const basicAuthToken = Buffer.from(
      `${process.env.SMS_COUNTRY_AUTH_KEY}:${process.env.SMS_COUNTRY_AUTH_TOKEN}`
    ).toString("base64");

    await axios.post(
      `https://restapi.smscountry.com/v0.1/Accounts/${process.env.SMS_COUNTRY_AUTH_KEY}/SMSes/`,
      {
        Text: `${otp} is your account verification code. Do not share this code with anyone.The code is valid for 2 minutes. Regards LAILA VENTURES PRIVATE LIMITED`,
        Number: sanitizedPhone,
        SenderId: `${process.env.SMS_COUNTRY_SENDER_ID}`,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${basicAuthToken}`,
        },
      }
    );
  } catch (error) {
    console.error(`Error sending SMS: ${error}`);
  }
};
