import { requestUrl } from 'obsidian';
import { ChatFn, ListaZakupowSettings } from './types';

/*
 * Klient generycznego kontraktu OpenAI Chat Completions — działa z Ollama,
 * llama.cpp, LM Studio, OpenAI, OpenRouter itd.
 *
 * Ustalenia z researchu (Ścieżka Dowodowa, D2):
 * - requestUrl zamiast fetch: fetch w Obsidianie podlega CORS (origin
 *   app://obsidian.md), requestUrl nie
 * - Authorization wysyłany zawsze: Ollama/llama.cpp ignorują wartość,
 *   endpointy chmurowe jej wymagają
 * - response_format {"type":"json_object"} to jedyny przenośny tryb JSON —
 *   json_schema przez /v1 Ollamy jest cicho ignorowany (ollama#10001),
 *   dlatego prompt MUSI dodatkowo jawnie kazać zwrócić JSON
 * - requestUrl nie streamuje → stream: false obowiązkowo
 */
export function createChatFn(settings: ListaZakupowSettings, apiKey: string): ChatFn {
	return async (system: string, user: string): Promise<string> => {
		const url = settings.llmBaseUrl.replace(/\/+$/, '') + '/chat/completions';
		const response = await requestUrl({
			url,
			method: 'POST',
			contentType: 'application/json',
			headers: { Authorization: `Bearer ${apiKey || 'ollama'}` },
			body: JSON.stringify({
				model: settings.llmModel,
				messages: [
					{ role: 'system', content: system },
					{ role: 'user', content: user },
				],
				stream: false,
				temperature: 0,
				response_format: { type: 'json_object' },
			}),
			throw: false,
		});

		if (response.status >= 400) {
			throw new Error(`LLM: HTTP ${response.status} z ${url}: ${response.text.slice(0, 300)}`);
		}

		let content: unknown;
		try {
			content = response.json?.choices?.[0]?.message?.content;
		} catch {
			throw new Error(`LLM: odpowiedź nie jest poprawnym JSON: ${response.text.slice(0, 300)}`);
		}
		if (typeof content !== 'string' || content === '') {
			throw new Error('LLM: brak treści w choices[0].message.content');
		}
		return content;
	};
}
