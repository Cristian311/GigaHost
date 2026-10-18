import { APP_NAME, BILLING_POLICY } from "@/lib/constants";

export type MailLocale = "en" | "ro";
export type RenderedEmail = { subject: string; text: string; html: string };

/** Anything a customer typed (their name, a server name) is escaped before it reaches HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type Content = {
  subject: string;
  /** Plain paragraphs; rendered both as text and as HTML. */
  lines: string[];
  action?: { label: string; url: string };
  footnote?: string;
};

function render({ subject, lines, action, footnote }: Content): RenderedEmail {
  const text = [
    ...lines,
    ...(action ? [`${action.label}: ${action.url}`] : []),
    ...(footnote ? [footnote] : []),
    `— ${APP_NAME}`,
  ].join("\n\n");

  const paragraphs = lines
    .map((line) => `<p style="margin:0 0 16px;line-height:1.6">${escapeHtml(line)}</p>`)
    .join("");
  const button = action
    ? `<p style="margin:24px 0"><a href="${escapeHtml(action.url)}" style="background:#7c3aed;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;display:inline-block">${escapeHtml(action.label)}</a></p>
       <p style="margin:0 0 16px;font-size:12px;color:#8b8b9a;word-break:break-all">${escapeHtml(action.url)}</p>`
    : "";
  const note = footnote
    ? `<p style="margin:16px 0 0;font-size:12px;color:#8b8b9a;line-height:1.5">${escapeHtml(footnote)}</p>`
    : "";

  const html = `<!doctype html><html><body style="margin:0;background:#0b0b12;padding:32px 16px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#e7e7ee">
<div style="max-width:520px;margin:0 auto;background:#14141f;border:1px solid #26263a;border-radius:16px;padding:32px">
<p style="margin:0 0 24px;font-size:18px;font-weight:700;color:#fff">${escapeHtml(APP_NAME)}</p>
<h1 style="margin:0 0 20px;font-size:20px;color:#fff">${escapeHtml(subject)}</h1>
${paragraphs}${button}${note}
</div></body></html>`;

  return { subject, text, html };
}

const hello = (locale: MailLocale, name: string | null) =>
  locale === "ro" ? `Salut${name ? `, ${name}` : ""}!` : `Hi${name ? ` ${name}` : ""},`;

type Base = { locale: MailLocale; name: string | null };

export const templates = {
  verifyEmail({ locale, name, url }: Base & { url: string }) {
    return render(
      locale === "ro"
        ? {
            subject: "Confirmă adresa de email",
            lines: [
              hello(locale, name),
              `Confirmă adresa de email ca să poți comanda servere pe ${APP_NAME}.`,
            ],
            action: { label: "Confirmă adresa", url },
            footnote: "Linkul expiră în 24 de ore. Dacă nu tu ai creat contul, ignoră acest mesaj.",
          }
        : {
            subject: "Confirm your email address",
            lines: [
              hello(locale, name),
              `Please confirm your email address so you can order servers on ${APP_NAME}.`,
            ],
            action: { label: "Confirm email", url },
            footnote:
              "The link expires in 24 hours. If you did not create this account, ignore this message.",
          },
    );
  },

  passwordReset({ locale, name, url }: Base & { url: string }) {
    return render(
      locale === "ro"
        ? {
            subject: "Resetează parola",
            lines: [hello(locale, name), "Am primit o cerere de resetare a parolei tale."],
            action: { label: "Alege o parolă nouă", url },
            footnote:
              "Linkul expiră într-o oră și poate fi folosit o singură dată. Dacă nu tu ai cerut resetarea, ignoră acest mesaj; parola ta rămâne neschimbată.",
          }
        : {
            subject: "Reset your password",
            lines: [hello(locale, name), "We received a request to reset your password."],
            action: { label: "Choose a new password", url },
            footnote:
              "The link expires in one hour and works once. If you did not ask for this, ignore this message; your password stays the same.",
          },
    );
  },

  passwordChanged({ locale, name }: Base) {
    return render(
      locale === "ro"
        ? {
            subject: "Parola ta a fost schimbată",
            lines: [
              hello(locale, name),
              "Parola contului tău tocmai a fost schimbată, iar celelalte sesiuni au fost deconectate.",
            ],
            footnote: "Dacă nu tu ai făcut schimbarea, resetează parola imediat și contactează-ne.",
          }
        : {
            subject: "Your password was changed",
            lines: [
              hello(locale, name),
              "The password of your account was just changed and your other sessions were signed out.",
            ],
            footnote: "If this was not you, reset your password right away and contact us.",
          },
    );
  },

  orderConfirmed({
    locale,
    name,
    serverName,
    invoiceNumber,
    amount,
    url,
  }: Base & { serverName: string; invoiceNumber: string; amount: string; url: string }) {
    return render(
      locale === "ro"
        ? {
            subject: `Comandă confirmată: ${serverName}`,
            lines: [
              hello(locale, name),
              `Am primit plata de ${amount} (factura ${invoiceNumber}). Serverul „${serverName}” se instalează acum și va fi gata în scurt timp.`,
            ],
            action: { label: "Deschide serverul", url },
          }
        : {
            subject: `Order confirmed: ${serverName}`,
            lines: [
              hello(locale, name),
              `We received your payment of ${amount} (invoice ${invoiceNumber}). "${serverName}" is being installed and will be ready shortly.`,
            ],
            action: { label: "Open the server", url },
          },
    );
  },

  serverReady({
    locale,
    name,
    serverName,
    address,
    url,
  }: Base & { serverName: string; address: string; url: string }) {
    return render(
      locale === "ro"
        ? {
            subject: `Serverul „${serverName}” este gata`,
            lines: [
              hello(locale, name),
              `Instalarea s-a încheiat. Adresa serverului: ${address}`,
              "Pornește-l din panou când ești gata să joci.",
            ],
            action: { label: "Deschide panoul", url },
          }
        : {
            subject: `"${serverName}" is ready`,
            lines: [
              hello(locale, name),
              `Installation has finished. Server address: ${address}`,
              "Start it from the dashboard whenever you are ready to play.",
            ],
            action: { label: "Open the dashboard", url },
          },
    );
  },

  renewalPaid({
    locale,
    name,
    serverName,
    invoiceNumber,
    amount,
    nextRenewal,
    url,
  }: Base & {
    serverName: string;
    invoiceNumber: string;
    amount: string;
    nextRenewal: string;
    url: string;
  }) {
    return render(
      locale === "ro"
        ? {
            subject: `Abonament reînnoit: ${serverName}`,
            lines: [
              hello(locale, name),
              `Am reînnoit abonamentul pentru „${serverName}”: ${amount} (factura ${invoiceNumber}).`,
              `Următoarea reînnoire: ${nextRenewal}.`,
            ],
            action: { label: "Vezi facturile", url },
          }
        : {
            subject: `Subscription renewed: ${serverName}`,
            lines: [
              hello(locale, name),
              `We renewed the subscription for "${serverName}": ${amount} (invoice ${invoiceNumber}).`,
              `Next renewal: ${nextRenewal}.`,
            ],
            action: { label: "View invoices", url },
          },
    );
  },

  paymentFailed({
    locale,
    name,
    serverName,
    amount,
    url,
  }: Base & { serverName: string; amount: string; url: string }) {
    const { suspendAfterDays, deleteAfterDays } = BILLING_POLICY;
    return render(
      locale === "ro"
        ? {
            subject: `Plata pentru „${serverName}” a eșuat`,
            lines: [
              hello(locale, name),
              `Nu am putut încasa ${amount} pentru reînnoirea serverului „${serverName}”.`,
              `Vom reîncerca zilnic. Dacă plata rămâne neachitată, serverul este suspendat după ${suspendAfterDays} zile și șters după ${deleteAfterDays} zile.`,
            ],
            action: { label: "Plătește acum", url },
          }
        : {
            subject: `Payment failed for "${serverName}"`,
            lines: [
              hello(locale, name),
              `We could not collect ${amount} for the renewal of "${serverName}".`,
              `We will retry daily. If it stays unpaid, the server is suspended after ${suspendAfterDays} days and deleted after ${deleteAfterDays} days.`,
            ],
            action: { label: "Pay now", url },
          },
    );
  },

  serverSuspended({
    locale,
    name,
    serverName,
    url,
  }: Base & { serverName: string; url: string }) {
    const { deleteAfterDays } = BILLING_POLICY;
    return render(
      locale === "ro"
        ? {
            subject: `Serverul „${serverName}” a fost suspendat`,
            lines: [
              hello(locale, name),
              `Serverul „${serverName}” a fost suspendat pentru neplată. Datele sunt păstrate, dar serverul nu poate fi pornit.`,
              `Dacă factura rămâne neachitată, serverul și datele lui sunt șterse la ${deleteAfterDays} zile de la prima plată eșuată.`,
            ],
            action: { label: "Plătește și reactivează", url },
          }
        : {
            subject: `"${serverName}" has been suspended`,
            lines: [
              hello(locale, name),
              `"${serverName}" was suspended for non-payment. Your data is kept, but the server cannot be started.`,
              `If the invoice stays unpaid, the server and its data are deleted ${deleteAfterDays} days after the first failed payment.`,
            ],
            action: { label: "Pay and reactivate", url },
          },
    );
  },

  serverDeleted({ locale, name, serverName }: Base & { serverName: string }) {
    return render(
      locale === "ro"
        ? {
            subject: `Serverul „${serverName}” a fost șters`,
            lines: [
              hello(locale, name),
              `Serverul „${serverName}” și datele lui au fost șterse, iar abonamentul s-a încheiat. Nu mai ai nimic de plată pentru el.`,
            ],
          }
        : {
            subject: `"${serverName}" has been deleted`,
            lines: [
              hello(locale, name),
              `"${serverName}" and its data were deleted and the subscription has ended. Nothing further is owed for it.`,
            ],
          },
    );
  },
  /**
   * Sent a few days before a card is charged. Required in spirit by the
   * subscription rules customers expect, and in practice it is what stops a
   * renewal being disputed as an unexpected charge.
   */
  renewalUpcoming({
    locale,
    name,
    serverName,
    amount,
    date,
    url,
  }: Base & { serverName: string; amount: string; date: string; url: string }) {
    return render(
      locale === "ro"
        ? {
            subject: `Abonamentul pentru „${serverName}” se reînnoiește pe ${date}`,
            lines: [
              hello(locale, name),
              `Pe ${date} vom reînnoi automat abonamentul pentru „${serverName}” și vom încasa ${amount} de pe cardul salvat.`,
              "Nu trebuie să faci nimic dacă vrei să continui. Dacă nu, poți anula din panou până atunci, iar serverul va rămâne activ până la finalul perioadei deja plătite.",
            ],
            action: { label: "Vezi abonamentul", url },
          }
        : {
            subject: `"${serverName}" renews on ${date}`,
            lines: [
              hello(locale, name),
              `On ${date} we will renew the subscription for "${serverName}" and charge ${amount} to your saved card.`,
              "There is nothing to do if you want to continue. If you do not, you can cancel from the dashboard before then, and your server stays up until the end of the period you have already paid for.",
            ],
            action: { label: "View subscription", url },
          },
    );
  },

  /** Support replied. Without this the customer has to keep checking the page. */
  ticketReplied({
    locale,
    name,
    subject,
    url,
  }: Base & { subject: string; url: string }) {
    return render(
      locale === "ro"
        ? {
            subject: `Răspuns la tichetul „${subject}”`,
            lines: [
              hello(locale, name),
              `Echipa de suport a răspuns la tichetul tău „${subject}”.`,
            ],
            action: { label: "Vezi răspunsul", url },
            footnote: "Răspunde din panou, nu la acest email.",
          }
        : {
            subject: `Reply to your ticket "${subject}"`,
            lines: [hello(locale, name), `Support has replied to your ticket "${subject}".`],
            action: { label: "Read the reply", url },
            footnote: "Reply from the dashboard rather than to this email.",
          },
    );
  },
  /**
   * To the operator, not the customer. A provisioning failure leaves someone
   * who has paid with a server in ERROR, and until this existed the only trace
   * was a log line nobody was watching.
   */
  provisioningFailed({
    locale,
    serverName,
    customerEmail,
    reason,
    url,
  }: Base & { serverName: string; customerEmail: string; reason: string; url: string }) {
    return render(
      locale === "ro"
        ? {
            subject: `Provizionare eșuată: „${serverName}"`,
            lines: [
              `Serverul „${serverName}" al clientului ${customerEmail} a fost plătit, dar nu a putut fi creat.`,
              `Motiv: ${reason}`,
              "Clientul are un server în ERROR. Reîncearcă provizionarea din panoul de administrare sau rambursează comanda.",
            ],
            action: { label: "Deschide serverul", url },
          }
        : {
            subject: `Provisioning failed: "${serverName}"`,
            lines: [
              `"${serverName}" for ${customerEmail} was paid for but could not be created.`,
              `Reason: ${reason}`,
              "The customer has a server in ERROR. Retry provisioning from the admin area, or refund the order.",
            ],
            action: { label: "Open the server", url },
          },
    );
  },
};

export type TemplateName = keyof typeof templates;
