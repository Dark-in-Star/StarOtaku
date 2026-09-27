"use server";

import { revalidatePath } from "next/cache";
import { BASE_URL } from "./api";
import { getValidAccessToken } from "./session";
import type { ListStatus, MangaListStatus } from "./types";

type QueryValue = string | number | boolean | undefined;

function buildForm(fields: Record<string, QueryValue>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    params.set(key, String(value));
  }
  return params.toString();
}

// See apiGet: a throttled MAL redirects to an endpoint that never answers, so never follow.
const NO_REDIRECT = "manual" as const;

async function requireToken(): Promise<string> {
  const token = await getValidAccessToken();
  if (!token) throw new Error("Log in with MyAnimeList to do that.");
  return token;
}

export interface UpdateAnimeStatusInput {
  animeId: number;
  status?: ListStatus;
  score?: number;
  num_watched_episodes?: number;
}

export async function updateAnimeStatusAction(input: UpdateAnimeStatusInput) {
  const { animeId, ...update } = input;
  const token = await requireToken();
  const response = await fetch(`${BASE_URL}/anime/${animeId}/my_list_status`, {
    method: "PUT",
    redirect: NO_REDIRECT,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${token}`,
    },
    body: buildForm(update),
  });

  if (!response.ok) {
    throw new Error(`Failed to update anime list status: ${response.status}`);
  }

  revalidatePath("/mylist");
}

export async function removeAnimeAction(animeId: number) {
  const token = await requireToken();
  const response = await fetch(`${BASE_URL}/anime/${animeId}/my_list_status`, {
    method: "DELETE",
    redirect: NO_REDIRECT,
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok && response.status !== 404) {
    throw new Error(`Failed to remove anime from list: ${response.status}`);
  }

  revalidatePath("/mylist");
  revalidatePath(`/anime/${animeId}`);
}

export interface UpdateMangaStatusInput {
  mangaId: number;
  status?: MangaListStatus;
  score?: number;
  num_chapters_read?: number;
  num_volumes_read?: number;
}

export async function updateMangaStatusAction(input: UpdateMangaStatusInput) {
  const { mangaId, ...update } = input;
  const token = await requireToken();
  const response = await fetch(`${BASE_URL}/manga/${mangaId}/my_list_status`, {
    method: "PUT",
    redirect: NO_REDIRECT,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${token}`,
    },
    body: buildForm(update),
  });

  if (!response.ok) {
    throw new Error(`Failed to update manga list status: ${response.status}`);
  }

  revalidatePath("/mylist");
  revalidatePath(`/manga/${mangaId}`);
}

export async function removeMangaAction(mangaId: number) {
  const token = await requireToken();
  const response = await fetch(`${BASE_URL}/manga/${mangaId}/my_list_status`, {
    method: "DELETE",
    redirect: NO_REDIRECT,
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok && response.status !== 404) {
    throw new Error(`Failed to remove manga from list: ${response.status}`);
  }

  revalidatePath("/mylist");
  revalidatePath(`/manga/${mangaId}`);
}
