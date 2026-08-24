export type MikeMessage = { role: "user" | "assistant"; content: string };

export const MIKE_MISSING_KEY_MESSAGE = "Add OPENAI_API_KEY to .env and restart.";
