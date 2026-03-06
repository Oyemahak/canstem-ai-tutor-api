// src/utils/mailer.js
const nodemailer = require("nodemailer");

function getTransport() {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !port || !user || !pass) return null;

  return nodemailer.createTransport({
    host,
    port: Number(port),
    secure: Number(port) === 465,
    auth: { user, pass },
  });
}

async function sendWelcomeEmail({ to, role, tempPassword, portalUrl }) {
  const transport = getTransport();
  if (!transport) return; // no-op safely

  const subject = "Your CanSTEM AI Tutor Portal Access";
  const text =
    `Hello,\n\n` +
    `Your CanSTEM AI Tutor portal access is ready.\n\n` +
    `Role: ${role}\n` +
    `Email: ${to}\n` +
    `Temporary Password: ${tempPassword}\n\n` +
    `Login here: ${portalUrl}\n\n` +
    `© 2025 CanSTEM Education Inc. All Rights Reserved.\n` +
    `Contact us: https://canstemeducation.com/contact-us/\n`;

  await transport.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    text,
  });
}

module.exports = { sendWelcomeEmail };