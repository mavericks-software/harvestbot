import { readFileSync } from 'fs';
import sgMail from '@sendgrid/mail';

export default (config) => {
  // TODO: error handling
  const sendEmail = async (email, subject, message, filePaths) => {
    sgMail.setApiKey(config.sendGridApiKey);
    const attachments = filePaths.map((path) => {
      const excelFile = readFileSync(path);
      return {
        content: Buffer.from(excelFile).toString('base64'),
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        filename: path.substring(path.lastIndexOf('/') + 1),
        disposition: 'attachment',
      };
    });
    const msg = {
      to: email,
      from: `noreply@${config.emailDomains[0]}`,
      subject,
      text: message,
      attachments,
    };
    return sgMail.send(msg);
  };

  return {
    sendEmail,
  };
};
