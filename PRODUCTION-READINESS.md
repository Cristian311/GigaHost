# GigaHost: ce mai trebuie până la producție

Audit făcut pe 20.09.2026. Punctele marcate **(verificat)** le-am confirmat personal în cod; restul vin din trei audituri automate cu referințe fișier:linie.

Pe scurt: aplicația compilează, 471 de teste trec, și tot ce se putea rezolva prin cod este rezolvat. **Ce a rămas cere fie conturi externe, fie oameni:** Stripe cu chei reale, un panou Pterodactyl real, și avizare juridică plus contabilă. Detalii în 0b, 0c și 0d; ordinea de lucru rămasă, în secțiunea 7.

---

## 0. Starea măsurată acum

| Verificare | Rezultat |
|---|---|
| `tsc --noEmit` | trece |
| `eslint` | trece, fără avertismente |
| Teste | 471 / 471 (43 fișiere) |
| `next build` | trece |
| `prisma migrate deploy` pe bază goală | trece, fără drift |
| `npm audit --omit=dev` | curat la runtime (rămân doar advisory-uri în CLI-ul Prisma) |
| CI | există acum: `.github/workflows/ci.yml` |

---

## 0b. Ce s-a rezolvat deja (20.09.2026)

Toate verificate pe un server de producție real (`next build` + `next start`), nu doar în teste.

| # | Ce | Cum e verificat |
|---|---|---|
| 1 | **Validare de env la pornire.** Cu `NODE_ENV=production` serverul refuză să pornească dacă `AUTH_SECRET` e placeholder sau scurt, `APP_URL` e pe localhost sau http, `SMTP_URL`/`MAIL_FROM`/`CRON_SECRET`/`DATABASE_URL` lipsesc, sau providerii sunt pe `mock`. Listează toate problemele odată. Mock-urile cer opt-in explicit (`ALLOW_MOCK_PAYMENTS`, `ALLOW_MOCK_PROVISIONING`). | 20 de teste + refuz observat pe server real |
| 2 | **Seed-ul nu mai creează contul public în producție.** Cere `SEED_ADMIN_EMAIL` + `SEED_ADMIN_PASSWORD` (12+ caractere) și eșuează înainte să scrie ceva. | rulat pe o bază curată: refuză, apoi seedează contul dat |
| 3 | **Cele patru coloane `VARCHAR(191)` sunt acum `TEXT`.** `TicketMessage.body`, `Server.lastError`, `Game.eggVariables`, `ScheduledTask.payload`. Migrația e portabilă: default-ul literal pe TEXT a fost scos, pentru că MySQL 8 îl respinge (MariaDB îl accepta, deci ar fi trecut în dev și ar fi crăpat în producție). | `migrate deploy` pe bază goală, fără drift |
| 4 | **Protecție CSRF pe toate rutele API.** `withApi` cere acum cererea și respinge scrierile cross-origin. Cererile fără `Origin` (Stripe, cron) trec mai departe. | 7 teste + verificat pe server real: 403 cross-origin, 401 same-origin |
| 5 | **Headere de securitate.** `frame-ancestors 'none'`, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, `COOP`, HSTS. CSP complet (script-src) nu e pus intenționat: cere nonces per cerere și testare pe fiecare pagină. | verificate cu `curl -D` pe server real |
| 6 | **Suspendarea pentru neplată ajunge la provider.** Un eșec abortează, ca următoarea rulare să reîncerce. Ridicarea suspendării la plată înghite eroarea și o scrie în `lastError` — cardul a fost deja taxat, deci înregistrarea trebuie scrisă oricum. | testele de reînnoire trec |
| 7 | **Outbox-ul nu mai păstrează link-urile de resetare.** Doar când SMTP e configurat; fără SMTP outbox-ul *este* cutia poștală în dev. | testele de securitate trec |
| 8 | **Rate limit** pe tichete (creare + mesaje), comenzi de consolă, resize și schimbarea parolei. Cheia e user-id, nu IP, deci nu poate fi rotită prin `X-Forwarded-For`. | — |
| 9 | **Verificare de rol în cele 5 pagini de admin** care se bazau doar pe layout. | — |
| 10 | **Textul „plata e simulată" e condiționat** de providerul real, în configurator și în FAQ. | — |
| 11 | **`/api/health`** cu ping pe bază: 200 sau 503. | verificat pe server real |
| 12 | **`global-error.tsx`**, care lipsea. | — |
| 13 | **Dependențe:** `nodemailer` 8→10 (9 advisory-uri high, inclusiv SSRF și citire de fișiere) și driverul `mariadb` 3.4.5→3.5.4 (**scurgea parola în clar către un MitM chiar cu `ssl: true`**), ambele forțate prin `overrides`. Șterse `pg`, `@types/pg`, `motion`. `next-auth` fixat la versiune exactă. `prisma` și `tsx` mutate în `dependencies`, altfel `npm ci --omit=dev` crapă la `postinstall`. | toate cele 385 de teste trec pe driverul nou |
| 14 | **Secțiune de deploy în README** și `.env.example` actualizat. | — |

**De reținut din asta:** `NEXT_PUBLIC_APP_URL` e înghețat la `next build`. Setarea lui la runtime nu are niciun efect. Validarea a prins exact greșeala asta când am testat.

---

## 0c. Runda a doua (tot 20.09.2026)

Toate verificate: 438 de teste, plus verificări pe un server de producție real.

### Bani — cele trei căi prin care se pierdeau, închise

| # | Ce | Cum e verificat |
|---|---|---|
| 15 | **Lock pe joburile programate.** Model nou `JobLock`, un *lease* în bază (nu `GET_LOCK`, care e legat de conexiune și nu supraviețuiește unui pool). Acoperă ciclul de facturare, task-urile programate și finalizarea fiecărei comenzi. Un lease expiră, deci o rulare care crapă nu blochează programul. | 17 teste de concurență: două rulări simultane → o singură taxare, o singură comandă de reînnoire |
| 16 | **Numerotarea facturilor e atomică.** Model nou `InvoiceCounter`, incrementat sub lock de rând într-o tranzacție. Citește-apoi-inserează nu era doar teoretic nesigur: **testul meu l-a spart imediat** — retry-ul se învârtea mai repede decât apuca tranzacția concurentă să facă commit. Contorul se auto-inițializează din facturile existente. | 25 de apeluri simultane → 25 de numere distincte |
| 17 | **`fulfilOrder` rezistă la crash.** O comandă plătită dar neterminată se reia de unde a rămas, în loc să întoarcă 409 unui client care a plătit deja. Serverul se leagă de comandă *înainte* de provizionare, ca un crash la mijloc să nu orfanizeze nimic. Fiecare pas verifică dacă a fost deja scris. | teste pentru: webhook în cursă cu pagina de succes, crash după plată, comandă plătită fără server |

### Securitate

| # | Ce | Cum e verificat |
|---|---|---|
| 18 | **Gaura din rate limit e închisă.** `X-Forwarded-For` e controlat de client, deci rotirea lui dădea ghiciri nelimitate de parolă. Acum se numără de la dreapta, cu `TRUSTED_PROXY_HOPS`; fără proxy configurat, header-ul e **ignorat complet**. Plus o limită per cont, care rezistă și la botnet. | 8 teste, inclusiv încercarea de rotire |
| 19 | **Erorile nu mai scurg detalii interne.** Doar codurile cu detalii scrise pentru client trec; restul primesc doar codul. Erorile Pterodactyl conțineau URL-ul panoului. | — |
| 20 | **Rate limit pe restul endpoint-urilor:** power, fișiere, backup-uri, `/api/pricing/quote`. | — |
| 21 | **TLS pentru baza de date** prin `?sslaccept=strict`, plus timeout-uri de conexiune. Fără el, o bază gestionată trimite parola și fiecare rând în clar. | — |

### Legal — de la zero la funcțional

| # | Ce | Cum e verificat |
|---|---|---|
| 22 | **Patru pagini legale** (Termeni, Confidențialitate, Cookie-uri, Retragere), în ro și en, scrise după ce face efectiv codul — politica de confidențialitate descrie exact ce coloane există. **Fiecare pagină poartă un banner „ciornă, neavizată juridic" până setezi `LEGAL_REVIEWED=true`**, ca să nu poți publica din greșeală text neavizat. | verificate pe server real |
| 23 | **Identificarea comerciantului în footer:** denumire, CUI, Reg. Com., adresă, contact, plus link-urile ANPC, SAL și SOL. Se afișează doar când datele sunt configurate — un număr de înregistrare inventat ar fi mai rău decât niciunul. | verificat pe server real |
| 24 | **Bifă de acceptare a termenilor la înregistrare**, niciodată pre-bifată, cu versiunea și momentul salvate pe cont. | — |
| 25 | **Renunțarea la dreptul de retragere la comandă.** Serverul se construiește imediat, deci legal e nevoie de o cerere expresă plus confirmarea consecinței. Validarea o cere pe server, nu doar în interfață. | — |
| 26 | **Testimonialele inventate sunt șterse complet.** Întâi le-am scos doar din randare — apoi am verificat pe server real și **textele tot se livrau în bundle-ul clientului**, deci recenziile false erau în continuare publicate. Am șters și componenta, și textele. Recenziile fabricate sunt practică interzisă explicit în UE (Directiva Omnibus, Anexa I), nu doar exagerare. | verificat că au dispărut din build |
| 27 | **Afirmații nesusținute scoase:** „99.9% Uptime SLA" (e angajament contractual) și „24/7" (e promisiune de personal). Au rămas doar faptele: timpul de creare și numărul de regiuni. | verificat pe server real |
| 28 | **GDPR self-service:** export complet de date (art. 15 și 20) ca JSON descărcabil, și ștergerea contului (art. 17) confirmată cu parola. Ștergerea distruge întâi serverele la provider, apoi detașează facturile pe un cont-substituent — legea contabilă cere păstrarea lor. | 10 teste, inclusiv că notele interne de suport nu ajung în export |
| 29 | **Retenție de date.** Nimic nu se ștergea vreodată. Acum: emailuri 90 de zile, jurnal admin 1 an, activitate server 180 de zile, consolă 30 de zile, token-uri expirate 7 zile. Facturile sunt excluse intenționat. | 5 teste |

### Operare și UX

| # | Ce | Cum e verificat |
|---|---|---|
| 30 | **CI complet** (`.github/workflows/ci.yml`): MySQL 8 real, `migrate deploy` de la zero, verificare de drift schemă-migrații, typecheck, lint, toate testele, build. MySQL 8 în CI e intenționat — dev-ul e MariaDB și cele două nu sunt de acord (vezi 0b.3). | comanda de drift testată local |
| 31 | **Taburile care dau 501 sunt ascunse per provider.** Providerul își declară acum capabilitățile; dashboard-ul, opțiunea de backup programat și cardul „backup-uri automate" de pe landing dispar toate când providerul nu le suportă. | typecheck + build |
| 32 | **Emailuri care lipseau:** reminder înainte de reînnoire (trimis o dată per perioadă, nu o dată pe oră) și notificare la răspuns pe tichet. | 9 teste |
| 33 | **Reîncercarea emailurilor eșuate.** Mesajele `FAILED` nu erau reîncercate niciodată — o problemă SMTP trecătoare înghițea tăcut o resetare de parolă. | 4 teste |
| 34 | **Canonical și hreflang per pagină.** Toate paginile declarau home-ul drept canonical, ceea ce cere motoarelor să le scoată din index. | verificat pe server real, pagină cu pagină |
| 35 | **`loading.tsx`** pentru segmentele de aplicație și marketing. | — |
| 36 | **Curățenie în cron:** lease-uri expirate, rate limit-uri, retenție și reîncercarea emailurilor, fiecare izolată ca una căzută să nu le piardă pe celelalte. | — |

### Un bug găsit în suita de teste

Testele depindeau de ordinea fișierelor: `admin.test.ts` modifica `PricingConfig`, care e partajat, iar `resetData` nu îl restaura. Adăugarea unui fișier nou a schimbat ordinea și a expus-o — de unde eșecuri aparent aleatorii cu preț 2800 în loc de 2700. `resetData` restaurează acum prețurile, lease-urile și contorul de facturi. Verificat rulând suita de două ori la rând.

---


## 0d. Runda a treia (tot 20.09.2026)

471 de teste. Aici au intrat lucrurile care cer doar cod, nu conturi externe.

| # | Ce | Cum e verificat |
|---|---|---|
| 37 | **Resize-ul ajunge la provider — blocajul #1, închis.** `ServerProvider` are acum `resize()`, implementat cu `PATCH /servers/{id}/build`. Ordinea contează și e testată: resize **întâi**, taxare **după**, pentru că eșecul probabil e lipsa de capacitate, iar clientul nu trebuie să plătească pentru a afla asta. Dacă plata eșuează după, resursele se dau înapoi; dacă nici rollback-ul nu merge, se scrie în `lastError`. Calculul limitelor e partajat cu crearea, ca cele două să nu poată diverge. | 6 teste cu un provider care refuză la comandă |
| 38 | **Recuperare după provizionare eșuată.** Un client care a plătit și nu a primit nimic avea zero căi de ieșire. Acum: buton „Reîncearcă" în admin (doar pentru servere în ERROR, și doar dacă nu există deja la provider) și **alertă pe email către toți adminii** — înainte, singura urmă era o linie de log pe care n-o citea nimeni. | 7 teste, inclusiv că factura și abonamentul se scriu chiar și când build-ul eșuează |
| 39 | **Refund-uri și chargeback-uri.** Se procesau doar evenimentele `checkout.session.*`, deci o plată rambursată lăsa comanda PAID și serverul pornit: clientul avea și banii, și serviciul. Acum `charge.refunded`, `charge.dispute.created` și `.closed`. Serverul se **suspendă, nu se șterge** — o lume nu se recuperează, iar o dispută se poate câștiga. O dispută câștigată readuce comanda la PAID. | 10 teste, inclusiv redelivery și dispută pierdută |
| 40 | **Istoric de rulări cron.** Model nou `CronRun`: fiecare rulare se înregistrează, cu raport sau eroare, fie că reușește, fie că aruncă. Panoul de admin arată starea fiecărui job. Deosebește **„eșuează"** de **„nu mai rulează deloc"** — un job pe care nu-l mai apelează nimeni nu poate fi raportat sănătos doar pentru că ultima lui rulare, de acum trei zile, a mers. | 10 teste |

**De reținut:** linterul a prins un `Date.now()` în render, ceea ce e impur în React. Evaluarea stării s-a mutat în serviciu — unde oricum îi era locul, pentru că pragul de „învechit" ține de definiția jobului, nu de afișare.

---
## 1. Rămășițe din merge

1. **Resturi:** `listAllServers` există de două ori ([admin-service.ts](src/server/services/admin-service.ts) linia 175, folosit doar de teste, și [server-service.ts](src/server/services/server-service.ts) linia 229, folosit de pagină).
2. **Catalogul s-a schimbat:** doar `minecraft-paper` și `minecraft-vanilla` sunt disponibile, restul de 10 jocuri sunt „coming soon" **(verificat)**. Decide conștient dacă lansezi doar cu Minecraft.
3. **Testele construiesc baza cu `db push`, nu cu migrațiile.** Am verificat manual că lanțul se aplică curat de la zero, dar merită un pas de CI care să o facă la fiecare commit.

---

## 2. BLOCAJE (nu lansa fără ele)

### A. Configurare nesigură implicit — REZOLVAT

Vezi secțiunea 0b, punctele 1-3. Ce a rămas de decis aici e comercial, nu tehnic: seed-ul mai adaugă cuponul nelimitat `WELCOME10` și, la re-rulare, suprascrie modificările făcute din admin la jocuri și regiuni. Dacă vrei să poți rula seed-ul pe o bază vie fără să pierzi ajustările, desparte catalogul de „update" (`update: {}` în loc de `update: catalog`).

### B. Integrarea Pterodactyl e pe jumătate

Serviciile de reînnoire, resize și billing au fost scrise pe `master` local, contra providerului mock. Providerul real a venit din remote. Nu au fost niciodată legate între ele.

4. ~~Suspendarea pentru neplată nu ajunge la provider.~~ **Rezolvat** (0b.6).
5. ~~Resize-ul taxează, dar nu schimbă nimic în panou.~~ **Rezolvat** (0d.37). Implementarea Pterodactyl urmează tiparele din fișier, dar nu a atins un panou real — vezi punctul 2 din secțiunea 7. Restul: Interfața `ServerProvider` nu are metodă de resize; [resize-service.ts](src/server/services/resize-service.ts) ia banii și actualizează doar rândurile din DB. Trebuie `resize()` în interfață, implementat cu `PATCH /servers/{id}/build`, aplicat înainte de a marca comanda plătită. **Acesta e cel mai grav blocaj rămas: clientul plătește pentru resurse pe care nu le primește.**
6. **Backup-uri, manager de fișiere, lista de jucători și add-on-uri întorc 501 pe Pterodactyl** ([pterodactyl-provider.ts](src/server/providers/pterodactyl-provider.ts); numărul de jucători e fix 0). **Promisiunile false sunt oprite** (0c.31): taburile, opțiunea de backup programat și cardul de pe landing dispar când providerul nu le suportă. Funcțiile în sine tot nu există — decide dacă lansezi fără ele sau le implementezi. Când o implementezi, treci flag-ul pe `true` în `capabilities` și reapare peste tot.
7. ~~Coloane `VARCHAR(191)` mai înguste decât permite validarea.~~ **Rezolvat** (0b.3).

### C. Legal și fiscal (vinzi către consumatori din UE, din România)

8. ~~Nu există pagini legale și nici date de identificare.~~ **Construit** (0c.22, 0c.23) — dar **textul cere avizare juridică**. Paginile sunt scrise corect față de ce face codul, ceea ce nu e același lucru cu a fi corecte juridic. Până setezi `LEGAL_REVIEWED=true` fiecare pagină o spune vizitatorului. Banner de cookie-uri nu există pentru că nu sunt cookie-uri neesențiale; dacă adaugi analytics, îți trebuie.
9. ~~Nu există consimțământ la înregistrare/comandă.~~ **Rezolvat** (0c.24, 0c.25).
10. ~~Textul „plata este simulată" apare necondiționat.~~ **Rezolvat** (0b.10).
11. **Facturile nu sunt utilizabile legal.** Ăsta e blocajul legal rămas. Nu există TVA deloc (nici cotă, nici cod de TVA, nici OSS), nici date de vânzător/cumpărător, nici adresă de facturare, nici PDF sau pagină de factură. Numerotarea e acum atomică (0c.16) și rezistentă, dar poate avea goluri — o secvență fiscală fără goluri e altceva. Relația `User → Invoice` rămâne `onDelete: Cascade` în schemă; ștergerea de cont o ocolește detașând facturile (0c.28), dar o ștergere directă din bază tot le-ar lua cu ea. De verificat cu un contabil, inclusiv e-Factura.

---

## 3. PRIORITATE MARE

### Bani și comenzi
- ~~Dublă taxare la reînnoiri.~~ **Rezolvat** (0c.15).
- ~~Numerotarea facturilor se poate ciocni.~~ **Rezolvat** (0c.16).
- ~~`fulfilOrder` nu rezistă la crash.~~ **Rezolvat** (0c.17).
- ~~Comandă plătită cu provizionare eșuată nu are cale de recuperare.~~ **Rezolvat** (0d.38). A rămas: nimic nu verifică capacitatea *înainte* de plată, deci `no_capacity` tot apare după, iar rambursarea automată nu există — adminul reîncearcă sau restituie manual.
- ~~Refund-urile și chargeback-urile nu sunt tratate deloc.~~ **Rezolvat** (0d.39). A rămas: nu există un buton de rambursare în admin — refund-ul se face din Stripe, iar webhook-ul îl aplică aici.
- **Reînnoire care cere 3-D Secure:** `requires_action` e tratat ca refuz, iar „Plătește acum" repetă aceeași taxare off-session. Trebuie un flux de plată cu clientul prezent pentru comenzile restante.
- **Stripe nu a fost exercitat niciodată cu chei reale**, nici măcar în test mode; testele folosesc un client fals. `PterodactylProvider` și `client.ts` nu au niciun test.

### Securitate
- ~~Outbox-ul păstrează link-urile de resetare în clar.~~ **Rezolvat** (0b.7).
- ~~Rate limiting pe IP e ocolibil.~~ **Rezolvat** (0c.18). Setează `TRUSTED_PROXY_HOPS` să corespundă infrastructurii tale: prea mare și clienții împart o găleată, prea mic și o pot falsifica.
- ~~Niciun header de securitate.~~ **Rezolvat parțial** (0b.5): lipsește încă CSP-ul pentru `script-src`/`style-src`, care cere nonces per cerere și testare pe fiecare pagină. E singurul lucru de securitate rămas care cere muncă serioasă.
- ~~Detalii interne în erori.~~ **Rezolvat** (0c.19).

### Operare
- **Nimic nu apelează cron-urile.** Sunt documentate în README (0b.14), dar tot trebuie instalate efectiv. Suprapunerile sunt acum sigure (0c.15), deci o instalare imperfectă nu mai strică date.
- **Observabilitate:** există `/api/health` (0b.11), CI (0c.30) și istoric de cron cu stare în admin (0d.40). A rămas: fără Sentry și fără log structurat, deci erorile din webhook și cele neprinse tot ajung doar în `console.error`. Panoul îți spune *că* un job a eșuat; pentru *de ce*, îți trebuie tot logurile.
- **Fără Dockerfile și fără teste E2E.** Scriptul de smoke HTTP există doar într-un scratchpad vechi, nu e în repo.
- **Fără strategie de backup pentru baza platformei** (procedura e în README, dar nu e automatizată).

### Legal și conținut
- ~~GDPR self-service lipsește.~~ **Rezolvat** (0c.28, 0c.29).
- ~~Afirmații de marketing neacoperite și testimoniale inventate.~~ **Rezolvat** (0c.26, 0c.27). „DDoS protection" a rămas ca titlu, cu descrierea rescrisă să nu promită mai mult decât face furnizorul — verifică dacă e adevărat pentru nodurile tale.
- ~~Emailuri lipsă.~~ **Rezolvat** (0c.32) pentru reminder și răspuns la tichet. Notificarea către *staff* la tichet nou încă lipsește.

---

## 4. PRIORITATE MEDIE

- ~~CSRF pe route handlers.~~ **Rezolvat** (0b.4).
- ~~Cinci pagini de admin fără verificare de rol.~~ **Rezolvat** (0b.9).
- ~~Endpoint-uri fără rate limit.~~ **Rezolvat** (0b.8, 0c.20). A rămas doar `payOutstandingAction`.
- ~~Detalii interne în mesajele de eroare.~~ **Rezolvat** (0c.19). A rămas însă forma răspunsurilor: `GET /api/servers` întoarce rânduri întregi, cu `lastError`, ID-uri de provider și config-ul de egg. Selectează explicit câmpurile expuse.
- **Token-ul de websocket pentru consolă e emis cu cheia de client a adminului panoului.** Ocolește `cleanCommand` și mașina de stări pentru power. Folosește un user non-admin sau subuseri.
- **Cupoanele de unică folosință pot fi folosite de mai multe ori:** limita se verifică la crearea comenzii, dar se consumă la finalizare. Rezervă cuponul atomic.
- **Sume sub minimul Stripe** (prorate mici, reînnoiri acoperite aproape integral din credit) produc erori și comenzi `PENDING` blocate. Reportează sumele mici pe factura următoare.
- **Sincronizarea de status bombardează panoul:** lista de admin face până la 200 de apeluri în paralel, toate pe o singură cheie.
- ~~Conexiunea la bază: fără TLS și fără timeout-uri.~~ **Rezolvat** (0c.21). Nu uita `?sslaccept=strict` în `DATABASE_URL` de producție — codul îl suportă, dar nu îl impune.
- **SEO:** canonical-urile sunt rezolvate (0c.34). Rămân: titlul și descrierea sunt doar în engleză și pentru `ro`, textele din catalog (seed) sunt doar în engleză, și lipsesc manifest și apple-icon.
- ~~UX la erori: lipsesc `global-error.tsx` și `loading.tsx`.~~ **Rezolvat** (0b.12, 0c.35).
- **Maparea jocurilor se potrivește doar pentru Minecraft** (un singur port alocat, alegerea imaginii Docker presupune Java). E în regulă cât timp lansezi doar cu Minecraft.
- **`infra/pterodactyl` e strict de dev** (imagini `:latest`, parole publice, HTTP simplu, `docker.sock` montat). Producția cere: noduri Linux cu TLS și hostname-uri reale, domeniul de producție în `allowed_origins` la Wings, pool-uri de porturi per nod, backup-uri în afara nodului, firewall, versiuni de imagini fixate.
- **Polling agresiv:** panoul live la 2-5 s, chat-ul la 3 s.

---

## 5. PRIORITATE MICĂ

- Sesiuni JWT de 30 de zile; logout-ul nu le revocă (doar schimbarea parolei).
- bcrypt cost 10; schema permite parole de 128 de caractere, dar bcrypt trunchiază la 72 de octeți.
- Enumerare de conturi: înregistrarea întoarce `email_taken`, iar login-ul sare peste bcrypt pentru useri inexistenți (diferență de timp).
- OAuth: nu se verifică dacă providerul a confirmat emailul (Discord).
- `verify-email` consumă token-ul la GET, deci un scanner de mail îl poate arde.
- Webhook Stripe: fără deduplicare pe ID-ul evenimentului, fără compararea sumei plătite cu comanda.
- ~~Dependențe.~~ **Rezolvat** (0b.13). Pachetul `cn` **este** folosit, în 21 de fișiere — nu îl șterge.
- `prisma` fiind acum în `dependencies`, CLI-ul său aduce în arbore `mysql2` și `deepmerge-ts`, care au advisory-uri. Nu servesc trafic (sunt folosite doar de tooling), dar apar în `npm audit`.
- Texte hard-codate de mutat în mesaje: „Community", „FAQ", `aria-label="More"`, „Close" (dialog, sheet), „Live chat", „Friday Night SMP".
- Registrele din admin sunt limitate la 200 de rânduri, fără paginare.
- `allowedDevOrigins` e larg (`172.*.*.*`), dar afectează doar dev.

---

## 6. Ce e deja făcut bine (nu pierde timp aici)

- **Autorizare:** fiecare rută și acțiune verifică sesiunea și proprietarul resursei. Nu s-a găsit niciun IDOR. Acțiunile de admin trec toate prin `requireAdmin`, cu audit log și IP.
- **Token-uri de resetare/verificare:** 256 de biți, stocate ca hash SHA-256, cu expirare, de unică folosință prin revendicare atomică.
- **Revocarea sesiunilor:** `sessionVersion` și rolul se reverifică în DB la fiecare `auth()`.
- **Rate limiter-ul e în baza de date**, deci merge pe mai multe instanțe.
- **Cron:** închis implicit fără `CRON_SECRET`, comparație `timingSafeEqual`.
- **Webhook Stripe:** semnătură verificată pe corpul brut, finalizare idempotentă prin revendicarea PENDING→PAID, inclusiv pentru evenimente duplicate sau sosite în altă ordine. Pagina de succes verifică sesiunea direct la Stripe dacă webhook-ul întârzie.
- **Prețuri recalculate mereu pe server**, bani în cenți întregi, reduceri și credit plafonate ca totalul să nu devină negativ.
- **Managerul de fișiere:** `normalizePath` respinge `..`, căi absolute, backslash și caractere de control, cu teste.
- **Dunning:** suspendare după 3 zile, ștergere după 14, iar ștergerea chiar apelează providerul.
- **i18n:** test de paritate a cheilor între `en.json` și `ro.json`; emailuri localizate.
- Fără markeri de conflict, fără TODO/FIXME, fără lorem ipsum, `.env` nu e în git, testele refuză să ruleze pe baza de dev.

---

## 7. Ordinea pe care o propun

Trei runde au închis configurarea nesigură, cele trei căi prin care se pierdeau bani sub concurență, partea legală vizibilă, resize-ul, recuperarea după provizionare eșuată, refund-urile și vizibilitatea cron-urilor. Ce a rămas cere fie conturi externe, fie oameni:

1. **Stripe cap-coadă în test mode, cu chei reale.** Nimic din fluxul de plată nu a atins vreodată API-ul real; tot ce știm despre el vine de la un client fals. Aici intră și 3-D Secure, singurul lucru din plăți încă netratat.
2. **Un panou Pterodactyl real.** Provizionarea, resize-ul și suspendarea sunt scrise după documentație și testate cu provideri falși, dar niciun apel n-a plecat vreodată către un panou. Prima instalare va găsi lucruri.
3. **Avizarea juridică** și **partea fiscală** (TVA, facturi, e-Factura). Paginile există și descriu corect ce face codul; corectitudinea juridică e altceva. Are termene proprii — începe în paralel, nu la final.
4. **Deploy**: VPS cu `next start` în spatele Caddy/nginx, cron de sistem pentru ambele joburi, `?sslaccept=strict`, `TRUSTED_PROXY_HOPS` corect, backup nocturn. Panoul de admin îți va spune imediat dacă cron-ul chiar apelează.
5. **Sentry sau echivalent.** Istoricul de cron îți spune *că* un job a eșuat; pentru *de ce* îți trebuie tot logurile.
6. **CSP complet** cu nonces, și selectarea explicită a câmpurilor în răspunsurile API.
7. **Funcțiile Pterodactyl care lipsesc** (fișiere, backup-uri, jucători, add-on-uri). Ascunse automat acum, deci nu blochează lansarea — dar limitează ce poți vinde. Treci flag-ul din `capabilities` pe `true` pe măsură ce fiecare aterizează.
8. **Verificare de capacitate înainte de plată**, ca `no_capacity` să nu mai apară după ce s-a încasat.
