/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MQTT_WS_URL?: string;
  readonly VITE_PERSON_COUNT_TOPIC?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
