// lib/fudoClient.ts

const FUDO_API_URL =
  process.env.FUDO_API_URL || "https://api.fu.do/v1alpha1";
const FUDO_AUTH_URL =
  process.env.FUDO_AUTH_URL || "https://auth.fu.do/api";

const FUDO_API_KEY = process.env.FUDO_API_KEY;
const FUDO_API_SECRET = process.env.FUDO_API_SECRET;

if (!FUDO_API_KEY || !FUDO_API_SECRET) {
  console.warn(
    "[FUDO] FUDO_API_KEY o FUDO_API_SECRET no están configuradas en .env.local"
  );
}

// ------- CACHE SIMPLE TOKEN -------

let cachedToken: string | null = null;
let cachedExp: number | null = null; // segundos desde Epoch

function tokenIsValid(): boolean {
  if (!cachedToken || !cachedExp) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  return nowSec < cachedExp - 60; // renovamos 60s antes
}

async function fetchNewToken(): Promise<string> {
  if (!FUDO_API_KEY || !FUDO_API_SECRET) {
    throw new Error(
      "[FUDO] No hay API key/secret configuradas para pedir token"
    );
  }

  const body = JSON.stringify({
    apiKey: FUDO_API_KEY,
    apiSecret: FUDO_API_SECRET,
  });

  const res = await fetch(FUDO_AUTH_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body,
  });

  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }

  if (!res.ok) {
    throw new Error(
      `[FUDO] Error obteniendo token (${res.status}) - ${text}`
    );
  }

  if (!json.token || !json.exp) {
    throw new Error("[FUDO] Respuesta de auth sin token o exp");
  }

  cachedToken = json.token;
  cachedExp = Number(json.exp);

  return cachedToken!;
}

async function getAuthToken(): Promise<string> {
  if (tokenIsValid()) return cachedToken as string;
  return fetchNewToken();
}

// ------- ENDPOINTS LISTA DE VENTAS -------

export async function getFudoSales(limit: number = 50) {
  const token = await getAuthToken();

  const params = new URLSearchParams();
  params.set("page[size]", String(limit));
  params.set("page[number]", "1");
  params.set("sort", "-createdAt");

  const url = `${FUDO_API_URL}/sales?${params.toString()}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }

  if (!res.ok) {
    throw new Error(
      `[FUDO] Error Fudo ${res.status} - ${
        typeof json === "string" ? json : JSON.stringify(json)
      }`
    );
  }

  return json;
}

// ------- DETALLE DE UNA VENTA -------

export async function getFudoSaleDetail(saleId: string | number) {
  const token = await getAuthToken();

  // include para que venga Customer, Items y ShippingCost en "included"
  const url = `${FUDO_API_URL}/sales/${saleId}?include=customer,items,shippingCosts`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }

  if (!res.ok) {
    throw new Error(
      `[FUDO] Error Fudo (sale detail) ${res.status} - ${
        typeof json === "string" ? json : JSON.stringify(json)
      }`
    );
  }

  return json;
}

// ------- DETALLE DE UN CLIENTE -------

export async function getFudoCustomer(customerId: string | number) {
  const token = await getAuthToken();

  const url = `${FUDO_API_URL}/customers/${customerId}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }

  if (!res.ok) {
    throw new Error(
      `[FUDO] Error Fudo (customer) ${res.status} - ${
        typeof json === "string" ? json : JSON.stringify(json)
      }`
    );
  }

  return json;
}
