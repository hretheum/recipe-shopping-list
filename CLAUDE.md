# Repo `obsidian` — wtyczka „Lista zakupów"

Referencja projektu: kontekst, ścieżki, wskaźniki. Chronologia i dowody
mieszkają w `docs/sciezka-dowodowa.md`.

## Co to jest

Wtyczka Obsidian (TypeScript, `isDesktopOnly: true`). Z notatek przepisów
(szablon Obsidian Web Clipper, frontmatter `type: recipe`) wyciąga tabelę
`## Ingredients` (kolumna „PL + SI"), normalizuje składniki przez LLM,
sumuje ilości między przepisami i wysyła pozycje na wybraną listę Bring!.

## Układ repozytorium

| Ścieżka | Zawartość |
|---|---|
| `obsidian-lista-zakupow/` | kod wtyczki; `npm run build` (tsc -noEmit + esbuild → `main.js`), `npm test` |
| `obsidian-lista-zakupow/src/` | 12 modułów |
| `obsidian-lista-zakupow/test/` | testy + atrapa modułu `obsidian`; `test/.build/` jest generowany i ignorowany |
| `docs/prompt-lista-zakupow-obsidian-plugin.md` | prompt źródłowy (pole 8 wymaga Ścieżki Dowodowej) |
| `docs/superpowers/specs/2026-07-24-lista-zakupow-integracja-design.md` | spec projektowy (rev. 2) |
| `docs/sciezka-dowodowa.md` | log odczytanych źródeł, decyzje D1–D7, logi testów — **nowe ustalenia dopisujemy tutaj** |

## Przepływ

```
komenda w palecie
  → FileSelectionModal        wybór notatek przepisów (type: recipe)
  → login + fetchLists        Bring!, PRZED pipeline'em LLM
  → ListSelectionModal        wybór listy; domyślnie nowa, o nazwie przepisu
  → IngredientParser → Normalizer (LLM) → Summer
  → resolveChoice             nowa lista powstaje dopiero tutaj
  → pushItems(listUuid, …)
  → SummaryModal
```

Dwie własności tej kolejności, warte zachowania przy zmianach: złe hasło albo
brak sieci wychodzi zanim model przemieli składniki, a nieudana normalizacja
nie zostawia w Bring pustej listy.

## Integracja Bring! — co wiemy o API

Bazowy adres `https://api.getbring.com/rest/v2/`, protokół odwzorowany ze źródeł
opisanych w Ścieżce Dowodowej. Wykorzystywane wywołania:

| Operacja | Żądanie |
|---|---|
| logowanie | `POST bringauth`, form-urlencoded `email`+`password` |
| listy konta | `GET bringusers/{userUuid}/lists` → `lists[].listUuid`, `lists[].name` |
| **utworzenie listy** | `POST bringusers/{userUuid}/lists`, body `name`+`theme` → `{"bringListUUID":"…"}` |
| zapis pozycji | `PUT bringlists/{listUuid}`, form-urlencoded `purchase`+`specification` |

Trzy rzeczy, o które łatwo się potknąć:

1. **Tworzenie listy ma tę samą ścieżkę, co pobieranie list** — różni je metoda.
   Dlatego nie zna go żadna z bibliotek społecznościowych; endpoint pochodzi
   z bundla aplikacji webowej Bringa i został potwierdzony żywym żądaniem.
2. **UUID nowej listy wraca pod kluczem `bringListUUID`**, choć w odpowiedzi
   `loadLists` ten sam identyfikator nazywa się `listUuid`.
3. **Usuwania listy API nie udostępnia.** Listy testowe kasuje się w aplikacji.

Motyw nowych list: `ch.publisheria.bring.theme.home` (wartość domyślna Bringa).
Spacje kodowane jako `+` przez `URLSearchParams` przechodzą poprawnie.

## Testy

`npm test` — esbuild kompiluje moduły do `test/.build`, potem `node --test`.
Adapter chodzi na rejestratorze żądań w miejsce `HttpFn`, więc nic nie wychodzi
na żywe konto. Smoke-test ładuje zbudowany `main.js` na atrapie modułu
`obsidian`; bundle trzeba skopiować pod `.cjs`, bo `package.json` ma
`"type": "module"`.

## Środowisko

`curl`, `npm` i Node nie rozwiązują nazw — `getaddrinfo` jest tu zablokowane.
Ruch wychodzący po IP działa, `dig` chodzi po UDP/53. Stąd dwa obejścia
w scratchpadzie sesji:

- `fetch.sh <url>` — `dig` podaje adres, `curl` dostaje go przez `--resolve`
- `dig-proxy.cjs` — proxy HTTP CONNECT na `127.0.0.1:8899`, które rozwiązuje
  nazwy digiem. `npm install --proxy http://127.0.0.1:8899 --https-proxy http://127.0.0.1:8899`

Token `gh` jest nieważny (`gh auth refresh -h github.com`). `python3` z Xcode CLT
blokuje licencja, działa `/opt/homebrew/bin/python3.12`.

## Kolejne kroki

1. Skasować ręcznie listę „TEST wtyczka Obsidian" w aplikacji Bring (została
   po potwierdzeniu endpointu 2026-09-20).
2. Przeinstalować wtyczkę w vaultcie: `main.js` + `manifest.json` do
   `<vault>/.obsidian/plugins/lista-zakupow/`. Aktualny vault z wtyczką to
   `~/Documents/stary prv` — ścieżka ze specyfikacji (`prv-sync`) już nie istnieje.
3. Stary klucz `bringListName` zostaje w `data.json` po aktualizacji i jest
   ignorowany. Można go usunąć ręcznie przy okazji.

## Konwencje

- Komentarze i komunikaty w kodzie po polsku, z pełnymi diakrytykami.
- Endpointy Bringa cytowane w kodzie z numerami linii źródła (`bring.ts:154-183`) —
  utrzymywać ten zwyczaj przy dokładaniu wywołań.
- Dane logowania Bring! leżą jawnym tekstem w `data.json` wtyczki (decyzja D6);
  `.obsidian/plugins/lista-zakupow/data.json` ma być wykluczony z synchronizacji.
