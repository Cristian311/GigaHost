# Pterodactyl local, pentru testare

Ghidul ăsta pornește pe PC-ul tău (Windows 11) un panou Pterodactyl și un nod Wings în Docker, ca GigaHost să creeze servere Minecraft adevărate. Configurația e aceeași ca pe un server dedicat; la mutarea în producție se schimbă doar adresele.

> **Doar pentru test.** Parolele din `docker-compose.yml` sunt publice, iar serverele se opresc când închizi PC-ul.

Durează cam o oră prima dată. Ai nevoie de cel puțin 8 GB RAM liberi.

## 1. Instalează Docker Desktop

1. Descarcă și instalează [Docker Desktop](https://www.docker.com/products/docker-desktop/). La instalare lasă bifat **Use WSL 2**.
2. Repornește PC-ul dacă ți se cere, apoi deschide Docker Desktop și așteaptă să scrie „Engine running”.
3. Verifică într-un terminal nou:
   ```bash
   docker --version
   docker compose version
   ```

## 2. Pornește panoul

Din folderul proiectului:

```bash
cd infra/pterodactyl
docker compose up -d database cache panel
```

Prima pornire descarcă imaginile și rulează migrările panoului (1–3 minute). Urmărește cu `docker compose logs -f panel` până nu mai apar mesaje noi.

Creează contul de administrator al panoului:

```bash
docker compose exec panel php artisan p:user:make
```

Răspunde cu `yes` la „Is this user an administrator?”, apoi completezi emailul, username-ul, numele și parola.

Deschide **http://host.docker.internal:8081** și loghează-te.

## 3. Creează o locație

**Admin (rotița din dreapta sus) → Locations → Create New**: short code `local`. După salvare, ID-ul apare în adresa paginii (`/admin/locations/view/1` → ID `1`). **Notează-l.**

## 4. Creează nodul

**Admin → Nodes → Create New**:

| Câmp | Valoare |
|---|---|
| Name | `local` |
| Location | `local` |
| FQDN | `host.docker.internal` |
| Communicate Over SSL | **Use HTTP Connection** |
| Behind Proxy | Not Behind Proxy |
| Total Memory | cât RAM vrei să dai serverelor, ex. `8192` |
| Memory Over-Allocation | `0` |
| Total Disk Space | ex. `50000` |
| Disk Over-Allocation | `0` |
| Daemon Port | `8080` |
| Daemon SFTP Port | `2022` |

## 5. Adaugă porturi (alocări)

În pagina nodului → tab-ul **Allocation**:

- **IP Address**: `0.0.0.0`
- **IP Alias**: `localhost` (sau IP-ul PC-ului în rețeaua locală, ex. `192.168.1.20`, dacă vrei să intre și alții din casă). Alias-ul e adresa pe care GigaHost o arată clienților.
- **Ports**: `25565-25575`

Fiecare server Minecraft ocupă un port, deci 11 porturi = 11 servere.

## 6. Pornește Wings

1. În pagina nodului → tab-ul **Configuration**, copiază tot blocul YAML.
2. Creează fișierul `infra/pterodactyl/wings/config.yml` și lipește conținutul (fișierul e ignorat de git, conține cheia nodului).
3. Adaugă la final, ca browserul să poată deschide consola live din GigaHost:
   ```yaml
   allowed_origins:
     - http://localhost:3000
     - http://localhost:3001
   ```
4. Pornește nodul:
   ```bash
   docker compose up -d wings
   ```
5. În **Admin → Nodes**, inima de lângă nod trebuie să devină verde în câteva secunde.

## 7. Notează ID-urile pentru Minecraft

**Admin → Nests → Minecraft**. ID-ul nest-ului e în adresă (`/admin/nests/view/1` → `1`). În aceeași pagină, deschide egg-urile **Paper** și **Vanilla Minecraft** și notează ID-urile lor (`/admin/nests/egg/3` → `3`).

## 8. Creează cheile API

1. **Cheia Application**: Admin → **Application API** → Create New. Dă **Read & Write** la *Servers* și **Read** la *Nodes*, *Allocations*, *Locations*, *Nests*, *Users*. Cheia începe cu `ptla_`.
2. **Cheia Client**: iconița de cont din dreapta sus → **API Credentials** → Create (lasă „Allowed IPs” gol). Cheia începe cu `ptlc_`.
3. **ID-ul tău de utilizator**: Admin → Users → contul tău; ID-ul e în adresă.

## 9. Conectează GigaHost

În `.env` din rădăcina proiectului:

```env
SERVER_PROVIDER="pterodactyl"
PTERODACTYL_URL="http://host.docker.internal:8081"
PTERODACTYL_APP_KEY="ptla_..."
PTERODACTYL_CLIENT_KEY="ptlc_..."
PTERODACTYL_OWNER_USER_ID="1"
```

Repornește `npm run dev`. Dacă lipsește ceva, serverul afișează la pornire exact ce variabilă e greșită.

> Serverele create cu mock-ul nu există în Pterodactyl. Pentru un început curat rulează `npm run db:reset`.

## 10. Configurează din admin-ul GigaHost

1. **/admin**: bara de sus trebuie să arate „Pterodactyl · Conectat”.
2. **/admin/games** → Minecraft: Java (Paper) → secțiunea Pterodactyl: *Nest ID* și *Egg ID* de la pasul 7. Apasă **Verifică egg-ul**: trebuie să apară variabilele `MINECRAFT_VERSION`, `SERVER_JARFILE`, `BUILD_NUMBER`. Salvează. La fel pentru Vanilla (variabila versiunii e `VANILLA_VERSION`).
3. **/admin/regions** → București → *ID locație Pterodactyl* de la pasul 3 → **Verifică** → Salvează. Regiunile fără locație nu apar în configurator.

## 11. Testează

1. **/configure** → Paper → versiunea dorită → comandă.
2. În dashboard, serverul trece prin *Se instalează* (1–3 minute prima dată, se descarcă Java și Paper) → *Oprit*.
3. **Pornește** → consola live arată logurile. Când apare `Done (…)! For help, type "help"`, trimite `say salut` din câmpul de comenzi.
4. În Minecraft: **Multiplayer → Direct Connection** → adresa afișată în dashboard (ex. `localhost:25565`).

## Prieteni din afara casei

Ai două variante:
- **Port forwarding** pe router pentru TCP `25565-25575` către IP-ul PC-ului, apoi pui IP-ul tău public ca *IP Alias* pe alocări.
- **[playit.gg](https://playit.gg)**: un tunel gratuit, fără setări pe router. Pui adresa primită de la playit ca *IP Alias*.

## Probleme frecvente

| Simptom | Cauză probabilă |
|---|---|
| Inima nodului rămâne roșie | `docker compose logs wings`. De obicei `config.yml` lipsește sau e în alt folder. |
| „Pterodactyl · Indisponibil” în admin | Panoul nu rulează sau `PTERODACTYL_URL` e greșit. Deschide URL-ul în browser. |
| Comanda eșuează cu „Locația este plină” | Nu mai sunt porturi libere (pasul 5) sau nodul nu mai are RAM (pasul 4). |
| Consola stă pe „Se conectează…” | Lipsește `allowed_origins` în `config.yml` (pasul 6) sau portul 8080 e blocat. |
| Wings pornește, dar serverele nu | Rețeaua Docker `pterodactyl_nw` se suprapune cu alta. `docker network ls`, apoi schimbă `docker.network.interface`/subnet în `config.yml`. |

## Oprire și ștergere

```bash
docker compose down      # oprește tot, păstrează datele
docker compose down -v   # șterge și baza de date a panoului
```

Fișierele serverelor de joc stau în mașina virtuală Docker, în `/var/lib/pterodactyl`.
