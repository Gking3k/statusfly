export interface HealthResponse {
  success: boolean;
  service: string;
  status: string;
  timestamp: string;
}

const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5000/api";

export async function getHealth(): Promise<HealthResponse> {
  const response = await fetch(`${API_URL}/health`);

  if (!response.ok) {
    throw new Error("Unable to connect to StatusFly API");
  }

  return response.json() as Promise<HealthResponse>;
}