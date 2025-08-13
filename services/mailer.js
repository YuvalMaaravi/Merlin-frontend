/**
 * Mailer Service
 * Sends notification emails using SendGrid.
 */
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Send email about new followings
async function sendEmail(to, igUser, newUsers) {
  const list = newUsers.join(', ');
  const msg = {
    to,
    from: process.env.SENDER_EMAIL,
    subject: `New followings by @${igUser}`,
    text: `@${igUser} started following: ${list}`,
    html: `<p><strong>@${igUser}</strong> started following:</p><p>${list}</p>`,
  };
  await sgMail.send(msg);
}

module.exports = { sendEmail };
