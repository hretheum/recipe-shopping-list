# Integracja Obsidian → lista zakupów: założenia projektowe

**Data:** 2026-07-24
**Status:** zatwierdzone do planowania implementacji (rev. 2 — architektura pluginowa)

## Cel

Umożliwić wybranie jednego lub dwóch plików markdown z przepisami (notatki Obsidian, dodawane przez Obsidian Web Clipper) i przeniesienie z nich listy składników do mobilnej aplikacji zakupowej — ze znormalizowanymi jednostkami i zsumowanymi ilościami, jeśli ten sam składnik występuje w więcej niż jednym przepisie. Cała funkcjonalność ma działać jako natywna wtyczka Obsidian, uruchamiana bez opuszczania aplikacji.

## Kontekst wejściowy

Przepisy mają ustandaryzowaną strukturę (szablon Obsidian Web Clipper):

- YAML frontmatter: `type: "recipe"`, `source`, `site`, `tags`
- Sekcja `## Ingredients` jako tabela markdown z kolumnami `Original` i `PL + SI`
- Kolumna `PL + SI` bywa już częściowo znormalizowana ręcznie/przez klipper (np. skrócone opisy), ale ilości i jednostki nie są ujednolicone między przepisami (np. "1–2 łyżki koperku" vs. "duża garść koperku")

Przykład referencyjny: `/Users/eorlowski/Documents/prv-sync/source/prv/kukbuk/Najlepsze schabowe na świecie.md`

## Wybrana architektura

Projekt od podstaw jest **wtyczką Obsidian** (TypeScript, desktop), nie osobnym skryptem CLI. Rozdzielamy dwie odpowiedzialności:

1. **Normalizacja i sumowanie ilości** — dzieje się wewnątrz wtyczki, nie w aplikacji zakupowej.
2. **Docelowa aplikacja zakupowa** — dostaje już gotowy, znormalizowany tekst i tylko go przechowuje/wyświetla na telefonie.

**LLM backend jest wymienny z założenia:** ustawienia wtyczki pozwalają skonfigurować dowolny endpoint zgodny z **OpenAI Chat Completions API** — obejmuje to lokalny Ollama/llama.cpp (który udostępnia taki endpoint), jak i dowolne inne kompatybilne API (chmurowe albo inne lokalne), przez zmianę URL/klucza/modelu w ustawieniach, bez zmian w kodzie.

### Rozważane opcje aplikacji docelowej (research)

| Aplikacja | Status API | Ryzyko | Ilość/jednostka |
|---|---|---|---|
| Listonic | brak publicznego API (tylko oferta B2B) | — | — |
| **Bring!** (wybrane) | nieoficjalne, reverse-engineered (`bring-api`, aktywnie utrzymywane, używane przez Home Assistant) | średnie — API może przestać działać przy zmianie backendu Bring | tylko wolny tekst (`specification`) |
| AnyList | nieoficjalne (`anylist` npm) | jak wyżej, bez przewagi nad Bring! | wolny tekst |
| Out of Milk | brak realnego API | — | — |
| Todoist | oficjalne, darmowe REST API | brak ryzyka ToS, ale limit 5 projektów na darmowym planie | brak pól strukturalnych, brak trybu "kupione" |
| Google Keep | tylko nieoficjalne (`gkeepapi`), rosnące problemy z logowaniem | wysokie | brak struktury |
| Grocy (self-hosted) | w pełni oficjalne REST API | zero ToS, ale wymaga własnego hostingu i product master data | pełna struktura, auto-sumowanie |
| Mealie (self-hosted) | w pełni oficjalne REST API, natywny dla przepisów | zero ToS, ale wymaga własnego hostingu, na telefonie tylko PWA | pełna struktura (quantity+unit+food) |

**Decyzja:** Bring! jako aplikacja docelowa — realnie używana na telefonie (iPhone), dojrzała biblioteka integracyjna, pełny CRUD (dodaj/edytuj/oznacz kupione). Świadomie akceptujemy ryzyko nieoficjalnego API; integracja z Bring! ma być izolowana za wspólnym interfejsem adaptera, żeby dało się ją podmienić (np. na Mealie/Grocy), gdyby API przestało działać lub potrzeby wzrosły.

## Architektura wtyczki (komponenty)

- **`main.ts`** — rejestruje komendę w palecie poleceń Obsidiana ("Dodaj składniki do listy zakupów") oraz opcjonalnie ikonę w pasku bocznym/skrót klawiszowy.
- **`FileSelectionModal`** — pozwala wybrać 1 lub 2 notatki: domyślnie aktywnie otwarta notatka, z opcją dodania drugiej z listy notatek o `type: recipe`.
- **`IngredientParser`** — parsuje tabelę `## Ingredients` (kolumna `PL + SI`) z wybranych notatek.
- **`Normalizer`** — woła skonfigurowany endpoint LLM (patrz sekcja "Backend LLM"), korzysta z i rozbudowuje słownik `ingredient_units.yaml`.
- **`Summer`** — grupuje pozycje po znormalizowanej nazwie składnika i sumuje ilości.
- **`ShoppingListAdapter`** (interfejs) z implementacją **`BringAdapter`** — wysyła gotowe pozycje do Bring!. Interfejs pozwala w przyszłości podpiąć kolejne aplikacje (Mealie/Grocy) bez zmiany reszty wtyczki.
- **`SettingsTab`** — konfiguracja: endpoint LLM (URL, opcjonalny klucz API, nazwa modelu), dane logowania do Bring!, lokalizacja pliku słownika.

## Przepływ danych

```
[Komenda w palecie poleceń Obsidiana: "Dodaj do listy zakupów"]
        │  użytkownik wybiera 1-2 notatki (aktywna notatka + opcjonalnie druga)
        ▼
[IngredientParser] → wyciąga tabelę "Ingredients" (kolumna "PL + SI")
        ▼
[Normalizer] → wywołuje skonfigurowany endpoint LLM
   (domyślnie lokalny Ollama, dowolny inny zgodny z OpenAI Chat Completions API)
   - rozdziela ilość + jednostkę + nazwę składnika
   - sprawdza/rozbudowuje słownik ingredient_units.yaml (plik w vaulcie)
        ▼
[Summer] → grupuje po znormalizowanej nazwie, sumuje ilości
   (np. koperek: "1-2 łyżki" + "duża garść" → "2 pęczki")
        ▼
[BringAdapter] → loguje się, dodaje/aktualizuje pozycje na liście Bring!
        ▼
[Notice/modal w Obsidianie] → podsumowanie: co dodano, co zsumowano,
   jakie nowe wpisy trafiły do słownika
```

## Sposób uruchamiania

Natywna komenda wtyczki Obsidian, dostępna z palety poleceń i opcjonalnie ze skrótu klawiszowego lub ikony w pasku bocznym. Użytkownik nie opuszcza Obsidiana ani nie kopiuje ścieżek plików ręcznie — wybór notatek odbywa się w modalu wewnątrz aplikacji.

## Backend LLM

Wtyczka nie zakłada jednego, sztywnego dostawcy LLM. Ustawienia pozwalają skonfigurować dowolny endpoint zgodny z **OpenAI Chat Completions API**:

- **Domyślnie:** lokalny serwer Ollama/llama.cpp (adres do ustalenia, np. `http://localhost:11434/v1`), bez kosztów per-token.
- **Alternatywnie:** dowolny inny kompatybilny endpoint (chmurowy albo inny lokalny) — wystarczy zmienić URL/klucz/model w ustawieniach, bez zmian w kodzie wtyczki.

## Model danych

- **`ingredient_units.yaml`** — słownik: nazwa składnika → preferowana jednostka zakupowa + notatki. Trzymany jako plik w vaulcie, rośnie z czasem, edytowalny ręcznie. Przykład:
  ```yaml
  koperek: {unit: pęczek, note: "nie waż, kupuj pęczkami"}
  szczypiorek: {unit: pęczek}
  masło: {unit: "kostka (200g)"}
  mąka pszenna: {unit: kg, round_to: 0.5}
  ```
- **Wewnętrzny model znormalizowanej pozycji** (między etapem normalizacji a adapterem):
  ```
  {ingredient: str, quantity: float, unit: str, source_recipes: [str]}
  ```
- **Format do Bring!:** sklejony string wolnotekstowy, np. `"koperek — 2 pęczki"` (Bring! nie ma pól strukturalnych ilość/jednostka).

## Ryzyka

- **Stabilność API Bring!** — nieoficjalne, reverse-engineered; może przestać działać przy zmianie backendu. Mitygacja: integracja izolowana za interfejsem `ShoppingListAdapter`, łatwa do podmiany.
- **Spójność normalizacji między uruchomieniami** — łagodzona przez trwały słownik `ingredient_units.yaml` zamiast decyzji LLM ad-hoc za każdym razem.
- **Przechowywanie danych logowania do Bring! w ustawieniach wtyczki** — Obsidian trzyma dane wtyczek w `.obsidian/plugins/<id>/data.json`, zwykle jawnym tekstem; jeśli ten folder synchronizuje się razem z vaultem (jak w `prv-sync`), dane logowania mogą trafić do miejsca synchronizacji. Do ustalenia w implementacji: wykluczenie folderu wtyczki z synchronizacji albo inny sposób przechowania sekretu.
- **Brak potwierdzonej biblioteki JS/TS do Bring!** — dojrzałe biblioteki społecznościowe (`bring-api`) są w Pythonie; wtyczka Obsidian działa w środowisku Node/Electron, więc potrzebny jest odpowiednik w JS/TS (istniejący pakiet npm albo własny port protokołu) — do zweryfikowania na etapie implementacji.
- **Zasięg platformowy** — wtyczki Obsidian na desktopie mają dostęp do Node.js API, co ułatwia wywołania HTTP do LLM i do Bring! bez ograniczeń typowych dla zwykłych stron webowych. Projekt zakłada tylko desktop (macOS) — Obsidian Mobile nie jest w zakresie, bo na telefonie i tak korzystasz z appki Bring!, nie z Obsidiana, do samych zakupów.

## Poza zakresem MVP

- Automatyczne wykrywanie/skanowanie plików przepisów (nadal ręczny wybór, teraz przez modal w Obsidianie)
- Oznaczanie z powrotem w Obsidianie, które składniki zostały kupione
- Obsługa wielu aplikacji zakupowych jednocześnie (interfejs adaptera to przewiduje na przyszłość, ale MVP ma tylko Bring!)
- Wsparcie Obsidian Mobile
- Publikacja w oficjalnym katalogu wtyczek Obsidian (na start: instalacja lokalna/manualna)

## Otwarte pytania do etapu planowania implementacji

1. Dokładny adres/port lokalnego serwera Ollama i nazwa domyślnego modelu.
2. Konkretna biblioteka/implementacja JS/TS do komunikacji z Bring! (istniejący pakiet npm czy własny port protokołu).
3. Sposób bezpiecznego przechowywania danych logowania do Bring! w kontekście synchronizowanego vaulta.
4. Docelowa lokalizacja i format pliku `ingredient_units.yaml` wewnątrz vaulta.
5. Mechanizm wyboru drugiej notatki w modalu (lista wszystkich notatek `type: recipe` czy przeszukiwanie fuzzy).
