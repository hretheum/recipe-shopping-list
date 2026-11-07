# PROMPT: Wtyczka Obsidian — lista zakupów z przepisów (Ingredients → Bring!)

## 1. WYNIK (nazwany artefakt)

Gotowy katalog wtyczki Obsidian `obsidian-lista-zakupow/` zawierający:
- `main.ts` — rejestracja komendy w palecie poleceń
- `manifest.json`, `package.json`, konfiguracja builda (esbuild/tsconfig zgodnie ze standardem
  wtyczek Obsidian)
- `FileSelectionModal.ts` — wybór 1-2 notatek przepisów
- `IngredientParser.ts` — parsowanie tabeli `## Ingredients` (kolumna `PL + SI`)
- `Normalizer.ts` — wywołanie skonfigurowanego endpointu LLM (OpenAI Chat Completions API)
- `Summer.ts` — grupowanie i sumowanie ilości
- `ShoppingListAdapter.ts` (interfejs) + `BringAdapter.ts` (pełna implementacja, nie mock)
- `SettingsTab.ts` — konfiguracja endpointu LLM, danych logowania Bring!, lokalizacji słownika
- przykładowy `ingredient_units.yaml` (startowy słownik, kilka wpisów jak w spec)

Wszystkie pliki muszą się wzajemnie zgadzać (spójne typy/interfejsy) i całość musi się budować
komendą `npm run build` bez błędów kompilacji TypeScript — to jeden, spójny artefakt, nie luźny
zbiór plików.

## 2. PAKIET ŹRÓDŁOWY (przeczytaj i zweryfikuj wobec rzeczywistości, nie zakładaj)

**Autorytatywne (rozstrzygają w razie sprzeczności):**
- `/Users/eorlowski/dev/obsidian/docs/superpowers/specs/2026-07-24-lista-zakupow-integracja-design.md`
  — pełny spec projektowy, rozstrzyga wszystko poza jego własnymi "Otwartymi pytaniami"
- `/Users/eorlowski/Documents/prv-sync/source/prv/kukbuk/Najlepsze schabowe na świecie.md`
  — realny przykład formatu wejściowego: wiersze-etykiety sekcji bez gwiazdki ("Masło ziołowe:",
  "Młoda kapusta:"), widełki ilości ("1–2 łyżki"), niejasne ilości ("duża garść koperku"),
  prefiksy "opcjonalnie:"

**Kontekstowe, zweryfikować na żywo (nie zakładać z pamięci treningowej):**
- Oficjalna dokumentacja Obsidian Plugin API (struktura main.ts, Modal, PluginSettingTab,
  manifest.json)
- Aktualny stan pakietów npm do komunikacji z Bring! — spec wskazuje realną niepewność (brak
  potwierdzonej biblioteki JS/TS, dojrzałe biblioteki są w Pythonie)
- Kontrakt OpenAI Chat Completions API i jego zgodność z endpointem Ollama `/v1`

## 3. DOSTĘP DO NARZĘDZI

**Pełny zapis:** `/Users/eorlowski/dev/obsidian` (katalog roboczy projektu wtyczki).

**Tylko odczyt:** pliki z Pakietu Źródłowego (pole 2) oraz cały katalog
`/Users/eorlowski/Documents/prv-sync/source/prv/kukbuk/` — dodatkowe przepisy jako materiał do
sprawdzenia parsera na więcej niż jednym przykładzie formatu.

**Internet:** dozwolone wyłącznie przeglądanie (read-only) npm registry, GitHub, oficjalnej
dokumentacji Obsidian Plugin API, dokumentacji OpenAI Chat Completions API i Ollama — w celu
weryfikacji faktów (np. czy istnieje aktualna biblioteka JS/TS do Bring!, aktualny kształt API).
Zabronione: `npm install` pakietów firm trzecich bez wcześniejszego wypisania ich w Ścieżce
Dowodowej do akceptacji przez człowieka; jakiekolwiek żądania do prawdziwego konta Bring! z realnymi
danymi logowania; wypełnianie/wysyłanie jakichkolwiek formularzy w sieci.

**Całkowicie zabronione:** `git push`/commit do jakiegokolwiek repozytorium; SSH lub sieć do hostów
innych niż wymienione wyżej (npm registry, GitHub, dokumentacja); testowanie integracji Bring! na
prawdziwym koncie bez wyraźnego pytania i zgody.

## 4. GRANICE

- Nigdy nie używa/testuje realnych danych logowania Bring! na żywym koncie — implementacja kodu
  tak, wywołanie z prawdziwymi danymi nie, bez wyraźnej zgody.
- Nigdy nie modyfikuje plików spoza katalogu pełnego zapisu (`/Users/eorlowski/dev/obsidian`) —
  w szczególności nie dotyka innych przepisów ani innych wtyczek w vaulcie.
- Zatrzymuje się i pyta, jeśli research wykaże brak jakiejkolwiek sensownej biblioteki JS/TS do
  Bring! i jedyną opcją zostaje własny reverse-engineering protokołu od zera — to zmienia
  zakres/ryzyko projektu i wymaga decyzji człowieka, nie cichego podjęcia decyzji przez model.
- Musi cytować źródło (dokumentację/kod biblioteki), a nie zgadywać z pamięci treningowej, przy:
  kształcie API Bring!, kontrakcie OpenAI Chat Completions API, strukturze manifest.json Obsidian.
- Zatrzymuje się przed ostatecznym wyborem sposobu przechowywania sekretu (dane logowania Bring!
  w ustawieniach wtyczki) — to punkt z sekcji "Ryzyka" w spec, wymaga akceptacji człowieka przed
  wdrożeniem na stałe, nie tylko wzmianki w kodzie.

## 5. PLAN PRACY

1. Zweryfikuj otwarte pytania z researchu (biblioteka JS/TS do Bring!, kontrakt Obsidian Plugin
   API, format endpointu Ollama `/v1`) — udokumentuj ustalenia przed pisaniem kodu.
2. Zbuduj szkielet wtyczki (manifest.json, main.ts, konfiguracja builda).
3. Zaimplementuj `IngredientParser` i sprawdź go na obu dostępnych przykładach przepisów, w tym
   przypadkach brzegowych: wiersze-etykiety sekcji, widełki ilości, niejasne ilości, prefiksy
   "opcjonalnie:".
4. Zaimplementuj `Normalizer` + `Summer` + startowy `ingredient_units.yaml`.
5. Zaimplementuj `ShoppingListAdapter` (interfejs) + pełny `BringAdapter`.
6. Zaimplementuj `FileSelectionModal` i `SettingsTab`, spiąć całość w `main.ts`.
7. Zweryfikuj build (`npm run build` bez błędów) i przejdź przez Standard Przeglądu (pole 7).

## 6. TRASA KOSZTOWA

**Mechaniczne, można zdelegować podagentowi/tańszemu modelowi:** szkielet plików boilerplate
(manifest.json, package.json, tsconfig), stały fragment startowego `ingredient_units.yaml` na
podstawie przykładów ze spec, research faktograficzny (czy istnieje aktualny pakiet npm do Bring!,
jaka jest bieżąca wersja Obsidian Plugin API).

**Wymaga osądu Fable, zostaje przy nim:** logika `IngredientParser` (obsługa niejednorodnych
formatów tabeli — etykiety sekcji, widełki, niejasne ilości), logika `Normalizer` + `Summer`
(decyzje o normalizacji jednostek, sumowanie widełek typu "1–2 łyżki"), wybór i integracja
biblioteki do Bring! (ryzyko niepewnego, nieoficjalnego API), decyzja o sposobie przechowywania
sekretu logowania.

## 7. STANDARD PRZEGLĄDU (definition of done)

1. `npm run build` kończy się bez błędów TypeScript (0 błędów kompilacji).
2. `IngredientParser` poprawnie wyciąga wszystkie pozycje składnikowe z obu testowych plików
   przepisów, poprawnie ignorując wiersze-etykiety sekcji (np. "Masło ziołowe:") jako nie-składniki.
3. `Normalizer` + `Summer` na przykładzie koperku występującego w dwóch różnych przepisach ("1–2
   łyżki" + "duża garść") dają jedną, faktycznie zsumowaną pozycję wyjściową — nie zdublowaną.
4. `BringAdapter` — kod buduje realne żądanie zgodne z wybraną biblioteką/protokołem (bez
   wysyłania go na żywo bez zgody); próba i jej wynik trafiają do Ścieżki Dowodowej.
5. Wtyczka ładuje się w Obsidianie bez błędów w konsoli deweloperskiej (weryfikowalne logiem lub
   screenshotem konsoli).
6. `SettingsTab` pozwala zapisać i odczytać: URL endpointu LLM, opcjonalny klucz API, nazwę
   modelu, dane logowania Bring!, ścieżkę do słownika — dane przetrwują restart Obsidiana.

## 8. ŚCIEŻKA DOWODOWA

- Log źródeł faktycznie odczytanych (dokumentacja Obsidian API, dokumentacja/kod bibliotek do
  Bring!, kontrakt OpenAI Chat Completions API) — z datą sprawdzenia.
- Lista decyzji z uzasadnieniem: dlaczego wybrana konkretna biblioteka/podejście do integracji
  z Bring!, dlaczego dany format/logika normalizacji jednostek, dlaczego dany sposób (proponowany,
  nie wdrożony bez zgody) przechowywania sekretu.
- Faktyczny log próby zbudowania żądania w `BringAdapter` (treść żądania, nie samo słowo "działa").
- Rzeczywisty output `npm run build` (log kompilacji, nie deklaracja "buduje się").
- Lista niepewności do ręcznej weryfikacji przez człowieka — np. czy wybrana biblioteka JS/TS do
  Bring! jest nadal aktywnie utrzymywana, czy wybrany sposób przechowania sekretu jest
  wystarczający w kontekście synchronizowanego vaulta.

## 9. BRAMA LUDZKA

**Eryk** — zatwierdza wynik po zakończeniu całego planu pracy (pole 5), przed instalacją wtyczki
w realnym vaulcie i przed jakimkolwiek podłączeniem prawdziwego konta Bring!.

---

## FAILURE / ESCALATION

Jeśli którykolwiek z warunków Standardu Przeglądu (pole 7) okaże się niewykonalny — w
szczególności jeśli research wykaże brak jakiejkolwiek sensownej biblioteki JS/TS do Bring! (patrz
GRANICE, pole 4) — model zatrzymuje się, dokumentuje dlaczego (dane/log z researchu, nie opinia) i
proponuje najmniejszą sensowną zmianę zakresu (np. własny minimalny port protokołu ograniczony do
potrzebnych operacji, albo tymczasowe przełączenie na inny adapter z tabeli w spec). Nie dowozi
czegoś, co "się generuje, ale nie działa".

**Bądź zwięzły w komunikacji postępu.** Nie opisuj szczegółowo procesu myślowego, nie twórz
rozbudowanych wyjaśnień pośrednich. Zatrzymaj się tylko gdy naprawdę potrzebujesz decyzji człowieka
(patrz GRANICE) — w przeciwnym razie dowieź całość od początku do końca.
