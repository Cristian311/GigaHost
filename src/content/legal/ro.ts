import type { LegalContent } from "./types";

const UPDATED = "2026-09-20";

/**
 * Traducerea documentelor din `en.ts`, scrise după ce face efectiv codul.
 * Nu au fost avizate juridic — vezi notificarea afișată pe fiecare pagină cât
 * timp LEGAL_REVIEWED nu este setat.
 */
export const legalRo: LegalContent = {
  terms: {
    title: "Termeni și condiții",
    intro: "Înțelegerea dintre tine și noi atunci când închiriezi un server de joc.",
    updated: UPDATED,
    sections: [
      {
        heading: "1. Cine suntem",
        body: [
          "Acești termeni se aplică serviciilor de găzduire de servere de joc vândute prin acest site. Datele firmei, numărul de înregistrare și adresa de contact se află în subsolul fiecărei pagini.",
          "Prin crearea unui cont sau plasarea unei comenzi accepți acești termeni. Dacă nu îi accepți, nu plasa o comandă.",
        ],
      },
      {
        heading: "2. Cine poate comanda",
        body: [
          "Trebuie să ai cel puțin 16 ani pentru a-ți crea un cont și capacitatea legală de a încheia un contract. Dacă ai sub 18 ani, confirmi că un părinte sau tutore acceptă acești termeni în numele tău.",
          "Ești responsabil pentru tot ce se întâmplă în contul tău, inclusiv pentru păstrarea parolei doar pentru tine.",
        ],
      },
      {
        heading: "3. Ce oferim",
        body: [
          "Îți închiriem un server de joc cu resursele alese: memorie, procesor virtual și stocare, în regiunea selectată. Îl administrezi din panoul de control.",
          "Funcțiile afișate în panou depind de joc și de infrastructura folosită. Acolo unde o funcție nu este disponibilă pentru serverul tău, nu este afișată.",
        ],
      },
      {
        heading: "4. Plata și reînnoirea",
        body: [
          "Prețurile sunt afișate înainte de comandă și includ tot ce îți facturăm pentru perioada respectivă. Plata se face la comandă și, pentru un abonament, la începutul fiecărei perioade noi.",
          "Abonamentul se reînnoiește automat până când îl anulezi. Poți anula oricând din panou; serverul rămâne activ până la finalul perioadei deja plătite.",
          "Dacă o plată de reînnoire eșuează, o reîncercăm. Serverul este suspendat după 3 zile de neplată și șters după 14 zile de neplată, împreună cu datele lui. Te anunțăm pe email înaintea fiecăruia dintre acești pași.",
        ],
      },
      {
        heading: "5. Schimbarea planului",
        body: [
          "Poți schimba oricând resursele serverului. O creștere se facturează imediat, proporțional cu zilele rămase din perioadă. O scădere generează un credit folosit la următoarea reînnoire, nu o rambursare în bani.",
        ],
      },
      {
        heading: "6. Utilizare acceptabilă",
        body: ["Nu poți folosi un server oferit de noi pentru:"],
        bullets: [
          "a încălca legea sau a ajuta pe altcineva să o încalce",
          "a trimite spam ori a găzdui phishing sau distribuție de malware",
          "a ataca, scana sau perturba alte rețele ori sisteme",
          "a mina criptomonede sau a rula sarcini fără legătură cu găzduirea de jocuri",
          "a găzdui conținut care încalcă drepturile de autor sau mărcile altcuiva",
          "a hărțui, amenința sau pune în pericol alte persoane",
        ],
      },
      {
        heading: "7. Suspendarea și încetarea",
        body: [
          "Putem suspenda imediat un server dacă este folosit cu încălcarea secțiunii 6, dacă pune în pericol infrastructura noastră sau alți clienți, ori dacă suntem obligați de lege sau de o autoritate competentă.",
          "Acolo unde împrejurările permit, îți spunem motivul și îți dăm ocazia să remediezi situația. Dacă suspendarea a fost greșeala noastră, o ridicăm și îți creditam timpul pierdut.",
          "Îți poți închide contul oricând. Închiderea contului încheie abonamentele la finalul perioadelor plătite.",
        ],
      },
      {
        heading: "8. Conținutul și datele tale",
        body: [
          "Tot ce pui pe server — lumi, configurații, pluginuri, date despre jucători — rămâne al tău. Accesăm aceste date doar pentru a opera serviciul, a remedia o defecțiune sau atunci când legea ne obligă.",
          "Ești responsabil să păstrezi propriile copii ale lucrurilor pe care nu ți le permiți să le pierzi. Datele unui server șters nu pot fi recuperate.",
        ],
      },
      {
        heading: "9. Disponibilitate",
        body: [
          "Facem tot ce ține de noi pentru ca serviciul să funcționeze, dar momentan nu oferim o garanție contractuală de disponibilitate. Mentenanța planificată este anunțată din timp, acolo unde este posibil.",
          "Nimic din această secțiune nu îți limitează drepturile legale de consumator.",
        ],
      },
      {
        heading: "10. Răspundere",
        body: [
          "Răspundem pentru prejudiciul cauzat prin neîndeplinirea obligațiilor noastre din acești termeni, până la valoarea plătită de tine în ultimele 12 luni dinaintea evenimentului.",
          "Nu limităm și nu excludem răspunderea pentru deces sau vătămare corporală din neglijență, pentru fraudă sau pentru orice altceva care nu poate fi limitat prin lege. Ca și consumator, păstrezi întotdeauna drepturile pe care ți le dă legea.",
        ],
      },
      {
        heading: "11. Modificarea termenilor",
        body: [
          "Dacă modificăm acești termeni într-un mod care te afectează, te anunțăm pe email cu cel puțin 30 de zile înainte. Dacă nu accepți modificarea, poți anula înainte ca aceasta să intre în vigoare, iar noi îți rambursăm partea nefolosită din perioadă.",
        ],
      },
      {
        heading: "12. Lege și litigii",
        body: [
          "Se aplică legea română, iar instanțele din România sunt competente. Ca și consumator, poți introduce o acțiune și la instanțele din țara în care locuiești.",
          "Înainte de instanță poți folosi soluționarea alternativă a litigiilor: ANPC și platforma SOL a Comisiei Europene sunt în subsolul paginii. Te rugăm să ne scrii mai întâi nouă — majoritatea lucrurilor se rezolvă mai repede direct.",
        ],
      },
    ],
  },

  privacy: {
    title: "Politica de confidențialitate",
    intro: "Ce date cu caracter personal păstrăm, de ce, și ce poți face în privința lor.",
    updated: UPDATED,
    sections: [
      {
        heading: "1. Operator",
        body: [
          "Firma identificată în subsolul paginii este operatorul datelor descrise aici. Scrie la adresa de contact din subsol pentru orice ține de această politică, inclusiv pentru cererile din secțiunea 6.",
        ],
      },
      {
        heading: "2. Ce colectăm",
        body: ["Colectăm doar ce este necesar pentru funcționarea serviciului:"],
        bullets: [
          "Cont: adresa de email, numele dacă îl oferi, limba aleasă și un hash al parolei. Nu stocăm niciodată parola în sine.",
          "Dacă te autentifici cu Google sau Discord: identificatorul de cont și adresa de email primite de la acel furnizor.",
          "Comenzi și facturare: ce ai comandat, prețul, facturile și starea fiecărei plăți. Datele cardului ajung direct la procesatorul de plăți și nu trec niciodată prin serverele noastre.",
          "Servere: configurația aleasă, adresa serverului și jurnalul lui de activitate (porniri, opriri, backupuri, redimensionări).",
          "Suport: tichetele și mesajele pe care ni le trimiți.",
          "Securitate: momentul încercărilor de autentificare și adresa IP înregistrată odată cu acțiunile administrative și limitele de rată.",
          "Email: o copie a emailurilor tranzacționale trimise, ca să putem arăta ce s-a trimis și când.",
        ],
      },
      {
        heading: "3. De ce le păstrăm și în ce temei",
        body: [
          "Pentru a furniza serviciul comandat și a-l factura — executarea contractului cu tine.",
          "Pentru a menține conturile și infrastructura în siguranță, a preveni abuzurile și a răspunde cererilor de suport — interesul nostru legitim de a opera serviciul în siguranță.",
          "Pentru evidențele contabile — o obligație legală.",
          "Nu folosim datele tale pentru publicitate, nu te profilăm și nu luăm decizii automate cu efecte juridice asupra ta.",
        ],
      },
      {
        heading: "4. Cine le mai vede",
        body: ["Doar furnizorii de care avem nevoie pentru a opera serviciul, și doar ce îi trebuie fiecăruia:"],
        bullets: [
          "procesatorul de plăți, pentru încasări și pentru cardul salvat",
          "furnizorul de email, pentru livrarea emailurilor tranzacționale",
          "furnizorii de găzduire și infrastructură, acolo unde rulează fizic serverele",
        ],
      },
      {
        heading: "5. Cât timp le păstrăm",
        body: [
          "Datele de cont, comenzile și facturile se păstrează atât timp cât legea ne obligă să păstrăm evidențele contabile.",
          "Înregistrările operaționale se șterg automat când nu mai sunt necesare: copiile emailurilor trimise după 90 de zile, activitatea serverelor după 180 de zile, ieșirea din consolă după 30 de zile, jurnalul administrativ după un an, iar token-urile de autentificare expirate în termen de o săptămână.",
          "Conținutul unui server șters dispare odată cu el și nu poate fi recuperat.",
        ],
      },
      {
        heading: "6. Drepturile tale",
        body: [
          "Conform GDPR poți să ne ceri o copie a datelor tale, să le corectăm, să le ștergem, să restrângem sau să oprim o anumită utilizare și să primești datele într-un format portabil. Îți poți retrage și consimțământul acolo unde ne-am bazat pe el.",
          "Scrie la adresa de contact din subsol. Răspundem în termen de o lună.",
          "Dacă crezi că ți-am prelucrat greșit datele, poți depune plângere la ANSPDCP (dataprotection.ro) sau la autoritatea din țara în care locuiești.",
        ],
      },
      {
        heading: "7. Unde se află datele",
        body: [
          "Datele sunt stocate în Spațiul Economic European. Dacă vreun furnizor folosit de noi prelucrează date în afara acestuia, ne bazăm pe clauzele contractuale standard ale Comisiei Europene sau pe o decizie de adecvare.",
        ],
      },
      {
        heading: "8. Securitate",
        body: [
          "Parolele sunt stocate sub formă de hash. Link-urile de autentificare și de resetare a parolei sunt de unică folosință, expiră și sunt stocate tot ca hash, nu în clar. Accesul la sistemele de producție este limitat la persoanele care le operează.",
          "Niciun sistem nu este perfect. Dacă o breșă îți afectează drepturile, te anunțăm pe tine și autoritatea de supraveghere, așa cum cere GDPR.",
        ],
      },
    ],
  },

  cookies: {
    title: "Politica de cookie-uri",
    intro: "Puținele cookie-uri pe care le folosește acest site și la ce servește fiecare.",
    updated: UPDATED,
    sections: [
      {
        heading: "Ce folosim",
        body: [
          "Acest site folosește doar cookie-uri necesare funcționării lui. Nu există publicitate, analytics sau urmărire de la terți — de aceea nu ești întrebat să accepți nimic: consimțământul este necesar pentru cookie-urile neesențiale, iar noi nu setăm niciunul.",
        ],
        bullets: [
          "Cookie de sesiune — te menține autentificat. Se setează la autentificare și dispare la deconectare.",
          "Token de securitate — protejează formularele de autentificare împotriva atacurilor de tip CSRF.",
          "Limbă — reține dacă citești site-ul în română sau engleză.",
          "Temă — reține preferința pentru modul luminos sau întunecat.",
        ],
      },
      {
        heading: "Controlul cookie-urilor",
        body: [
          "Poți șterge sau bloca cookie-urile din setările browserului. Blocarea cookie-ului de sesiune înseamnă că nu poți rămâne autentificat, deci panoul de control nu va funcționa.",
        ],
      },
      {
        heading: "Dacă se schimbă ceva",
        body: [
          "Dacă vom adăuga vreodată un cookie care nu este strict necesar — de exemplu pentru analytics — îți vom cere consimțământul înainte de a-l seta și vom actualiza această pagină.",
        ],
      },
    ],
  },

  withdrawal: {
    title: "Dreptul de retragere",
    intro: "Dreptul tău de a te răzgândi în 14 zile și ce se întâmplă cu el când serverul pornește imediat.",
    updated: UPDATED,
    sections: [
      {
        heading: "Dreptul",
        body: [
          "Ca și consumator în UE ai, în mod normal, 14 zile de la plasarea comenzii pentru a te retrage din ea fără a da vreun motiv. Dreptul vine din Directiva 2011/83/UE, transpusă în România prin OUG 34/2014.",
        ],
      },
      {
        heading: "Ce înseamnă aici",
        body: [
          "Serverul tău este construit și pus la dispoziție în câteva momente de la plată. Pentru serviciile digitale care încep imediat, legea îți permite să ceri începerea lor înainte de expirarea celor 14 zile și îți cere să confirmi că, procedând astfel, dreptul de retragere se stinge odată ce serviciul a fost executat integral.",
          "La plasarea comenzii ți se cere exact această solicitare și confirmare. Este o bifă pe care o faci tu, nu una pre-bifată, și o vezi înainte de a plăti.",
          "Dacă te retragi după ce serviciul a început, dar înainte de finalul perioadei, îți facturăm doar partea folosită, proporțional cu întreaga perioadă.",
        ],
      },
      {
        heading: "Cum te retragi",
        body: [
          "Scrie la adresa de contact din subsol, de pe adresa de email a contului, în termen de 14 zile de la comandă. Nu trebuie să explici de ce. Poți folosi formularul-model de retragere din legislație, dar orice declarație clară este suficientă.",
          "Rambursăm ce se cuvine în termen de 14 zile de la primirea înștiințării, folosind aceeași metodă de plată, dacă nu convenim altfel.",
        ],
      },
      {
        heading: "Anularea, ca alternativă",
        body: [
          "Separat de acest drept, poți anula oricând un abonament din panoul de control. Anularea oprește următoarea reînnoire; serverul rămâne activ până la finalul perioadei deja plătite.",
        ],
      },
    ],
  },
};
