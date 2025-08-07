const app = "mama";

const toTitleCase = (str) =>
  str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();

exports.emailVerifyOtp = async (otp, email) => {
  const emailBody = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5;">
      <h2 style="color: #4CAF50;">Welcome to ${toTitleCase(app)} App!</h2>
      <p>Hi there,</p>
      <p>We received a request to verify your email address. Please use the following OTP code to verify your account:</p>
      <h3 style="color: #FF5733;">${otp}</h3>
      <p>This OTP is valid for the next 2 minutes. If you did not request this, please ignore this email.</p>
      <p>Thank you!</p>
      <p>Best regards,<br>${toTitleCase(app)} App</p>
    </div>
  `;

  const emailToSend = {
    to: email,
    from: `${toTitleCase(app)} <${process.env.SMTP_USERNAME}>`,
    replyTo: process.env.SMTP_USERNAME,
    subject: "Verify Your OTP for Verification",
    text: `${otp} is the otp for your ${app} account`,
    html: emailBody,
  };

  await strapi.plugin("email").service("email").send(emailToSend);
};
