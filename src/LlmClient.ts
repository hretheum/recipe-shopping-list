import { requestUrl } from 'obsidian';
import { ChatFn, RecipeShoppingListSettings } from './types';

/*
 * Client of the generic OpenAI Chat Completions contract; works with Ollama,
 * llama.cpp, LM Studio, OpenAI, OpenRouter and the like.
 *
 * Notes:
 * - requestUrl instead of fetch: fetch inside Obsidian is subject to CORS
 *   (origin app://obsidian.md), requestUrl is not.
 * - Authorization is always sent: Ollama and llama.cpp ignore the value,
 *   cloud endpoints require it.
 * - response_format {"type":"json_object"} is the only portable JSON mode
 *   (json_schema through Ollama's /v1 is silently ignored), so the prompt
 *   must also tell the model explicitly to return JSON.
 * - requestUrl cannot stream, so stream: false is mandatory.
 */
function baseUrl(settings: RecipeShoppingListSettings): string {
	return settings.llmBaseUrl.replace(/\/+$/, '');
}

export function createChatFn(settings: RecipeShoppingListSettings, apiKey: string): ChatFn {
	return async (system: string, user: string): Promise<string> => {
		const url = baseUrl(settings) + '/chat/completions';
		const response = await requestUrl({
			url,
			method: 'POST',
			contentType: 'application/json',
			headers: { Authorization: `Bearer ${apiKey || 'none'}` },
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
			throw new Error(`LLM: HTTP ${response.status} from ${url}: ${response.text.slice(0, 300)}`);
		}

		let content: unknown;
		try {
			content = response.json?.choices?.[0]?.message?.content;
		} catch {
			throw new Error(`LLM: the reply is not valid JSON: ${response.text.slice(0, 300)}`);
		}
		if (typeof content !== 'string' || content === '') {
			throw new Error('LLM: no content in choices[0].message.content');
		}
		return content;
	};
}

/** Model ids offered by the endpoint (GET {base}/models). */
export async function fetchModels(settings: RecipeShoppingListSettings, apiKey: string): Promise<string[]> {
	const url = baseUrl(settings) + '/models';
	const response = await requestUrl({
		url,
		method: 'GET',
		headers: { Authorization: `Bearer ${apiKey || 'none'}` },
		throw: false,
	});
	if (response.status >= 400) {
		throw new Error(`HTTP ${response.status} from ${url}`);
	}
	const data = response.json as { data?: Array<{ id?: unknown }> };
	const ids = Array.isArray(data?.data) ? data.data.map((entry) => entry.id).filter((id): id is string => typeof id === 'string') : [];
	return ids.sort((a, b) => a.localeCompare(b));
}
