import type { LegalContent } from "./types";

const UPDATED = "2026-09-20";

/**
 * Written from what the code actually does, so the descriptions of data,
 * cookies and billing are accurate. It has not been reviewed by a lawyer — see
 * the notice component that says so on every page until LEGAL_REVIEWED is set.
 */
export const legalEn: LegalContent = {
  terms: {
    title: "Terms of Service",
    intro: "The agreement between you and us when you rent a game server.",
    updated: UPDATED,
    sections: [
      {
        heading: "1. Who we are",
        body: [
          "These terms apply to the game server hosting sold through this website. Our company details, registration number and contact address are in the footer of every page.",
          "By creating an account or placing an order you accept these terms. If you do not accept them, do not place an order.",
        ],
      },
      {
        heading: "2. Eligibility",
        body: [
          "You must be at least 16 years old to create an account, and you must have the legal capacity to enter into a contract. If you are under 18, you confirm that a parent or guardian agrees to these terms on your behalf.",
          "You are responsible for everything that happens under your account, including keeping your password to yourself.",
        ],
      },
      {
        heading: "3. What we provide",
        body: [
          "We rent you a game server with the resources you selected: memory, virtual CPU and storage, in the region you chose. You manage it through the dashboard.",
          "Features shown in the dashboard depend on the game and on the infrastructure in use. Where a feature is not available for your server, it is not shown.",
        ],
      },
      {
        heading: "4. Payment and renewal",
        body: [
          "Prices are shown before you order and include everything we charge for that period. Payment is taken when you order and, for a subscription, at the start of each new period.",
          "A subscription renews automatically until you cancel it. You can cancel at any time from the dashboard; your server keeps running until the end of the period you already paid for.",
          "If a renewal payment fails, we retry it. Your server is suspended after 3 days unpaid and deleted after 14 days unpaid, along with its data. We email you before each of those steps.",
        ],
      },
      {
        heading: "5. Changing your plan",
        body: [
          "You can change your server's resources at any time. An increase is charged immediately, pro-rated for the days left in the period. A decrease creates a credit which is used against your next renewal rather than refunded in cash.",
        ],
      },
      {
        heading: "6. Acceptable use",
        body: ["You may not use a server we provide to:"],
        bullets: [
          "break any applicable law, or help someone else do so",
          "send spam, or run phishing or malware distribution",
          "attack, scan or disrupt other networks or systems",
          "mine cryptocurrency, or run workloads unrelated to game hosting",
          "host content that infringes someone else's copyright or trademark",
          "harass, threaten or endanger other people",
        ],
      },
      {
        heading: "7. Suspension and termination",
        body: [
          "We may suspend a server immediately if it is being used in breach of section 6, if it endangers our infrastructure or other customers, or if we are required to by law or by a competent authority.",
          "Where the circumstances allow it, we tell you why and give you a chance to put things right. If a suspension is our mistake, we lift it and credit the time lost.",
          "You can close your account at any time. Closing it ends your subscriptions at the end of their paid periods.",
        ],
      },
      {
        heading: "8. Your content and your data",
        body: [
          "Whatever you put on your server — worlds, configuration, plugins, player data — stays yours. We access it only to operate the service, to fix a fault, or when we are legally required to.",
          "You are responsible for keeping your own copies of anything you cannot afford to lose. A deleted server's data cannot be recovered.",
        ],
      },
      {
        heading: "9. Availability",
        body: [
          "We work to keep the service running, but we do not currently offer a contractual uptime guarantee. Planned maintenance is announced in advance where possible.",
          "Nothing in this section limits your statutory rights as a consumer.",
        ],
      },
      {
        heading: "10. Liability",
        body: [
          "We are liable for damage we cause by failing to meet our obligations under these terms, up to the amount you paid us in the 12 months before the event.",
          "We do not limit or exclude liability for death or personal injury caused by negligence, for fraud, or for anything else that cannot be limited by law. As a consumer you always keep the rights the law gives you.",
        ],
      },
      {
        heading: "11. Changes to these terms",
        body: [
          "If we change these terms in a way that affects you, we tell you by email at least 30 days beforehand. If you do not accept the change, you may cancel before it takes effect and we refund the unused part of your period.",
        ],
      },
      {
        heading: "12. Law and disputes",
        body: [
          "Romanian law applies, and the courts of Romania have jurisdiction. As a consumer, you may also bring a claim in the courts of the country where you live.",
          "Before going to court you may use out-of-court dispute resolution: the ANPC and the European Commission's online dispute resolution platform are linked in the footer. Please write to us first — most things are quicker to fix directly.",
        ],
      },
    ],
  },

  privacy: {
    title: "Privacy Policy",
    intro: "What personal data we hold, why we hold it, and what you can do about it.",
    updated: UPDATED,
    sections: [
      {
        heading: "1. Controller",
        body: [
          "The company identified in the footer is the controller of the personal data described here. Write to the contact address in the footer for anything in this policy, including the requests in section 6.",
        ],
      },
      {
        heading: "2. What we collect",
        body: ["We collect only what the service needs in order to work:"],
        bullets: [
          "Account: your email address, your name if you give one, your chosen language, and a hash of your password. We never store the password itself.",
          "If you sign in with Google or Discord: the account identifier and email address that provider gives us.",
          "Orders and billing: what you ordered, the price, invoices, and the status of each payment. Card details go straight to our payment processor and never reach our servers.",
          "Servers: the configuration you chose, the server's address, and its activity log (starts, stops, backups, resizes).",
          "Support: the tickets and messages you send us.",
          "Security: the time of sign-in attempts, and the IP address recorded with administrative actions and rate limits.",
          "Email: a copy of the transactional emails we send you, so we can show what was sent and when.",
        ],
      },
      {
        heading: "3. Why we hold it, and on what basis",
        body: [
          "To provide the service you ordered and to bill for it — this is the performance of our contract with you.",
          "To keep accounts and infrastructure secure, to prevent abuse, and to answer support requests — our legitimate interest in running the service safely.",
          "To keep accounting records — a legal obligation.",
          "We do not use your data for advertising, we do not profile you, and we do not make automated decisions with legal effects about you.",
        ],
      },
      {
        heading: "4. Who else sees it",
        body: [
          "Only the providers we need to run the service, and only what each one needs:",
        ],
        bullets: [
          "our payment processor, to take payments and hold your saved card",
          "our email provider, to deliver transactional email",
          "our hosting and infrastructure providers, where the servers physically run",
        ],
      },
      {
        heading: "5. How long we keep it",
        body: [
          "Account, order and invoice records are kept for as long as the law requires us to keep accounting records.",
          "Operational records are deleted automatically once they are no longer needed: copies of sent emails after 90 days, server activity after 180 days, console output after 30 days, administrative audit records after a year, and expired sign-in tokens within a week.",
          "A deleted server's contents are removed with it and cannot be recovered.",
        ],
      },
      {
        heading: "6. Your rights",
        body: [
          "Under the GDPR you may ask us for a copy of your data, ask us to correct it, ask us to delete it, ask us to restrict or stop a particular use, and ask for your data in a portable form. You may also withdraw consent where we relied on it.",
          "Write to the contact address in the footer. We answer within one month.",
          "If you think we have handled your data wrongly, you can complain to the Romanian supervisory authority, ANSPDCP (dataprotection.ro), or to the authority where you live.",
        ],
      },
      {
        heading: "7. Where your data is",
        body: [
          "Your data is stored within the European Economic Area. If any provider we use processes data outside it, we rely on the European Commission's standard contractual clauses or an adequacy decision.",
        ],
      },
      {
        heading: "8. Security",
        body: [
          "Passwords are stored hashed. Sign-in and password-reset links are single-use, expire, and are stored hashed rather than in the clear. Access to production systems is limited to the people who operate them.",
          "No system is perfect. If a breach affects your rights, we notify you and the supervisory authority as the GDPR requires.",
        ],
      },
    ],
  },

  cookies: {
    title: "Cookie Policy",
    intro: "The small number of cookies this site sets, and what each one is for.",
    updated: UPDATED,
    sections: [
      {
        heading: "What we use",
        body: [
          "This site uses only cookies that are necessary for it to work. There is no advertising, no analytics and no third-party tracking, which is why you are not asked to consent to anything: consent is required for non-essential cookies, and we do not set any.",
        ],
        bullets: [
          "Session cookie — keeps you signed in. Set when you sign in, removed when you sign out.",
          "Security token — protects sign-in forms against cross-site request forgery.",
          "Language — remembers whether you are reading the site in Romanian or English.",
          "Theme — remembers your light or dark preference.",
        ],
      },
      {
        heading: "Controlling cookies",
        body: [
          "You can delete or block cookies in your browser settings. Blocking the session cookie means you cannot stay signed in, so the dashboard will not work.",
        ],
      },
      {
        heading: "If this changes",
        body: [
          "If we ever add a cookie that is not strictly necessary — analytics, for example — we will ask for your consent before setting it, and update this page.",
        ],
      },
    ],
  },

  withdrawal: {
    title: "Right of Withdrawal",
    intro: "Your 14-day right to change your mind, and what happens to it when a server starts immediately.",
    updated: UPDATED,
    sections: [
      {
        heading: "The right",
        body: [
          "As a consumer in the EU you normally have 14 days from placing an order to withdraw from it without giving a reason. This comes from Directive 2011/83/EU, which in Romania is OUG 34/2014.",
        ],
      },
      {
        heading: "What it means here",
        body: [
          "Your server is built and handed to you within moments of payment. For digital services that start immediately, the law lets you ask for them to start before the 14 days are up, and asks you to acknowledge that doing so ends the right of withdrawal once the service has been fully performed.",
          "When you place an order you are asked to make exactly that request and acknowledgement. It is a deliberate tick, not a pre-ticked box, and you see it before you pay.",
          "If you withdraw after the service has started but before the period has run out, we charge you only for the part you used, in proportion to the whole period.",
        ],
      },
      {
        heading: "How to withdraw",
        body: [
          "Write to the contact address in the footer, from the email address on your account, within 14 days of your order. You do not have to explain why. You can use the model withdrawal form from the legislation, but any clear statement is enough.",
          "We refund what is due within 14 days of being told, using the same payment method you used, unless you agree to another.",
        ],
      },
      {
        heading: "Cancelling instead",
        body: [
          "Separately from this right, you can cancel a subscription at any time from the dashboard. Cancelling stops the next renewal; your server keeps running until the end of the period you have already paid for.",
        ],
      },
    ],
  },
};
