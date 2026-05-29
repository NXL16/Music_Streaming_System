interface Env {
  API_FINALIZE_URL: string;
  FINALIZER_INTERNAL_TOKEN: string;
}

type R2EventNotification = {
  account: string;
  action: string;
  bucket: string;
  object: {
    key: string;
    size: number;
    eTag: string;
  };
  eventTime: string;
};

export default {
  async queue(
    batch: MessageBatch<R2EventNotification>,
    env: Env,
  ): Promise<void> {
    for (const message of batch.messages) {
      const event = message.body as R2EventNotification;
      const keyParts = event.object.key.split("/");
      if (keyParts.length < 2 || keyParts[0] !== "quarantine") {
        message.ack();
        continue;
      }

      const checksum = keyParts[1];

      try {
        const res = await fetch(env.API_FINALIZE_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-internal-token": env.FINALIZER_INTERNAL_TOKEN,
          },
          body: JSON.stringify({
            checksum,
          }),
        });

        if (!res.ok) throw new Error(`API ${res.status}`);
        message.ack();
      } catch {
        message.retry();
      }
    }
  },
};
