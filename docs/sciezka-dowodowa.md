# Ścieżka Dowodowa — wtyczka Obsidian „lista zakupów"

Dokument wymagany przez prompt (pole 8). Uzupełniany w trakcie realizacji.

## 1. Log źródeł faktycznie odczytanych (data sprawdzenia: 2026-07-24)

### Bring! — biblioteki i protokół
- npm registry API + npm downloads API: pakiet `bring-shopping` (v2.0.1, 2025-01-21, MIT, 167 pobrań/tydz., TypeScript, zero zależności runtime, natywny `fetch`)
- https://github.com/foxriver76/node-bring-api — źródło `src/bring.ts` (API: `login`, `loadLists`, `getItems`, `saveItem(listUuid, itemName, specification)`, `removeItem`, …)
- https://github.com/miaucl/bring-api — `bring_api/const.py`, `bring_api/bring.py` (referencyjna, aktywnie utrzymywana biblioteka Pythona używana przez Home Assistant):
  - Base URL: `https://api.getbring.com/rest/`
  - Nagłówki stałe: `X-BRING-API-KEY: cof4Nc6D8saplXjE3h3HXqHH8m7VU2i1Gs0g85Sp`, `X-BRING-CLIENT: android`, `X-BRING-APPLICATION: bring`, `X-BRING-COUNTRY: DE`
  - Login: `POST v2/bringauth` (form: email, password) → `access_token`, `token_type`, user UUID, public UUID; potem `Authorization: <token_type> <access_token>` + `X-BRING-USER-UUID` + `X-BRING-PUBLIC-USER-UUID`
  - Dodanie pozycji (nowszy wariant): `PUT v2/bringlists/{listUuid}/items`, JSON `{"changes":[{"itemId": <nazwa>, "spec": <specyfikacja>, "uuid": <itemUuid>, "operation":"ADD"}], "sender":""}`
  - Wariant starszy (używany przez `bring-shopping`): `PUT v2/bringlists/{listUuid}`, form-urlencoded `purchase=...&specification=...`
- Pakiety martwe/nieistniejące: `bring-api` na npm (2019, 5 pobrań/tydz., bez typów — kolizja nazwy z projektem Pythona), `node-bring-api`/`bringapi` — 404 na npm.

### Bring! — tworzenie listy (data sprawdzenia: 2026-09-20)

Pytanie: czy nieoficjalne API pozwala założyć listę? Sprawdziłem cztery
niezależne implementacje i **żadna takiego wywołania nie ma**:
miaucl/bring-api (Python, 22 metody publiczne, listy tylko do odczytu),
foxriver76/node-bring-api (TS, 14 metod, zero POST na `bringlists`),
helvete003/bring-api (PHP, opisana przez autora jako niekompletna),
costantinoai/bring-shopping-card (karta Home Assistanta; `websocket_api.py`
wystawia wyłącznie get_lists, get_items, add_item, complete_item, update_item,
reorder_items — pod spodem opakowuje bring-api).
Ślepy trop: `developer.bring.com` należy do firmy Posten Bring (logistyka
norweska). Z aplikacją zakupową Bring! łączy ją wyłącznie nazwa.

Rozstrzygnięcie przyszło z **własnego kodu aplikacji webowej Bringa**:
pobrany `https://web.getbring.com/main.bundle.js` (966 kB, Angular, 2026-09-20),
moduł `./src/app/core/bring-api-resources.ts`:

```js
BRING_API_RESOURCES.lists = {
    listItems:       'v2/bringlists/{listUuid}',
    listItemDetails: 'v2/bringlists/{listUuid}/details',
    listUsers:       'v2/bringlists/{listUuid}/users',
    create:          'v2/bringusers/{userUuid}/lists'
}
```

oraz `BringListsDataService.prototype.createList`:

```js
createList = function (userUuid, name, theme) {
    var url = this.getUrlReplaced(BRING_API_RESOURCES.lists.create, { userUuid: userUuid });
    var formContent = this.getUrlEncoded({ name: name, theme: theme });
    var options = this.getRequestOptionsWithUrlEncodedHeader();
    return this.http.post(url, formContent, options).map(function (res) { return res; });
};
```

Uzupełnienia z tego samego bundla: `getRequestOptionsWithUrlEncodedHeader()` ustawia
`Content-Type: application/x-www-form-urlencoded`; `BringListTheme.DEFAULT_THEME =
'ch.publisheria.bring.theme.home'`; `environment.bringapi.baseUrl =
'https://api.getbring.com/rest/'` (ta sama stała, co `BASE_URL` w `BringAdapter.ts`).

Żądanie w całości:

```
POST https://api.getbring.com/rest/v2/bringusers/{userUuid}/lists
Content-Type: application/x-www-form-urlencoded
Authorization: Bearer <access_token>  + nagłówki X-BRING-* jak przy pozostałych wywołaniach
name=<nazwa>&theme=ch.publisheria.bring.theme.home
```

Dlaczego przegapiły to wszystkie cztery biblioteki: ścieżka jest identyczna
z tą do pobierania list (`users.lists = 'v2/bringusers/{userUuid}/lists'`).
Różni je tylko metoda — GET czyta, POST tworzy.

**Potwierdzone żywym żądaniem na koncie Eryka (2026-09-20, za jego zgodą).**
Powstała lista „TEST wtyczka Obsidian" — do skasowania ręcznie w aplikacji, bo
API nie zna usuwania listy (mapa zasobów ma wyłącznie `create`):

```
[1] POST v2/bringauth               -> HTTP 200
[2] GET  v2/bringusers/{uuid}/lists -> HTTP 200, 2 listy
[3] POST v2/bringusers/{uuid}/lists -> HTTP 200
    body: name=TEST+wtyczka+Obsidian&theme=ch.publisheria.bring.theme.home
    odpowiedź: {"bringListUUID":"<uuid nowej listy>"}
[4] GET  v2/bringusers/{uuid}/lists -> HTTP 200, 3 listy
    nowa pozycja o nazwie dokładnie "TEST wtyczka Obsidian"
```

Dwa wnioski dla implementacji:

1. Odpowiedź niesie UUID nowej listy pod kluczem **`bringListUUID`**. W odpowiedzi
   `loadLists` ten sam identyfikator nazywa się `listUuid`, więc przy mapowaniu
   trzeba uważać. Drugie żądanie po UUID jest zbędne.
2. Spacja zakodowana jako `+` przechodzi poprawnie, nazwa wraca bez zniekształceń.
   `URLSearchParams`, którego używa `BringAdapter.ts`, nadaje się bez zmian.

### Obsidian Plugin API
- https://github.com/obsidianmd/obsidian-sample-plugin (master, pliki raw): `manifest.json`, `package.json`, `esbuild.config.mjs`, `tsconfig.json`, `src/main.ts`, `src/settings.ts`, `versions.json` — kod w `src/`, build: `tsc -noEmit -skipLibCheck && node esbuild.config.mjs production`, format wyjścia CJS, target ES2021, devDependencies: `obsidian@latest`, `esbuild@0.25.5`, `typescript@^5.8.3`, `@types/node@^22`, ESLint 9 + `eslint-plugin-obsidianmd`
- https://github.com/obsidianmd/obsidian-api → `obsidian.d.ts` (8498 linii, pobrany w całości; kopia robocza w scratchpadzie sesji) — sygnatury: `Plugin` (addCommand, addSettingTab, loadData/saveData), `Modal`, `SuggestModal`/`FuzzySuggestModal`, `PluginSettingTab` + `Setting`, `Notice`, `Vault` (getMarkdownFiles, cachedRead, getFileByPath), `MetadataCache` (getFileCache → frontmatter), `requestUrl`
- https://docs.obsidian.md/Reference/Manifest — pola manifestu (uwaga: `id` nie może kończyć się na `plugin`; `isDesktopOnly: true` wymagane przy użyciu API Node/Electron)
- https://docs.obsidian.md/Reference/TypeScript+API/requestUrl — „without any CORS restrictions"; brak wsparcia streamingu; `throw` domyślnie true; getter `.json` rzuca przy niepoprawnym JSON
- CORS w praktyce: https://github.com/ollama/ollama/issues/3827, https://forum.obsidian.md/t/make-http-requests-from-plugins/15461, https://forum.obsidian.md/t/support-streaming-the-request-and-requesturl-response-body/87381

### LLM — kontrakt OpenAI Chat Completions / Ollama / llama.cpp
- https://docs.ollama.com/api/openai-compatibility — `/v1/chat/completions` na porcie 11434; klucz API ignorowany (placeholder wystarcza); wspierane m.in. `response_format`, `stream`; NIEwspierane: `tool_choice`, `logit_bias`, `n`
- https://github.com/ollama/ollama/issues/10001 — OpenAI-owe structured outputs (`response_format.json_schema`) przez `/v1` są CICHO ignorowane; działa tylko `{"type":"json_object"}` (mapowane na natywny `format: "json"`)
- Ollama natywne `/api/chat` — parametr `format` przyjmuje goły JSON Schema (constrained decoding) lub `"json"`; przy `format: "json"` docs wymagają jawnej instrukcji „zwróć JSON" w promptcie
- https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md — llama-server serwuje `/v1/chat/completions`; wspiera i `json_object`, i `json_schema`; domyślnie `127.0.0.1:8080`
- platform.openai.com — 403 dla ruchu botów; kontrakt potwierdzony krzyżowo przez dokumentacje Ollama i llama.cpp (obie go odwzorowują)

## 2. Decyzje z uzasadnieniem

| # | Decyzja | Uzasadnienie | Status |
|---|---|---|---|
| D1 | Integracja Bring!: własny minimalny klient przez `requestUrl` zamiast pakietu `bring-shopping` | `bring-shopping` używa natywnego `fetch`; w Obsidianie `fetch` podlega CORS (origin `app://obsidian.md`), a `api.getbring.com` nie wysyła nagłówków CORS — biblioteka najpewniej nie zadziała w rendererze. `requestUrl` omija CORS. Protokół udokumentowany z 2 niezależnych, żywych bibliotek (miaucl/bring-api, foxriver76/node-bring-api); zakres portu: login + loadLists + saveItem (~60-100 linii) | **zaakceptowana przez Eryka 2026-07-24** |
| D2 | Kontrakt LLM: generyczne OpenAI Chat Completions, non-streaming, `response_format: {"type":"json_object"}` + jawna instrukcja JSON w promptcie | Wspólny mianownik OpenAI/Ollama/llama.cpp/LM Studio/OpenRouter; `json_schema` nieprzenośne (Ollama `/v1` cicho ignoruje — issue #10001); `requestUrl` i tak nie streamuje, więc `stream: false` obowiązkowe | przyjęta (wynika z researchu + spec) |
| D3 | Wybór notatek: `FuzzySuggestModal<TFile>` | Wbudowany fuzzy-search; do implementacji tylko `getItems`/`getItemText`/`onChooseItem`; filtrowanie po `type: recipe` przez `MetadataCache.getFileCache().frontmatter` (synchronicznie, bez czytania dysku) | przyjęta |
| D4 | Czytanie przepisów: `Vault.cachedRead` | JSDoc API: do samego parsowania/wyświetlania `cachedRead` jest właściwe (nie modyfikujemy plików źródłowych) | przyjęta |
| D5 | Parser: mechaniczna ekstrakcja wierszy + heurystyki filtrujące + ostateczna klasyfikacja przez LLM | Realne pliki mają w tabeli Ingredients wmieszane wiersze instrukcji („Carbonara z młodą kapustą") i notki o temperaturze („Kanapka z pieczoną rybą") — sam regex nie odróżni ich niezawodnie od składników | przyjęta |
| D6 | Sposób przechowywania danych logowania Bring!: jawny tekst w data.json wtyczki + ostrzeżenie w UI ustawień | Standard wśród wtyczek Obsidian; warunek po stronie użytkownika: wykluczyć `.obsidian/plugins/lista-zakupow/data.json` z prv-sync. Alternatywa (Keychain przez `security` CLI) odrzucona na MVP jako nadmiarowa | **zaakceptowana przez Eryka 2026-07-24** |
| D7 | Wybór listy zakupowej przeniesiony ze stałej nazwy w ustawieniach do modalu przy każdym wysłaniu; domyślną propozycją jest nowa lista o nazwie przepisu | Nazwa wpisana w ustawieniach rozjeżdżała się z kontem (literówka wychodziła dopiero po normalizacji LLM, czyli po całym koszcie modelu). Logowanie i `fetchLists` przed pipeline'em przenoszą ten błąd na sam początek. Endpoint zakładania listy (`POST v2/bringusers/{userUuid}/lists`) odczytany z bundla aplikacji webowej Bringa i potwierdzony żywym żądaniem — sekcja 1. Ustawienie `bringListName` usunięte, `resolveListUuid` (dopasowanie po nazwie) razem z nim | **zaakceptowana przez Eryka 2026-09-20** |

## 3. Pakiety npm do instalacji (zaakceptowane przez Eryka 2026-07-24)

**Toolchain builda (devDependencies — standard wtyczek Obsidian, narzucony przez artefakt z promptu):**
- `obsidian` (latest) — typy API + moduł external w bundlu
- `esbuild` (0.25.5 — wersja przypięta w oficjalnym sample-plugin)
- `typescript` (^5.8.3)
- `@types/node` (^22)
- (bez ESLint w MVP — nie jest potrzebny do `npm run build`)

**Runtime:** brak (decyzja D1: własny klient Bring! przez `requestUrl`, YAML przez wbudowane w Obsidian `parseYaml`/`stringifyYaml` — zero zależności runtime).

## 4. Log żądania BringAdapter (bez wysyłki na żywo — dane fikcyjne, HTTP przez rejestrator)

Dodatkowa weryfikacja źródłowa przed implementacją: pobrano w całości
`https://raw.githubusercontent.com/foxriver76/node-bring-api/master/src/bring.ts`
(441 linii, 2026-07-24) — endpointy cytowane w kodzie adaptera z numerami linii
(login: 154-183, loadLists: 188-201, saveItem: 247-258, nagłówki: 143-148).
Odstępstwo od bring.ts: body PUT kodowane przez `URLSearchParams` — bring.ts
skleja surowy string, co psuje nazwy z `&`/znakami spoza ASCII; referencyjna
biblioteka Pythona (miaucl/bring-api) też koduje poprawnie.

Faktyczny log z testu `test-bring-dryrun.mjs` (2 pozycje, lista wybrana po nazwie "Dom"):

```
[1] POST https://api.getbring.com/rest/v2/bringauth
    contentType: application/x-www-form-urlencoded; charset=UTF-8
    headers: {"X-BRING-API-KEY":"cof4Nc6D8saplXjE3h3HXqHH8m7VU2i1Gs0g85Sp","X-BRING-CLIENT":"webApp","X-BRING-CLIENT-SOURCE":"webApp","X-BRING-COUNTRY":"DE"}
    body: email=test%40example.com&password=FIKCYJNE-HASLO

[2] GET https://api.getbring.com/rest/v2/bringusers/USER-UUID-123/lists
    headers: {... jw. + "Authorization":"Bearer TOKEN-ABC","X-BRING-USER-UUID":"USER-UUID-123"}

[3] PUT https://api.getbring.com/rest/v2/bringlists/LIST-UUID-DOM
    contentType: application/x-www-form-urlencoded; charset=UTF-8
    headers: {... jw. z Authorization}
    body: purchase=Koperek&recently=&specification=2%C3%97+p%C4%99czek+%E2%80%94+Najlepsze+schabowe+na+%C5%9Bwiecie%2C+M%C5%82oda+kapusta&remove=&sender=null

[4] PUT https://api.getbring.com/rest/v2/bringlists/LIST-UUID-DOM
    body: purchase=S%C3%B3l+%26+pieprz+test&recently=&specification=Najlepsze+schabowe+na+%C5%9Bwiecie&remove=&sender=null
```

Asercje (7/7 PASS): kolejność login→lists→2×saveItem; lista po nazwie, nie
pierwsza z brzegu; nagłówki auth; stały API-key we wszystkich żądaniach;
form-urlencoded z purchase+specification; znaki specjalne zakodowane; hasło
wyłącznie w body loginu.

## 5. Rzeczywiste outputy testów i builda (2026-07-24)

**`npm run build`** (tsc -noEmit + esbuild production):
```
> tsc -noEmit -skipLibCheck && node esbuild.config.mjs production
EXIT: 0
```
0 błędów TypeScript; artefakt `main.js` wygenerowany.

**Parser na 3 realnych przepisach** (`test-parser.mjs`):
- „Najlepsze schabowe na świecie": 24 wiersze składników; etykiety sekcji
  „Masło ziołowe:" i „Młoda kapusta:" poprawnie zignorowane; widełki
  („1–2 łyżki"), „opcjonalnie:" i wiersze bez ilości zachowane.
- „Carbonara z młodą kapustą": 14 wierszy (8 składników + 6 zdań instrukcji
  wmieszanych w tabelę — przechodzą dalej zgodnie z decyzją D5, klasyfikuje LLM).
- „Kanapka z pieczoną rybą": 24 wiersze (21 składników + 3 notki o temperaturze).

**Pipeline Normalizer+Summer** (`test-pipeline.mjs`, LLM = atrapa, 14/14 PASS):
koperek z 2 przepisów → JEDNA pozycja „Koperek — 2× pęczek — <oba przepisy>"
(DoD #3 na poziomie logiki); retry po zepsutym JSON; zdejmowanie ```json```;
filtrowanie instrukcji; sól bez ilości; „(opcjonalnie)" w specyfikacji;
round_to 0.5: 0.6→1 kg; ceil jednostek sztukowych; różne jednostki tego samego
składnika NIE sumują się na ślepo.

**Smoke-test ładowania wtyczki** (`test-plugin-load.cjs`, atrapa modułu
'obsidian', 7/7 PASS): bundle ładuje się bez wyjątku, komenda i zakładka
ustawień zarejestrowane, ustawienia przeżywają symulowany restart
(saveData→loadData), wartości domyślne uzupełniają brakujące klucze.

**Testy w repozytorium (od 2026-09-20).** Powyższe testy żyły dotąd tylko
w scratchpadzie sesji. Wraz z D7 trafiły do projektu jako `npm test`
(15/15 PASS): `test/BringAdapter.test.mjs` na rejestratorze żądań
(fetchLists, createList, pushItems, jedno logowanie na adapter, brak
zapamiętywania nieudanego logowania, odporność na błąd pojedynczej pozycji),
`test/ListSelectionModal.test.mjs` (nazwa domyślna, rozstrzyganie wyboru)
oraz `test/plugin-load.test.cjs` (smoke-test bundla).
Uwaga techniczna: bezpośrednie `require('main.js')` w Node wymaga kopii
jako `.cjs` (package.json ma `"type":"module"` — standard sample-plugina);
w Obsidianie bez znaczenia, ładuje CJS po swojemu.

## 6. Status Standardu Przeglądu (DoD)

| # | Warunek | Status |
|---|---|---|
| 1 | `npm run build` bez błędów TS | ✅ log wyżej |
| 2 | Parser: wszystkie pozycje z obu plików testowych, etykiety sekcji ignorowane | ✅ log wyżej (3 pliki, nie 2) |
| 3 | Koperek z 2 przepisów → jedna zsumowana pozycja | ✅ na poziomie logiki (LLM = atrapa); test z żywym LLM oczekuje na adres endpointu Ollama (k12) |
| 4 | BringAdapter buduje realne żądania bez wysyłki, log w Ścieżce Dowodowej | ✅ sekcja 4 |
| 5 | Wtyczka ładuje się bez błędów w konsoli | ⚠️ częściowo: smoke-test z atrapą 'obsidian' PASS; weryfikacja w realnym Obsidianie wymaga instalacji w vaultcie = Brama Ludzka |
| 6 | SettingsTab zapisuje/odczytuje wszystkie pola, dane przetrwują restart | ✅ symulacja restartu w smoke-teście; w realnym Obsidianie do potwierdzenia przy instalacji |

## 7. Niepewności do ręcznej weryfikacji przez człowieka
- Protokół Bring! jest nieoficjalny — nagłówek `X-BRING-API-KEY` to stała wartość wyciągnięta z aplikacji; może zostać unieważniona przy zmianie backendu Bring.
- `bring-shopping` utrzymywany do 2025-01; miaucl/bring-api aktywny — przy problemach z protokołem sprawdzać najpierw ten drugi.
- Zachowanie CORS `fetch` w Obsidianie potwierdzone źródłami społecznościowymi i docs `requestUrl`, ale nie testem na żywym Bring! (test na żywym koncie wymaga osobnej zgody — GRANICE).
- Test Normalizera z żywym LLM nie wykonany: Ollama nie odpowiada na localhost:11434 na tej maszynie, a adres serwera k12 nie jest znany (otwarte pytanie ze spec). Logika zweryfikowana atrapą.
- Sposób przechowania sekretu Bring!: rozstrzygnięte (D6 — data.json + wykluczenie z sync); PAMIĘTAJ o faktycznym wykluczeniu `.obsidian/plugins/lista-zakupow/data.json` z prv-sync po instalacji.
