export type BrregEntity = Record<string, unknown>;

export type BrregEntitySearchResponse = {
  _embedded?: {
    enheter?: BrregEntity[];
  };
  page?: {
    size?: number;
    totalElements?: number;
    totalPages?: number;
    number?: number;
  };
};

const brregBaseUrl = "https://data.brreg.no/enhetsregisteret/api";

export async function fetchBrregEntitiesPage(options: {
  municipalityNumber: string;
  page: number;
  size: number;
}): Promise<BrregEntitySearchResponse> {
  const url = new URL(`${brregBaseUrl}/enheter`);
  url.searchParams.set(
    "forretningsadresse.kommunenummer",
    options.municipalityNumber,
  );
  url.searchParams.set("page", String(options.page));
  url.searchParams.set("size", String(options.size));

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "crm_signal_local_dev/0.1",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Brreg request failed with ${response.status} ${response.statusText}: ${body}`,
    );
  }

  return (await response.json()) as BrregEntitySearchResponse;
}
