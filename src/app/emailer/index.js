import { readFileSync } from 'fs';
import sgMail from '@sendgrid/mail';

export default (config) => {
  // TODO: error handling
  const sendEmail = async (email, subject, message, filePaths) => {
    sgMail.setApiKey(config.sendGridApiKey);
    const attachments = filePaths
      ? filePaths.map((path) => {
        const attachment = readFileSync(path);
        return {
          content: Buffer.from(attachment).toString('base64'),
          type: path.endsWith('xlsx')
            ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            : 'application/pdf',
          filename: path.substring(path.lastIndexOf('/') + 1),
          disposition: 'attachment',
        };
      }) : undefined;
    const msg = {
      to: email,
      from: 'HarvestBot <services@mavericks.fi>',
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
