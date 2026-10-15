import type {
	MusicalLyricsPayload,
	MusicalLyricsResponse,
} from "./lyrics-adapter";

type ApiEnvelope<T> = { data?: T; message?: string };

let accessToken = "";

function apiBaseUrl() {
	return (
		import.meta.env.VITE_MUSICAL_API_URL || window.location.origin
	).replace(/\/+$/, "");
}

function url(path: string) {
	return `${apiBaseUrl()}${path}`;
}

async function responseBody(response: Response) {
	const body = (await response
		.json()
		.catch(() => ({}))) as ApiEnvelope<unknown>;
	if (!response.ok)
		throw new Error(body.message || `Request failed (${response.status}).`);
	return (body.data ?? body) as never;
}

async function refreshSession() {
	const session = (await responseBody(
		await fetch(url("/auth/refresh"), {
			method: "POST",
			credentials: "include",
		}),
	)) as { accessToken?: string };
	if (!session.accessToken)
		throw new Error("Sign in to 404Hz before using the lyrics library.");
	accessToken = session.accessToken;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
	if (!accessToken) await refreshSession();
	const execute = () =>
		fetch(url(path), {
			...init,
			credentials: "include",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${accessToken}`,
				...init.headers,
			},
		});
	let response = await execute();
	if (response.status === 401) {
		await refreshSession();
		response = await execute();
	}
	return responseBody(response) as Promise<T>;
}

export function loadMusicalLyrics(songId: string) {
	return request<MusicalLyricsResponse>(
		`/studio/catalog/songs/${encodeURIComponent(songId)}/lyrics`,
	);
}

export function saveMusicalLyrics(
	songId: string,
	payload: MusicalLyricsPayload,
	publish: boolean,
) {
	return request<MusicalLyricsResponse>(
		`/studio/catalog/songs/${encodeURIComponent(songId)}/lyrics`,
		{
			method: "POST",
			body: JSON.stringify({ ...payload, publish }),
		},
	);
}
