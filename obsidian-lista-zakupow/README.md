# Lista zakupów — wtyczka Obsidian

Wybierasz 1-2 notatki przepisów (szablon Obsidian Web Clipper, frontmatter
`type: recipe`), a wtyczka: parsuje tabelę `## Ingredients` (kolumna `PL + SI`),
normalizuje składniki przez LLM (dowolny endpoint zgodny z OpenAI Chat
Completions — domyślnie lokalny Ollama), sumuje ilości między przepisami
w preferowanych jednostkach zakupowych (słownik `ingredient_units.yaml`)
i wysyła gotowe pozycje na wybraną listę Bring!.

Dokumentacja projektowa: `../docs/superpowers/specs/2026-07-24-lista-zakupow-integracja-design.md`
oraz `../docs/sciezka-dowodowa.md` (źródła, decyzje, logi testów).

## Build

```
npm install
npm run build   # tsc -noEmit + esbuild → main.js
```

## Instalacja w vaultcie (ręczna)

1. Skopiuj `main.js` i `manifest.json` do `<vault>/.obsidian/plugins/lista-zakupow/`.
2. Włącz wtyczkę: Ustawienia → Community plugins → Lista zakupów.
3. W ustawieniach wtyczki podaj: adres LLM (np. `http://localhost:11434/v1`),
   nazwę modelu oraz e-mail i hasło Bring!. Listy docelowej się tu nie ustawia —
   wybierasz ją przy każdym wysłaniu.
4. Skopiuj startowy `ingredient_units.yaml` do vaulta (domyślna ścieżka:
   `ingredient_units.yaml` w korzeniu; zmienisz ją w ustawieniach).

## Użycie

Paleta poleceń → „Dodaj składniki z przepisów do listy zakupów" → wybierz
notatki → wskaż listę docelową → „Wyślij do listy zakupów".

W kroku wyboru wtyczka pokazuje listy z Twojego konta Bring!. Domyślnie
proponuje założenie nowej, o nazwie przepisu (przy kilku przepisach: tytuł
pierwszego z licznikiem pozostałych, np. `Schabowe +1`); nazwę możesz zmienić
w polu obok. Nowa lista powstaje dopiero po normalizacji składników, więc
nieudany przebieg nie zostawia pustej listy w aplikacji.

Po wysyłce zobaczysz podsumowanie:
co dodano, co zsumowano i jakie propozycje trafiły do słownika (sekcja
`# --- propozycje LLM (zweryfikuj i popraw ręcznie) ---` w YAML — przejrzyj je).

## Testy

```
npm test   # esbuild kompiluje moduły do test/.build, potem node --test
```

Testy adaptera chodzą na rejestratorze żądań w miejsce HTTP, więc nic nie
wychodzi na żywe konto Bring!. Osobny smoke-test ładuje zbudowany `main.js`
na atrapie modułu `obsidian` i sprawdza rejestrację komendy oraz trwałość
ustawień.

## Uwagi

- Ponowne wysłanie tej samej pozycji aktualizuje jej opis w Bring! zamiast
  tworzyć duplikat (nazwy pozycji są unikalne w obrębie listy) — całość jest
  bezpieczna do wielokrotnego uruchomienia.
- Zakładanie listy idzie na `POST v2/bringusers/{userUuid}/lists`. Tego wywołania
  nie zna żadna z bibliotek społecznościowych: ścieżka jest ta sama, co przy
  pobieraniu list, różni je metoda. Odczytane z bundla aplikacji webowej Bringa
  i potwierdzone żywym żądaniem — szczegóły w `../docs/sciezka-dowodowa.md`.
- Usuwania listy API nie udostępnia. Kasuje się ją w aplikacji Bring!.
- API Bring! jest nieoficjalne (reverse-engineered) — może przestać działać
  przy zmianie backendu. Adapter jest izolowany za interfejsem
  `ShoppingListAdapter`, łatwo podmienić na inny (Mealie/Grocy).
- Dane logowania Bring! są w `data.json` wtyczki — patrz ostrzeżenie
  w ustawieniach dot. synchronizacji folderu `.obsidian`.
