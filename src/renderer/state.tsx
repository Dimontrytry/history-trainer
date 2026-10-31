import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Bootstrap } from "../shared/models";

export const api = window.historyTrainer;
type Result<T> = { ok: true; value: T } | { ok: false };
type AppState = {
  data: Bootstrap | null;
  busy: boolean;
  message: string;
  error: string;
  refresh: () => Promise<void>;
  task: <T>(
    work: () => Promise<T>,
    message?: string | ((value: T) => string),
  ) => Promise<Result<T>>;
  clear: () => void;
};
const Context = createContext<AppState>(null!);
export function StateProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Bootstrap | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const refresh = async () => {
    setData(await api.request<Bootstrap>("bootstrap"));
  };
  async function task<T>(
    work: () => Promise<T>,
    success: string | ((value: T) => string) = "",
  ): Promise<Result<T>> {
    if (busy) return { ok: false };
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const value = await work();
      await refresh();
      setMessage(typeof success === "function" ? success(value) : success);
      return { ok: true, value };
    } catch (e) {
      setError(
        (e as Error).message.replace(
          /^Error invoking remote method '[^']+': Error: /,
          "",
        ),
      );
      return { ok: false };
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    refresh().catch((e) => setError(String(e)));
  }, []);
  return (
    <Context.Provider
      value={{
        data,
        busy,
        error,
        message,
        refresh,
        task,
        clear: () => {
          setError("");
          setMessage("");
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useApp = () => useContext(Context);
