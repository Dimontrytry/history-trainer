import { Application } from "../application/service";
import { userMessage } from "../shared/errors";

const root = process.argv[2];
if (!root) throw new Error("Не указан каталог данных");
const parent = (
  process as unknown as {
    parentPort: {
      on: (event: string, handler: (event: { data: unknown }) => void) => void;
      postMessage: (value: unknown) => void;
    };
  }
).parentPort;
let application: Application;
try {
  application = new Application(root);
  parent.postMessage({ ready: true });
} catch (e) {
  parent.postMessage({ fatal: userMessage(e) });
  process.exit(1);
}
let queue = Promise.resolve();
parent.on("message", ({ data }) => {
  const request = data as { id: string; command: string; payload: unknown };
  queue = queue.then(async () => {
    try {
      const value = await application.dispatch(
        request.command,
        request.payload,
      );
      parent.postMessage({ id: request.id, ok: true, value });
    } catch (e) {
      parent.postMessage({
        id: request.id,
        ok: false,
        error: userMessage(e),
      });
    }
  });
});
process.on("exit", () => application?.store.close());
