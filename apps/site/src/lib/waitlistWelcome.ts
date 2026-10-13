import type { Mail } from './newsletterMail';
import { unsubscribeToken } from './unsubscribe';

// The waitlist welcome email, written by Chris and Taymar (12 Oct 2026).
// Kept as they wrote it; only the logo and photo point at files hosted on
// the site (public/email/), since Gmail drops embedded images and SVG, and
// the footer has an unsubscribe link.
export const WELCOME_SUBJECT = 'Welcome to the Chipperly waitlist';

const html = (SITE: string, unsubscribe: string) => `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>Welcome to the Chipperly waitlist</title>
<link href="https://fonts.googleapis.com/css2?family=Alegreya:wght@500;700&family=Alegreya+Sans:wght@400;500;700&display=swap" rel="stylesheet">
<style>
  body { margin:0; padding:0; background:#f2ede6; }
  a { color:#1f6f6f; }
  @media only screen and (max-width:620px) {
    .container { width:100% !important; }
    .px { padding-left:24px !important; padding-right:24px !important; }
    .sig-col { display:block !important; width:100% !important; padding:0 0 20px 0 !important; }
    .h1 { font-size:34px !important; }
  }
</style>
</head>
<body style="margin:0; padding:0; background:#f2ede6;">
<div style="display:none; max-height:0; overflow:hidden;">Thank you for joining the Chipperly waitlist, here's how you can help us launch.</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f2ede6;">
<tr><td align="center" style="padding:32px 12px;">

  <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px; max-width:600px;">

    <!-- Header -->
    <tr>
      <td class="px" style="background:#faf7f2; border:1px solid #e6dfd3; border-radius:18px 18px 0 0; padding:20px 36px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td valign="middle" style="width:40px;">
            <img src="${SITE}/email/mark-72.png" width="36" height="36" alt="" style="display:block; border:0;">
          </td>
          <td valign="middle" style="font-family:'Alegreya', Georgia, serif; font-size:28px; font-weight:700; color:#1e2b2b; padding-left:8px;">
            Chipperly<sup style="font-size:12px;">™</sup>
          </td>
        </tr></table>
      </td>
    </tr>

    
    <tr>
      <td style="border-left:1px solid #e6dfd3; border-right:1px solid #e6dfd3; padding:0; line-height:0; font-size:0;">
        <img src="${SITE}/email/taymar-benny.jpg" width="600" alt="Taymar and her son Benny smiling cheek to cheek" style="display:block; width:100%; max-width:600px; height:auto; border:0;">
      </td>
    </tr>

    <!-- Body card -->
    <tr>
      <td class="px" style="background:#ffffff; border:1px solid #e6dfd3; border-top:0; border-radius:0 0 18px 18px; padding:40px 48px 44px; font-family:'Alegreya Sans', 'Helvetica Neue', Arial, sans-serif; font-size:17px; line-height:1.65; color:#4a5555;">

        <p style="margin:0 0 10px; font-size:13px; font-weight:700; letter-spacing:.12em; text-transform:uppercase; color:#1f6f6f;">Welcome to the waitlist</p>
        <h1 class="h1" style="margin:0 0 22px; font-family:'Alegreya', Georgia, serif; font-size:40px; line-height:1.1; font-weight:700; color:#1e2b2b;">Hello!</h1>

        <p style="margin:0 0 18px;">Thank you for signing up for the Chipperly App waitlist!</p>

        <p style="margin:0 0 18px;">As the founder of Chipperly I built this app for my son Benny, and I use it with him every day. It is a life transforming game changer, and I can’t wait to share it with the world!</p>

        <p style="margin:0 0 18px;">We are so happy to have you on board with us as we get ready to launch. We want to change the world for neurodivergent people, and the people who love and support them. To make it happen, we need people like you to help us make our launch a success!</p>

        <!-- Beta callout -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 26px;">
          <tr><td style="background:#f2ede6; border-radius:14px; padding:24px 26px;">
            <p style="margin:0 0 8px; font-size:13px; font-weight:700; letter-spacing:.12em; text-transform:uppercase; color:#1f6f6f;">Beta testers wanted</p>
            <p style="margin:0 0 18px; color:#3d4848;">If you haven’t signed up for a beta version of the app and you have the time and patience to use an imperfect product and give us feedback, please <a href="https://app.chipperlyapp.com" style="color:#1f6f6f; font-weight:700;">sign up here</a>.</p>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
              <td style="background:#1f6f6f; border-radius:999px;">
                <a href="https://app.chipperlyapp.com" style="display:inline-block; padding:13px 28px; font-family:'Alegreya Sans', 'Helvetica Neue', Arial, sans-serif; font-size:16px; font-weight:700; color:#ffffff; text-decoration:none;">Join the beta</a>
              </td>
            </tr></table>
          </td></tr>
        </table>

        <p style="margin:0 0 18px;">Along the way we’ll ask you to share everything that you find frustrating or confusing about our beta product. Please don’t worry about hurting our feelings! We know that we have work to do, and we appreciate hearing about what isn’t working because it helps us make it better.</p>

        <p style="margin:0 0 18px;">If you know of anyone who needs something like Chipperly to help them in their daily life, please help us spread the word.</p>

        <p style="margin:0 0 30px;">Feel free to text customer support at <a href="sms:+15202766861" style="color:#1f6f6f; font-weight:700; text-decoration:none;">520-276-6861</a> with any suggestions or questions. Thank you so much for being a part of our success!</p>

        <p style="margin:0 0 22px;">Sincerely,</p>

        <!-- Signatures -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #e6dfd3;">
          <tr>
            <td class="sig-col" valign="top" width="50%" style="padding:22px 12px 0 0; font-size:15px; line-height:1.55; color:#4a5555;">
              <div style="font-family:'Alegreya', Georgia, serif; font-size:20px; font-weight:700; color:#1e2b2b;">Taymar Pixleysmith</div>
              <div style="color:#1f6f6f; font-weight:500;">Founder &amp; CEO</div>
              <a href="mailto:taymar@chipperlyapp.com" style="color:#4a5555; text-decoration:none;">taymar@chipperlyapp.com</a>
            </td>
            <td class="sig-col" valign="top" width="50%" style="padding:22px 0 0 12px; font-size:15px; line-height:1.55; color:#4a5555;">
              <div style="font-family:'Alegreya', Georgia, serif; font-size:20px; font-weight:700; color:#1e2b2b;">Chris Thurston</div>
              <div style="color:#1f6f6f; font-weight:500;">Co-Founder &amp; Customer Support</div>
              <a href="mailto:chris@chipperlyapp.com" style="color:#4a5555; text-decoration:none;">chris@chipperlyapp.com</a><br>
              <a href="tel:+15202766861" style="color:#4a5555; text-decoration:none;">520-276-6861</a>
            </td>
          </tr>
        </table>

      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td align="center" style="padding:26px 24px 8px; font-family:'Alegreya Sans', 'Helvetica Neue', Arial, sans-serif; font-size:13px; line-height:1.6; color:#7a8282;">
        <span style="font-family:'Alegreya', Georgia, serif; font-size:15px; color:#1f6f6f; font-weight:700;">Have a Chipperly Day!</span>
        <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:16px auto 18px;">
          <tr><td colspan="5" align="center" style="padding-bottom:8px; font-family:'Alegreya Sans', 'Helvetica Neue', Arial, sans-serif; font-size:12px; font-weight:700; letter-spacing:.12em; text-transform:uppercase; color:#1f6f6f;">Follow us!</td></tr>
          <tr>
            <td style="background:#ffffff; border:1px solid #e6dfd3; border-radius:999px;"><a href="https://www.facebook.com/share/14rvu2wkWi5/?mibextid=wwXIfr" style="display:inline-block; padding:7px 16px; font-family:'Alegreya Sans', 'Helvetica Neue', Arial, sans-serif; font-size:14px; font-weight:700; color:#1f6f6f; text-decoration:none;">Facebook</a></td>
            <td style="width:8px;"></td>
            <td style="background:#ffffff; border:1px solid #e6dfd3; border-radius:999px;"><a href="https://instagram.com/chipperlyapp" style="display:inline-block; padding:7px 16px; font-family:'Alegreya Sans', 'Helvetica Neue', Arial, sans-serif; font-size:14px; font-weight:700; color:#1f6f6f; text-decoration:none;">Instagram</a></td>
            <td style="width:8px;"></td>
            <td style="background:#ffffff; border:1px solid #e6dfd3; border-radius:999px;"><a href="https://open.substack.com/pub/chipperlyapp" style="display:inline-block; padding:7px 16px; font-family:'Alegreya Sans', 'Helvetica Neue', Arial, sans-serif; font-size:14px; font-weight:700; color:#1f6f6f; text-decoration:none;">Substack</a></td>
          </tr>
        </table>
        You’re receiving this because you joined the Chipperly waitlist. <a href="${unsubscribe}" style="color:#7a8282;">Unsubscribe</a>
      </td>
    </tr>

  </table>

</td></tr>
</table>
</body>
</html>
`;

const text = (unsubscribe: string) => `Hello!

Thank you for signing up for the Chipperly App waitlist!

As the founder of Chipperly I built this app for my son Benny, and I use it with him every day. It is a life transforming game changer, and I can’t wait to share it with the world!

We are so happy to have you on board with us as we get ready to launch. We want to change the world for neurodivergent people, and the people who love and support them. To make it happen, we need people like you to help us make our launch a success!

BETA TESTERS WANTED
If you haven’t signed up for a beta version of the app and you have the time and patience to use an imperfect product and give us feedback, please sign up here: https://app.chipperlyapp.com

Along the way we’ll ask you to share everything that you find frustrating or confusing about our beta product. Please don’t worry about hurting our feelings! We know that we have work to do, and we appreciate hearing about what isn’t working because it helps us make it better.

If you know of anyone who needs something like Chipperly to help them in their daily life, please help us spread the word.

Feel free to text customer support at 520-276-6861 with any suggestions or questions. Thank you so much for being a part of our success!

Sincerely,

Taymar Pixleysmith, Founder & CEO, taymar@chipperlyapp.com
Chris Thurston, Co-Founder & Customer Support, chris@chipperlyapp.com, 520-276-6861

Have a Chipperly Day!
Facebook: https://www.facebook.com/share/14rvu2wkWi5/?mibextid=wwXIfr
Instagram: https://instagram.com/chipperlyapp
Substack: https://open.substack.com/pub/chipperlyapp

You’re receiving this because you joined the Chipperly waitlist. Unsubscribe: ${unsubscribe}`;

/** One sign-up's welcome email, with their own signed unsubscribe link and the one-click List-Unsubscribe headers. */
export async function welcomeMail(to: string, secret: string, siteUrl: string): Promise<Mail> {
  const unsubscribe = `${siteUrl}/unsubscribe?t=${await unsubscribeToken(to, secret)}`;
  return {
    to,
    subject: WELCOME_SUBJECT,
    html: html(siteUrl, unsubscribe),
    text: text(unsubscribe),
    headers: { 'List-Unsubscribe': `<${unsubscribe}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  };
}
